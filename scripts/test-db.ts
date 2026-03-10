import { query } from '../lib/db';

async function testConnection() {
  try {
    const result = await query('SELECT COUNT(*) FROM dl_resolved.resolved_companies WHERE is_match = true');
    console.log('✅ Database connected:', result[0]);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }
}

testConnection();
