import { NextRequest, NextResponse } from 'next/server';
import { handleLemlistWebhook } from '@/lib/outbound/lemlist/webhook-handler';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const result = await handleLemlistWebhook(payload);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/outbound/lemlist/webhook] Error:", err);
    return NextResponse.json({ ok: true, error: String(err) });
  }
}
