import { describe, expect, it, vi } from "vitest";

import {
  AgentRuntimeService,
  AgentVersionPromotionGateError,
  AgentVersionService,
  ApprovalEscalationService
} from "../src/index.js";

describe("agent-os runtime controls", () => {
  it("escalates stale approval requests", async () => {
    const markApprovalEscalated = vi.fn(async ({ approvalRequestId }: { approvalRequestId: string }) => ({
      approvalRequestId,
      escalationCount: 1
    }));
    const repository = {
      listStaleApprovalRequests: vi.fn(async () => [
        { approvalRequestId: "approval:brandyn:1" },
        { approvalRequestId: "approval:kobe:2" }
      ]),
      markApprovalEscalated
    } as never;

    const service = new ApprovalEscalationService(repository);
    const result = await service.escalateStaleRequests({
      tenantId: "11111111-1111-4111-8111-111111111111",
      olderThanIso: "2026-03-11T00:00:00.000Z"
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.approvalRequestId).toBe("approval:brandyn:1");
    expect(markApprovalEscalated).toHaveBeenCalledTimes(2);
  });

  it("schedules retries before dead-lettering executions", async () => {
    let runState = "routed";
    const scheduleExecutionRetry = vi.fn(async () => ({
      executionId: "execution:kobe:campaign-1",
      status: "QUEUED",
      retryCount: 1
    }));
    const deadLetterExecution = vi.fn(async () => ({
      executionId: "execution:kobe:campaign-1",
      status: "FAILED",
      deadLetteredAt: "2026-03-11T00:01:00.000Z"
    }));
    const repository = {
      claimQueuedExecutions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            tenantId: "11111111-1111-4111-8111-111111111111",
            executionId: "execution:kobe:campaign-1",
            agentId: "kobe",
            inputPayload: { forceFail: true },
            retryCount: 0,
            maxRetries: 2
          }
        ])
        .mockResolvedValueOnce([
          {
            tenantId: "11111111-1111-4111-8111-111111111111",
            executionId: "execution:kobe:campaign-1",
            agentId: "kobe",
            inputPayload: { forceFail: true },
            retryCount: 1,
            maxRetries: 2
          }
        ]),
      appendExecutionStep: vi.fn(async () => ({})),
      getExecutionRunRecordByExecutionId: vi.fn(async () => ({
        runRecordId: "run:kobe:campaign-1",
        currentState: runState
      })),
      transitionExecutionRunRecord: vi.fn(async ({ toState }: { toState: string }) => {
        runState = toState;
        return { runRecordId: "run:kobe:campaign-1", currentState: toState };
      }),
      scheduleExecutionRetry,
      deadLetterExecution,
      completeExecution: vi.fn(async () => undefined),
      getExecution: vi.fn(async () => null)
    } as never;

    const service = new AgentRuntimeService(
      repository,
      undefined,
      { createFromExecutionFailure: vi.fn(async () => ({ incidentId: "incident:1" })) } as never
    );
    const first = await service.processExecutionJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      limit: 1,
      now: "2026-03-11T00:00:00.000Z"
    });
    const second = await service.processExecutionJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      limit: 1,
      now: "2026-03-11T00:01:00.000Z"
    });

    expect(first.retried).toHaveLength(1);
    expect(second.deadLettered).toHaveLength(1);
    expect(scheduleExecutionRetry).toHaveBeenCalledTimes(1);
    expect(deadLetterExecution).toHaveBeenCalledTimes(1);
  });

  it("appends executed handoff steps for queued maestro orchestration jobs", async () => {
    let runState = "routed";
    const appendExecutionStep = vi.fn(async () => ({}));
    const repository = {
      claimQueuedExecutions: vi.fn(async () => [
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          executionId: "execution:maestro:campaign-1",
          agentId: "maestro",
          inputPayload: {
            routedWorkflow: "brand_pipeline",
            delegatedAgents: ["brandyn", "jordyn", "kobe", "oracle", "titan"],
            handoffPlan: [
              { fromAgent: "brandyn", toAgent: "jordyn" },
              { fromAgent: "jordyn", toAgent: "kobe" }
            ]
          },
          retryCount: 0,
          maxRetries: 2
        }
      ]),
      appendExecutionStep,
      getExecutionRunRecordByExecutionId: vi.fn(async () => ({
        runRecordId: "run:maestro:campaign-1",
        currentState: runState
      })),
      transitionExecutionRunRecord: vi.fn(async ({ toState }: { toState: string }) => {
        runState = toState;
        return { runRecordId: "run:maestro:campaign-1", currentState: toState };
      }),
      completeExecution: vi.fn(async () => undefined),
      getExecution: vi.fn(async () => ({
        execution: { executionId: "execution:maestro:campaign-1", status: "COMPLETED" }
      }))
    } as never;

    const service = new AgentRuntimeService(
      repository,
      undefined,
      { createFromExecutionFailure: vi.fn(async () => ({ incidentId: "incident:2" })) } as never
    );
    await service.processExecutionJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      agentId: "maestro",
      limit: 1,
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(appendExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepName: "handoff_executed:brandyn->jordyn"
      })
    );
    expect(appendExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepName: "handoff_executed:jordyn->kobe"
      })
    );
  });

  it("completes eval jobs and dead-letters exhausted failing evals", async () => {
    const completeEvalRun = vi.fn(async () => ({
      evalRun: { evalRunId: "eval:brandyn:pass", status: "COMPLETED" },
      scores: []
    }));
    const deadLetterEvalRun = vi.fn(async () => ({
      evalRunId: "eval:kobe:fail",
      status: "FAILED"
    }));
    const repository = {
      claimPendingEvalRuns: vi
        .fn()
        .mockResolvedValueOnce([
          {
            tenantId: "11111111-1111-4111-8111-111111111111",
            evalRunId: "eval:brandyn:pass",
            agentId: "brandyn",
            suiteName: "foundation-suite",
            retryCount: 0,
            maxRetries: 2
          },
          {
            tenantId: "11111111-1111-4111-8111-111111111111",
            evalRunId: "eval:kobe:fail",
            agentId: "kobe",
            suiteName: "force-fail-suite",
            retryCount: 1,
            maxRetries: 2
          }
        ]),
      completeEvalRun,
      scheduleEvalRetry: vi.fn(async () => ({
        evalRunId: "eval:kobe:retry",
        status: "PENDING"
      })),
      deadLetterEvalRun
    } as never;

    const service = new AgentRuntimeService(repository);
    const result = await service.processEvalJobs({
      tenantId: "11111111-1111-4111-8111-111111111111",
      limit: 5,
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(result.completed).toHaveLength(1);
    expect(result.deadLettered).toHaveLength(1);
    expect(completeEvalRun).toHaveBeenCalledTimes(1);
    expect(deadLetterEvalRun).toHaveBeenCalledTimes(1);
  });

  it("blocks version promotion when eval gates are not satisfied", async () => {
    const promoteAgentVersion = vi.fn();
    const repository = {
      getLatestEvalRunForVersion: vi.fn(async () => ({
        status: "COMPLETED",
        scoreSummary: { failed: 1, total: 5 }
      })),
      promoteAgentVersion
    } as never;

    const service = new AgentVersionService(repository);

    await expect(
      service.promoteVersion({
        tenantId: "11111111-1111-4111-8111-111111111111",
        agentId: "brandyn",
        agentVersionId: "brandyn:foundation-v2",
        promotedBy: "founder",
        reason: "promote"
      })
    ).rejects.toBeInstanceOf(AgentVersionPromotionGateError);
    expect(promoteAgentVersion).not.toHaveBeenCalled();
  });
});
