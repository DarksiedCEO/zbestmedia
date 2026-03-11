import type { AgentId } from "../agents/registry.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import { evaluateObservations, type EvalObservation } from "../evals/runner.js";
import { buildDeterministicExecutionOutput } from "../execution/service.js";
import type { EvalRunRecord, ExecutionRecord } from "../persistence/contracts.js";
import type { AgentOsRepository } from "../persistence/repository.js";

function buildDefaultEvalObservations(agentId: AgentId): EvalObservation[] {
  return AGENT_EVAL_PROFILES[agentId].metrics.map((metric) => ({
    metric: metric.metric,
    score: metric.targetDirection === "higher_is_better" ? Math.max(metric.minScore ?? 1, 1) : Math.min(metric.maxScore ?? 0, 0),
    metadata: { generatedBy: "agent-os-runtime" }
  }));
}

export class AgentRuntimeService {
  constructor(private readonly repository: AgentOsRepository) {}

  async processExecutionJobs(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    retryDelayMs?: number;
    now?: string;
  }): Promise<{ completed: ExecutionRecord[]; retried: ExecutionRecord[]; deadLettered: ExecutionRecord[] }> {
    const retryDelayMs = args.retryDelayMs ?? 60_000;
    const now = args.now ?? new Date().toISOString();
    const claimed = await this.repository.claimQueuedExecutions({
      tenantId: args.tenantId,
      agentId: args.agentId,
      limit: args.limit,
      startedAt: now
    });

    const completed: ExecutionRecord[] = [];
    const retried: ExecutionRecord[] = [];
    const deadLettered: ExecutionRecord[] = [];

    for (const execution of claimed) {
      const forcedFailureClass =
        typeof execution.inputPayload.forceFailureClass === "string"
          ? execution.inputPayload.forceFailureClass
          : execution.inputPayload.forceFail === true
            ? "TRANSIENT_RUNTIME_ERROR"
            : null;
      const failureMessage =
        typeof execution.inputPayload.forceFailureMessage === "string"
          ? execution.inputPayload.forceFailureMessage
          : "forced_runtime_failure";

      if (forcedFailureClass) {
        const nextAttemptCount = execution.retryCount + 1;
        if (nextAttemptCount >= execution.maxRetries) {
          await this.repository.appendExecutionStep({
            tenantId: args.tenantId,
            executionId: execution.executionId,
            stepName: "execution_dead_lettered",
            stepOrder: 99,
            status: "FAILED",
            payload: { failureClass: forcedFailureClass, failureMessage },
            createdAt: now
          });
          deadLettered.push(
            await this.repository.deadLetterExecution({
              tenantId: args.tenantId,
              executionId: execution.executionId,
              failureClass: forcedFailureClass,
              failureMessage,
              deadLetteredAt: now
            })
          );
        } else {
          const nextRetryAt = new Date(new Date(now).getTime() + retryDelayMs).toISOString();
          await this.repository.appendExecutionStep({
            tenantId: args.tenantId,
            executionId: execution.executionId,
            stepName: "execution_retry_scheduled",
            stepOrder: 99,
            status: "FAILED",
            payload: { failureClass: forcedFailureClass, failureMessage, nextRetryAt },
            createdAt: now
          });
          retried.push(
            await this.repository.scheduleExecutionRetry({
              tenantId: args.tenantId,
              executionId: execution.executionId,
              failureClass: forcedFailureClass,
              failureMessage,
              nextRetryAt,
              updatedAt: now
            })
          );
        }
        continue;
      }

      const output = buildDeterministicExecutionOutput(execution.agentId, execution.inputPayload);
      const handoffPlan = Array.isArray(output.handoffPlan) ? output.handoffPlan : [];
      for (const [index, step] of handoffPlan.entries()) {
        if (
          step &&
          typeof step === "object" &&
          "fromAgent" in step &&
          "toAgent" in step &&
          typeof step.fromAgent === "string" &&
          typeof step.toAgent === "string"
        ) {
          await this.repository.appendExecutionStep({
            tenantId: args.tenantId,
            executionId: execution.executionId,
            stepName: `handoff_executed:${step.fromAgent}->${step.toAgent}`,
            stepOrder: 20 + index,
            status: "COMPLETED",
            payload: step as Record<string, unknown>,
            createdAt: now
          });
        }
      }
      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "execution_completed_by_worker",
        stepOrder: 2,
        status: "COMPLETED",
        payload: output,
        createdAt: now
      });
      await this.repository.completeExecution({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        outputPayload: output,
        completedAt: now
      });
      const resolved = await this.repository.getExecution({
        tenantId: args.tenantId,
        executionId: execution.executionId
      });
      if (resolved) {
        completed.push(resolved.execution);
      }
    }

    return { completed, retried, deadLettered };
  }

  async processEvalJobs(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    retryDelayMs?: number;
    now?: string;
  }): Promise<{ completed: EvalRunRecord[]; retried: EvalRunRecord[]; deadLettered: EvalRunRecord[] }> {
    const retryDelayMs = args.retryDelayMs ?? 60_000;
    const now = args.now ?? new Date().toISOString();
    const claimed = await this.repository.claimPendingEvalRuns({
      tenantId: args.tenantId,
      agentId: args.agentId,
      limit: args.limit
    });

    const completed: EvalRunRecord[] = [];
    const retried: EvalRunRecord[] = [];
    const deadLettered: EvalRunRecord[] = [];

    for (const run of claimed) {
      const shouldForceFailure = run.suiteName.includes("force-fail");
      if (shouldForceFailure) {
        const nextAttemptCount = run.retryCount + 1;
        if (nextAttemptCount >= run.maxRetries) {
          deadLettered.push(
            await this.repository.deadLetterEvalRun({
              tenantId: args.tenantId,
              evalRunId: run.evalRunId,
              deadLetteredAt: now
            })
          );
        } else {
          const nextRetryAt = new Date(new Date(now).getTime() + retryDelayMs).toISOString();
          retried.push(
            await this.repository.scheduleEvalRetry({
              tenantId: args.tenantId,
              evalRunId: run.evalRunId,
              nextRetryAt
            })
          );
        }
        continue;
      }

      const evaluation = evaluateObservations(run.agentId, buildDefaultEvalObservations(run.agentId));
      const result = await this.repository.completeEvalRun({
        tenantId: args.tenantId,
        evalRunId: run.evalRunId,
        scoreSummary: evaluation.scoreSummary,
        scores: evaluation.scores,
        completedAt: now
      });
      completed.push(result.evalRun);
    }

    return { completed, retried, deadLettered };
  }
}
