import { NextRequest, NextResponse } from 'next/server';
import { handleLemlistWebhook } from '@/lib/outbound/lemlist/webhook-handler';

export async function POST(req: NextRequest) {
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
    const result = await handleLemlistWebhook(payload);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/outbound/lemlist/webhook] Error:", err);
    return NextResponse.json({ ok: true, error: 'Internal error' });
  }
}
