CREATE TABLE IF NOT EXISTS inbound.account_scores (
  domain            TEXT PRIMARY KEY,
  company_name      TEXT,
  industry          TEXT,
  account_score     INTEGER NOT NULL DEFAULT 0,
  account_tier      TEXT NOT NULL DEFAULT 'T3',
  best_contact_score INTEGER DEFAULT 0,
  avg_contact_score  NUMERIC(5,1) DEFAULT 0,
  contact_count     INTEGER DEFAULT 0,
  qualified_contact_count INTEGER DEFAULT 0,
  domain_age_years  NUMERIC(5,1),
  employee_count    INTEGER,
  funding_stage     TEXT,
  funding_total     NUMERIC(15,2),
  retailer_count    INTEGER,
  retailers_list    TEXT,
  is_cpg            BOOLEAN DEFAULT false,
  has_ecommerce     BOOLEAN DEFAULT false,
  sells_retail      BOOLEAN DEFAULT false,
  total_engagement_touchpoints INTEGER DEFAULT 0,
  has_active_conversation BOOLEAN DEFAULT false,
  best_velocity_score INTEGER DEFAULT 0,
  any_positive_intent BOOLEAN DEFAULT false,
  any_meeting_requested BOOLEAN DEFAULT false,
  active_channels   JSONB DEFAULT '[]',
  attio_company_id  TEXT,
  key_contacts      JSONB DEFAULT '[]',
  score_30d_ago     INTEGER,
  trend_direction   TEXT DEFAULT 'flat',
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_scores_tier ON inbound.account_scores(account_tier);
CREATE INDEX IF NOT EXISTS idx_account_scores_score ON inbound.account_scores(account_score DESC);
CREATE INDEX IF NOT EXISTS idx_account_scores_industry ON inbound.account_scores(industry);
