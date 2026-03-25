import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [leads, qualResults, learnings] = await Promise.all([
    writeQuery<Record<string, unknown>>(`SELECT * FROM inbound.leads WHERE id = $1::uuid`, [id]),
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

  return NextResponse.json({
    lead: leads[0],
    qualification: qualResults[0] || null,
    learnings,
  });
}
