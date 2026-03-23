/**
 * Cron: Process queued messages and send via the appropriate channel.
 *
 * Runs every minute via Vercel Cron. Picks up messages past their
 * scheduled_at time and routes them:
 *   - channel='lemlist' → send email reply via Lemlist API
 *   - channel='linkedin' → send LinkedIn reply via Lemlist API (LinkedIn step)
 *
 * Protected by CRON_SECRET header verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReadyMessages, markSent, markFailed } from '@/lib/outbound/safety/message-queue';
import { sendSmartLeadReply } from '@/lib/outbound/integrations/smartlead';
import { sendLinkedInReply } from '@/lib/outbound/integrations/smartlead';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const messages = await getReadyMessages();
  if (!messages.length) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
    const leadId = String(metadata.lemlist_lead_id || metadata.smartlead_lead_id || '');
    const campaignId = String(metadata.campaign_id || '');

    if (!leadId || !campaignId) {
      await markFailed(msg.id, 'Missing lead_id or campaign_id in metadata');
      failed++;
      continue;
    }

    try {
      if (msg.channel === 'linkedin') {
        await sendLinkedInReply({
          leadId,
          message: msg.message_text,
          campaignId,
        });
      } else {
        // Default: email via Lemlist
        await sendSmartLeadReply({
          leadId,
          message: msg.message_text,
          campaignId,
        });
      }

      await markSent(msg.id);
      sent++;
    } catch (err) {
      console.error(`[cron/send-queued] Failed to send message ${msg.id}:`, err);
      await markFailed(msg.id, (err as Error).message);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, total: messages.length });
}
