import type { AgentId } from "../agents/registry.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class AgentWorkerService {
  constructor(private readonly repository: AgentOsRepository) {}

  async claimExecutionJobs(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
  }) {
    return this.repository.claimQueuedExecutions(args);
  }

  async queueEvalJob(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    createdAt?: string;
  }) {
    return this.repository.queueEvalRun(args);
  }

  async claimEvalJobs(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
  }) {
    return this.repository.claimPendingEvalRuns(args);
  }
}
