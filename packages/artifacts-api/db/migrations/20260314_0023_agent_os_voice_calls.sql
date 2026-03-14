CREATE TABLE IF NOT EXISTS voice_call_records (
  tenant_id uuid NOT NULL,
  call_id text NOT NULL,
  external_call_id text,
  source_system text NOT NULL,
  caller_phone_number text NOT NULL,
  caller_display_name text,
  caller_organization_name text,
  transcript text NOT NULL,
  call_summary_text text,
  duration_seconds integer,
  intent text NOT NULL,
  urgency text NOT NULL,
  risk_level text NOT NULL,
  company_mode text NOT NULL,
  routing_target jsonb NOT NULL,
  assignment_record_id text,
  run_record_id text,
  outcome text NOT NULL,
  founder_attention_required boolean NOT NULL,
  escalation_recommended boolean NOT NULL,
  interruption_class text NOT NULL,
  recommended_next_action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, call_id)
);

CREATE INDEX IF NOT EXISTS voice_call_records_founder_attention_idx
  ON voice_call_records (tenant_id, founder_attention_required, created_at DESC);
