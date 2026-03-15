CREATE TABLE IF NOT EXISTS aaliyah_diagnostics_events (
  tenant_id uuid NOT NULL,
  event_id text NOT NULL,
  actor_id text NOT NULL,
  principal_context text NOT NULL,
  active_mode text NOT NULL,
  event_type text NOT NULL,
  event_source text NOT NULL,
  signal_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_diagnostics_events_actor_window
  ON aaliyah_diagnostics_events (tenant_id, actor_id, principal_context, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aaliyah_diagnostics_events_type_window
  ON aaliyah_diagnostics_events (tenant_id, event_type, created_at DESC);
