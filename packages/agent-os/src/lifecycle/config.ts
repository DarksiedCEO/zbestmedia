import { z } from "zod";
import type { AgentId } from "../agents/registry.js";

export const AgentLifecycleStatusSchema = z.enum([
  "draft",
  "training",
  "validation",
  "active",
  "supervised",
  "degraded",
  "retirement_pending",
  "retired",
  "replaced"
]);

export type AgentLifecycleStatus = z.infer<typeof AgentLifecycleStatusSchema>;

export type LifecycleTransition = {
  from: AgentLifecycleStatus;
  to: AgentLifecycleStatus;
};

export type AgentLifecycleProfile = {
  profileId: string;
  agentId: AgentId;
  allowedTransitions: LifecycleTransition[];
  requiredValidationMetrics: string[];
};

const COMMON_ALLOWED_TRANSITIONS: LifecycleTransition[] = [
  { from: "draft", to: "training" },
  { from: "training", to: "validation" },
  { from: "validation", to: "active" },
  { from: "active", to: "supervised" },
  { from: "active", to: "degraded" },
  { from: "supervised", to: "degraded" },
  { from: "degraded", to: "validation" },
  { from: "active", to: "retirement_pending" },
  { from: "supervised", to: "retirement_pending" },
  { from: "retirement_pending", to: "retired" },
  { from: "retired", to: "replaced" }
];

export const AGENT_LIFECYCLE_PROFILES: Record<AgentId, AgentLifecycleProfile> = {
  brandyn: {
    profileId: "brand-governance-v1",
    agentId: "brandyn",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "tone_fidelity",
      "positioning_consistency",
      "contradiction_rate",
      "banned_phrase_violations"
    ]
  },
  jordyn: {
    profileId: "visual-governance-v1",
    agentId: "jordyn",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "design_token_compliance",
      "visual_consistency_score",
      "brand_alignment_score",
      "creative_drift_rate"
    ]
  },
  kobe: {
    profileId: "social-deployment-v1",
    agentId: "kobe",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "schedule_adherence",
      "platform_format_correctness",
      "publishing_success_rate",
      "approval_bypass_rate"
    ]
  },
  oracle: {
    profileId: "growth-intelligence-v1",
    agentId: "oracle",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "metric_interpretation_accuracy",
      "signal_consistency",
      "recommendation_relevance",
      "anomaly_detection_precision"
    ]
  },
  titan: {
    profileId: "revenue-optimization-v1",
    agentId: "titan",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "monetization_lift_precision",
      "pricing_sensitivity_accuracy",
      "recommendation_roi_confidence",
      "pricing_risk_recall"
    ]
  },
  maestro: {
    profileId: "orchestration-v1",
    agentId: "maestro",
    allowedTransitions: COMMON_ALLOWED_TRANSITIONS,
    requiredValidationMetrics: [
      "routing_accuracy",
      "handoff_integrity",
      "approval_coordination_accuracy",
      "delegation_policy_compliance"
    ]
  }
};

export function isLifecycleTransitionAllowed(
  agentId: AgentId,
  from: AgentLifecycleStatus,
  to: AgentLifecycleStatus
): boolean {
  return AGENT_LIFECYCLE_PROFILES[agentId].allowedTransitions.some(
    (transition) => transition.from === from && transition.to === to
  );
}
