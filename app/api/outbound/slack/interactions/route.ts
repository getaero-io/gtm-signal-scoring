import { NextRequest, NextResponse } from 'next/server';
import { handleInteraction, verifySlackSignature } from '@/lib/outbound/slack/interactions';

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
    console.warn('[slack/interactions] SLACK_SIGNING_SECRET is not set — skipping signature verification');
  }

  // Parse payload from URL-encoded body
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');

  if (!payloadStr) {
    // Try parsing as JSON fallback
    try {
      const body = JSON.parse(rawBody);
      if (body?.payload) {
        const payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
        // Fire and forget - Slack needs response within 3s
        handleInteraction(payload).catch(err =>
          console.error("[slack/interactions] Error:", err)
        );
        return NextResponse.json({ ok: true });
      }
    } catch {}
    return NextResponse.json({ error: "missing payload" }, { status: 400 });
  }

  // Ack immediately, process async
  const payload = JSON.parse(payloadStr);
  handleInteraction(payload).catch(err =>
    console.error("[slack/interactions] Error:", err)
  );

  return NextResponse.json({ ok: true });
}
