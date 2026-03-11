CREATE TABLE IF NOT EXISTS orchestration_ops_snapshot_exports (
  tenant_id uuid NOT NULL,
  export_id text NOT NULL,
  snapshot_type text NOT NULL,
  exported_by text NOT NULL,
  payload_hash text NOT NULL,
  signature text NOT NULL,
  sealed_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, export_id),
  CONSTRAINT orchestration_ops_snapshot_exports_type_check
    CHECK (snapshot_type IN ('worker_freshness', 'alerts'))
);

CREATE INDEX IF NOT EXISTS idx_orchestration_ops_snapshot_exports_type_created
  ON orchestration_ops_snapshot_exports (tenant_id, snapshot_type, created_at DESC);

ALTER TABLE orchestration_ops_snapshot_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestration_ops_snapshot_exports_tenant_isolation ON orchestration_ops_snapshot_exports;
CREATE POLICY orchestration_ops_snapshot_exports_tenant_isolation
  ON orchestration_ops_snapshot_exports
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
