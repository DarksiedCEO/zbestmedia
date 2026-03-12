import type { AgentId } from "../agents/registry.js";

import type { OperationalSignalType, ResponsibilityKey } from "./selectors.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "./types.js";

export type RoutingTaskCategory =
  | "brand_identity"
  | "campaign_growth"
  | "visual_design"
  | "jingle_music"
  | "build_integrity_monitoring"
  | "dependency_integrity_monitoring"
  | "runtime_health_monitoring"
  | "migration_integrity_monitoring"
  | "route_contract_monitoring"
  | "slo_integrity_monitoring";

export type JingleRoutingMode = "composition" | "packaging";

export type RoutingRequest = {
  category: RoutingTaskCategory;
  requestedAgentId?: LeadAgentId | SubAgentId | AgentId;
  jingleMode?: JingleRoutingMode;
};

export type RoutingDecision = {
  requestedCategory: RoutingTaskCategory;
  resolvedDepartment: DepartmentId;
  resolvedExecutive: ExecutiveId;
  resolvedLeadAgentId: LeadAgentId;
  resolvedSubAgentId: SubAgentId | null;
  executionAgentId: AgentId | null;
  responsibilityKey: ResponsibilityKey;
  operationalSignalType: OperationalSignalType | null;
  policyValidated: true;
  trace: string[];
};
