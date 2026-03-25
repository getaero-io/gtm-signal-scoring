-- Vector.co enrichment cache table
-- Stores raw API responses keyed by domain with a fetched_at timestamp
-- so the application can enforce a 7-day TTL at query time.

CREATE TABLE IF NOT EXISTS inbound.vector_cache (
  domain TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vector_cache_fetched ON inbound.vector_cache(fetched_at);
