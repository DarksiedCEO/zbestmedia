import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PolicyError } from "../src/agency/policy/types";
import { PolicyService } from "../src/agency/policy/policyService";
import { createPool, type DbPool } from "../src/db/pool";
import { withTenant } from "../src/db/withTenant";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

describe.runIf(Boolean(DATABASE_URL))("PolicyService integration", () => {
  let pool: DbPool;

  beforeAll(async () => {
    await applyArtifactsMigration({ databaseUrl: DATABASE_URL! });
    pool = createPool(DATABASE_URL!);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates draft -> submit -> approve -> activate -> resolve", async () => {
    await withTenant(pool, TENANT_ID, async (client) => {
      const svc = new PolicyService(client);
      const actorId = "tester";

      const created = await svc.createDraft({
        tenantId: TENANT_ID,
        scopeType: "global",
        scopeId: null,
        policyKey: "performance_limits",
        valueJson: {
          maxCPA: 150,
          maxRouteLatencyP95: 220,
          maxErrorRate: 0.02,
          maxPodFailureRate: 0.05,
          minMargin: 0.3
        },
        effectiveAt: new Date(Date.now() - 1_000),
        changeReason: "init",
        createdBy: actorId,
        requiredRoles: ["sebastian"]
      });

      await svc.submitForApproval(TENANT_ID, created.policyVersionId, actorId);
      await svc.recordApproval(TENANT_ID, created.policyVersionId, "sebastian", "approved", actorId);
      await svc.activate(TENANT_ID, created.policyVersionId, actorId);

      const resolved = await svc.resolve(TENANT_ID, "performance_limits", new Date());
      expect(resolved.provenance).not.toBeNull();
      expect((resolved.resolved as { maxCPA: number }).maxCPA).toBe(150);
    });
  });

  it("rejects campaign policy draft without expiresAt", async () => {
    await withTenant(pool, TENANT_ID, async (client) => {
      const svc = new PolicyService(client);
      await expect(
        svc.createDraft({
          tenantId: TENANT_ID,
          scopeType: "campaign",
          scopeId: "22222222-2222-4222-8222-222222222222",
          policyKey: "creative_limits",
          valueJson: {
            minCreativeScore: 0.82,
            brandRiskTolerance: "low",
            experimentationLevel: "moderate"
          },
          effectiveAt: new Date(),
          expiresAt: null,
          changeReason: "test",
          createdBy: "tester",
          requiredRoles: ["sebastian"]
        })
      ).rejects.toMatchObject({ code: "EXPIRES_REQUIRED" } satisfies Partial<PolicyError>);
    });
  });
});
