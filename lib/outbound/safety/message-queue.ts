/**
 * Message Queue with Undo-Send
 *
 * Messages are queued with a configurable delay (default 60s) before sending.
 * During the delay, messages can be cancelled via the "Undo Send" Slack button.
 * After the delay, a scheduled check sends queued messages.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";

const SEND_DELAY_SECONDS = parseInt(process.env.MESSAGE_SEND_DELAY_SECONDS || '60', 10);

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
}

/**
 * Queue a message for delayed sending.
 * Returns the queue entry ID for undo operations.
 */
export async function queueMessage(opts: {
  conversationId: number;
  leadId: string;
  channel?: string;
  messageText: string;
  metadata?: Record<string, unknown>;
  delaySec?: number;
}): Promise<{ queueId: number; scheduledAt: Date }> {
  const delay = opts.delaySec ?? SEND_DELAY_SECONDS;
  const scheduledAt = new Date(Date.now() + delay * 1000);

  const rows = await writeQuery<{ id: number; scheduled_at: string }>(
    `INSERT INTO inbound.message_queue (conversation_id, lead_id, channel, message_text, metadata, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, scheduled_at`,
    [
      opts.conversationId,
      opts.leadId,
      opts.channel || 'lemlist',
      opts.messageText,
      JSON.stringify(opts.metadata || {}),
      scheduledAt.toISOString(),
    ]
  );

  return { queueId: rows[0].id, scheduledAt };
}

/**
 * Cancel a queued message (undo send).
 * Only works if the message is still in 'queued' status.
 */
export async function cancelMessage(queueId: number, cancelledBy: string): Promise<boolean> {
  const rows = await writeQuery<{ id: number }>(
    `UPDATE inbound.message_queue
     SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1
     WHERE id = $2 AND status = 'queued'
     RETURNING id`,
    [cancelledBy, queueId]
  );
  return rows.length > 0;
}

/**
 * Get messages ready to be sent (scheduled_at has passed, still queued).
 */
export async function getReadyMessages(): Promise<QueuedMessage[]> {
  return query<QueuedMessage>(
    `SELECT id, conversation_id, lead_id, channel, message_text, metadata, status, scheduled_at, created_at
     FROM inbound.message_queue
     WHERE status = 'queued' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT 50`
  );
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
export async function markFailed(queueId: number, errorMessage: string): Promise<void> {
  await writeQuery(
    `UPDATE inbound.message_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
    [errorMessage.slice(0, 500), queueId]
  );
}

/**
 * Get queue status for a conversation.
 */
export async function getQueueStatus(conversationId: number): Promise<QueuedMessage | null> {
  const rows = await query<QueuedMessage>(
    `SELECT * FROM inbound.message_queue WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  return rows[0] ?? null;
}
