CREATE TABLE IF NOT EXISTS aaliyah_founder_preferences (
  tenant_id uuid NOT NULL,
  preference_id text NOT NULL,
  category text NOT NULL,
  value text NOT NULL,
  scope jsonb NOT NULL,
  source_type text NOT NULL,
  confidence_level text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deactivated_at timestamptz NULL,
  created_by text NOT NULL,
  deactivated_by text NULL,
  PRIMARY KEY (tenant_id, preference_id)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_founder_preferences_active
  ON aaliyah_founder_preferences (tenant_id, active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aaliyah_founder_preferences_category_scope
  ON aaliyah_founder_preferences (tenant_id, category, active);
