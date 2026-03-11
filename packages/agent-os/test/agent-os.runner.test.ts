import { describe, expect, it, vi } from "vitest";

import { AgentWorkerRunner } from "../src/workers/runner";

describe("AgentWorkerRunner", () => {
  it("runs execution and eval processing in one non-HTTP cycle", async () => {
    const repository = {
      claimQueuedExecutions: vi.fn(async () => []),
      claimPendingEvalRuns: vi.fn(async () => []),
      appendExecutionStep: vi.fn(async () => ({})),
      completeExecution: vi.fn(async () => undefined),
      getExecution: vi.fn(async () => null),
      scheduleExecutionRetry: vi.fn(async () => ({})),
      deadLetterExecution: vi.fn(async () => ({})),
      completeEvalRun: vi.fn(async () => ({ evalRun: { evalRunId: "eval:1" }, scores: [] })),
      scheduleEvalRetry: vi.fn(async () => ({})),
      deadLetterEvalRun: vi.fn(async () => ({}))
    } as any;

    const runner = new AgentWorkerRunner(repository);
    const result = await runner.runOnce({
      tenantId: "tenant-1",
      agentId: "maestro",
      limit: 5
    });

    expect(result.executions.completed).toEqual([]);
    expect(result.evals.completed).toEqual([]);
    expect(repository.claimQueuedExecutions).toHaveBeenCalledOnce();
    expect(repository.claimPendingEvalRuns).toHaveBeenCalledOnce();
  });
});
