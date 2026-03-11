import type { AgentId } from "../agents/registry.js";

export type EvalMetricSpec = {
  metric: string;
  minScore?: number;
  maxScore?: number;
  targetDirection: "higher_is_better" | "lower_is_better";
};

export type EvalProfile = {
  profileId: string;
  agentId: AgentId;
  metrics: EvalMetricSpec[];
};

export const AGENT_EVAL_PROFILES: Record<AgentId, EvalProfile> = {
  brandyn: {
    profileId: "brandyn-evals-v1",
    agentId: "brandyn",
    metrics: [
      { metric: "tone_fidelity", minScore: 0.92, targetDirection: "higher_is_better" },
      { metric: "positioning_consistency", minScore: 0.92, targetDirection: "higher_is_better" },
      { metric: "contradiction_rate", maxScore: 0.03, targetDirection: "lower_is_better" },
      { metric: "banned_phrase_violations", maxScore: 0, targetDirection: "lower_is_better" },
      { metric: "offer_clarity", minScore: 0.9, targetDirection: "higher_is_better" }
    ]
  },
  jordyn: {
    profileId: "jordyn-evals-v1",
    agentId: "jordyn",
    metrics: [
      { metric: "design_token_compliance", minScore: 0.98, targetDirection: "higher_is_better" },
      { metric: "visual_consistency_score", minScore: 0.93, targetDirection: "higher_is_better" },
      { metric: "brand_alignment_score", minScore: 0.93, targetDirection: "higher_is_better" },
      { metric: "creative_drift_rate", maxScore: 0.05, targetDirection: "lower_is_better" }
    ]
  },
  kobe: {
    profileId: "kobe-evals-v1",
    agentId: "kobe",
    metrics: [
      { metric: "schedule_adherence", minScore: 0.99, targetDirection: "higher_is_better" },
      { metric: "platform_format_correctness", minScore: 0.98, targetDirection: "higher_is_better" },
      { metric: "publishing_success_rate", minScore: 0.99, targetDirection: "higher_is_better" },
      { metric: "approval_bypass_rate", maxScore: 0, targetDirection: "lower_is_better" }
    ]
  }
};
