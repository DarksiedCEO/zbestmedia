import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { createPool, type DbPool } from "../src/db/pool";
import { withTenant } from "../src/db/withTenant";
import { buildServer } from "../src/server";
import { performanceLimitsPolicy } from "./fixtures/policyMinimal";
import { getPolicyAudit } from "./helpers/audit";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

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

async function authedHeaders(role: string): Promise<Record<string, string>> {
  const token = await signToken({
    tenantId: TENANT_ID,
    actorId: `${role}-actor`,
    roles: [role]
  });
  return { authorization: `Bearer ${token}` };
}

function findEvent(events: Array<{ event_type: string }>, eventType: string): { event_type: string } {
  const event = events.find((row) => row.event_type === eventType);
  expect(event, `missing audit event ${eventType}`).toBeTruthy();
  return event as { event_type: string };
}

describe.runIf(Boolean(DATABASE_URL))("policy audit log (integration)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let pool: DbPool;

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
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
  });

  it("writes created/submitted/approved/activated audit records", async () => {
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const sebastianHeaders = await authedHeaders("sebastian");

    const create = await app.inject({
      method: "POST",
      url: "/v1/policies/drafts",
      headers: sebastianHeaders,
      payload: {
        scopeType: "campaign",
        scopeId: campaignId,
        clientId,
        policyKey: "performance_limits",
        valueJson: performanceLimitsPolicy({ maxCPA: 190 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "audit-happy",
        requiredRoles: ["sebastian"]
      }
    });
    expect(create.statusCode).toBe(201);
    const policyVersionId = String(create.json().policyVersionId);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${policyVersionId}/submit`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${policyVersionId}/approve`,
          headers: sebastianHeaders,
          payload: { role: "sebastian", decision: "approved", notes: "approved in test" }
        })
      ).statusCode
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${policyVersionId}/activate`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    await withTenant(pool, TENANT_ID, async (client) => {
      const events = await getPolicyAudit({ client, tenantId: TENANT_ID, policyVersionId });
      expect(events.length).toBeGreaterThanOrEqual(4);
      findEvent(events, "created");
      findEvent(events, "submitted");
      findEvent(events, "approved");
      findEvent(events, "activated");
      expect(events.every((e) => Boolean(e.actor_id))).toBe(true);
      expect(events.every((e) => e.ts instanceof Date)).toBe(true);
    });
  });

  it("writes rejected and rolled_back audit records", async () => {
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const sebastianHeaders = await authedHeaders("sebastian");

    const createAndActivate = async (maxCPA: number): Promise<string> => {
      const create = await app.inject({
        method: "POST",
        url: "/v1/policies/drafts",
        headers: sebastianHeaders,
        payload: {
          scopeType: "campaign",
          scopeId: campaignId,
          clientId,
          policyKey: "performance_limits",
          valueJson: performanceLimitsPolicy({ maxCPA }),
          effectiveAt: new Date(Date.now() - 1_000).toISOString(),
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
          changeReason: `audit-create-${maxCPA}`,
          requiredRoles: ["sebastian"]
        }
      });
      expect(create.statusCode).toBe(201);
      const policyVersionId = String(create.json().policyVersionId);

      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/policies/${policyVersionId}/submit`,
            headers: sebastianHeaders
          })
        ).statusCode
      ).toBe(204);

      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/policies/${policyVersionId}/approve`,
            headers: sebastianHeaders,
            payload: { role: "sebastian", decision: "approved" }
          })
        ).statusCode
      ).toBe(204);

      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/policies/${policyVersionId}/activate`,
            headers: sebastianHeaders
          })
        ).statusCode
      ).toBe(204);

      return policyVersionId;
    };

    const createReject = await app.inject({
      method: "POST",
      url: "/v1/policies/drafts",
      headers: sebastianHeaders,
      payload: {
        scopeType: "campaign",
        scopeId: randomUUID(),
        clientId: randomUUID(),
        policyKey: "performance_limits",
        valueJson: performanceLimitsPolicy({ maxCPA: 210 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "audit-reject",
        requiredRoles: ["sebastian"]
      }
    });
    expect(createReject.statusCode).toBe(201);
    const rejectVersionId = String(createReject.json().policyVersionId);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${rejectVersionId}/submit`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${rejectVersionId}/approve`,
          headers: sebastianHeaders,
          payload: { role: "sebastian", decision: "rejected", notes: "reject in test" }
        })
      ).statusCode
    ).toBe(204);

    await withTenant(pool, TENANT_ID, async (client) => {
      const events = await getPolicyAudit({ client, tenantId: TENANT_ID, policyVersionId: rejectVersionId });
      findEvent(events, "rejected");
    });

    const v1 = await createAndActivate(120);
    const v2 = await createAndActivate(300);

    const rollback = await app.inject({
      method: "POST",
      url: `/v1/policies/${v2}/rollback`,
      headers: sebastianHeaders,
      payload: { reason: "audit rollback" }
    });
    expect(rollback.statusCode).toBe(201);

    await withTenant(pool, TENANT_ID, async (client) => {
      const rollbackEvents = await getPolicyAudit({ client, tenantId: TENANT_ID, policyVersionId: v2 });
      findEvent(rollbackEvents, "rolled_back");
      const rolledBack = rollbackEvents.find((row) => row.event_type === "rolled_back");
      expect(rolledBack?.details_json?.sourcePolicyVersionId).toBe(v1);
    });
  });

  it("audit log remains append-only across transitions", async () => {
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const sebastianHeaders = await authedHeaders("sebastian");

    const create = await app.inject({
      method: "POST",
      url: "/v1/policies/drafts",
      headers: sebastianHeaders,
      payload: {
        scopeType: "campaign",
        scopeId: campaignId,
        clientId,
        policyKey: "performance_limits",
        valueJson: performanceLimitsPolicy({ maxCPA: 230 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "audit-append",
        requiredRoles: ["sebastian"]
      }
    });
    expect(create.statusCode).toBe(201);
    const policyVersionId = String(create.json().policyVersionId);

    let beforeIds: Set<string> = new Set();
    await withTenant(pool, TENANT_ID, async (client) => {
      const before = await getPolicyAudit({ client, tenantId: TENANT_ID, policyVersionId });
      beforeIds = new Set(before.map((row) => row.id));
    });

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${policyVersionId}/submit`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    await withTenant(pool, TENANT_ID, async (client) => {
      const after = await getPolicyAudit({ client, tenantId: TENANT_ID, policyVersionId });
      expect(after.length).toBeGreaterThan(beforeIds.size);
      const preserved = after.filter((row) => beforeIds.has(row.id));
      expect(preserved.length).toBe(beforeIds.size);
    });
  });
});
