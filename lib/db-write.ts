import { Pool } from 'pg';

if (!process.env.DATABASE_WRITE_URL && !process.env.DATABASE_URL) {
  console.error('[db-write] FATAL: Neither DATABASE_WRITE_URL nor DATABASE_URL environment variable is set');
}

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

export type TxClient = {
  query: <T = Record<string, any>>(text: string, params?: any[]) => Promise<T[]>;
};

/** Run callback inside a BEGIN/COMMIT transaction. Rolls back on error. */
export async function writeTransaction<T>(
  fn: (client: TxClient) => Promise<T>
): Promise<T> {
  const client = await writePool.connect();
  try {
    await client.query("BEGIN");
    const txClient: TxClient = {
      query: async <R = Record<string, any>>(text: string, params?: any[]) => {
        const result = await client.query<R & Record<string, any>>(text, params);
        return result.rows as R[];
      },
    };
    const result = await fn(txClient);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default writePool;
