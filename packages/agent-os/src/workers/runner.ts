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
}
