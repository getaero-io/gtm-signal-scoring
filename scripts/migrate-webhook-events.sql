-- Migration: Create inbound.webhook_events table for full webhook observability
-- Every webhook that hits the app gets recorded for auditability and debugging.

CREATE SCHEMA IF NOT EXISTS inbound;

-- Raw webhook event log
CREATE TABLE IF NOT EXISTS inbound.webhook_events (
  id                SERIAL PRIMARY KEY,
  source            TEXT NOT NULL,                       -- 'lemlist', 'slack_interaction', 'slack_event', 'hubspot'
  event_type        TEXT NOT NULL,                       -- e.g. 'emailsReplied', 'emailsOpened', 'block_actions', 'approve_response'
  status            TEXT NOT NULL DEFAULT 'received',    -- 'received', 'processed', 'skipped', 'failed', 'rate_limited'
  lead_id           UUID,                                -- FK to leads if applicable (nullable)
  conversation_id   INTEGER,                             -- FK to conversations if applicable (nullable)
  raw_payload       JSONB NOT NULL,                      -- full raw webhook payload
  processing_result JSONB,                               -- result/error details from processing
  error_message     TEXT,                                -- error message if failed
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON inbound.webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON inbound.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON inbound.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON inbound.webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_lead_id ON inbound.webhook_events(lead_id);

-- Add hubspot_id to existing leads table
ALTER TABLE inbound.leads ADD COLUMN IF NOT EXISTS hubspot_id TEXT;
