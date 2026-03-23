-- Create message_queue table with QStash support
CREATE TABLE IF NOT EXISTS inbound.message_queue (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES inbound.conversations(id),
  lead_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  message_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  error_message TEXT,
  qstash_message_id TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_message_queue_status_scheduled
  ON inbound.message_queue (status, scheduled_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_message_queue_conversation
  ON inbound.message_queue (conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_queue_qstash_id
  ON inbound.message_queue (qstash_message_id)
  WHERE qstash_message_id IS NOT NULL;
