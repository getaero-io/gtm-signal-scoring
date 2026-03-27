import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifySlackSignature } from '@/lib/outbound/slack/interactions';
import { logWebhookEvent } from '@/lib/outbound/safety/webhook-logger';
import { handleThreadReply } from '@/lib/outbound/slack/thread-replies';

export async function POST(req: NextRequest) {
  // Read raw body first for signature verification
  const rawBody = await req.text();

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[slack/events] SLACK_SIGNING_SECRET is not set — skipping signature verification');
  }

  const event = JSON.parse(rawBody);

  // Handle Slack URL verification challenge (don't log these)
  if (event && event.type === "url_verification") {
    return NextResponse.json({ challenge: event.challenge });
  }

  // Log every Slack event to DB for observability
  logWebhookEvent({
    source: 'slack_event',
    eventType: event?.event?.type || event?.type || 'unknown',
    rawPayload: event,
    status: 'processed',
  }).catch((err) => console.error('[slack/events] Failed to log event:', err));

  // Handle thread replies — capture edited responses
  const innerEvent = event?.event;
  if (
    innerEvent?.type === 'message' &&
    innerEvent.thread_ts &&
    innerEvent.thread_ts !== innerEvent.ts && // is a reply, not the parent
    !innerEvent.bot_id &&                     // not from a bot
    !innerEvent.subtype &&                    // not a message_changed etc.
    innerEvent.text
  ) {
    after(async () => {
      try {
        await handleThreadReply({
          threadTs: innerEvent.thread_ts,
          channel: innerEvent.channel,
          userId: innerEvent.user,
          text: innerEvent.text,
          messageTs: innerEvent.ts,
        });
      } catch (err) {
        console.error('[slack/events] Thread reply handler error:', err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
