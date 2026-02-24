BEGIN;

CREATE SCHEMA IF NOT EXISTS lead;

-- Leads: current snapshot (mutable), but ALL state changes should be represented via lead_events.
CREATE TABLE IF NOT EXISTS lead.leads (
  id               TEXT PRIMARY KEY,
  tenant_id        UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- identity
  email            TEXT,
  phone            TEXT,
  first_name       TEXT,
  last_name        TEXT,
  company_name     TEXT,
  company_domain   TEXT,

  -- attribution
  source           TEXT NOT NULL,              -- e.g. "website", "linkedin", "referral", "inbound"
  source_ref       TEXT,                       -- campaign/ad/utm ref or external ID
  channel          TEXT,                       -- "paid_search", "organic", "social", "email", etc.

  -- scoring
  score_total      INTEGER NOT NULL DEFAULT 0,
  score_version    TEXT NOT NULL DEFAULT 'v1',
  score_updated_at TIMESTAMPTZ,

  -- state
  lifecycle_stage  TEXT NOT NULL DEFAULT 'new', -- new|mql|sql|opportunity|customer|disqualified

  -- audit
  created_by       TEXT NOT NULL DEFAULT 'system',
  updated_by       TEXT NOT NULL DEFAULT 'system'
);

-- Append-only events for signals
CREATE TABLE IF NOT EXISTS lead.lead_events (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  lead_id     TEXT NOT NULL REFERENCES lead.leads(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  type        TEXT NOT NULL,                  -- e.g. "page_view", "pricing_view", "form_submit", "email_open", "call_booked"
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor       TEXT NOT NULL DEFAULT 'system'   -- user/service identifier
);

-- Append-only conversions (hard events)
CREATE TABLE IF NOT EXISTS lead.lead_conversions (
  id           TEXT PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  lead_id      TEXT NOT NULL REFERENCES lead.leads(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  type         TEXT NOT NULL,                 -- e.g. "meeting_booked", "purchase", "signed_msa"
  value_usd    NUMERIC(12,2),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor        TEXT NOT NULL DEFAULT 'system'
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated
  ON lead.leads (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_email
  ON lead.leads (tenant_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_tenant_lead_time
  ON lead.lead_events (tenant_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversions_tenant_lead_time
  ON lead.lead_conversions (tenant_id, lead_id, created_at DESC);

-- RLS
ALTER TABLE lead.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead.lead_conversions ENABLE ROW LEVEL SECURITY;

-- Expectation: app sets `SET app.tenant_id = '<uuid>'` per request/transaction.
-- Enforce tenant isolation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lead' AND tablename = 'leads' AND policyname = 'lead_leads_tenant_isolation'
  ) THEN
    CREATE POLICY lead_leads_tenant_isolation ON lead.leads
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lead' AND tablename = 'lead_events' AND policyname = 'lead_events_tenant_isolation'
  ) THEN
    CREATE POLICY lead_events_tenant_isolation ON lead.lead_events
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lead' AND tablename = 'lead_conversions' AND policyname = 'lead_conversions_tenant_isolation'
  ) THEN
    CREATE POLICY lead_conversions_tenant_isolation ON lead.lead_conversions
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

COMMIT;
