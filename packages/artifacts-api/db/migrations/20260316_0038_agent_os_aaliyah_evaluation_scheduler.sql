CREATE TABLE IF NOT EXISTS aaliyah_evaluation_schedules (
  schedule_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  engine_type text NOT NULL,
  schedule_status text NOT NULL,
  cadence_type text NOT NULL,
  cadence_value text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  idempotency_key text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, engine_type)
);

CREATE TABLE IF NOT EXISTS aaliyah_evaluation_runs (
  run_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  schedule_id text NOT NULL REFERENCES aaliyah_evaluation_schedules(schedule_id) ON DELETE CASCADE,
  engine_type text NOT NULL,
  run_status text NOT NULL,
  window_key text NOT NULL,
  summary_text text NOT NULL,
  audit_event_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (tenant_id, schedule_id, window_key)
);

CREATE INDEX IF NOT EXISTS aaliyah_evaluation_schedules_tenant_status_idx
  ON aaliyah_evaluation_schedules (tenant_id, schedule_status, next_run_at);

CREATE INDEX IF NOT EXISTS aaliyah_evaluation_runs_tenant_engine_started_idx
  ON aaliyah_evaluation_runs (tenant_id, engine_type, started_at DESC);
