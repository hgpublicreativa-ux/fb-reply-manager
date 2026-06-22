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
import { getPageComments, getPageInfo } from './services/facebook';
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

        await recordDailySnapshot(account.id, account.account_id, token);
      } catch (err) {
        console.error(`[auto-sync] failed for account ${account.account_id}:`, err);
      }
    }
    console.log(`[auto-sync] done in ${Date.now() - start}ms — total new: ${totalAdded}`);
  } catch (err) {
    console.error('[auto-sync] error:', err);
  }
}

// Record one snapshot per account per day. Only hits Facebook for followers
// when today's row is missing, so it's at most one extra call/account/day.
async function recordDailySnapshot(accountUuid: string, pageId: string, token: string) {
  try {
    const existing = await query(
      'SELECT 1 FROM metric_snapshots WHERE facebook_account_id = $1 AND snapshot_date = CURRENT_DATE',
      [accountUuid]
    );
    if (existing.rowCount && existing.rowCount > 0) return;

    const info = await getPageInfo(pageId, token);
    const followers = info.followers ?? info.fanCount;
    const countRes = await query<{ count: string }>(
      'SELECT COUNT(*) FROM comments WHERE facebook_account_id = $1',
      [accountUuid]
    );
    const totalComments = parseInt(countRes.rows[0].count, 10);

    await query(
      `INSERT INTO metric_snapshots (facebook_account_id, snapshot_date, followers, total_comments)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (facebook_account_id, snapshot_date) DO UPDATE
       SET followers = EXCLUDED.followers, total_comments = EXCLUDED.total_comments`,
      [accountUuid, followers, totalComments]
    );
  } catch (err) {
    console.error(`[snapshot] failed for account ${pageId}:`, err);
  }
}

async function ensureSchema() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS metric_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        facebook_account_id UUID NOT NULL REFERENCES facebook_accounts(id) ON DELETE CASCADE,
        snapshot_date DATE NOT NULL,
        followers INTEGER,
        total_comments INTEGER,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(facebook_account_id, snapshot_date)
      )
    `);
    await query(
      'CREATE INDEX IF NOT EXISTS idx_metric_snapshots_account_date ON metric_snapshots(facebook_account_id, snapshot_date)'
    );
  } catch (err) {
    console.error('[ensureSchema] error:', err);
  }
}

function startAutoSync() {
  ensureSchema().then(() => syncAllAccounts());
  setInterval(syncAllAccounts, 30 * 1000);
}

export default app;
