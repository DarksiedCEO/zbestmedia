import { z } from "zod";
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

export const ROUTING_TASK_CATEGORIES = [
  "brand_identity",
  "campaign_growth",
  "visual_design",
  "jingle_music",
  "build_integrity_monitoring",
  "dependency_integrity_monitoring",
  "runtime_health_monitoring",
  "migration_integrity_monitoring",
  "route_contract_monitoring",
  "slo_integrity_monitoring"
] as const;

export type JingleRoutingMode = "composition" | "packaging";
export const JINGLE_ROUTING_MODES = ["composition", "packaging"] as const;

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

export const RoutingTaskCategorySchema = z.enum(ROUTING_TASK_CATEGORIES);

export const JingleRoutingModeSchema = z.enum(JINGLE_ROUTING_MODES);

export const RoutingDecisionSchema = z.object({
  requestedCategory: RoutingTaskCategorySchema,
  resolvedDepartment: z.string().min(1),
  resolvedExecutive: z.string().min(1),
  resolvedLeadAgentId: z.string().min(1),
  resolvedSubAgentId: z.string().nullable(),
  executionAgentId: z.string().nullable(),
  responsibilityKey: z.string().min(1),
  operationalSignalType: z.string().nullable(),
  policyValidated: z.literal(true),
  trace: z.array(z.string().min(1))
});
