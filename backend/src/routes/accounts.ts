import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../config/database';

export const accountsRouter = Router();
accountsRouter.use(authenticateToken);

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
