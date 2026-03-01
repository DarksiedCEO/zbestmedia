import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { createPool, type DbPool } from "../src/db/pool";
import { withTenant } from "../src/db/withTenant";
import { buildServer } from "../src/server";
import { performanceLimitsPolicy } from "./fixtures/policyMinimal";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

type ResolveAuditRow = {
  id: string;
  correlation_id: string;
  policy_key: string;
  role: string | null;
  resolution_hash: string | null;
  active_version: number | null;
  contract_version: string;
  receipt_kid: string | null;
  receipt_sig_present: boolean;
};

async function signToken(args: { tenantId: string; actorId: string; roles: string[] }): Promise<string> {
  return new SignJWT({
    tenantId: args.tenantId,
    roles: args.roles
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(args.actorId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function authedHeaders(role: string, requestId: string): Promise<Record<string, string>> {
  const token = await signToken({
    tenantId: TENANT_ID,
    actorId: `${role}-actor`,
    roles: [role]
  });
  return {
    authorization: `Bearer ${token}`,
    "x-request-id": requestId
  };
}

async function createActiveCampaignPolicy(args: {
  app: Awaited<ReturnType<typeof buildServer>>;
  campaignId: string;
  clientId: string;
  headers: Record<string, string>;
}): Promise<string> {
  const create = await args.app.inject({
    method: "POST",
    url: "/v1/policies/drafts",
    headers: args.headers,
    payload: {
      scopeType: "campaign",
      scopeId: args.campaignId,
      clientId: args.clientId,
      policyKey: "performance_limits",
      valueJson: performanceLimitsPolicy({ maxCPA: 180 }),
      effectiveAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
      changeReason: "resolve-audit-integration",
      requiredRoles: ["sebastian"]
    }
  });
  expect(create.statusCode).toBe(201);
  const policyVersionId = String(create.json().policyVersionId);

  expect(
    (
      await args.app.inject({
        method: "POST",
        url: `/v1/policies/${policyVersionId}/submit`,
        headers: args.headers
      })
    ).statusCode
  ).toBe(204);

  expect(
    (
      await args.app.inject({
        method: "POST",
        url: `/v1/policies/${policyVersionId}/approve`,
        headers: args.headers,
        payload: { role: "sebastian", decision: "approved" }
      })
    ).statusCode
  ).toBe(204);

  expect(
    (
      await args.app.inject({
        method: "POST",
        url: `/v1/policies/${policyVersionId}/activate`,
        headers: args.headers
      })
    ).statusCode
  ).toBe(204);

  return policyVersionId;
}

describe.runIf(Boolean(DATABASE_URL))("policy resolve audit (integration)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let pool: DbPool;

  const originalAuditEnabled = process.env.POLICY_RESOLVE_AUDIT_ENABLED;
  const originalAuditSampleRate = process.env.POLICY_RESOLVE_AUDIT_SAMPLE_RATE;
  const originalAuditSeed = process.env.POLICY_RESOLVE_AUDIT_SEED;

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: DATABASE_URL!,
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY,
      MAX_ARTIFACT_WRITES_PER_MINUTE: 60,
      MAX_POLICY_PAYLOAD_BYTES: 50_000,
      MAX_POLICY_PAYLOAD_KEYS: 200,
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 16_384,
      LEAD_MAX_CONVERSION_META_BYTES: 16_384,
      LEAD_MAX_INTAKE_ATTR_BYTES: 16_384,
      LEAD_ROUTE_SLOW_BUDGET_MS: 250,
      FORBIDDEN_ARTIFACT_TYPES: "legal.advice,medical.advice",
      FORBIDDEN_PHRASES: "guaranteed results,no risk,100% guaranteed",
      POLICY_VERSION: "policy-v1",
      MAX_PROVENANCE_DEPTH: 25
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    pool = createPool(env.DATABASE_URL);
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    process.env.POLICY_RESOLVE_AUDIT_ENABLED = originalAuditEnabled;
    process.env.POLICY_RESOLVE_AUDIT_SAMPLE_RATE = originalAuditSampleRate;
    process.env.POLICY_RESOLVE_AUDIT_SEED = originalAuditSeed;

    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
  });

  it("writes a resolve audit row when sampling is enabled at 1.0", async () => {
    process.env.POLICY_RESOLVE_AUDIT_ENABLED = "true";
    process.env.POLICY_RESOLVE_AUDIT_SAMPLE_RATE = "1";
    process.env.POLICY_RESOLVE_AUDIT_SEED = "42";

    const requestId = `resolve-audit-write-${randomUUID()}`;
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const headers = await authedHeaders("sebastian", requestId);

    await createActiveCampaignPolicy({ app, campaignId, clientId, headers });

    const resolve = await app.inject({
      method: "GET",
      url: `/v1/policies/resolve?policyKey=performance_limits&clientId=${encodeURIComponent(clientId)}&campaignId=${encodeURIComponent(campaignId)}`,
      headers
    });
    expect(resolve.statusCode).toBe(200);
    const body = resolve.json() as { meta: { resolution_hash: string | null } };
    expect(typeof body.meta.resolution_hash).toBe("string");

    await withTenant(pool, TENANT_ID, async (client) => {
      const result = await client.query<ResolveAuditRow>(
        `
        SELECT id, correlation_id, policy_key, role, resolution_hash, active_version, contract_version, receipt_kid, receipt_sig_present
        FROM agency.policy_resolve_audit
        WHERE tenant_id = $1 AND correlation_id = $2
        ORDER BY resolved_at DESC
        `,
        [TENANT_ID, requestId]
      );

      expect(result.rowCount).toBeGreaterThanOrEqual(1);
      const row = result.rows[0];
      expect(row.policy_key).toBe("performance_limits");
      expect(row.role).toBe("sebastian");
      expect(row.resolution_hash).toBe(body.meta.resolution_hash);
      expect(row.active_version).toBeTypeOf("number");
      expect(row.contract_version).toBe("policy-resolve@1.0.0");
      expect(row.receipt_kid).toBe("k1");
      expect(row.receipt_sig_present).toBe(false);
    });
  });

  it("does not write a resolve audit row when sample rate is 0.0", async () => {
    process.env.POLICY_RESOLVE_AUDIT_ENABLED = "true";
    process.env.POLICY_RESOLVE_AUDIT_SAMPLE_RATE = "0";
    process.env.POLICY_RESOLVE_AUDIT_SEED = "42";

    const requestId = `resolve-audit-skip-${randomUUID()}`;
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const headers = await authedHeaders("sebastian", requestId);

    await createActiveCampaignPolicy({ app, campaignId, clientId, headers });

    const resolve = await app.inject({
      method: "GET",
      url: `/v1/policies/resolve?policyKey=performance_limits&clientId=${encodeURIComponent(clientId)}&campaignId=${encodeURIComponent(campaignId)}`,
      headers
    });
    expect(resolve.statusCode).toBe(200);

    await withTenant(pool, TENANT_ID, async (client) => {
      const result = await client.query<{ cnt: string }>(
        `
        SELECT COUNT(*)::text AS cnt
        FROM agency.policy_resolve_audit
        WHERE tenant_id = $1 AND correlation_id = $2
        `,
        [TENANT_ID, requestId]
      );
      expect(Number(result.rows[0]?.cnt ?? "0")).toBe(0);
    });
  });
});
