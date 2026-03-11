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

  it("lists maestro workflow executions and filters dead-lettered items", async () => {
    const repositoryWithExecutions = {
      ...repository,
      listExecutions: vi.fn(async () => [
        { executionId: "execution:maestro:1", agentId: "maestro", deadLetteredAt: null },
        { executionId: "execution:maestro:2", agentId: "maestro", deadLetteredAt: "2026-03-11T00:00:00.000Z" }
      ])
    } as any;
    const serviceWithExecutions = new MaestroOrchestrationService(
      repositoryWithExecutions,
      executionService,
      approvalEscalation
    );

    const all = await serviceWithExecutions.listWorkflowExecutions({
      tenantId: "tenant-1"
    });
    const deadOnly = await serviceWithExecutions.listWorkflowExecutions({
      tenantId: "tenant-1",
      deadLetteredOnly: true
    });

    expect(all).toHaveLength(2);
    expect(deadOnly).toEqual([{ executionId: "execution:maestro:2", agentId: "maestro", deadLetteredAt: "2026-03-11T00:00:00.000Z" }]);
  });

  it("builds approval SLA report from pending and stale approvals", async () => {
    const repositoryWithApprovals = {
      ...repository,
      listApprovalRequests: vi.fn(async () => [
        { agentId: "brandyn", escalatedAt: null },
        { agentId: "kobe", escalatedAt: "2026-03-11T00:00:00.000Z" }
      ]),
      listStaleApprovalRequests: vi.fn(async () => [{ agentId: "kobe" }])
    } as any;
    const serviceWithApprovals = new MaestroOrchestrationService(
      repositoryWithApprovals,
      executionService,
      approvalEscalation
    );

    const report = await serviceWithApprovals.buildApprovalSlaReport({
      tenantId: "tenant-1",
      olderThanMinutes: 60
    });

    expect(report.totals).toEqual({ pending: 2, stale: 1, escalated: 1 });
    expect(report.byAgent.kobe).toEqual({ pending: 1, stale: 1, escalated: 1 });
  });
});
