import { describe, expect, it, vi } from "vitest";

import { AgentExecutionService } from "../src/execution/service";
import { MaestroOrchestrationError, MaestroOrchestrationService } from "../src/orchestration/service";

describe("MaestroOrchestrationService", () => {
  const repository = {
    appendExecutionStep: vi.fn(async () => undefined),
    getExecution: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-1", status: "COMPLETED" },
      steps: [
        { stepName: "execution_started" },
        { stepName: "handoff_planned:brandyn->jordyn" },
        { stepName: "handoff_planned:jordyn->kobe" }
      ]
    }))
  } as any;
  const executionService = {
    execute: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-1", status: "COMPLETED" },
      approvalRequired: false,
      output: { kind: "orchestration_output" }
    }))
  } as unknown as AgentExecutionService;
  const approvalEscalation = {
    escalateStaleRequests: vi.fn(async () => [{ approvalRequestId: "approval:1" }])
  } as any;

  const service = new MaestroOrchestrationService(repository, executionService, approvalEscalation);

  it("creates a delegated brand pipeline plan and appends handoff audit steps", async () => {
    const result = await service.createDelegatedPlan({
      tenantId: "tenant-1",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "test",
      workflow: "brand_pipeline",
      subjectId: "campaign-1",
      payload: { campaign: "spring" }
    });

    expect(result.delegatedAgents).toEqual(["brandyn", "jordyn", "kobe", "oracle", "titan"]);
    expect(result.handoffPlan).toEqual([
      { fromAgent: "brandyn", toAgent: "jordyn" },
      { fromAgent: "jordyn", toAgent: "kobe" },
      { fromAgent: "kobe", toAgent: "oracle" },
      { fromAgent: "oracle", toAgent: "titan" }
    ]);
    expect(repository.appendExecutionStep).toHaveBeenCalledTimes(4);
  });

  it("rejects invalid delegates", async () => {
    await expect(
      service.createDelegatedPlan({
        tenantId: "tenant-1",
        actorId: "actor-1",
        correlationId: "corr-1",
        requestSource: "test",
        workflow: "brand_pipeline",
        subjectId: "campaign-1",
        payload: {},
        delegatedAgents: ["brandyn", "maestro"]
      })
    ).rejects.toBeInstanceOf(MaestroOrchestrationError);
  });

  it("returns only handoff steps in audit view", async () => {
    const result = await service.getHandoffAudit({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-1"
    });

    expect(result?.handoffs).toEqual([
      { stepName: "handoff_planned:brandyn->jordyn" },
      { stepName: "handoff_planned:jordyn->kobe" }
    ]);
  });

  it("delegates approval escalation", async () => {
    const items = await service.escalateApprovals({
      tenantId: "tenant-1",
      olderThanMinutes: 45,
      agentId: "maestro"
    });

    expect(items).toEqual([{ approvalRequestId: "approval:1" }]);
    expect(approvalEscalation.escalateStaleRequests).toHaveBeenCalledOnce();
  });
});
