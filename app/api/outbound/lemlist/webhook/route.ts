import { NextRequest, NextResponse } from 'next/server';
import { handleLemlistWebhook } from '@/lib/outbound/lemlist/webhook-handler';
import { logWebhookEvent, updateWebhookEvent } from '@/lib/outbound/safety/webhook-logger';

export async function POST(req: NextRequest) {
  let eventId: number | null = null;

  try {
    // Verify webhook secret if configured
    const expectedSecret = process.env.LEMLIST_WEBHOOK_SECRET;
    if (expectedSecret) {
      const headerSecret = req.headers.get('x-lemlist-secret');
      const querySecret = req.nextUrl.searchParams.get('secret');
      if (headerSecret !== expectedSecret && querySecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json();

    // Log every Lemlist webhook event to DB (regardless of type)
    eventId = await logWebhookEvent({
      source: 'lemlist',
      eventType: payload.type || 'unknown',
      rawPayload: payload,
    });

    const result = await handleLemlistWebhook(payload);

    // Update event with processing result
    await updateWebhookEvent(eventId, {
      status: result.ok ? 'processed' : 'failed',
      leadId: undefined,
      conversationId: result.conversation_id,
      processingResult: result as Record<string, unknown>,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/outbound/lemlist/webhook] Error:", err);
    if (eventId) {
      await updateWebhookEvent(eventId, {
        status: 'failed',
        errorMessage: (err as Error).message,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, error: 'Internal error', detail: (err as Error).message });
  }
}
