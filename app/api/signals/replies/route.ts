import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get('status'); // pending, approved, sent, rejected
    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const offset = parseInt(params.get('offset') || '0');

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) {
      if (status === 'needs_response') {
        conditions.push(`c.status = 'pending'`);
      } else if (status === 'responded') {
        conditions.push(`c.status IN ('approved', 'approved_queued', 'sent')`);
      } else {
        conditions.push(`c.status = $${idx}`);
        values.push(status);
        idx++;
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [replies, countResult, funnel] = await Promise.all([
      query<{
        id: number;
        lead_id: string;
        direction: string;
        channel: string;
        original_message: string;
        drafted_response: string | null;
        final_response: string | null;
        status: string;
        approved_by: string | null;
        sent_at: string | null;
        created_at: string;
        updated_at: string;
        metadata: Record<string, unknown>;
        lead_name: string;
        lead_email: string;
        company_name: string;
        lead_source: string;
      }>(
        `SELECT c.id, c.lead_id, c.direction, c.channel, c.original_message,
         c.drafted_response, c.final_response, c.status, c.approved_by,
         c.sent_at, c.created_at, c.updated_at, c.metadata,
         COALESCE(l.full_name, l.first_name || ' ' || l.last_name, 'Unknown') as lead_name,
         l.email as lead_email,
         COALESCE(l.company_name, l.company) as company_name,
         l.source as lead_source
         FROM inbound.conversations c
         LEFT JOIN inbound.leads l ON l.id = c.lead_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*) as total FROM inbound.conversations c ${where}`,
        values
      ),
      query<{
        total: string;
        pending: string;
        approved: string;
        sent: string;
        rejected: string;
      }>(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status IN ('approved', 'approved_queued')) as approved,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected
      FROM inbound.conversations`),
    ]);

    return NextResponse.json({
      replies,
      total: parseInt(countResult[0]?.total || '0'),
      funnel: funnel[0] || { total: '0', pending: '0', approved: '0', sent: '0', rejected: '0' },
      limit,
      offset,
    });
  } catch (error) {
    console.error('[signals/replies] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch replies', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
