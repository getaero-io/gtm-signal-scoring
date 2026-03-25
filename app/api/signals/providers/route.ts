import { NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET() {
  try {
    const [providers, recentFailures] = await Promise.all([
      writeQuery<{
        source: string;
        total_events: string;
        processed: string;
        failed: string;
        skipped: string;
        rate_limited: string;
        avg_processing_seconds: string | null;
        last_event_at: string;
      }>(`SELECT source,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE status = 'processed') as processed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) FILTER (WHERE status = 'rate_limited') as rate_limited,
        ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))
          FILTER (WHERE processed_at IS NOT NULL)::numeric, 2) as avg_processing_seconds,
        MAX(created_at) as last_event_at
      FROM inbound.webhook_events
      GROUP BY source
      ORDER BY total_events DESC`),

      writeQuery<{
        id: string;
        source: string;
        event_type: string;
        error_message: string | null;
        created_at: string;
      }>(`SELECT id, source, event_type, error_message, created_at
        FROM inbound.webhook_events
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 20`),
    ]);

    return NextResponse.json({ providers, recent_failures: recentFailures });
  } catch (error) {
    console.error('[signals/providers] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch provider stats', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
