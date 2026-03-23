import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/outbound/slack/interactions';

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

  // Handle Slack URL verification challenge
  if (event && event.type === "url_verification") {
    return NextResponse.json({ challenge: event.challenge });
  }

  return NextResponse.json({ ok: true });
}
