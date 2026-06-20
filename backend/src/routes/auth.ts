import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import {
  getFacebookAuthUrl,
  exchangeCodeForToken,
  getMe,
  getPages,
} from '../services/facebook';
import { encrypt } from '../services/encryption';

export const authRouter = Router();

authRouter.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await query<{ id: string; email: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, passwordHash]
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

authRouter.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    try {
      const result = await query<{ id: string; email: string; password_hash: string }>(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);

      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

authRouter.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{ id: string; email: string; created_at: Date }>(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/facebook', authenticateToken, (req: Request, res: Response) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user!.userId })).toString('base64');
  const url = getFacebookAuthUrl() + `&state=${encodeURIComponent(state)}`;
  res.json({ url });
});

authRouter.get('/facebook/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    res.redirect(`${frontendUrl}/accounts?error=facebook_denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/accounts?error=missing_params`);
    return;
  }

  try {
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const userId = stateData.userId;

    const accessToken = await exchangeCodeForToken(code as string);
    const me = await getMe(accessToken);
    const pages = await getPages(accessToken);

    const accountCount = await query<{ count: string }>(
      'SELECT COUNT(*) FROM facebook_accounts WHERE user_id = $1',
      [userId]
    );

    const currentCount = parseInt(accountCount.rows[0].count, 10);
    const available = 40 - currentCount;
    const toAdd = pages.slice(0, available);

    for (const page of toAdd) {
      const encryptedToken = encrypt(page.access_token);
      const avatarUrl = page.picture?.data?.url || me.picture?.data?.url || null;

      await query(
        `INSERT INTO facebook_accounts (user_id, account_name, account_id, access_token, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, account_id) DO UPDATE
         SET access_token = EXCLUDED.access_token, avatar_url = EXCLUDED.avatar_url`,
        [userId, page.name, page.id, encryptedToken, avatarUrl]
      );

      const acctResult = await query<{ id: string }>(
        'SELECT id FROM facebook_accounts WHERE user_id = $1 AND account_id = $2',
        [userId, page.id]
      );

      if (acctResult.rows.length > 0) {
        await query(
          `INSERT INTO account_settings (facebook_account_id) VALUES ($1)
           ON CONFLICT (facebook_account_id) DO NOTHING`,
          [acctResult.rows[0].id]
        );
      }
    }

    res.redirect(`${frontendUrl}/accounts?success=connected&added=${toAdd.length}`);
  } catch (err) {
    console.error('Facebook callback error:', err);
    res.redirect(`${frontendUrl}/accounts?error=connection_failed`);
  }
});
