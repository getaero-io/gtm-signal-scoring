/**
 * Cron: safety-net sweeper for approved messages that didn't send via QStash.
 *
 * Runs every minute. Finds message_queue rows stuck in 'queued' status
 * past their scheduled send time, and triggers send-reply for each.
 */
import { NextRequest, NextResponse } from "next/server";
import { writeQuery } from "@/lib/db-write";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Find queued messages past their scheduled send time that QStash may have missed
    const stuck = await writeQuery<{
      id: number;
      conversation_id: number;
      lead_id: string;
      campaign_id: string;
      channel: string;
      provider: string;
      message_text: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, conversation_id, lead_id, campaign_id, channel, provider, message_text, metadata
       FROM inbound.message_queue
       WHERE status = 'queued'
         AND scheduled_send_at < NOW() - INTERVAL '2 minutes'
       ORDER BY scheduled_send_at ASC
       LIMIT 10`
    );

    if (stuck.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "no stuck messages" });
    }

    let sent = 0;
    let errors = 0;

    for (const msg of stuck) {
      try {
        // Import dynamically to avoid cold-start overhead when nothing to process
        const { claimForSending, markSent, markFailed } = await import(
          "@/lib/outbound/safety/message-queue"
        );
        const { sendReply, normalizeChannel } = await import(
          "@/lib/outbound/integrations/deepline-outbound"
        );

        const claimed = await claimForSending(msg.id);
        if (!claimed) continue; // Already claimed/cancelled/sent

        await sendReply(msg.provider as any, {
          leadId: msg.lead_id,
          message: msg.message_text,
          campaignId: msg.campaign_id,
          channel: normalizeChannel(msg.channel as any),
        });

        await markSent(msg.id);
        sent++;
      } catch (err) {
        console.error(`[cron/send-approved] Error on queue=${msg.id}:`, (err as Error).message);
        try {
          const { markFailed } = await import("@/lib/outbound/safety/message-queue");
          await markFailed(msg.id, (err as Error).message);
        } catch {}
        errors++;
      }
    }

    return NextResponse.json({ ok: true, stuck: stuck.length, sent, errors });
  } catch (err) {
    console.error("[cron/send-approved] Fatal:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
