import { z } from "zod";

import type { OperationalSignalType } from "../org/selectors.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";

export const IncidentTypeSchema = z.enum([
  "build_integrity_failure",
  "dependency_integrity_failure",
  "runtime_health_failure",
  "migration_integrity_failure",
  "route_contract_failure",
  "slo_integrity_failure",
  "execution_policy_failure",
  "execution_runtime_failure"
]);
export type IncidentType = z.infer<typeof IncidentTypeSchema>;

export const IncidentSeveritySchema = z.enum(["info", "warning", "critical"]);
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;

export const IncidentStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentRecordSchema = z.object({
  tenantId: z.string().uuid(),
  incidentId: z.string().min(1),
  incidentType: IncidentTypeSchema,
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  owningExecutiveId: z.string().min(1),
  owningDepartmentId: z.string().min(1),
  owningLeadAgentId: z.string().min(1),
  owningSubAgentId: z.string().min(1),
  sourceSystem: z.string().min(1),
  relatedSignalType: z.string().nullable(),
  relatedAssignmentRecordId: z.string().nullable(),
  relatedRunRecordId: z.string().nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
  recommendedAction: z.string().min(1),
  releaseBlocking: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().nullable(),
  resolutionNote: z.string().nullable()
});
export type IncidentRecord = z.infer<typeof IncidentRecordSchema>;

export type IncidentSignalInput = {
  signalType: OperationalSignalType;
  status: "healthy" | "warning" | "critical";
  sourceSystem: string;
  message: string;
  details?: Record<string, unknown>;
  relatedAssignmentRecordId?: string | null;
  relatedRunRecordId?: string | null;
};

export type ExecutionFailureIncidentInput = {
  incidentType: Extract<IncidentType, "execution_policy_failure" | "execution_runtime_failure">;
  sourceSystem: string;
  message: string;
  details?: Record<string, unknown>;
  relatedAssignmentRecordId?: string | null;
  relatedRunRecordId?: string | null;
  releaseBlocking?: boolean;
};

export type IncidentOwnership = {
  owningExecutiveId: ExecutiveId;
  owningDepartmentId: DepartmentId;
  owningLeadAgentId: LeadAgentId;
  owningSubAgentId: SubAgentId;
};
