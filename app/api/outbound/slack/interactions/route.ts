import { NextRequest, NextResponse } from 'next/server';
import { handleInteraction } from '@/lib/outbound/slack/interactions';

export async function POST(req: NextRequest) {
  // Slack sends payload as URL-encoded body
  const formData = await req.formData().catch(() => null);
  const payloadStr = formData?.get('payload') as string | null;

  if (!payloadStr) {
    // Try JSON body as fallback
    try {
      const body = await req.json();
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
