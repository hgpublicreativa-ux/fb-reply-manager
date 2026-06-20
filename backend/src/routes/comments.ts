import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../config/database';
import { getPageComments } from '../services/facebook';
import { decrypt } from '../services/encryption';

export const commentsRouter = Router();
commentsRouter.use(authenticateToken);

commentsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { accountId, filter = 'all', search = '', page = '1', limit = '20' } = req.query;

  if (!accountId) {
    res.status(400).json({ error: 'accountId required' });
    return;
  }

  try {
    const acct = await query(
      'SELECT id FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [accountId as string, req.user!.userId]
    );

    if (acct.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    let filterClause = '';
    if (filter === 'pending') filterClause = `AND (r.id IS NULL OR r.status = 'pending')`;
    else if (filter === 'responded') filterClause = `AND r.status = 'published'`;

    const searchClause = search
      ? `AND (c.text ILIKE $4 OR c.author_name ILIKE $4)`
      : '';

    const params: (string | number)[] = [accountId as string, parseInt(limit as string), offset];
    if (search) params.push(`%${search}%`);

    const result = await query<{
      id: string;
      comment_id: string;
      post_id: string | null;
      text: string;
      author_name: string | null;
      author_id: string | null;
      created_at: Date;
      post_message: string | null;
      post_permalink: string | null;
      response_id: string | null;
      suggested_text: string | null;
      actual_text: string | null;
      status: string | null;
    }>(
      `SELECT
         c.id, c.comment_id, c.post_id, c.text, c.author_name, c.author_id, c.created_at, c.post_message, c.post_permalink,
         r.id AS response_id, r.suggested_text, r.actual_text, r.status
       FROM comments c
       LEFT JOIN responses r ON r.comment_id = c.id
       WHERE c.facebook_account_id = $1
       ${filterClause}
       ${searchClause}
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM comments c
       LEFT JOIN responses r ON r.comment_id = c.id
       WHERE c.facebook_account_id = $1
       ${filterClause}
       ${searchClause}`,
      search ? [accountId as string, `%${search}%`] : [accountId as string]
    );

    res.json({
      comments: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

commentsRouter.post('/sync/:accountId', async (req: Request, res: Response): Promise<void> => {
  try {
    const acct = await query<{ id: string; account_id: string; access_token: string }>(
      'SELECT id, account_id, access_token FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [req.params.accountId, req.user!.userId]
    );

    if (acct.rowCount === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = acct.rows[0];
    const decryptedToken = decrypt(account.access_token);
    const fbComments = await getPageComments(account.account_id, decryptedToken);

    let added = 0;
    for (const comment of fbComments) {
      const result = await query(
        `INSERT INTO comments (facebook_account_id, comment_id, post_id, text, author_name, author_id, created_at, post_message, post_permalink)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (comment_id) DO NOTHING`,
        [
          account.id,
          comment.id,
          comment.post_id || null,
          comment.message || '',
          comment.from?.name || null,
          comment.from?.id || null,
          new Date(comment.created_time),
          comment.post_message || null,
          comment.post_permalink || null,
        ]
      );
      if (result.rowCount && result.rowCount > 0) added++;
    }

    res.json({ message: 'Sync complete', added });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});
