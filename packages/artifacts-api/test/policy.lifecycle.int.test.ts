import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { buildServer } from "../src/server";
import { applyArtifactsMigration } from "./helpers/migrate";
import { performanceLimitsPolicy } from "./fixtures/policyMinimal";

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

describe.runIf(Boolean(DATABASE_URL))("policy lifecycle (integration)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

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
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("create -> submit -> approve -> activate -> resolve happy path", async () => {
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
        valueJson: performanceLimitsPolicy({ maxCPA: 160 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "lifecycle-happy-path",
        requiredRoles: ["sebastian"]
      }
    });
    expect(create.statusCode).toBe(201);
    const policyVersionId = String(create.json().policyVersionId);

    const submit = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/submit`,
      headers: sebastianHeaders
    });
    expect(submit.statusCode).toBe(204);

    const approve = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/approve`,
      headers: sebastianHeaders,
      payload: { role: "sebastian", decision: "approved", notes: "ok" }
    });
    expect(approve.statusCode).toBe(204);

    const activate = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/activate`,
      headers: sebastianHeaders
    });
    expect(activate.statusCode).toBe(204);

    const resolve = await app.inject({
      method: "GET",
      url: `/v1/policies/resolve?policyKey=performance_limits&clientId=${encodeURIComponent(clientId)}&campaignId=${encodeURIComponent(campaignId)}`,
      headers: sebastianHeaders
    });
    expect(resolve.statusCode).toBe(200);
    const resolved = resolve.json();
    expect(resolved.meta?.resolution_hash).toBeTruthy();
    expect(resolved.source?.policyVersionId).toBe(policyVersionId);
    expect(resolved.source?.scopeType).toBe("campaign");
    expect(resolved.resolved?.maxCPA).toBe(160);
  });

  it("reject path blocks activation", async () => {
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
        valueJson: performanceLimitsPolicy({ maxCPA: 170 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "lifecycle-reject-path",
        requiredRoles: ["sebastian"]
      }
    });
    const policyVersionId = String(create.json().policyVersionId);

    const submit = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/submit`,
      headers: sebastianHeaders
    });
    expect(submit.statusCode).toBe(204);

    const reject = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/approve`,
      headers: sebastianHeaders,
      payload: { role: "sebastian", decision: "rejected", notes: "nope" }
    });
    expect(reject.statusCode).toBe(204);

    const activate = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/activate`,
      headers: sebastianHeaders
    });
    expect(activate.statusCode).toBe(409);
    expect(activate.json().error).toBe("INVALID_STATE");
  });

  it("rollback creates replacement draft that can be approved+activated", async () => {
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
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
          changeReason: `activate-${maxCPA}`,
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

    const v1 = await createAndActivate(120);
    const v2 = await createAndActivate(300);
    expect(v1).not.toBe(v2);

    const beforeRollback = await app.inject({
      method: "GET",
      url: `/v1/policies/resolve?policyKey=performance_limits&clientId=${encodeURIComponent(clientId)}&campaignId=${encodeURIComponent(campaignId)}`,
      headers: sebastianHeaders
    });
    expect(beforeRollback.statusCode).toBe(200);
    expect(beforeRollback.json().source?.policyVersionId).toBe(v2);
    expect(beforeRollback.json().resolved?.maxCPA).toBe(300);

    const rollback = await app.inject({
      method: "POST",
      url: `/v1/policies/${v2}/rollback`,
      headers: sebastianHeaders,
      payload: { reason: "rollback to previous stable" }
    });
    expect(rollback.statusCode).toBe(201);
    const rollbackVersionId = String(rollback.json().policyVersionId);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${rollbackVersionId}/approve`,
          headers: sebastianHeaders,
          payload: { role: "sebastian", decision: "approved", notes: "rollback approved" }
        })
      ).statusCode
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${rollbackVersionId}/activate`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    const afterRollback = await app.inject({
      method: "GET",
      url: `/v1/policies/resolve?policyKey=performance_limits&clientId=${encodeURIComponent(clientId)}&campaignId=${encodeURIComponent(campaignId)}`,
      headers: sebastianHeaders
    });
    expect(afterRollback.statusCode).toBe(200);
    expect(afterRollback.json().source?.policyVersionId).toBe(rollbackVersionId);
    expect(afterRollback.json().resolved?.maxCPA).toBe(120);
  });

  it("role enforcement: non-governance role cannot submit/approve/activate/rollback", async () => {
    const campaignId = randomUUID();
    const clientId = randomUUID();
    const sebastianHeaders = await authedHeaders("sebastian");
    const userHeaders = await authedHeaders("user");

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
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "authz",
        requiredRoles: ["sebastian"]
      }
    });
    const policyVersionId = String(create.json().policyVersionId);

    const submitAsUser = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/submit`,
      headers: userHeaders
    });
    expect(submitAsUser.statusCode).toBe(403);

    const approveAsUser = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/approve`,
      headers: userHeaders,
      payload: { role: "sebastian", decision: "approved" }
    });
    expect(approveAsUser.statusCode).toBe(403);

    const activateAsUser = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/activate`,
      headers: userHeaders
    });
    expect(activateAsUser.statusCode).toBe(403);

    const rollbackAsUser = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/rollback`,
      headers: userHeaders,
      payload: { reason: "not allowed" }
    });
    expect(rollbackAsUser.statusCode).toBe(403);
  });

  it("concurrency/state guard: cannot approve before submit", async () => {
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
        valueJson: performanceLimitsPolicy({ maxCPA: 210 }),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "state-guard",
        requiredRoles: ["sebastian"]
      }
    });
    const policyVersionId = String(create.json().policyVersionId);

    const approve = await app.inject({
      method: "POST",
      url: `/v1/policies/${policyVersionId}/approve`,
      headers: sebastianHeaders,
      payload: { role: "sebastian", decision: "approved" }
    });
    expect(approve.statusCode).toBe(409);
    expect(approve.json().error).toBe("INVALID_STATE");
  });
});
