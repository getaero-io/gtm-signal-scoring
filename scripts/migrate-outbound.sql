-- Outbound engine schema migration
-- Creates tables in the inbound schema for leads, conversations, qualification, and routing

CREATE SCHEMA IF NOT EXISTS inbound;

CREATE TABLE IF NOT EXISTS inbound.leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT,
  full_name       TEXT,
  first_name      TEXT,
  last_name       TEXT,
  email           TEXT,
  company         TEXT,
  company_name    TEXT,
  company_domain  TEXT,
  domain          TEXT,
  linkedin_url    TEXT,
  title           TEXT,
  source          TEXT NOT NULL DEFAULT 'unknown',
  status          TEXT NOT NULL DEFAULT 'new',
  assigned_rep    TEXT,
  qualification_score  INTEGER,
  qualification_reason TEXT,
  attio_id        TEXT,
  smartlead_id    TEXT,
  campaign_id     TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound.conversations (
  id              SERIAL PRIMARY KEY,
  lead_id         UUID REFERENCES inbound.leads(id),
  direction       TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'linkedin',
  original_message TEXT NOT NULL,
  drafted_response TEXT,
  final_response   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  slack_message_ts TEXT,
  slack_channel    TEXT,
  approved_by     TEXT,
  sent_at         TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound.qualification_results (
  id              SERIAL PRIMARY KEY,
  lead_id         UUID REFERENCES inbound.leads(id),
  rule_set        TEXT,
  rule_name       TEXT,
  icp_ref         TEXT,
  website_summary TEXT,
  product_description TEXT,
  score           INTEGER NOT NULL,
  passed          BOOLEAN,
  qualified       BOOLEAN,
  score_breakdown JSONB DEFAULT '{}',
  breakdown       JSONB DEFAULT '{}',
  flags           JSONB DEFAULT '[]',
  llm_reasoning   TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound.routing_log (
  id              SERIAL PRIMARY KEY,
  lead_id         UUID REFERENCES inbound.leads(id),
  action          TEXT NOT NULL,
  details         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_leads_status ON inbound.leads(status);
CREATE INDEX IF NOT EXISTS idx_inbound_leads_company_domain ON inbound.leads(company_domain);
CREATE INDEX IF NOT EXISTS idx_inbound_leads_email ON inbound.leads(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_leads_email_unique ON inbound.leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_conversations_status ON inbound.conversations(status);
CREATE INDEX IF NOT EXISTS idx_inbound_conversations_slack_ts ON inbound.conversations(slack_message_ts);
