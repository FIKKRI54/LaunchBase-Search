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

-- Optional, consented business outcomes used to calibrate recommendations.
-- Normal public scans remain ephemeral and are never written to this table.
CREATE TABLE IF NOT EXISTS business_outcomes (
  id BIGSERIAL PRIMARY KEY,
  external_ref_hash TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  state TEXT,
  district TEXT,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  opened_on DATE,
  closed_on DATE,
  observation_month DATE NOT NULL,
  monthly_sales_rm NUMERIC(14, 2),
  monthly_transactions INTEGER,
  average_ticket_rm NUMERIC(12, 2),
  gross_margin NUMERIC(6, 5),
  monthly_rent_rm NUMERIC(12, 2),
  monthly_payroll_rm NUMERIC(12, 2),
  other_monthly_fixed_costs_rm NUMERIC(12, 2),
  floor_area_sqm NUMERIC(10, 2),
  weekly_open_hours NUMERIC(7, 2),
  chain_store BOOLEAN,
  source_type TEXT NOT NULL,
  consent_basis TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_outcomes_month_start CHECK (observation_month = date_trunc('month', observation_month)::date),
  CONSTRAINT business_outcomes_sales_nonnegative CHECK (monthly_sales_rm IS NULL OR monthly_sales_rm >= 0),
  CONSTRAINT business_outcomes_transactions_nonnegative CHECK (monthly_transactions IS NULL OR monthly_transactions >= 0),
  CONSTRAINT business_outcomes_margin_range CHECK (gross_margin IS NULL OR (gross_margin > 0 AND gross_margin <= 1)),
  CONSTRAINT business_outcomes_location_malaysia CHECK (
    latitude BETWEEN 0.8 AND 7.6 AND longitude BETWEEN 99.5 AND 119.5
  ),
  UNIQUE (external_ref_hash, category_slug, observation_month)
);

CREATE INDEX IF NOT EXISTS business_outcomes_category_time_idx
  ON business_outcomes(category_slug, observation_month DESC);

CREATE INDEX IF NOT EXISTS business_outcomes_spatial_block_idx
  ON business_outcomes(state, district, category_slug);

-- A category is never labelled historically calibrated merely because outcome
-- rows exist. It needs a recorded spatial/temporal out-of-sample validation.
CREATE TABLE IF NOT EXISTS model_validation_runs (
  id BIGSERIAL PRIMARY KEY,
  model_version TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  training_cutoff DATE NOT NULL,
  holdout_strategy TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  holdout_size INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  baselines JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'candidate')),
  notes TEXT,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_version, category_slug, training_cutoff, holdout_strategy)
);

CREATE INDEX IF NOT EXISTS model_validation_runs_latest_idx
  ON model_validation_runs(category_slug, validated_at DESC);
