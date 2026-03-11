import type { AgentId } from "../agents/registry.js";

export type PolicyCapability =
  | "brand_rules.generate"
  | "brand_rules.evaluate"
  | "brand_rules.approve_copy"
  | "brand_rules.maintain_tone"
  | "visual_rules.validate"
  | "visual_rules.propose_specs"
  | "visual_rules.score_assets"
  | "visual_rules.maintain_tokens"
  | "publishing.package_content"
  | "publishing.schedule"
  | "publishing.adapt_channels"
  | "publishing.maintain_cadence"
  | "intelligence.analyze_performance"
  | "intelligence.aggregate_signals"
  | "intelligence.summarize_channels"
  | "intelligence.draft_recommendations";

export type PolicyRestriction =
  | "posting.direct_outbound"
  | "messaging.rewrite_strategy"
  | "visual.identity_override"
  | "analytics.performance_interpretation"
  | "budget.modify"
  | "lead.sales_activity"
  | "approval.override"
  | "compliance.alter_sensitive_copy"
  | "pricing.modify"
  | "strategy.redefine_brand"
  | "publishing.execute_campaign";

export type AgentPolicyProfile = {
  profileId: string;
  agentId: AgentId;
  allowed: PolicyCapability[];
  denied: PolicyRestriction[];
};

export const AGENT_POLICY_PROFILES: Record<AgentId, AgentPolicyProfile> = {
  brandyn: {
    profileId: "brandyn-governance-v1",
    agentId: "brandyn",
    allowed: [
      "brand_rules.generate",
      "brand_rules.evaluate",
      "brand_rules.approve_copy",
      "brand_rules.maintain_tone"
    ],
    denied: [
      "posting.direct_outbound",
      "visual.identity_override",
      "budget.modify",
      "analytics.performance_interpretation"
    ]
  },
  jordyn: {
    profileId: "jordyn-visual-v1",
    agentId: "jordyn",
    allowed: [
      "visual_rules.validate",
      "visual_rules.propose_specs",
      "visual_rules.score_assets",
      "visual_rules.maintain_tokens"
    ],
    denied: [
      "messaging.rewrite_strategy",
      "posting.direct_outbound",
      "budget.modify",
      "lead.sales_activity"
    ]
  },
  kobe: {
    profileId: "kobe-social-v1",
    agentId: "kobe",
    allowed: [
      "publishing.package_content",
      "publishing.schedule",
      "publishing.adapt_channels",
      "publishing.maintain_cadence"
    ],
    denied: [
      "messaging.rewrite_strategy",
      "visual.identity_override",
      "approval.override",
      "compliance.alter_sensitive_copy"
    ]
  },
  oracle: {
    profileId: "oracle-growth-v1",
    agentId: "oracle",
    allowed: [
      "intelligence.analyze_performance",
      "intelligence.aggregate_signals",
      "intelligence.summarize_channels",
      "intelligence.draft_recommendations"
    ],
    denied: [
      "strategy.redefine_brand",
      "visual.identity_override",
      "publishing.execute_campaign",
      "pricing.modify"
    ]
  }
};

export function canAgentPerform(agentId: AgentId, capability: PolicyCapability): boolean {
  return AGENT_POLICY_PROFILES[agentId].allowed.includes(capability);
}

export function isAgentDenied(agentId: AgentId, restriction: PolicyRestriction): boolean {
  return AGENT_POLICY_PROFILES[agentId].denied.includes(restriction);
}
