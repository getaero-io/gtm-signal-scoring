/**
 * QStash callback: Send a queued reply via Deepline.
 *
 * Called by QStash after the undo-send delay expires.
 * QStash delivers the message body with queue metadata,
 * and this endpoint sends it through the correct provider/channel.
 *
 * Idempotency: atomically claims the DB row (queued → sending) before
 * calling the provider API, preventing double-sends on QStash retries
 * and race conditions with undo cancellation.
 *
 * Protected by QStash signature verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { markSent, markFailed, claimForSending } from "@/lib/outbound/safety/message-queue";
import {
  sendReply,
  normalizeChannel,
  type OutboundProvider,
  type ReplyChannel,
} from "@/lib/outbound/integrations/deepline-outbound";

interface SendReplyPayload {
  queueId: number;
  conversationId: number;
  leadId: string;
  campaignId: string;
  channel: ReplyChannel;
  provider: OutboundProvider;
  messageText: string;
  metadata: Record<string, unknown>;
}

async function handler(req: NextRequest) {
  const body = (await req.json()) as SendReplyPayload;

  const {
    queueId,
    leadId,
    campaignId,
    messageText,
  } = body;

  // Trust the provider and channel serialized at queue time
  const provider = body.provider;
  const channel = normalizeChannel(body.channel);

  if (!leadId || !campaignId) {
    // Permanent failure — return 200 so QStash does not retry
    await markFailed(queueId, "Missing leadId or campaignId in QStash payload");
    return NextResponse.json(
      { error: "Missing leadId or campaignId", queueId },
      { status: 200 }
    );
  }

  // Atomically claim the row: queued → sending.
  // Prevents double-sends on QStash retries and races with undo cancellation.
  const claimed = await claimForSending(queueId);
  if (!claimed) {
    // Already cancelled, sent, or claimed by another retry — return 200 to stop QStash retries
    console.log(
      `[send-reply] Skipped queue=${queueId} — already claimed, sent, or cancelled`
    );
    return NextResponse.json({ ok: true, skipped: true, queueId });
  }

  try {
    await sendReply(provider, {
      leadId,
      message: messageText,
      campaignId,
      channel,
    });

    await markSent(queueId);

    console.log(
      `[send-reply] Sent via ${provider}/${channel}: queue=${queueId}, lead=${leadId}, campaign=${campaignId}`
    );

    return NextResponse.json({ ok: true, queueId, provider, channel });
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[send-reply] Failed queue=${queueId}:`, err);

    // Distinguish transient vs permanent errors
    const isTransient =
      errorMsg.includes("ECONNREFUSED") ||
      errorMsg.includes("ETIMEDOUT") ||
      errorMsg.includes("503") ||
      errorMsg.includes("429") ||
      errorMsg.includes("502") ||
      errorMsg.includes("504");

    if (isTransient) {
      // Return 500 so QStash retries with backoff
      // Leave status as 'sending' so retry can re-claim via claimForSending
      // (claimForSending accepts both 'queued' and 'sending' statuses)
      return NextResponse.json(
        { error: errorMsg, queueId, retryable: true },
        { status: 500 }
      );
    }

    // Permanent failure — mark failed and return 200 to stop retries
    await markFailed(queueId, errorMsg);
    return NextResponse.json(
      { error: errorMsg, queueId, retryable: false },
      { status: 200 }
    );
  }
}

// QStash signature verification wraps the handler
export const POST = verifySignatureAppRouter(handler);
