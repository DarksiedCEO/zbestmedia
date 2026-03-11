import type { AgentId } from "../agents/registry.js";

export type SharedPolicyAccess = "company_policy_read";

export type MemoryPartition = {
  partitionId: string;
  agentId: AgentId;
  namespace: string;
  ownedCollections: string[];
  sharedAccess: SharedPolicyAccess[];
};

export const AGENT_MEMORY_PARTITIONS: Record<AgentId, MemoryPartition> = {
  brandyn: {
    partitionId: "brandyn-brand-identity-v1",
    agentId: "brandyn",
    namespace: "agent.brandyn",
    ownedCollections: [
      "approved_taglines",
      "messaging_pillars",
      "founder_voice_examples",
      "banned_phrases",
      "service_descriptions",
      "positioning_documents",
      "tone_decisions"
    ],
    sharedAccess: ["company_policy_read"]
  },
  jordyn: {
    partitionId: "jordyn-visual-identity-v1",
    agentId: "jordyn",
    namespace: "agent.jordyn",
    ownedCollections: [
      "brand_kit",
      "typography_rules",
      "color_tokens",
      "imagery_rules",
      "reference_boards",
      "approved_layouts",
      "asset_qa_decisions"
    ],
    sharedAccess: ["company_policy_read"]
  },
  kobe: {
    partitionId: "kobe-social-deployment-v1",
    agentId: "kobe",
    namespace: "agent.kobe",
    ownedCollections: [
      "posting_schedules",
      "platform_best_practices",
      "campaign_rollout_templates",
      "channel_mappings",
      "post_history",
      "publishing_decisions"
    ],
    sharedAccess: ["company_policy_read"]
  }
};

export function canAgentAccessPartition(agentId: AgentId, partitionId: string): boolean {
  return AGENT_MEMORY_PARTITIONS[agentId].partitionId === partitionId;
}
