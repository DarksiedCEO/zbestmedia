import { describe, expect, it, vi } from "vitest";

import {
  AgentExecutionService,
  AgentMemoryAccessError,
  ApprovalWorkflowService,
  BrandPipelineOrchestrator,
  EvalRunnerService,
  MemoryPartitionService
} from "../src/index.js";

describe("agent-os execution and workflow services", () => {
  it("requires approval for customer-facing Brandyn executions", async () => {
    const repository = {
      createApprovalRequest: vi.fn(async () => ({
        approvalRequestId: "approval:brandyn:launch-copy",
        requiredApprovers: ["founder", "brand-lead"]
      })),
      createExecution: vi.fn(async () => ({
        executionId: "execution:brandyn:launch-copy",
        status: "PENDING_APPROVAL"
      })),
      appendExecutionStep: vi.fn(async () => ({}))
    } as never;

    const service = new AgentExecutionService(
      repository,
      new ApprovalWorkflowService(repository)
    );

    const result = await service.execute({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "brandyn",
      actorId: "founder",
      correlationId: "req-1",
      requestSource: "test-suite",
      subjectType: "copy",
      subjectId: "launch-copy",
      payload: { customerFacing: true }
    });

    expect(result.approvalRequired).toBe(true);
    if (result.approvalRequired) {
      expect(result.approvalRequestId).toContain("approval:brandyn");
    }
  });

  it("rejects writes to collections an agent does not own", async () => {
    const service = new MemoryPartitionService({} as never);

    await expect(
      service.writeOwnedEntry({
        tenantId: "11111111-1111-4111-8111-111111111111",
        agentId: "kobe",
        collection: "approved_taglines",
        entryKey: "x",
        entryValue: {},
        createdBy: "actor-1"
      })
    ).rejects.toBeInstanceOf(AgentMemoryAccessError);
  });

  it("runs the brand pipeline in the enforced order and attaches evals", async () => {
    const executionService = {
      execute: vi.fn(async () => ({
        execution: { executionId: "execution:brandyn:campaign-1", status: "COMPLETED" },
        approvalRequired: false,
        output: { kind: "brand_governance_output" }
      }))
    } as never;

    const evalRunner = {
      runSuite: vi.fn(async () => ({
        evalRun: { evalRunId: "eval:brandyn" },
        scores: [{ metric: "tone_fidelity", passed: true }],
        missingMetrics: [],
        passed: true
      }))
    } as never;

    const orchestrator = new BrandPipelineOrchestrator(executionService, evalRunner);

    const result = await orchestrator.advance({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "req-1",
      requestSource: "test-suite",
      subjectId: "campaign-1",
      completedSteps: [],
      nextStep: "brandyn_direction_approved",
      payload: { messagingPillars: ["proof", "velocity"] },
      evalObservations: [{ metric: "tone_fidelity", score: 0.95 }]
    });

    expect(result.completedSteps).toEqual(["brandyn_direction_approved"]);
    expect(result.remainingSteps[0]).toBe("jordyn_visual_alignment_approved");
    expect(result.evalResult?.passed).toBe(true);
  });
});
