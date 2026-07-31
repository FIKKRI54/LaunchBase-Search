CREATE TABLE IF NOT EXISTS business_benchmarks (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  google_place_type TEXT NOT NULL,
  per_capita_spend_rm NUMERIC(12, 2) NOT NULL,
  average_store_sales_rm NUMERIC(14, 2) NOT NULL,
  income_elasticity NUMERIC(5, 3) NOT NULL DEFAULT 0.5,
  capture_rate NUMERIC(5, 3) NOT NULL DEFAULT 0.35,
  estimated_stores_per_100k NUMERIC(8, 2) NOT NULL DEFAULT 5,
  osm_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  classifier_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE business_benchmarks
  ADD COLUMN IF NOT EXISTS estimated_stores_per_100k NUMERIC(8, 2) NOT NULL DEFAULT 5;

ALTER TABLE business_benchmarks
  ADD COLUMN IF NOT EXISTS osm_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE business_benchmarks
  ADD COLUMN IF NOT EXISTS classifier_types JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  source TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS area_statistics (
  dataset_id TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  data_year INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  source_url TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (dataset_id, state, district)
);

CREATE INDEX IF NOT EXISTS area_statistics_lookup_idx
  ON area_statistics(dataset_id, LOWER(district), LOWER(state));

CREATE INDEX IF NOT EXISTS area_statistics_expires_at_idx
  ON area_statistics(expires_at);
