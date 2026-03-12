import { SignJWT } from 'jose';

import { assertWorkerSloReleaseStatus } from './ops-gate';
import { resolveAgentOsEnv } from './load-env';

type SmokeMode = 'local' | 'deployed';

function fail(message: string): never {
  console.error(`[agent-os:ops:smoke] ${message}`);
  process.exit(1);
}

function mode(): SmokeMode {
  const raw = (process.env.AGENT_OS_SMOKE_MODE ?? 'local').toLowerCase();
  if (raw !== 'local' && raw !== 'deployed') {
    fail(`AGENT_OS_SMOKE_MODE must be local|deployed (got ${raw})`);
  }
  return raw;
}

async function mintToken(args: {
  secret: string;
  tenantId: string;
  actorId: string;
  roles: string[];
}): Promise<string> {
  const key = new TextEncoder().encode(args.secret);
  return new SignJWT({ tenantId: args.tenantId, roles: args.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(args.actorId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
}

async function authToken(tenantId: string, actorId: string, secret?: string, explicitToken?: string): Promise<string> {
  const deployedMode = mode() === 'deployed';
  if (deployedMode && secret) {
    return mintToken({
      secret,
      tenantId,
      actorId,
      roles: ['admin', 'agents:read', 'agents:write', 'artifacts:read']
    });
  }
  if (explicitToken && explicitToken.trim()) {
    return explicitToken.trim();
  }
  if (!secret) {
    fail(
      'missing auth configuration. Provide one of: AGENT_OS_AUTH_TOKEN, ARTIFACTS_AUTH_TOKEN, AUTH_TOKEN, SERVICE_TOKEN, API_BEARER_TOKEN, AGENT_OS_AUTH_JWT_SECRET, ARTIFACTS_AUTH_JWT_SECRET, AUTH_JWT_SECRET, JWT_SECRET'
    );
  }
  return mintToken({
    secret,
    tenantId,
    actorId,
    roles: ['admin', 'agents:read', 'agents:write', 'artifacts:read']
  });
}

async function requestJson(args: {
  baseUrl: string;
  method: 'GET' | 'POST';
  path: string;
  token: string;
  tenantId: string;
  body?: unknown;
}): Promise<{ status: number; json: unknown; raw: string }> {
  const res = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method,
    headers: {
      authorization: `Bearer ${args.token}`,
      'x-tenant-id': args.tenantId,
      'content-type': 'application/json'
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body)
  });

  const raw = await res.text();
  let json: unknown = raw;
  try {
    json = JSON.parse(raw);
  } catch {
    // keep raw
  }
  return { status: res.status, json, raw };
}

function assertObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${context}: expected object response`);
  }
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const smokeMode = mode();
  const env = resolveAgentOsEnv(smokeMode);
  const baseUrl = env.baseUrl?.replace(/\/+$/, '');
  if (!baseUrl) {
    fail(
      smokeMode === 'deployed'
        ? 'missing required env AGENT_OS_BASE_URL for deployed smoke. Do not reuse ARTIFACTS_BASE_URL for Agent OS checks.'
        : 'missing required env AGENT_OS_BASE_URL. Tried aliases: AGENT_OS_BASE_URL, ARTIFACTS_BASE_URL, ARTIFACTS_API_BASE_URL, ZBESTMEDIA_API_BASE_URL, API_BASE_URL, BACKEND_BASE_URL'
    );
  }

  const token = await authToken(
    env.authTenantId,
    process.env.AGENT_OS_ACTOR_ID ?? 'agent-os-smoke',
    env.authJwtSecret,
    env.authToken
  );

  const runbook = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/runbook',
    token,
    tenantId: env.authTenantId
  });
  if (runbook.status !== 200) {
    fail(`runbook expected 200, got ${runbook.status}`);
  }
  const runbookJson = assertObject(runbook.json, 'runbook');
  const commands = assertObject(runbookJson.commands, 'runbook.commands');
  if (commands.releaseCheck !== 'pnpm agent-os:worker:release:check') {
    fail('runbook.commands.releaseCheck mismatch');
  }

  const slo = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/workers/slo?staleAfterMinutes=15',
    token,
    tenantId: env.authTenantId
  });
  if (slo.status !== 200) {
    fail(`worker SLO expected 200, got ${slo.status}`);
  }
  const sloJson = assertObject(slo.json, 'worker-slo');
  for (const field of ['totalWorkers', 'healthyWorkers', 'staleWorkers', 'freshnessCoverage', 'status']) {
    if (!(field in sloJson)) fail(`worker-slo: missing field '${field}'`);
  }
  const workerSloStatus = assertWorkerSloReleaseStatus(sloJson.status);

  const diagnostics = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/diagnostics?olderThanMinutes=60',
    token,
    tenantId: env.authTenantId
  });
  if (diagnostics.status !== 200) {
    fail(`diagnostics expected 200, got ${diagnostics.status}`);
  }
  const diagnosticsJson = assertObject(diagnostics.json, 'diagnostics');
  if (!('executions' in diagnosticsJson) || !('approvalSla' in diagnosticsJson)) {
    fail('diagnostics: missing executions or approvalSla');
  }

  const inventory = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/inventory',
    token,
    tenantId: env.authTenantId
  });
  if (inventory.status !== 200) {
    fail(`inventory expected 200, got ${inventory.status}`);
  }
  const inventoryJson = assertObject(inventory.json, 'inventory');
  if (!('deadLettered' in inventoryJson) || !('retryQueue' in inventoryJson)) {
    fail('inventory: missing deadLettered or retryQueue');
  }

  const alerts = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/alerts?olderThanMinutes=60&heartbeatStaleMinutes=15',
    token,
    tenantId: env.authTenantId
  });
  if (alerts.status !== 200) {
    fail(`alerts expected 200, got ${alerts.status}`);
  }
  const alertsJson = assertObject(alerts.json, 'alerts');
  if (!('alerts' in alertsJson)) {
    fail('alerts: missing alerts field');
  }

  const freshnessExport = await requestJson({
    baseUrl,
    method: 'GET',
    path: '/v1/orchestration/ops/workers/freshness/export?staleAfterMinutes=15',
    token,
    tenantId: env.authTenantId
  });
  if (freshnessExport.status !== 200) {
    fail(`freshness export expected 200, got ${freshnessExport.status}`);
  }
  const freshnessExportJson = assertObject(freshnessExport.json, 'freshness-export');
  if (!('snapshot' in freshnessExportJson) || !('signature' in freshnessExportJson)) {
    fail('freshness-export: missing snapshot or signature');
  }

  console.log(
    `[agent-os:ops:smoke] OK mode=${smokeMode} base=${baseUrl} tenant=${env.authTenantId} workerSloStatus=${workerSloStatus}`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
