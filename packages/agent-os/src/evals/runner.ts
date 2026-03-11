import type { AgentId } from "../agents/registry.js";
import { AGENT_EVAL_PROFILES } from "./specs.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export type EvalObservation = {
  metric: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export class EvalRunnerService {
  constructor(private readonly repository: AgentOsRepository) {}

  async runSuite(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    observations: EvalObservation[];
    createdAt?: string;
  }) {
    const expectedMetrics = AGENT_EVAL_PROFILES[args.agentId].metrics.map((metric) => metric.metric);
    const observedMetrics = new Set(args.observations.map((observation) => observation.metric));
    const missingMetrics = expectedMetrics.filter((metric) => !observedMetrics.has(metric));

    const result = await this.repository.createEvalRun({
      tenantId: args.tenantId,
      agentId: args.agentId,
      suiteName: args.suiteName,
      createdBy: args.createdBy,
      scores: args.observations,
      createdAt: args.createdAt
    });

    return {
      ...result,
      missingMetrics,
      passed: missingMetrics.length === 0 && result.scores.every((score) => score.passed)
    };
  }
}
