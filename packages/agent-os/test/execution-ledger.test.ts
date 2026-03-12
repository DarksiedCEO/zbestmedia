import { describe, expect, it, vi } from "vitest";

import { AgentExecutionLedgerService, AgentExecutionLedgerStateError } from "../src/index.js";

describe("execution ledger", () => {
  it("creates assignment and run records through the repository seam", async () => {
    const repository = {
      createAssignmentRecord: vi.fn(async (args) => ({
        assignmentRecordId: "assignment:1",
        ...args
      })),
      createExecutionRunRecord: vi.fn(async (args) => ({
        runRecordId: "run:1",
        ...args
      }))
    } as never;

    const ledger = new AgentExecutionLedgerService(repository);

    const assignment = await ledger.createAssignment({
      tenantId: "11111111-1111-4111-8111-111111111111",
      correlationId: "corr-1",
      requestSource: "test-suite",
      requestedBy: "actor-1",
      requestedTaskCategory: "brand_identity",
      requestMetadata: { subjectType: "brand_smoke" },
      requestedExecutionTarget: "brandyn",
      policyDecision: "approved",
      policyDecisionReason: "assignment_policy_valid"
    });
    const run = await ledger.createRun({
      tenantId: "11111111-1111-4111-8111-111111111111",
      assignmentRecordId: assignment.assignmentRecordId,
      requestedAt: "2026-03-12T01:00:00.000Z"
    });

    expect(assignment.assignmentRecordId).toBe("assignment:1");
    expect(run.runRecordId).toBe("run:1");
  });

  it("rejects invalid state transitions", async () => {
    const ledger = new AgentExecutionLedgerService({} as never);

    await expect(
      ledger.transition({
        tenantId: "11111111-1111-4111-8111-111111111111",
        runRecord: {
          runRecordId: "run:1",
          currentState: "requested"
        } as never,
        transition: "succeed"
      })
    ).rejects.toBeInstanceOf(AgentExecutionLedgerStateError);
  });

  it("transitions run states through the repository with provenance metadata", async () => {
    const repository = {
      transitionExecutionRunRecord: vi.fn(async (args) => ({
        runRecordId: "run:1",
        currentState: args.toState,
        metadata: args.metadata ?? {}
      }))
    };

    const ledger = new AgentExecutionLedgerService(repository as never);
    const result = await ledger.transition({
      tenantId: "11111111-1111-4111-8111-111111111111",
      runRecord: {
        runRecordId: "run:1",
        currentState: "validated"
      } as never,
      transition: "route",
      metadata: { resolvedLeadAgentId: "brandyn" },
      transitionedAt: "2026-03-12T01:00:00.000Z"
    });

    expect(repository.transitionExecutionRunRecord).toHaveBeenCalledOnce();
    expect(result.currentState).toBe("routed");
  });
});
