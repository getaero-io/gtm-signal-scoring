import { Pool, QueryResult } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result: QueryResult<T> = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export default pool;
