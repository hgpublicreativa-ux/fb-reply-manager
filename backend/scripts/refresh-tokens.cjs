/**
 * One-off maintenance: refresh Facebook PAGE access tokens directly in the DB,
 * bypassing the OAuth redirect flow (useful when the app's OAuth redirect domain
 * is not whitelisted in the Facebook app settings).
 *
 * Mirrors the /api/auth/facebook/callback handler exactly: derives page tokens
 * from a user token, encrypts them with the same AES-256-GCM scheme as
 * services/encryption.ts, and UPSERTs into facebook_accounts + account_settings.
 *
 * Run with production env injected (DATABASE_URL, ENCRYPTION_KEY come from Railway):
 *
 *   FB_USER_TOKEN="EAA..." FB_USER_EMAIL="you@example.com" \
 *     railway run node backend/scripts/refresh-tokens.cjs
 *
 * No secrets are stored in this file — the user token is passed via env var.
 */
const crypto = require('crypto');
const https = require('https');
const { Client } = require('pg');

const FB_BASE = 'https://graph.facebook.com/v21.0';
const ALGORITHM = 'aes-256-gcm';

const USER_TOKEN = process.env.FB_USER_TOKEN;
const USER_EMAIL = process.env.FB_USER_EMAIL; // optional; falls back to the only user
// Prefer DATABASE_PUBLIC_URL: when run locally via `railway run`, the injected
// DATABASE_URL points at the internal host (postgres.railway.internal) which only
// resolves inside Railway's network. Pass the public proxy URL to reach it locally.
const DATABASE_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!USER_TOKEN) throw new Error('FB_USER_TOKEN env var required');
if (!DATABASE_URL) throw new Error('DATABASE_URL env var required (use `railway run`)');
if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY env var required (use `railway run`)');

// Must match services/encryption.ts exactly so the app can decrypt.
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) reject(new Error(JSON.stringify(parsed.error)));
            else resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const me = await getJSON(
    `${FB_BASE}/me?fields=id,name,picture&access_token=${encodeURIComponent(USER_TOKEN)}`
  );
  const pagesRes = await getJSON(
    `${FB_BASE}/me/accounts?fields=id,name,picture,access_token&access_token=${encodeURIComponent(USER_TOKEN)}`
  );
  const pages = pagesRes.data || [];
  if (pages.length === 0) throw new Error('User token returned 0 pages — check token scopes');
  console.log(`User: ${me.name} (${me.id}) — ${pages.length} pages`);

  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    const userRes = USER_EMAIL
      ? await db.query('SELECT id, email FROM users WHERE email = $1', [USER_EMAIL])
      : await db.query('SELECT id, email FROM users ORDER BY created_at ASC LIMIT 2');

    if (userRes.rows.length === 0) throw new Error('No matching app user found');
    if (!USER_EMAIL && userRes.rows.length > 1) {
      throw new Error(
        'Multiple app users exist — set FB_USER_EMAIL to pick one: ' +
          userRes.rows.map((u) => u.email).join(', ')
      );
    }
    const userId = userRes.rows[0].id;
    console.log(`App user: ${userRes.rows[0].email} (${userId})`);

    let updated = 0;
    for (const page of pages) {
      const encryptedToken = encrypt(page.access_token);
      const avatarUrl = page.picture?.data?.url || me.picture?.data?.url || null;

      await db.query(
        `INSERT INTO facebook_accounts (user_id, account_name, account_id, access_token, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, account_id) DO UPDATE
         SET access_token = EXCLUDED.access_token, avatar_url = EXCLUDED.avatar_url`,
        [userId, page.name, page.id, encryptedToken, avatarUrl]
      );

      const acct = await db.query(
        'SELECT id FROM facebook_accounts WHERE user_id = $1 AND account_id = $2',
        [userId, page.id]
      );
      if (acct.rows.length > 0) {
        await db.query(
          `INSERT INTO account_settings (facebook_account_id) VALUES ($1)
           ON CONFLICT (facebook_account_id) DO NOTHING`,
          [acct.rows[0].id]
        );
      }
      updated++;
      console.log(`  ✓ ${page.name} (${page.id})`);
    }
    console.log(`Done — ${updated} page tokens refreshed.`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('refresh-tokens failed:', err.message);
  process.exit(1);
});
