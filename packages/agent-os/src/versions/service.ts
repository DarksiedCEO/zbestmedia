import type { AgentId } from "../agents/registry.js";
import { AGENT_LIFECYCLE_PROFILES } from "../lifecycle/config.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class AgentVersionPromotionGateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AgentVersionService {
  constructor(private readonly repository: AgentOsRepository) {}

  async createVersion(args: {
    tenantId: string;
    agentId: AgentId;
    versionLabel: string;
    definitionSnapshot: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }) {
    return this.repository.createAgentVersion(args);
  }

  async promoteVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
    promotedBy: string;
    reason: string;
    createdAt?: string;
  }) {
    const latestEval = await this.repository.getLatestEvalRunForVersion({
      tenantId: args.tenantId,
      agentId: args.agentId,
      agentVersionId: args.agentVersionId
    });

    if (!latestEval) {
      throw new AgentVersionPromotionGateError("promotion_requires_completed_eval");
    }
    if (latestEval.status !== "COMPLETED") {
      throw new AgentVersionPromotionGateError("promotion_requires_completed_eval");
    }

    const requiredMetricCount = AGENT_LIFECYCLE_PROFILES[args.agentId].requiredValidationMetrics.length;
    const failed = Number(latestEval.scoreSummary.failed ?? requiredMetricCount);
    const total = Number(latestEval.scoreSummary.total ?? 0);
    if (failed > 0 || total < requiredMetricCount) {
      throw new AgentVersionPromotionGateError("promotion_blocked_by_eval_thresholds");
    }

    return this.repository.promoteAgentVersion(args);
  }
}
