import { NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET() {
  try {
    const funnel = await writeQuery<{
      total: string;
      approved: string;
      sent: string;
      pending: string;
      rejected: string;
      avg_time_to_send_seconds: string | null;
    }>(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status IN ('approved', 'approved_queued')) as approved,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))
        FILTER (WHERE status = 'sent')::numeric, 1) as avg_time_to_send_seconds
    FROM inbound.conversations`);

    return NextResponse.json({ funnel: funnel[0] ?? null });
  } catch (error) {
    console.error('[signals/conversations] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch conversation stats', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
