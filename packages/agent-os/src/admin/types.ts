import type { IncidentRecord } from "../incidents/types.js";
import type { AssignmentRecord, ExecutionRunRecord } from "../execution/record-types.js";
import type { RoutingDecision, RoutingTaskCategory, JingleRoutingMode } from "../org/routing-types.js";
import type { OpsStatusSummary } from "../telemetry/types.js";

export type AgentOrgIntegrityStatus = {
  manifestVersion: string;
  valid: boolean;
  validatedAt: string;
  error: string | null;
};

export type AdminRoutingCategoryDescriptor = {
  category: RoutingTaskCategory;
  responsibilityKey: string | null;
  operationalSignalType: string | null;
  requiresDisambiguation: boolean;
  supported: boolean;
  supportedJingleModes?: JingleRoutingMode[];
};

export type AdminSummary = {
  manifestVersion: string;
  generatedAt: string;
  integrity: AgentOrgIntegrityStatus;
  ops: OpsStatusSummary;
  releaseBlockingIncidentCount: number;
  openIncidentCount: number;
  recentExecutionFailureCount: number;
  degradedSurfaces: string[];
};

export type AdminExecutionRecordList = {
  items: AssignmentRecord[];
};

export type AdminExecutionRunList = {
  items: ExecutionRunRecord[];
};

export type AdminIncidentList = {
  items: IncidentRecord[];
};

export type AdminRoutingPreview = {
  manifestVersion: string;
  resourceType: "admin_routing_preview";
  decision: RoutingDecision;
};
