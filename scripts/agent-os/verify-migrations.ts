import fs from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

import { loadAgentOsEnv, optionalEnvValue, firstDefined } from './load-env';

const REQUIRED_MIGRATIONS = [
  '20260311_0010_agent_os_foundation.sql',
  '20260311_0011_agent_os_execution_memory.sql',
  '20260311_0012_agent_os_runtime_controls.sql',
  '20260311_0013_agent_os_ops_visibility.sql',
  '20260311_0014_agent_os_alert_acks.sql',
  '20260311_0015_agent_os_alert_ack_reopen.sql',
  '20260311_0016_agent_os_ops_snapshot_exports.sql',
  '20260311_0017_agent_os_ops_snapshot_types.sql'
] as const;

const REQUIRED_TABLES = [
  'agents',
  'agent_versions',
  'agent_policy_profiles',
  'agent_memory_partitions',
  'agent_lifecycle_events',
  'approval_requests',
  'approval_decisions',
  'eval_runs',
  'eval_scores',
  'executions',
  'execution_steps',
  'agent_memory_entries',
  'orchestration_bundle_exports',
  'orchestration_alert_acks',
  'worker_heartbeats',
  'orchestration_ops_snapshot_exports'
] as const;

const REQUIRED_ALERT_ACK_COLUMNS = ['reopened_at', 'reopened_by', 'reopen_reason'] as const;
const REQUIRED_OPS_EXPORT_COLUMNS = ['snapshot_type', 'payload_hash', 'signature', 'sealed_at', 'snapshot'] as const;

function fail(message: string): never {
  console.error(`[agent-os:migrations] ${message}`);
  process.exit(1);
}

async function verifyDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tableRows = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tables = new Set(tableRows.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
    if (missingTables.length > 0) {
      fail(`missing required tables: ${missingTables.join(', ')}`);
    }

    const alertAckColumns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orchestration_alert_acks'
    `);
    const alertAckColumnSet = new Set(alertAckColumns.rows.map((row) => row.column_name));
    const missingAlertAckColumns = REQUIRED_ALERT_ACK_COLUMNS.filter((column) => !alertAckColumnSet.has(column));
    if (missingAlertAckColumns.length > 0) {
      fail(`missing required orchestration_alert_acks columns: ${missingAlertAckColumns.join(', ')}`);
    }

    const opsExportColumns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orchestration_ops_snapshot_exports'
    `);
    const opsExportColumnSet = new Set(opsExportColumns.rows.map((row) => row.column_name));
    const missingOpsExportColumns = REQUIRED_OPS_EXPORT_COLUMNS.filter((column) => !opsExportColumnSet.has(column));
    if (missingOpsExportColumns.length > 0) {
      fail(`missing required orchestration_ops_snapshot_exports columns: ${missingOpsExportColumns.join(', ')}`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadAgentOsEnv();

  const root = path.resolve(__dirname, '..', '..');
  const migrationDir = path.join(root, 'packages', 'artifacts-api', 'db', 'migrations');

  for (const file of REQUIRED_MIGRATIONS) {
    const abs = path.join(migrationDir, file);
    if (!fs.existsSync(abs)) {
      fail(`missing migration file: ${path.relative(root, abs)}`);
    }
  }

  const verifyDb = firstDefined(process.env.AGENT_OS_VERIFY_DB, process.env.ARTIFACTS_VERIFY_DB)?.toLowerCase() === 'true';
  const dbUrl = optionalEnvValue([
    'AGENT_OS_DATABASE_URL',
    'ARTIFACTS_DATABASE_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
    'PGDATABASE_URL'
  ]);

  if (verifyDb) {
    if (!dbUrl) {
      fail('AGENT_OS_VERIFY_DB=true requires one of: AGENT_OS_DATABASE_URL, ARTIFACTS_DATABASE_URL, DATABASE_URL, POSTGRES_URL, PGDATABASE_URL');
    }
    await verifyDatabase(dbUrl);
    console.log('[agent-os:migrations] OK (files + database schema)');
    return;
  }

  console.log('[agent-os:migrations] OK (files only; database verification skipped)');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
