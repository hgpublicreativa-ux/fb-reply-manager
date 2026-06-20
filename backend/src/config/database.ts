import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err);
  process.exit(-1);
});

export const query = <T = Record<string, unknown>>(
  text: string,
  params?: (string | number | boolean | null | Date)[]
) => pool.query<T>(text, params);
