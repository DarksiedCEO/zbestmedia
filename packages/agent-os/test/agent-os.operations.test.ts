import { describe, expect, it, vi } from "vitest";

import { AgentVersionService, AgentWorkerService } from "../src/index.js";

describe("agent-os operations", () => {
  it("promotes a prepared version through the version service", async () => {
    const repository = {
      promoteAgentVersion: vi.fn(async () => ({
        promotedVersion: { agentVersionId: "brandyn:foundation-v2" },
        previousVersionId: "brandyn:foundation-v1"
      }))
    } as never;
    const service = new AgentVersionService(repository);

    const result = await service.promoteVersion({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "brandyn",
      agentVersionId: "brandyn:foundation-v2",
      promotedBy: "founder",
      reason: "improved tone rules"
    });

    expect(result.promotedVersion.agentVersionId).toBe("brandyn:foundation-v2");
    expect(result.previousVersionId).toBe("brandyn:foundation-v1");
  });

  it("claims queued worker jobs through the worker service", async () => {
    const repository = {
      claimQueuedExecutions: vi.fn(async () => [{ executionId: "execution:kobe:campaign-1", status: "RUNNING" }]),
      queueEvalRun: vi.fn(async () => ({ evalRunId: "eval:brandyn:suite-1", status: "PENDING" })),
      claimPendingEvalRuns: vi.fn(async () => [{ evalRunId: "eval:brandyn:suite-1", status: "RUNNING" }])
    } as never;
    const service = new AgentWorkerService(repository);

    const executions = await service.claimExecutionJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "kobe",
      limit: 5
    });
    const queuedEval = await service.queueEvalJob({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "brandyn",
      suiteName: "brand-suite",
      createdBy: "ops-1"
    });
    const claimedEvals = await service.claimEvalJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "brandyn",
      limit: 5
    });

    expect(executions[0]?.status).toBe("RUNNING");
    expect(queuedEval.status).toBe("PENDING");
    expect(claimedEvals[0]?.status).toBe("RUNNING");
  });
});
