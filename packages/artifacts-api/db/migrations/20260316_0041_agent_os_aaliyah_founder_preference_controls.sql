CREATE TABLE IF NOT EXISTS aaliyah_founder_preference_controls (
  id text PRIMARY KEY,
  tenant_id text NOT NULL UNIQUE,
  actor_user_id text NOT NULL,
  notification_json jsonb NOT NULL,
  digest_json jsonb NOT NULL,
  opportunity_json jsonb NOT NULL,
  recommendation_json jsonb NOT NULL,
  scheduler_json jsonb NOT NULL,
  delivery_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
