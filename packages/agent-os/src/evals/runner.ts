import type { AgentId } from "../agents/registry.js";
import { AGENT_EVAL_PROFILES } from "./specs.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export type EvalObservation = {
  metric: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export function evaluateObservations(agentId: AgentId, observations: EvalObservation[]) {
  const expectedMetrics = AGENT_EVAL_PROFILES[agentId].metrics.map((metric) => metric.metric);
  const observedMetrics = new Set(observations.map((observation) => observation.metric));
  const missingMetrics = expectedMetrics.filter((metric) => !observedMetrics.has(metric));

  const scores = observations.map((observation) => {
    const spec = AGENT_EVAL_PROFILES[agentId].metrics.find((metric) => metric.metric === observation.metric);
    const passed = spec
      ? (spec.minScore === undefined || observation.score >= spec.minScore) &&
        (spec.maxScore === undefined || observation.score <= spec.maxScore)
      : false;

    return {
      metric: observation.metric,
      score: observation.score,
      thresholdMin: spec?.minScore ?? null,
      thresholdMax: spec?.maxScore ?? null,
      passed,
      metadata: observation.metadata ?? {}
    };
  });

  const passed = missingMetrics.length === 0 && scores.every((score) => score.passed);
  return {
    scores,
    missingMetrics,
    passed,
    scoreSummary: {
      total: scores.length,
      passed: scores.filter((score) => score.passed).length,
      failed: scores.filter((score) => !score.passed).length,
      missingMetrics
    }
  };
}

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
    const evaluation = evaluateObservations(args.agentId, args.observations);
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
      missingMetrics: evaluation.missingMetrics,
      passed: evaluation.passed
    };
  }
}
