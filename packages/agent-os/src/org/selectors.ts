import type { AgentId } from "../agents/registry.js";

import { LEAD_AGENTS } from "./lead-agents.js";
import { SUB_AGENTS } from "./sub-agents.js";
import type { LeadAgentId, SubAgentId } from "./types.js";

export type ResponsibilityKey =
  | "brand_identity_governance"
  | "visual_identity_governance"
  | "social_campaign_deployment"
  | "sonic_brand_composition"
  | "sonic_campaign_packaging"
  | "build_breakage_detection"
  | "dependency_drift_detection"
  | "runtime_health_monitoring"
  | "migration_integrity_monitoring"
  | "route_contract_monitoring"
  | "slo_release_gate_monitoring"
  | "growth_intelligence"
  | "revenue_optimization"
  | "orchestration_workflow";

export type OperationalSignalType =
  | "build_breakage"
  | "dependency_drift"
  | "runtime_health"
  | "migration_integrity"
  | "route_contract"
  | "slo_release_gate";

export const RESPONSIBILITY_OWNER: Record<ResponsibilityKey, LeadAgentId | null> = {
  brand_identity_governance: "brandyn",
  visual_identity_governance: "jordyn",
  social_campaign_deployment: "kobe",
  sonic_brand_composition: "jingle-jon",
  sonic_campaign_packaging: "jingle-jane",
  build_breakage_detection: "code-sentinel",
  dependency_drift_detection: "code-sentinel",
  runtime_health_monitoring: "code-sentinel",
  migration_integrity_monitoring: "code-sentinel",
  route_contract_monitoring: "code-sentinel",
  slo_release_gate_monitoring: "code-sentinel",
  growth_intelligence: null,
  revenue_optimization: null,
  orchestration_workflow: null
};

export const EXECUTION_AGENT_TO_LEAD_AGENT: Partial<Record<AgentId, LeadAgentId>> = {
  brandyn: "brandyn",
  jordyn: "jordyn",
  kobe: "kobe"
};

export const CODE_SENTINEL_SIGNAL_OWNERS: Record<OperationalSignalType, SubAgentId> = {
  build_breakage: "build-monitor",
  dependency_drift: "dependency-watcher",
  runtime_health: "runtime-health-monitor",
  migration_integrity: "migration-guardian",
  route_contract: "route-contract-watcher",
  slo_release_gate: "slo-enforcer"
};

export function getLeadAgentAllowedScope(leadAgentId: LeadAgentId): string[] {
  return LEAD_AGENTS[leadAgentId].allowedScope;
}

export function getLeadAgentForbiddenScope(leadAgentId: LeadAgentId): string[] {
  return LEAD_AGENTS[leadAgentId].forbiddenScope;
}

export function getResponsibilityOwner(responsibilityKey: ResponsibilityKey): LeadAgentId | null {
  return RESPONSIBILITY_OWNER[responsibilityKey];
}

export function getOperationalSignalOwner(signalType: OperationalSignalType) {
  const subAgentId = CODE_SENTINEL_SIGNAL_OWNERS[signalType];
  return {
    subAgent: SUB_AGENTS[subAgentId],
    leadAgent: LEAD_AGENTS[SUB_AGENTS[subAgentId].parentLeadAgentId]
  };
}
