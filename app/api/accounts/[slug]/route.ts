import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Lookup by domain
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get('authorization')?.replace('Bearer ', '') ||
      req.nextUrl.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const domain = slug.toLowerCase();
  const accounts = await query(
    `SELECT * FROM inbound.account_scores WHERE domain = $1`,
    [domain]
  );

  if (!accounts[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Use company_id from companies_resolved when available, fall back to text match
  const contacts = await query(
    `SELECT l.id, l.email, l.full_name, l.title, l.linkedin_url,
            l.qualification_score, l.status, l.source, l.attio_id,
            l.person_id, l.company_id,
            p.primary_name as person_name,
            qr.breakdown, qr.flags, qr.reason
     FROM inbound.leads l
     LEFT JOIN LATERAL (
       SELECT breakdown, flags, reason
       FROM inbound.qualification_results
       WHERE lead_id = l.id
       ORDER BY created_at DESC LIMIT 1
     ) qr ON true
     LEFT JOIN inbound.persons p ON p.id = l.person_id
     WHERE l.company_id = (SELECT id FROM inbound.companies_resolved WHERE primary_domain = $1 LIMIT 1)
        OR (l.company_id IS NULL AND l.company_domain = $1)
     ORDER BY l.qualification_score DESC NULLS LAST`,
    [domain]
  );

  // Deduplicate contacts by person_id (keep highest-scored per person)
  const seen = new Map<string, any>();
  const deduped: any[] = [];
  for (const c of contacts) {
    const key = c.person_id || c.id;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(c);
    }
  }

  return NextResponse.json({
    account: accounts[0],
    contacts: deduped,
    contact_count: deduped.length,
    total_lead_records: contacts.length,
  });
}
