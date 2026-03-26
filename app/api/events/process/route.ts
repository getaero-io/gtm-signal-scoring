/**
 * Event Processor — QStash-triggered + Vercel cron fallback
 *
 * Primary: Deepline cloud pushes QStash when new events land in tamdb.
 * Fallback: Vercel cron hits GET every 5 minutes to catch missed events.
 *
 * Reads from dl_cache.enrichment_event (tamdb — source of truth),
 * processes reply events through: template match → LLM draft → ICP score → Slack.
 *
 * Env vars:
 *   QSTASH_CURRENT_SIGNING_KEY — from Upstash QStash dashboard
 *   QSTASH_NEXT_SIGNING_KEY    — from Upstash QStash dashboard
 *   CRON_SECRET                — for Vercel cron auth
 */
import { NextRequest, NextResponse } from 'next/server';
import { processWebhookEvents } from '@/lib/outbound/webhooks/consumer';

// Each event makes an LLM call (~5-10s), so 5 events needs ~60s max
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const qstashSignature = req.headers.get('upstash-signature');
  const cronAuth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (qstashSignature) {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
    const body = await req.text();
    const isValid = await receiver
      .verify({
        signature: qstashSignature,
        body,
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/events/process`,
      })
      .catch(() => false);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
    }
  } else if (cronSecret && cronAuth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processWebhookEvents();
    console.log('[api/events/process]', result);
    return NextResponse.json({ ok: true, source: 'qstash', ...result });
  } catch (err) {
    console.error('[api/events/process] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel cron fallback (every 5 minutes via vercel.json)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processWebhookEvents();
    console.log('[api/events/process] cron fallback:', result);
    return NextResponse.json({ ok: true, source: 'cron', ...result });
  } catch (err) {
    console.error('[api/events/process] cron error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
