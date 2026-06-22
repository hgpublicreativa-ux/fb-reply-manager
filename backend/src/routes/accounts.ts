import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../config/database';
import { getPageInfo } from '../services/facebook';
import { decrypt } from '../services/encryption';

export const accountsRouter = Router();
accountsRouter.use(authenticateToken);

// Consolidated overview across all linked accounts: live followers from Facebook
// + comment stats from the DB, per account and totaled.
accountsRouter.get('/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const accts = await query<{ id: string; account_name: string; account_id: string; avatar_url: string | null; access_token: string }>(
      'SELECT id, account_name, account_id, avatar_url, access_token FROM facebook_accounts WHERE user_id = $1 ORDER BY account_name ASC',
      [req.user!.userId]
    );

    // Comment stats grouped by account in a single query.
    const statsRows = await query<{ facebook_account_id: string; total: string; responded: string; pending: string }>(
      `SELECT c.facebook_account_id,
        COUNT(DISTINCT c.id) AS total,
        COUNT(DISTINCT CASE WHEN r.status = 'published' THEN c.id END) AS responded,
        COUNT(DISTINCT CASE WHEN r.id IS NULL OR r.status = 'pending' THEN c.id END) AS pending
       FROM comments c
       LEFT JOIN responses r ON r.comment_id = c.id
       WHERE c.facebook_account_id = ANY($1::uuid[])
       GROUP BY c.facebook_account_id`,
      [accts.rows.map((a) => a.id)]
    );
    const statsByAccount = new Map(statsRows.rows.map((s) => [s.facebook_account_id, s]));

    // Followers come from Facebook — fetch all in parallel.
    const accounts = await Promise.all(
      accts.rows.map(async (a) => {
        let followers: number | null = null;
        try {
          const info = await getPageInfo(a.account_id, decrypt(a.access_token));
          followers = info.followers ?? info.fanCount;
        } catch {
          followers = null;
        }
        const s = statsByAccount.get(a.id);
        return {
          id: a.id,
          account_name: a.account_name,
          avatar_url: a.avatar_url,
          followers,
          totalComments: s ? parseInt(s.total, 10) : 0,
          responded: s ? parseInt(s.responded, 10) : 0,
          pending: s ? parseInt(s.pending, 10) : 0,
        };
      })
    );

    const totals = accounts.reduce(
      (acc, a) => ({
        followers: acc.followers + (a.followers || 0),
        totalComments: acc.totalComments + a.totalComments,
        responded: acc.responded + a.responded,
        pending: acc.pending + a.pending,
      }),
      { followers: 0, totalComments: 0, responded: 0, pending: 0 }
    );

    res.json({ accounts, totals });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Daily growth series. accountId=all → summed across the user's accounts.
