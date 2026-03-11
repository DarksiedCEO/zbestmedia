import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildAgentOsFoundationBundle } from "../src/persistence/foundation.js";
import {
  AgentLifecycleStateError,
  AgentOsRepository
} from "../src/persistence/repository.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-03-11T12:00:00.000Z";

type FakeQueryCall = {
  sql: string;
  params?: unknown[];
};

function createFakeClient(responses: Array<{ rows?: unknown[] }>) {
  const queryCalls: FakeQueryCall[] = [];
  let index = 0;

  return {
    queryCalls,
    client: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queryCalls.push({ sql, params });
        const response = responses[index] ?? { rows: [] };
        index += 1;
        return response;
      })
    }
  };
}

describe("agent-os persistence foundation", () => {
  it("builds a deterministic foundation bundle for Brandyn, Jordyn, and Kobe", () => {
    const bundle = buildAgentOsFoundationBundle({
      tenantId: TENANT_ID,
      createdBy: "founder",
      versionLabel: "foundation-v1",
      createdAt: NOW
    });

    expect(bundle.agents).toHaveLength(3);
    expect(bundle.versions).toHaveLength(3);
    expect(bundle.policyProfiles).toHaveLength(3);
    expect(bundle.memoryPartitions).toHaveLength(3);
    expect(bundle.agents.map((agent) => agent.agentId)).toEqual(["brandyn", "jordyn", "kobe"]);
    expect(bundle.versions[0]?.agentVersionId).toBe("brandyn:foundation-v1");
    expect(bundle.policyProfiles[1]?.policyProfileId).toBe("jordyn-visual-v1");
    expect(bundle.memoryPartitions[2]?.partitionId).toBe("kobe-social-deployment-v1");
  });

  it("provisions the foundation rows through the repository", async () => {
    const fake = createFakeClient(new Array(12).fill({ rows: [] }));
    const runWithTenant = vi.fn(async (_pool, _tenantId, fn) => fn(fake.client as never));
    const repository = new AgentOsRepository({} as never, runWithTenant);

    const result = await repository.provisionFoundation({
      tenantId: TENANT_ID,
      createdBy: "founder",
      versionLabel: "foundation-v1",
      createdAt: NOW
    });

    expect(runWithTenant).toHaveBeenCalledOnce();
    expect(result.agents).toHaveLength(3);
    expect(fake.queryCalls).toHaveLength(12);
    expect(fake.queryCalls[0]?.sql).toContain("INSERT INTO agents");
    expect(fake.queryCalls[3]?.sql).toContain("INSERT INTO agent_versions");
    expect(fake.queryCalls[6]?.sql).toContain("INSERT INTO agent_policy_profiles");
    expect(fake.queryCalls[9]?.sql).toContain("INSERT INTO agent_memory_partitions");
  });

  it("guards illegal lifecycle transitions at the repository boundary", async () => {
    const fake = createFakeClient([{ rows: [{ current_status: "draft" }] }]);
    const repository = new AgentOsRepository(
      {} as never,
      vi.fn(async (_pool, _tenantId, fn) => fn(fake.client as never))
    );

    await expect(
      repository.appendLifecycleEvent({
        tenantId: TENANT_ID,
        agentId: "brandyn",
        toStatus: "active",
        actorId: "founder",
        reason: "skip gates",
        createdAt: NOW
      })
    ).rejects.toBeInstanceOf(AgentLifecycleStateError);
  });

  it("records approval and eval persistence rows with stable IDs", async () => {
    const fake = createFakeClient([
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ current_version_id: "brandyn:foundation-v1" }] },
      { rows: [] },
      { rows: [] }
    ]);
    const repository = new AgentOsRepository(
      {} as never,
      vi.fn(async (_pool, _tenantId, fn) => fn(fake.client as never))
    );

    const request = await repository.createApprovalRequest({
      tenantId: TENANT_ID,
      agentId: "kobe",
      subjectType: "content_package",
      subjectId: "campaign-17",
      requestedBy: "manager-1",
      requiredApprovers: ["brand-lead", "compliance-lead"],
      createdAt: NOW
    });
    const decision = await repository.recordApprovalDecision({
      tenantId: TENANT_ID,
      approvalRequestId: request.approvalRequestId,
      approverId: "brand-lead",
      decision: "APPROVE",
      rationale: "Brand fit confirmed",
      createdAt: NOW
    });
    const evalRun = await repository.createEvalRun({
      tenantId: TENANT_ID,
      agentId: "brandyn",
      suiteName: "brand-consistency",
      createdBy: "qa-runner",
      createdAt: NOW,
      scores: [
        { metric: "tone_fidelity", score: 0.95 },
        { metric: "banned_phrase_violations", score: 0 }
      ]
    });

    expect(request.approvalRequestId).toContain("approval:kobe:campaign-17");
    expect(decision.approvalDecisionId).toContain(request.approvalRequestId);
    expect(evalRun.evalRun.agentVersionId).toBe("brandyn:foundation-v1");
    expect(evalRun.scores).toHaveLength(2);
    expect(evalRun.scores.every((score) => typeof score.passed === "boolean")).toBe(true);
  });

  it("commits the required agent-os foundation tables and tenant policies in the migration", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "packages/artifacts-api/db/migrations/20260311_0010_agent_os_foundation.sql"
    );
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agents");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agent_versions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agent_policy_profiles");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agent_memory_partitions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agent_lifecycle_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS approval_requests");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS approval_decisions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS eval_runs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS eval_scores");
    expect(migration).toContain("CREATE POLICY agents_tenant_isolation");
    expect(migration).toContain("CREATE POLICY eval_scores_tenant_isolation");
  });
});
