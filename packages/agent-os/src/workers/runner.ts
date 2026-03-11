import type { AgentId } from "../agents/registry.js";
import { AgentRuntimeService } from "./runtime.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class AgentWorkerRunner {
  private readonly runtime: AgentRuntimeService;

  constructor(repository: AgentOsRepository) {
    this.runtime = new AgentRuntimeService(repository);
  }

  async runOnce(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    retryDelayMs?: number;
  }) {
    const executions = await this.runtime.processExecutionJobs(args);
    const evals = await this.runtime.processEvalJobs(args);

    return {
      executions,
      evals
    };
  }

  async runLoop(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    retryDelayMs?: number;
    intervalMs: number;
    maxIterations?: number;
  }) {
    const iterations: Array<Awaited<ReturnType<AgentWorkerRunner["runOnce"]>>> = [];
    let count = 0;

    while (args.maxIterations === undefined || count < args.maxIterations) {
      iterations.push(
        await this.runOnce({
          tenantId: args.tenantId,
          agentId: args.agentId,
          limit: args.limit,
          retryDelayMs: args.retryDelayMs
        })
      );
      count += 1;

      if (args.maxIterations !== undefined && count >= args.maxIterations) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, args.intervalMs));
    }

    return {
      iterations: count,
      last: iterations.length > 0 ? iterations[iterations.length - 1]! : null
    };
  }
}
