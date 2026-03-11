import { SignJWT } from 'jose';

import { resolveAgentOsEnv } from './load-env';

type SmokeMode = 'local' | 'deployed';

function fail(message: string): never {
  console.error(`[agent-os:execution:smoke] ${message}`);
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

function assertPromptOutput(value: unknown, context: string): Record<string, unknown> {
  const obj = assertObject(value, context);
  for (const key of ['summary', 'actions', 'risks', 'approvalRequired', 'handoffTarget', 'evidence']) {
    if (!(key in obj)) {
      fail(`${context}: missing '${key}'`);
    }
  }
  return obj;
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
    env.tenantId,
    process.env.AGENT_OS_ACTOR_ID ?? 'agent-os-execution-smoke',
    env.authJwtSecret,
    env.authToken
  );

  const suffix = Date.now();
  const brandyn = await requestJson({
    baseUrl,
    method: 'POST',
    path: '/v1/agents/brandyn/execute',
    token,
    tenantId: env.tenantId,
    body: {
      subjectType: 'brand_smoke',
      subjectId: `brandyn-smoke-${suffix}`,
      payload: {
        objective: 'Define proof-led positioning for a smoke-test launch.',
        context: ['Smoke test execution path.'],
        subjectSummary: 'Smoke execution for Brandyn.'
      }
    }
  });

  if (brandyn.status !== 200) {
    fail(`brandyn execute expected 200, got ${brandyn.status}`);
  }
  const brandynJson = assertObject(brandyn.json, 'brandyn.execute');
  if (brandynJson.approvalRequired !== false) {
    fail('brandyn.execute: approvalRequired must be false for smoke fixture');
  }
  const brandynOutput = assertPromptOutput(brandynJson.output, 'brandyn.execute.output');
  if (brandynOutput.handoffTarget !== 'jordyn') {
    fail(`brandyn.execute.output: expected handoffTarget jordyn, got ${String(brandynOutput.handoffTarget)}`);
  }

  const maestro = await requestJson({
    baseUrl,
    method: 'POST',
    path: '/v1/orchestration/plans',
    token,
    tenantId: env.tenantId,
    body: {
      workflow: 'brand_pipeline',
      subjectId: `maestro-smoke-${suffix}`,
      payload: {
        objective: 'Route the full brand pipeline for smoke verification.',
        campaign: 'smoke'
      },
      queueForWorker: false
    }
  });

  if (maestro.status !== 201) {
    fail(`maestro plan expected 201, got ${maestro.status}`);
  }
  const maestroJson = assertObject(maestro.json, 'maestro.plan');
  const delegatedAgents = Array.isArray(maestroJson.delegatedAgents) ? maestroJson.delegatedAgents : [];
  if (delegatedAgents.join(',') !== 'brandyn,jordyn,kobe,oracle,titan') {
    fail(`maestro.plan: delegatedAgents mismatch (${JSON.stringify(delegatedAgents)})`);
  }
  const execution = assertObject(maestroJson.execution, 'maestro.plan.execution');
  const executionRecord = assertObject(execution.execution, 'maestro.plan.execution.execution');
  const executionId = executionRecord.executionId;
  if (typeof executionId !== 'string' || executionId.length === 0) {
    fail('maestro.plan.execution.execution: missing executionId');
  }
  assertPromptOutput(execution.output, 'maestro.plan.execution.output');

  const replayBundle = await requestJson({
    baseUrl,
    method: 'GET',
    path: `/v1/orchestration/executions/${executionId}/replay-bundle`,
    token,
    tenantId: env.tenantId
  });

  if (replayBundle.status !== 200) {
    fail(`replay bundle expected 200, got ${replayBundle.status}`);
  }
  const replayJson = assertObject(replayBundle.json, 'replay-bundle');
  if (!('bundle' in replayJson) || !('signature' in replayJson)) {
    fail('replay-bundle: missing bundle or signature');
  }
  const bundle = assertObject(replayJson.bundle, 'replay-bundle.bundle');
  const replay = assertObject(bundle.replay, 'replay-bundle.bundle.replay');
  if (replay.workflow !== 'brand_pipeline') {
    fail(`replay-bundle.bundle.replay: expected workflow brand_pipeline, got ${String(replay.workflow)}`);
  }

  console.log(
    `[agent-os:execution:smoke] OK mode=${smokeMode} base=${baseUrl} tenant=${env.tenantId} executionId=${executionId}`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
