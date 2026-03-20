-- Run this in Neon console (SQL editor) with a write-capable user

CREATE SCHEMA IF NOT EXISTS inbound;

CREATE TABLE IF NOT EXISTS inbound.reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'SDR',
  max_leads_per_day INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound.routing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default Routing',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  domain TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'form',
  atlas_score INTEGER,
  email_quality INTEGER,
  founder_match INTEGER,
  contact_identity INTEGER,
  is_founder_detected BOOLEAN DEFAULT false,
  valid_business_emails INTEGER DEFAULT 0,
  valid_free_emails INTEGER DEFAULT 0,
  mx_found BOOLEAN DEFAULT false,
  enrichment_data JSONB DEFAULT '{}',
  assigned_rep_id UUID REFERENCES inbound.reps(id),
  routing_path JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enriched_at TIMESTAMPTZ,
  routed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inbound.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES inbound.leads(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  template TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent'
);

INSERT INTO inbound.reps (name, email, role, max_leads_per_day) VALUES
  ('Alex Rivera', 'alex@example.com', 'Senior', 10),
  ('Jordan Kim', 'jordan@example.com', 'AE', 15),
  ('Sam Chen', 'sam@example.com', 'SDR', 20)
ON CONFLICT (email) DO NOTHING;

INSERT INTO inbound.routing_configs (name, nodes, edges) VALUES (
  'Default Routing',
  '[
    {"id":"trigger-1","type":"triggerNode","position":{"x":60,"y":180},"data":{"label":"Inbound Lead","source":"form"}},
    {"id":"enrich-1","type":"enrichNode","position":{"x":280,"y":180},"data":{"label":"Enrich from DB"}},
    {"id":"condition-1","type":"conditionNode","position":{"x":500,"y":180},"data":{"label":"Atlas Score >= 60","field":"atlas_score","operator":"gte","value":60}},
    {"id":"assign-senior","type":"assignNode","position":{"x":740,"y":80},"data":{"label":"Assign Senior Rep","role":"Senior"}},
    {"id":"assign-sdr","type":"assignNode","position":{"x":740,"y":300},"data":{"label":"Assign SDR Queue","role":"SDR"}},
    {"id":"reply-founder","type":"autoReplyNode","position":{"x":980,"y":80},"data":{"label":"Founder Reply","template":"founder"}},
    {"id":"reply-standard","type":"autoReplyNode","position":{"x":980,"y":300},"data":{"label":"Standard Reply","template":"standard"}}
  ]',
  '[
    {"id":"e1","source":"trigger-1","target":"enrich-1"},
    {"id":"e2","source":"enrich-1","target":"condition-1"},
    {"id":"e3","source":"condition-1","target":"assign-senior","sourceHandle":"true"},
    {"id":"e4","source":"condition-1","target":"assign-sdr","sourceHandle":"false"},
    {"id":"e5","source":"assign-senior","target":"reply-founder"},
    {"id":"e6","source":"assign-sdr","target":"reply-standard"}
  ]'
) ON CONFLICT DO NOTHING;