// Followers come from recorded snapshots; new comments/day come straight from
// the comments table (real history, available before snapshots existed).
accountsRouter.get('/overview/history', async (req: Request, res: Response): Promise<void> => {
  const accountId = (req.query.accountId as string) || 'all';
  const days = Math.min(Math.max(parseInt((req.query.days as string) || '30', 10), 7), 90);

  try {
    // Resolve which account UUIDs belong to this user (and optionally one).
    const acctRows = accountId === 'all'
      ? await query<{ id: string }>('SELECT id FROM facebook_accounts WHERE user_id = $1', [req.user!.userId])
      : await query<{ id: string }>('SELECT id FROM facebook_accounts WHERE user_id = $1 AND id = $2', [req.user!.userId, accountId]);

    if (acctRows.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const ids = acctRows.rows.map((r) => r.id);

    // Followers per day: sum across accounts of the latest snapshot per day.
    const followersRows = await query<{ d: string; followers: string }>(
      `SELECT snapshot_date::text AS d, SUM(followers)::bigint AS followers
       FROM metric_snapshots
       WHERE facebook_account_id = ANY($1::uuid[])
         AND snapshot_date >= CURRENT_DATE - ($2::int - 1)
       GROUP BY snapshot_date
       ORDER BY snapshot_date`,
      [ids, days]
    );

    // New comments per day from the comments table.
    const commentsRows = await query<{ d: string; n: string }>(
      `SELECT created_at::date::text AS d, COUNT(*)::bigint AS n
       FROM comments
       WHERE facebook_account_id = ANY($1::uuid[])
         AND created_at >= CURRENT_DATE - ($2::int - 1)
       GROUP BY created_at::date
       ORDER BY created_at::date`,
      [ids, days]
    );

    const followersByDate = new Map(followersRows.rows.map((r) => [r.d, parseInt(r.followers, 10)]));
    const commentsByDate = new Map(commentsRows.rows.map((r) => [r.d, parseInt(r.n, 10)]));

    // Build a continuous daily series for the requested window.
    const series: { date: string; followers: number | null; comments: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      series.push({
        date: key,
        followers: followersByDate.has(key) ? followersByDate.get(key)! : null,
        comments: commentsByDate.get(key) || 0,
      });
    }

    res.json({ series });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

accountsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{
      id: string;
      account_name: string;
      account_id: string;
      avatar_url: string | null;
      connected_at: Date;
    }>(
      `SELECT id, account_name, account_id, avatar_url, connected_at
       FROM facebook_accounts WHERE user_id = $1
       ORDER BY connected_at ASC`,
      [req.user!.userId]
    );

    res.json({ accounts: result.rows, total: result.rows.length, max: 40 });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

accountsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) FROM facebook_accounts WHERE user_id = $1',
      [req.user!.userId]
    );

    if (parseInt(countResult.rows[0].count, 10) <= 1) {
      res.status(400).json({ error: 'Cannot disconnect the only account' });
      return;
    }

    const result = await query(
      'DELETE FROM facebook_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ message: 'Account disconnected' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

accountsRouter.get('/:id/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const acct = await query(
      'SELECT id FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (acct.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const result = await query<{ tone: string; rules_json: string }>(
      'SELECT tone, rules_json FROM account_settings WHERE facebook_account_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.json({ tone: 'comedy', rules: [] });
      return;
    }

    const s = result.rows[0];
    res.json({ tone: s.tone, rules: JSON.parse(s.rules_json) });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

accountsRouter.put('/:id/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const acct = await query(
      'SELECT id FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (acct.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const { tone = 'comedy', rules = [] } = req.body;
    const validTones = ['comedy', 'ironic', 'neutral', 'friendly', 'professional', 'casual', 'formal', 'empathetic'];

    if (!validTones.includes(tone)) {
      res.status(400).json({ error: 'Invalid tone' });
      return;
    }

    await query(
      `INSERT INTO account_settings (facebook_account_id, tone, rules_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (facebook_account_id) DO UPDATE
       SET tone = EXCLUDED.tone, rules_json = EXCLUDED.rules_json, updated_at = NOW()`,
      [req.params.id, tone, JSON.stringify(rules)]
    );

    res.json({ tone, rules });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

accountsRouter.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const acct = await query(
      'SELECT id FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (acct.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const statsResult = await query<{
      total_comments: string;
      responded: string;
      pending: string;
    }>(
      `SELECT
        COUNT(DISTINCT c.id) AS total_comments,
        COUNT(DISTINCT CASE WHEN r.status = 'published' THEN c.id END) AS responded,
        COUNT(DISTINCT CASE WHEN r.id IS NULL OR r.status = 'pending' THEN c.id END) AS pending
       FROM comments c
       LEFT JOIN responses r ON r.comment_id = c.id
       WHERE c.facebook_account_id = $1`,
      [req.params.id]
    );

    const s = statsResult.rows[0];
    res.json({
      totalComments: parseInt(s.total_comments, 10),
      responded: parseInt(s.responded, 10),
      pending: parseInt(s.pending, 10),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
