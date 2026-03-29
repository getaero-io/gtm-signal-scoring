import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export { pool };

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO inbound, public");
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}
