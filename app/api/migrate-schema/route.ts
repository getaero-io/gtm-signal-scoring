import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: string[] = [];

  const migrations = [
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS first_name TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS last_name TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS company_name TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS company_domain TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS linkedin_url TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS qualification_score INTEGER`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS qualification_reason TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS external_id TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS campaign_id TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS smartlead_id TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS attio_id TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS assigned_rep TEXT`,
    `ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    // Backfill created_at from submitted_at where null
    `UPDATE inbound.leads SET created_at = submitted_at WHERE created_at IS NULL AND submitted_at IS NOT NULL`,
  ];

  for (const sql of migrations) {
    try {
      await writeQuery(sql);
      results.push(`OK: ${sql.slice(0, 80)}`);
    } catch (err: any) {
      results.push(`ERR: ${sql.slice(0, 80)} — ${err.message}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
