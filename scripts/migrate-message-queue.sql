-- Message queue for undo-send and rate limiting
-- Messages are queued with a delay before being sent

CREATE TABLE IF NOT EXISTS inbound.message_queue (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES inbound.conversations(id),
  lead_id         UUID REFERENCES inbound.leads(id),
  channel         TEXT NOT NULL DEFAULT 'lemlist',
  message_text    TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'queued',  -- queued, cancelled, sent, failed
  scheduled_at    TIMESTAMPTZ NOT NULL,            -- when to actually send
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    TEXT,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_message_queue_status ON inbound.message_queue(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_scheduled ON inbound.message_queue(scheduled_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_message_queue_conversation ON inbound.message_queue(conversation_id);

-- Rate limiting tracking table
CREATE TABLE IF NOT EXISTS inbound.rate_limit_log (
  id              SERIAL PRIMARY KEY,
  action_type     TEXT NOT NULL,       -- 'outbound_reply', 'slack_notification', 'llm_call'
  actor           TEXT NOT NULL,       -- username or 'system'
  window_start    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_action ON inbound.rate_limit_log(action_type, window_start);
