import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { createPool, type DbPool } from "../src/db/pool";
import { withTenant } from "../src/db/withTenant";
import { buildServer } from "../src/server";
import { HARD_INVARIANTS } from "../src/agency/policy/hardInvariants";
import { performanceLimitsPolicy } from "./fixtures/policyMinimal";
import { policyTier1Violation } from "./fixtures/policyTier1Violation";
import { getPolicyAudit } from "./helpers/audit";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

type PolicyStatusRow = {
  status: "draft" | "pending_approval" | "active" | "superseded" | "expired" | "rejected";
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

async function authedHeaders(role: string): Promise<Record<string, string>> {
  const token = await signToken({
    tenantId: TENANT_ID,
    actorId: `${role}-actor`,
    roles: [role]
  });
  return { authorization: `Bearer ${token}` };
}

describe.runIf(Boolean(DATABASE_URL))("tier-1 invariant enforcement (integration)", () => {
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

  it("blocks activation at campaign override cap and writes rejection audit", async () => {
    const sebastianHeaders = await authedHeaders("sebastian");
    const clientId = randomUUID();
    const cap = HARD_INVARIANTS.maxCampaignPolicyOverridesPerClient;

    const createAndActivateCampaignOverride = async (campaignId: string, maxCPA: number): Promise<string> => {
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
          changeReason: `seed-${maxCPA}`,
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

    for (let i = 0; i < cap; i += 1) {
      await createAndActivateCampaignOverride(randomUUID(), 120 + i);
    }

    const violatingCampaignId = randomUUID();
    const createViolating = await app.inject({
      method: "POST",
      url: "/v1/policies/drafts",
      headers: sebastianHeaders,
      payload: {
        scopeType: "campaign",
        scopeId: violatingCampaignId,
        clientId,
        policyKey: "performance_limits",
        valueJson: policyTier1Violation(),
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
        changeReason: "tier1-violation-cap-test",
        requiredRoles: ["sebastian"]
      }
    });
    expect(createViolating.statusCode).toBe(201);
    const violatingPolicyVersionId = String(createViolating.json().policyVersionId);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${violatingPolicyVersionId}/submit`,
          headers: sebastianHeaders
        })
      ).statusCode
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/policies/${violatingPolicyVersionId}/approve`,
          headers: sebastianHeaders,
          payload: { role: "sebastian", decision: "approved", notes: "approve before cap check" }
        })
      ).statusCode
    ).toBe(204);

    const activateViolating = await app.inject({
      method: "POST",
      url: `/v1/policies/${violatingPolicyVersionId}/activate`,
      headers: sebastianHeaders
    });
    expect(activateViolating.statusCode).toBe(409);
    expect(activateViolating.json().error).toBe("CAP_EXCEEDED");

    await withTenant(pool, TENANT_ID, async (client) => {
      const statusResult = await client.query<PolicyStatusRow>(
        `
        SELECT status
        FROM agency.policy_versions
        WHERE tenant_id = $1 AND id = $2
        `,
        [TENANT_ID, violatingPolicyVersionId]
      );
      expect(statusResult.rows[0]?.status).toBe("pending_approval");

      const events = await getPolicyAudit({
        client,
        tenantId: TENANT_ID,
        policyVersionId: violatingPolicyVersionId
      });
      const rejected = events.find((row) => row.event_type === "rejected");
      expect(rejected).toBeTruthy();
      expect(rejected?.actor_id).toBe("sebastian-actor");
      expect(rejected?.details_json?.reason).toBe("tier1_blocked");
      expect(rejected?.details_json?.errorCode).toBe("CAP_EXCEEDED");
    });
  });
});
