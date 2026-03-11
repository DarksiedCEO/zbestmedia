import {
  BRANDYN_TASK_DOMAIN,
  JORDYN_TASK_DOMAIN,
  KOBE_TASK_DOMAIN,
  ORACLE_TASK_DOMAIN,
  TITAN_TASK_DOMAIN,
  type AgentTaskDomain
} from "./domains.js";

export type AgentId = "brandyn" | "jordyn" | "kobe" | "oracle" | "titan";

export type AgentDefinition = {
  agentId: AgentId;
  displayName: string;
  taskDomain: AgentTaskDomain;
  policyProfileId: string;
  memoryPartitionId: string;
  lifecycleProfileId: string;
  evalProfileId: string;
  workflowRole:
    | "brand_brain"
    | "visual_law"
    | "distribution_operator"
    | "intelligence_analyst"
    | "revenue_strategist";
  prohibitedDomains: AgentTaskDomain[];
};

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  brandyn: {
    agentId: "brandyn",
    displayName: "Brandyn",
    taskDomain: BRANDYN_TASK_DOMAIN,
    policyProfileId: "brandyn-governance-v1",
    memoryPartitionId: "brandyn-brand-identity-v1",
    lifecycleProfileId: "brand-governance-v1",
    evalProfileId: "brandyn-evals-v1",
    workflowRole: "brand_brain",
    prohibitedDomains: [JORDYN_TASK_DOMAIN, KOBE_TASK_DOMAIN, ORACLE_TASK_DOMAIN, TITAN_TASK_DOMAIN]
  },
  jordyn: {
    agentId: "jordyn",
    displayName: "Jordyn",
    taskDomain: JORDYN_TASK_DOMAIN,
    policyProfileId: "jordyn-visual-v1",
    memoryPartitionId: "jordyn-visual-identity-v1",
    lifecycleProfileId: "visual-governance-v1",
    evalProfileId: "jordyn-evals-v1",
    workflowRole: "visual_law",
    prohibitedDomains: [BRANDYN_TASK_DOMAIN, KOBE_TASK_DOMAIN, ORACLE_TASK_DOMAIN, TITAN_TASK_DOMAIN]
  },
  kobe: {
    agentId: "kobe",
    displayName: "Kobe",
    taskDomain: KOBE_TASK_DOMAIN,
    policyProfileId: "kobe-social-v1",
    memoryPartitionId: "kobe-social-deployment-v1",
    lifecycleProfileId: "social-deployment-v1",
    evalProfileId: "kobe-evals-v1",
    workflowRole: "distribution_operator",
    prohibitedDomains: [BRANDYN_TASK_DOMAIN, JORDYN_TASK_DOMAIN, ORACLE_TASK_DOMAIN, TITAN_TASK_DOMAIN]
  },
  oracle: {
    agentId: "oracle",
    displayName: "Oracle",
    taskDomain: ORACLE_TASK_DOMAIN,
    policyProfileId: "oracle-growth-v1",
    memoryPartitionId: "oracle-growth-intelligence-v1",
    lifecycleProfileId: "growth-intelligence-v1",
    evalProfileId: "oracle-evals-v1",
    workflowRole: "intelligence_analyst",
    prohibitedDomains: [BRANDYN_TASK_DOMAIN, JORDYN_TASK_DOMAIN, KOBE_TASK_DOMAIN, TITAN_TASK_DOMAIN]
  },
  titan: {
    agentId: "titan",
    displayName: "Titan",
    taskDomain: TITAN_TASK_DOMAIN,
    policyProfileId: "titan-revenue-v1",
    memoryPartitionId: "titan-revenue-optimization-v1",
    lifecycleProfileId: "revenue-optimization-v1",
    evalProfileId: "titan-evals-v1",
    workflowRole: "revenue_strategist",
    prohibitedDomains: [BRANDYN_TASK_DOMAIN, JORDYN_TASK_DOMAIN, KOBE_TASK_DOMAIN, ORACLE_TASK_DOMAIN]
  }
};

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  return AGENT_DEFINITIONS[agentId];
}
