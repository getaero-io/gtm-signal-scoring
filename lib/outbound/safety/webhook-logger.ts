import { writeQuery } from '@/lib/db-write';

export interface WebhookEventInput {
  source: 'lemlist' | 'slack_interaction' | 'slack_event' | 'hubspot';
  eventType: string;
  rawPayload: Record<string, unknown>;
  status?: 'received' | 'processed' | 'skipped' | 'failed' | 'rate_limited';
  leadId?: string;
  conversationId?: number;
  processingResult?: Record<string, unknown>;
  errorMessage?: string;
}

export async function logWebhookEvent(input: WebhookEventInput): Promise<number> {
  const status = input.status ?? 'received';

  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO inbound.webhook_events
       (source, event_type, raw_payload, status, lead_id, conversation_id, error_message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.source,
      input.eventType,
      JSON.stringify(input.rawPayload),
      status,
      input.leadId ?? null,
      input.conversationId ?? null,
      input.errorMessage ?? null,
      input.processingResult ? JSON.stringify(input.processingResult) : '{}',
    ]
  );

  return Number(rows[0].id) || 0;
}

export async function updateWebhookEvent(
  eventId: number,
  update: {
    status: string;
    leadId?: string;
    conversationId?: number;
    processingResult?: Record<string, unknown>;
    errorMessage?: string;
  }
): Promise<void> {
  const setProcessedAt = ['processed', 'failed', 'skipped'].includes(update.status);

  await writeQuery(
    `UPDATE inbound.webhook_events
     SET status = $1,
         lead_id = COALESCE($2::uuid, lead_id),
         conversation_id = COALESCE($3, conversation_id),
         metadata = COALESCE($4::jsonb, metadata),
         error_message = COALESCE($5, error_message),
         processed_at = CASE WHEN $6 THEN NOW() ELSE processed_at END
     WHERE id = $7::uuid`,
    [
      update.status,
      update.leadId ?? null,
      update.conversationId ?? null,
      update.processingResult ? JSON.stringify(update.processingResult) : null,
      update.errorMessage ?? null,
      setProcessedAt,
      eventId,
    ]
  );
}
