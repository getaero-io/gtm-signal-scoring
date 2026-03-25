-- Platform Views: Stable interfaces for vibe coders
-- Flattens internal JSONB structures into simple columns
-- Run against the Deepline/tamdb database

-- =============================================================
-- v_contacts: Flattened view of dl_resolved.resolved_people
-- Columns: id (text PK), identity_payload (jsonb), raw_payload (jsonb)
-- =============================================================
CREATE OR REPLACE VIEW inbound.v_contacts AS
SELECT
  rp.id,
  -- Email (primary)
  COALESCE(
    rp.identity_payload->'email'->>0,
    rp.raw_payload->'result'->>'email'
  ) AS email,

  -- Name fields
  COALESCE(
    rp.raw_payload->'result'->>'firstname',
    split_part(rp.identity_payload->'person_name'->>0, ' ', 1)
  ) AS first_name,
  COALESCE(
    rp.raw_payload->'result'->>'lastname',
    CASE
      WHEN rp.identity_payload->'person_name'->>0 LIKE '% %'
      THEN substring(rp.identity_payload->'person_name'->>0 FROM position(' ' IN rp.identity_payload->'person_name'->>0) + 1)
      ELSE NULL
    END
  ) AS last_name,
  COALESCE(
    rp.identity_payload->'person_name'->>0,
    concat_ws(' ', rp.raw_payload->'result'->>'firstname', rp.raw_payload->'result'->>'lastname')
  ) AS full_name,

  rp.display_name,

  -- Title + founder detection
  COALESCE(
    rp.raw_payload->'result'->>'title',
    rp.raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title'
  ) AS title,
  (rp.raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title') IS NOT NULL AS is_founder,

  -- Company
  rp.raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'brand_name' AS brand_name,

  -- Domain (first from identity_payload array)
  rp.identity_payload->'domain'->>0 AS domain,

  -- Email validation (ZeroBounce)
  rp.raw_payload->'result'->>'status' AS email_status,
  CASE WHEN rp.raw_payload->'result'->>'free_email' IN ('true','True') THEN true
       WHEN rp.raw_payload->'result'->>'free_email' IN ('false','False') THEN false
       ELSE NULL END AS is_free_email,
  CASE WHEN rp.raw_payload->'result'->>'mx_found' IN ('true','True') THEN true
       WHEN rp.raw_payload->'result'->>'mx_found' IN ('false','False') THEN false
       ELSE NULL END AS mx_found,

  -- LinkedIn
  rp.identity_payload->'linkedin'->>0 AS linkedin_url,

  -- Provider metadata
  rp.provider,
  rp.entity_type,
  rp.super_person_id,

  -- Timestamps
  rp.created_at,
  rp.updated_at

FROM dl_resolved.resolved_people rp;

COMMENT ON VIEW inbound.v_contacts IS 'Flattened contact records from Deepline identity resolution. Stable column names over internal JSONB paths.';


-- =============================================================
-- v_events: Flattened view of dl_cache.enrichment_event
-- Columns: row_id (uuid PK), source (text), doc (jsonb)
-- =============================================================
CREATE OR REPLACE VIEW inbound.v_events AS
SELECT
  e.row_id,
  e.source,

  -- Event classification
  e.doc->'raw_payload'->>'event_type' AS event_type,
  e.doc->'raw_payload'->>'source_platform' AS source_platform,

  -- Reply content
  e.doc->'raw_payload'->>'reply_text' AS reply_text,

  -- Contact info
  e.doc->'raw_payload'->>'email' AS email,
  e.doc->'raw_payload'->>'first_name' AS first_name,
  e.doc->'raw_payload'->>'last_name' AS last_name,
  e.doc->'raw_payload'->>'company' AS company,

  -- Campaign
  e.doc->'raw_payload'->>'campaign_id' AS campaign_id,
  e.doc->'raw_payload'->>'campaign_name' AS campaign_name,

  -- LinkedIn
  e.doc->'raw_payload'->>'linkedin_url' AS linkedin_url,

  -- Timestamps
  e.doc->'raw_payload'->>'received_at' AS received_at,
  e.created_at,
  e.updated_at

FROM dl_cache.enrichment_event e
WHERE e.source LIKE 'cache:local:event_tamdb_write:%';

COMMENT ON VIEW inbound.v_events IS 'Flattened webhook events from outbound platforms (Lemlist, SmartLead, HeyReach, Instantly). Stable column names over internal JSONB doc paths.';


-- =============================================================
-- Multi-app event claiming: Add app_id to processed_webhook_events
-- =============================================================
ALTER TABLE IF EXISTS inbound.processed_webhook_events
  ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'replybot';

-- Drop old PK and create composite PK for multi-app claiming
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_schema = 'inbound'
      AND table_name = 'processed_webhook_events'
      AND column_name = 'app_id'
  ) THEN
    ALTER TABLE inbound.processed_webhook_events DROP CONSTRAINT IF EXISTS processed_webhook_events_pkey;
    ALTER TABLE inbound.processed_webhook_events ADD PRIMARY KEY (event_row_id, app_id);
  END IF;
END $$;

COMMENT ON TABLE inbound.processed_webhook_events IS 'Tracks which events each app has processed. Composite PK (event_row_id, app_id) allows multiple apps to independently claim events from the same tamdb stream.';
COMMENT ON COLUMN inbound.processed_webhook_events.app_id IS 'Identifier for the app processing events. Default "replybot". Other apps use their own app_id to independently process the same events.';


-- =============================================================
-- get_unprocessed_events: Convenience function for apps polling new events
-- =============================================================
CREATE OR REPLACE FUNCTION inbound.get_unprocessed_events(p_app_id TEXT DEFAULT 'replybot', p_limit INT DEFAULT 20)
RETURNS TABLE (
  row_id UUID,
  source TEXT,
  event_type TEXT,
  source_platform TEXT,
  reply_text TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  linkedin_url TEXT,
  received_at TEXT,
  created_at TIMESTAMPTZ
) AS $$
  SELECT
    e.row_id,
    e.source,
    e.event_type,
    e.source_platform,
    e.reply_text,
    e.email,
    e.first_name,
    e.last_name,
    e.company,
    e.campaign_id,
    e.campaign_name,
    e.linkedin_url,
    e.received_at,
    e.created_at
  FROM inbound.v_events e
  LEFT JOIN inbound.processed_webhook_events p
    ON p.event_row_id = e.row_id AND p.app_id = p_app_id
  WHERE p.event_row_id IS NULL
  ORDER BY e.created_at ASC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION inbound.get_unprocessed_events IS 'Returns events not yet processed by a given app_id. Usage: SELECT * FROM get_unprocessed_events(''my_app'', 50);';
