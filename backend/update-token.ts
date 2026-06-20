import { query } from './src/config/database';
import { encrypt } from './src/services/encryption';

const NEW_PAGE_TOKEN = 'EAAhzXGE9ZBzsBR6hvUMPrOTzJLRZBHiF9BZCbBQoKaAvqGF575ALZACnC6PtJNSM0u1Io8nghWeNZC7pqE0hiIlLaQy4tv3yRAU8jaxWvsrkHzlBWYUZAVyl0Hyseb9jWwJl1stC9oKuj3vwdyIpoPKJLX2ZAIFOt0deLLM0yzC9VGkibEgjIxbjeZBWnmaXjOj5vmoOLYNp8Nxy2fRqAL0d';
const PAGE_ID = '321760877696392'; // Famosos TVEC

async function updateToken() {
  try {
    const encryptedToken = encrypt(NEW_PAGE_TOKEN);
    const result = await query<{ id: string; account_name: string }>(
      'UPDATE facebook_accounts SET access_token = $1 WHERE account_id = $2 RETURNING id, account_name',
      [encryptedToken, PAGE_ID]
    );

    if (result.rows.length > 0) {
      console.log('✅ Token actualizado para:', result.rows[0].account_name);
      console.log('   ID:', result.rows[0].id);
    } else {
      console.log('❌ Cuenta no encontrada');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
  process.exit(0);
}

updateToken();
