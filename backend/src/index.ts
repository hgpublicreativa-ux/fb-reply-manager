import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import { authRouter } from './routes/auth';
import { accountsRouter } from './routes/accounts';
import { commentsRouter } from './routes/comments';
import { responsesRouter } from './routes/responses';
import { query } from './config/database';
import { getPageComments } from './services/facebook';
import { decrypt } from './services/encryption';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/responses', responsesRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  startAutoSync();
});

async function syncAllAccounts() {
  const start = Date.now();
  try {
    const accounts = await query<{ id: string; account_id: string; access_token: string }>(
      'SELECT id, account_id, access_token FROM facebook_accounts'
    );
    console.log(`[auto-sync] running for ${accounts.rows.length} accounts`);
    let totalAdded = 0;
    for (const account of accounts.rows) {
      try {
        const token = decrypt(account.access_token);
        const fbComments = await getPageComments(account.account_id, token);
        let added = 0;
        for (const comment of fbComments) {
          const r = await query(
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
          if (r.rowCount && r.rowCount > 0) added++;
        }
        totalAdded += added;
        console.log(`[auto-sync] ${account.account_id}: ${fbComments.length} fetched, ${added} new`);
      } catch (err) {
        console.error(`[auto-sync] failed for account ${account.account_id}:`, err);
      }
    }
    console.log(`[auto-sync] done in ${Date.now() - start}ms — total new: ${totalAdded}`);
  } catch (err) {
    console.error('[auto-sync] error:', err);
  }
}

function startAutoSync() {
  syncAllAccounts();
  setInterval(syncAllAccounts, 5 * 60 * 1000);
}

export default app;
