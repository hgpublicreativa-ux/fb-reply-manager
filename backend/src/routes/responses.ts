import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../config/database';
import { generateResponse } from '../services/claude';
import { publishComment } from '../services/facebook';
import { decrypt, encrypt } from '../services/encryption';

export const responsesRouter = Router();
responsesRouter.use(authenticateToken);

responsesRouter.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const { commentId } = req.body;

  if (!commentId) {
    res.status(400).json({ error: 'commentId required' });
    return;
  }

  try {
    const commentResult = await query<{
      id: string;
      comment_id: string;
      text: string;
      author_name: string | null;
      facebook_account_id: string;
    }>(
      `SELECT c.id, c.comment_id, c.text, c.author_name, c.facebook_account_id
       FROM comments c
       JOIN facebook_accounts fa ON fa.id = c.facebook_account_id
       WHERE c.id = $1 AND fa.user_id = $2`,
      [commentId, req.user!.userId]
    );

    if (commentResult.rows.length === 0) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const comment = commentResult.rows[0];

    const acctResult = await query<{ account_name: string }>(
      'SELECT account_name FROM facebook_accounts WHERE id = $1',
      [comment.facebook_account_id]
    );

    const settingsResult = await query<{ tone: string; rules_json: string }>(
      'SELECT tone, rules_json FROM account_settings WHERE facebook_account_id = $1',
      [comment.facebook_account_id]
    );

    const tone = settingsResult.rows[0]?.tone || 'professional';
    const rules = JSON.parse(settingsResult.rows[0]?.rules_json || '[]') as string[];
    const accountName = acctResult.rows[0]?.account_name || 'the page';

    const suggested = await generateResponse(
      comment.text,
      comment.author_name || 'User',
      accountName,
      tone,
      rules
    );

    const existing = await query<{ id: string }>(
      'SELECT id FROM responses WHERE comment_id = $1',
      [comment.id]
    );

    let responseId: string;

    if (existing.rows.length > 0) {
      await query(
        `UPDATE responses SET suggested_text = $1, status = 'pending', updated_at = NOW()
         WHERE id = $2`,
        [suggested, existing.rows[0].id]
      );
      responseId = existing.rows[0].id;
    } else {
      const inserted = await query<{ id: string }>(
        `INSERT INTO responses (comment_id, user_id, suggested_text, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [comment.id, req.user!.userId, suggested]
      );
      responseId = inserted.rows[0].id;
    }

    res.json({ responseId, suggestedText: suggested });
  } catch (err) {
    console.error('Generate response error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

responsesRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { actualText } = req.body;

  if (!actualText) {
    res.status(400).json({ error: 'actualText required' });
    return;
  }

  try {
    const result = await query(
      `UPDATE responses SET actual_text = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND status != 'published'
       RETURNING id`,
      [actualText, req.params.id, req.user!.userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Response not found or already published' });
      return;
    }

    res.json({ message: 'Response updated' });
  } catch (err) {
    console.error('Update response error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

responsesRouter.post('/:id/publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const responseResult = await query<{
      id: string;
      comment_id: string;
      suggested_text: string | null;
      actual_text: string | null;
      status: string;
    }>(
      'SELECT id, comment_id, suggested_text, actual_text, status FROM responses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (responseResult.rows.length === 0) {
      res.status(404).json({ error: 'Response not found' });
      return;
    }

    const response = responseResult.rows[0];

    if (response.status === 'published') {
      res.status(400).json({ error: 'Already published' });
      return;
    }

    const textToPublish = response.actual_text || response.suggested_text;
    if (!textToPublish) {
      res.status(400).json({ error: 'No text to publish' });
      return;
    }

    const commentResult = await query<{
      comment_id: string;
      facebook_account_id: string;
    }>(
      `SELECT c.comment_id, c.facebook_account_id
       FROM comments c WHERE c.id = $1`,
      [response.comment_id]
    );

    const comment = commentResult.rows[0];

    if (!comment.comment_id) {
      res.status(400).json({ error: 'Comment ID not available for this comment' });
      return;
    }

    const acctResult = await query<{ access_token: string }>(
      'SELECT access_token FROM facebook_accounts WHERE id = $1 AND user_id = $2',
      [comment.facebook_account_id, req.user!.userId]
    );

    const decryptedToken = decrypt(acctResult.rows[0].access_token);
    await publishComment(comment.comment_id, textToPublish, decryptedToken);

    await query(
      `UPDATE responses SET status = 'published', actual_text = $1, published_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [textToPublish, response.id]
    );

    res.json({ message: 'Published successfully' });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Failed to publish response' });
  }
});

responsesRouter.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `UPDATE responses SET status = 'rejected', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status != 'published'
       RETURNING id`,
      [req.params.id, req.user!.userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Response not found or already published' });
      return;
    }

    res.json({ message: 'Response rejected' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
