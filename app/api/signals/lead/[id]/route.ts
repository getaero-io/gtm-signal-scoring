import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [leads, qualResults, learnings] = await Promise.all([
    writeQuery<Record<string, unknown>>(
      `SELECT l.*,
         p.primary_name as person_name, p.primary_email as person_email, p.primary_linkedin_url as person_linkedin,
         cr.primary_domain as company_resolved_domain, cr.primary_name as company_resolved_name
       FROM inbound.leads l
       LEFT JOIN inbound.persons p ON p.id = l.person_id
       LEFT JOIN inbound.companies_resolved cr ON cr.id = l.company_id
       WHERE l.id = $1::uuid`,
      [id],
    ),
    writeQuery<Record<string, unknown>>(
      `SELECT * FROM inbound.qualification_results WHERE lead_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [id],
    ),
    writeQuery<Record<string, unknown>>(
      `SELECT * FROM inbound.learnings WHERE entity_id = $1 ORDER BY updated_at DESC`,
      [id],
    ),
  ]);

  if (!leads[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const lead = leads[0];

  // Fetch sibling leads (other leads linked to the same person)
  let siblingLeads: Record<string, unknown>[] = [];
  if (lead.person_id) {
    siblingLeads = await writeQuery<Record<string, unknown>>(
      `SELECT id, email, full_name, first_name, last_name, source, status, qualification_score, created_at
       FROM inbound.leads
       WHERE person_id = $1 AND id != $2::uuid
       ORDER BY created_at DESC`,
      [lead.person_id, id],
    );
  }

  return NextResponse.json({
    lead,
    qualification: qualResults[0] || null,
    learnings,
    sibling_leads: siblingLeads,
  });
}
