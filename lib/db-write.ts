import { Pool } from 'pg';

// Uses DATABASE_WRITE_URL for write operations (new inbound.* tables)
// Falls back to DATABASE_URL if write URL not set (dev convenience)
const writePool = new Pool({
  connectionString: process.env.DATABASE_WRITE_URL || process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function writeQuery<T = Record<string, any>>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const client = await writePool.connect();
  try {
    const result = await client.query<T & Record<string, any>>(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export default writePool;
