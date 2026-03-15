CREATE TABLE IF NOT EXISTS aaliyah_follow_through_records (
  tenant_id uuid NOT NULL,
  follow_through_id text NOT NULL,
  session_id text NOT NULL,
  actor_id text NOT NULL,
  principal_context text NOT NULL,
  active_mode text NOT NULL,
  company_scope text NOT NULL,
  working_item_type text NOT NULL,
  source_subsystem text NOT NULL,
  source_item_id text NOT NULL,
  queue_item_id text NULL,
  review_item_id text NULL,
  call_id text NULL,
  incident_id text NULL,
  dispatch_id text NULL,
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL,
  closure_state text NOT NULL,
  closure_reason text NULL,
  next_governed_action text NOT NULL,
  founder_declared_completion boolean NOT NULL DEFAULT false,
  downstream_action_ref text NULL,
  escalation_target text NULL,
  escalation_class text NULL,
  escalation_rationale text NULL,
  escalation_provenance jsonb NULL,
  note text NULL,
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz NULL,
  PRIMARY KEY (tenant_id, follow_through_id)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_follow_through_source
  ON aaliyah_follow_through_records (tenant_id, actor_id, principal_context, source_item_id);

CREATE INDEX IF NOT EXISTS idx_aaliyah_follow_through_updated
  ON aaliyah_follow_through_records (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS aaliyah_follow_through_history (
  tenant_id uuid NOT NULL,
  event_id text NOT NULL,
  follow_through_id text NOT NULL,
  action text NOT NULL,
  previous_status text NOT NULL,
  resulting_status text NOT NULL,
  closure_state text NOT NULL,
  closure_reason text NOT NULL,
  next_governed_action text NOT NULL,
  founder_declared_completion boolean NOT NULL DEFAULT false,
  downstream_action_ref text NULL,
  escalation_target text NULL,
  escalation_class text NULL,
  escalation_rationale text NULL,
  escalation_provenance jsonb NULL,
  note text NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  CONSTRAINT fk_aaliyah_follow_through_history_record
    FOREIGN KEY (tenant_id, follow_through_id)
    REFERENCES aaliyah_follow_through_records (tenant_id, follow_through_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_follow_through_history_record
  ON aaliyah_follow_through_history (tenant_id, follow_through_id, created_at DESC);
