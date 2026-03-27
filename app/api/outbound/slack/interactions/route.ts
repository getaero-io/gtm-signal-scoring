import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { handleInteraction, verifySlackSignature } from '@/lib/outbound/slack/interactions';
import { logWebhookEvent, updateWebhookEvent } from '@/lib/outbound/safety/webhook-logger';

export async function POST(req: NextRequest) {
  // Read raw body first for signature verification
  const rawBody = await req.text();

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';
    if (!timestamp || !signature) {
      console.error(`[slack/interactions] Missing headers: timestamp=${!!timestamp}, signature=${!!signature}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      console.error(`[slack/interactions] Signature verification failed. Secret length=${signingSecret.length}, body length=${rawBody.length}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[slack/interactions] SLACK_SIGNING_SECRET is not set — skipping signature verification');
  }

  // Parse payload from URL-encoded body
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');

  let payload: any;
  if (!payloadStr) {
    try {
      const body = JSON.parse(rawBody);
      if (body?.payload) {
        payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
      }
    } catch {}
    if (!payload) {
      return NextResponse.json({ error: "missing payload" }, { status: 400 });
    }
  } else {
    payload = JSON.parse(payloadStr);
  }

  // Log raw Slack interaction to DB
  const actionIds = (payload.actions || []).map((a: any) => a.action_id).join(',');
  const eventId = await logWebhookEvent({
    source: 'slack_interaction',
    eventType: actionIds || payload.type || 'unknown',
    rawPayload: payload,
  });

  // Ack immediately, process async (Slack needs response within 3s)
  // Use after() to keep the function alive for background DB/Slack work
  after(async () => {
    try {
      await handleInteraction(payload);
      if (eventId) await updateWebhookEvent(eventId, { status: 'processed' });
    } catch (err) {
      console.error("[slack/interactions] Error:", err);
      if (eventId) {
        await updateWebhookEvent(eventId, {
          status: 'failed',
          errorMessage: (err as Error).message,
        }).catch(() => {});
      }
    }
  });

  return NextResponse.json({ ok: true });
}
