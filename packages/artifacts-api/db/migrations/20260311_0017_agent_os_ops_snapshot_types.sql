ALTER TABLE orchestration_ops_snapshot_exports
  DROP CONSTRAINT IF EXISTS orchestration_ops_snapshot_exports_type_check;

ALTER TABLE orchestration_ops_snapshot_exports
  ADD CONSTRAINT orchestration_ops_snapshot_exports_type_check
  CHECK (snapshot_type IN ('worker_freshness', 'alerts', 'diagnostics', 'inventory'));
