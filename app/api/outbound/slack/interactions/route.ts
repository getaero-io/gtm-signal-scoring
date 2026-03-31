import { NextRequest, NextResponse } from 'next/server';
import { handleInteraction, verifySlackSignature } from '@/lib/outbound/slack/interactions';
import { logWebhookEvent, updateWebhookEvent } from '@/lib/outbound/safety/webhook-logger';

export async function POST(req: NextRequest) {
  // Read raw body first for signature verification
  const rawBody = await req.text();

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (signingSecret) {
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';
    const valid = verifySlackSignature(signingSecret, timestamp, rawBody, signature);
    if (!valid) {
      console.warn(`[slack/interactions] Signature verification failed (ts=${timestamp}, sig_len=${signature.length}, secret_len=${signingSecret.length})`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[slack/interactions] SLACK_SIGNING_SECRET is not set — skipping signature verification');
  }

  // Parse payload from URL-encoded body
  let payload: any;
  try {
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      const body = JSON.parse(rawBody);
      if (body?.payload) {
        payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
      }
      if (!payload) {
        return NextResponse.json({ error: "missing payload" }, { status: 400 });
      }
    } else {
      payload = JSON.parse(payloadStr);
    }
  } catch (err) {
    console.error("[slack/interactions] Failed to parse payload:", err);
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // Log to DB (non-blocking — must not prevent ack)
  const actionIds = (payload.actions || []).map((a: any) => a.action_id).join(',');
  const eventIdP = logWebhookEvent({
    source: 'slack_interaction',
    eventType: actionIds || payload.type || 'unknown',
    rawPayload: payload,
  }).catch((err) => {
    console.error("[slack/interactions] Failed to log webhook event:", err);
    return null;
  });

  // Ack immediately, process async (Slack needs response within 3s)
  handleInteraction(payload)
    .then(async () => {
      const eventId = await eventIdP;
      if (eventId) await updateWebhookEvent(eventId, { status: 'processed' });
    })
    .catch(async (err) => {
      console.error("[slack/interactions] Error:", err);
      const eventId = await eventIdP;
      if (eventId) {
        await updateWebhookEvent(eventId, {
          status: 'failed',
          errorMessage: (err as Error).message,
        }).catch(() => {});
      }
    });

  return NextResponse.json({ ok: true });
}
