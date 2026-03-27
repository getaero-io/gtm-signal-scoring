/**
 * Reprocess conversations that have empty drafted_response.
 * Deletes the processed_webhook_events record for the corresponding event,
 * then re-runs the consumer to process them again.
 *
 * POST /api/events/reprocess-empty-drafts
 * Requires CRON_SECRET auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';
import { processWebhookEvents } from '@/lib/outbound/webhooks/consumer';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find conversations with empty drafts that have a deepline_event_row_id
    const emptyDrafts = await writeQuery<{ id: number; event_row_id: string }>(
      `SELECT c.id, c.metadata->>'deepline_event_row_id' as event_row_id
       FROM inbound.conversations c
       WHERE (c.drafted_response IS NULL OR c.drafted_response = '')
         AND c.metadata->>'deepline_event_row_id' IS NOT NULL`
    );

    if (emptyDrafts.length === 0) {
      return NextResponse.json({ ok: true, message: 'No empty drafts found', reset: 0 });
    }

    const eventRowIds = emptyDrafts.map((r) => r.event_row_id).filter(Boolean);
    const convIds = emptyDrafts.map((r) => r.id);

    // Delete the processed_webhook_events records so consumer can re-fetch them
    let deletedEvents = 0;
    if (eventRowIds.length > 0) {
      const result = await writeQuery(
        `DELETE FROM inbound.processed_webhook_events
         WHERE event_row_id = ANY($1::uuid[])`,
        [eventRowIds]
      );
      deletedEvents = (result as any).rowCount ?? eventRowIds.length;
    }

    // Delete the empty-draft conversations so they don't conflict
    let deletedConvs = 0;
    if (convIds.length > 0) {
      const result = await writeQuery(
        `DELETE FROM inbound.conversations WHERE id = ANY($1::int[])`,
        [convIds]
      );
      deletedConvs = (result as any).rowCount ?? convIds.length;
    }

    // Now re-run the consumer to process the events fresh
    const processResult = await processWebhookEvents();

    return NextResponse.json({
      ok: true,
      empty_drafts_found: emptyDrafts.length,
      events_reset: deletedEvents,
      conversations_deleted: deletedConvs,
      reprocess_result: processResult,
    });
  } catch (err) {
    console.error('[reprocess-empty-drafts] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
