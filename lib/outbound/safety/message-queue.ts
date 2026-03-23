/**
 * Message Queue with Undo-Send (QStash-backed)
 *
 * Messages are queued with a configurable delay (default 60s) via Upstash QStash.
 * During the delay, messages can be cancelled via the "Undo Send" Slack button,
 * which removes the QStash message before delivery.
 *
 * After the delay, QStash calls POST /api/send-reply which sends via Deepline.
 *
 * The DB table (inbound.message_queue) still tracks state for audit/history,
 * but QStash handles the actual scheduling and delivery trigger.
 */

import { Client } from "@upstash/qstash";
import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import type { OutboundProvider, ReplyChannel } from "../integrations/deepline-outbound";

const SEND_DELAY_SECONDS = parseInt(
  process.env.MESSAGE_SEND_DELAY_SECONDS || "60",
  10
);

function getQStashClient(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN environment variable is not set");
  return new Client({ token });
}

function getSendReplyUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  return `${base}/api/send-reply`;
}

export interface QueuedMessage {
  id: number;
  conversation_id: number;
  lead_id: string;
  channel: string;
  message_text: string;
  metadata: Record<string, unknown>;
  status: string;
  scheduled_at: string;
  created_at: string;
  qstash_message_id: string | null;
}

/**
 * Queue a message for delayed sending via QStash.
 * Inserts a DB record for tracking, then publishes to QStash with a delay.
 */
export async function queueMessage(opts: {
  conversationId: number;
  leadId: string;
  channel?: ReplyChannel;
  provider?: OutboundProvider;
  messageText: string;
  metadata?: Record<string, unknown>;
  delaySec?: number;
}): Promise<{ queueId: number; scheduledAt: Date; qstashMessageId: string }> {
  const delay = opts.delaySec ?? SEND_DELAY_SECONDS;
  const scheduledAt = new Date(Date.now() + delay * 1000);
  const channel = opts.channel || "email";
  const provider = opts.provider || "lemlist";

  // 1. Insert DB record for audit trail
  const rows = await writeQuery<{ id: number }>(
    `INSERT INTO inbound.message_queue (conversation_id, lead_id, channel, message_text, metadata, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      opts.conversationId,
      opts.leadId,
      channel,
      opts.messageText,
      JSON.stringify(opts.metadata || {}),
      scheduledAt.toISOString(),
    ]
  );

  const queueId = rows[0].id;

  // 2. Publish to QStash with delay
  let result: { messageId: string };
  try {
    const qstash = getQStashClient();
    result = await qstash.publishJSON({
      url: getSendReplyUrl(),
      body: {
        queueId,
        conversationId: opts.conversationId,
        leadId: opts.leadId,
        campaignId: String(opts.metadata?.campaign_id || ""),
        channel,
        provider,
        messageText: opts.messageText,
        metadata: opts.metadata || {},
      },
      delay,
    });
  } catch (err) {
    // QStash publish failed — clean up the orphaned DB row
    console.error(
      `[message-queue] QStash publish failed for queue=${queueId}, cleaning up:`,
      (err as Error).message
    );
    await writeQuery(
      `UPDATE inbound.message_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
      [`QStash publish failed: ${(err as Error).message}`.slice(0, 500), queueId]
    );
    throw err;
  }

  // 3. Store QStash message ID for cancellation
  await writeQuery(
    `UPDATE inbound.message_queue SET qstash_message_id = $1 WHERE id = $2`,
    [result.messageId, queueId]
  );

  return { queueId, scheduledAt, qstashMessageId: result.messageId };
}

/**
 * Cancel a queued message (undo send).
 * Cancels the QStash message and marks the DB row as cancelled.
 */
export async function cancelMessage(
  queueId: number,
  cancelledBy: string
): Promise<boolean> {
  // 1. Get the QStash message ID
  const rows = await query<{ qstash_message_id: string | null; status: string }>(
    `SELECT qstash_message_id, status FROM inbound.message_queue WHERE id = $1`,
    [queueId]
  );

  if (!rows[0] || rows[0].status !== "queued") return false;

  // 2. Cancel in QStash if we have a message ID
  const qstashMsgId = rows[0].qstash_message_id;
  if (qstashMsgId) {
    try {
      const qstash = getQStashClient();
      await qstash.messages.delete(qstashMsgId);
    } catch (err) {
      // QStash message may have already been delivered — check DB status
      console.warn(
        `[message-queue] QStash delete failed for ${qstashMsgId}:`,
        (err as Error).message
      );
    }
  }

  // 3. Mark as cancelled in DB (atomic — only if still queued)
  const updated = await writeQuery<{ id: number }>(
    `UPDATE inbound.message_queue
     SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1
     WHERE id = $2 AND status = 'queued'
     RETURNING id`,
    [cancelledBy, queueId]
  );

  return updated.length > 0;
}

/**
 * Atomically claim a queued message for sending (queued → sending).
 * Returns true if the row was successfully claimed, false if it was
 * already cancelled, sent, or claimed by another process.
 * Also accepts 'sending' status to allow QStash retries.
 */
export async function claimForSending(queueId: number): Promise<boolean> {
  const rows = await writeQuery<{ id: number }>(
    `UPDATE inbound.message_queue SET status = 'sending'
     WHERE id = $1 AND status IN ('queued', 'sending')
     RETURNING id`,
    [queueId]
  );
  return rows.length > 0;
}

/**
 * Mark a message as sent.
 */
export async function markSent(queueId: number): Promise<void> {
  await writeQuery(
    `UPDATE inbound.message_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
    [queueId]
  );
}

/**
 * Mark a message as failed.
 */
export async function markFailed(
  queueId: number,
  errorMessage: string
): Promise<void> {
  await writeQuery(
    `UPDATE inbound.message_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
    [errorMessage.slice(0, 500), queueId]
  );
}

/**
 * Get queue status for a conversation.
 */
export async function getQueueStatus(
  conversationId: number
): Promise<QueuedMessage | null> {
  const rows = await query<QueuedMessage>(
    `SELECT * FROM inbound.message_queue WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  return rows[0] ?? null;
}
