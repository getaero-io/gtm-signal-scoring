/**
 * QStash callback: Send a queued reply via Deepline.
 *
 * Called by QStash after the undo-send delay expires.
 * QStash delivers the message body with queue metadata,
 * and this endpoint sends it through the correct provider/channel.
 *
 * Protected by QStash signature verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { markSent, markFailed } from "@/lib/outbound/safety/message-queue";
import {
  sendReply,
  resolveProvider,
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
    metadata,
  } = body;

  const provider = resolveProvider({ provider: body.provider, ...metadata });
  const channel = normalizeChannel(body.channel);

  if (!leadId || !campaignId) {
    await markFailed(queueId, "Missing leadId or campaignId in QStash payload");
    return NextResponse.json(
      { error: "Missing leadId or campaignId" },
      { status: 400 }
    );
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
    await markFailed(queueId, errorMsg);
    return NextResponse.json(
      { error: errorMsg, queueId },
      { status: 500 }
    );
  }
}

// QStash signature verification wraps the handler
export const POST = verifySignatureAppRouter(handler);
