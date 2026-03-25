-- Migration: Create inbound.learnings table for signal accumulation
-- Flexible key-value store keyed by (entity_type, entity_id, category, key).
-- Use cases: rep style preferences, customer signals, enrichment patterns,
-- campaign analytics, objection patterns, ICP scores, reply intents.

CREATE SCHEMA IF NOT EXISTS inbound;

CREATE TABLE IF NOT EXISTS inbound.learnings (
  id              SERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,           -- 'lead', 'rep', 'company', 'campaign', 'system'
  entity_id       TEXT NOT NULL,           -- UUID or other identifier
  category        TEXT NOT NULL,           -- 'icp_score', 'reply_signal', 'style_pref', etc.
  key             TEXT NOT NULL,           -- specific signal name
  value           TEXT NOT NULL,           -- signal value (may be JSON string)
  confidence      INTEGER NOT NULL DEFAULT 50,  -- 0-100
  source          TEXT NOT NULL DEFAULT 'manual',
  metadata        JSONB NOT NULL DEFAULT '{}',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learnings_upsert
  ON inbound.learnings(entity_type, entity_id, category, key);

CREATE INDEX IF NOT EXISTS idx_learnings_entity
  ON inbound.learnings(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_learnings_category
  ON inbound.learnings(category);

CREATE INDEX IF NOT EXISTS idx_learnings_expires
  ON inbound.learnings(expires_at)
  WHERE expires_at IS NOT NULL;
