import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('[db] FATAL: DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query<T = Record<string, any>>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<T & Record<string, any>>(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export default pool;
