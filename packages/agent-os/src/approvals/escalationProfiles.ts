import type { AgentId } from "../agents/registry.js";

export type ApprovalEscalationPolicy = {
  agentId: AgentId;
  staleAfterMinutes: number;
  maxEscalations: number;
};

export const APPROVAL_ESCALATION_POLICIES: Record<AgentId, ApprovalEscalationPolicy> = {
  brandyn: { agentId: "brandyn", staleAfterMinutes: 180, maxEscalations: 2 },
  jordyn: { agentId: "jordyn", staleAfterMinutes: 180, maxEscalations: 2 },
  kobe: { agentId: "kobe", staleAfterMinutes: 90, maxEscalations: 2 },
  oracle: { agentId: "oracle", staleAfterMinutes: 120, maxEscalations: 2 },
  titan: { agentId: "titan", staleAfterMinutes: 60, maxEscalations: 3 },
  maestro: { agentId: "maestro", staleAfterMinutes: 45, maxEscalations: 3 }
};

export function getApprovalEscalationPolicy(agentId: AgentId): ApprovalEscalationPolicy {
  return APPROVAL_ESCALATION_POLICIES[agentId];
}
