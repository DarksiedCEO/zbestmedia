import type { AgentId } from "../agents/registry.js";
import type { RoutingDecision, RoutingTaskCategory } from "../org/routing-types.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";

export type AssignmentPolicyDecision = "approved" | "rejected";

export type AssignmentRecord = {
  tenantId: string;
  assignmentRecordId: string;
  manifestVersion: string;
  correlationId: string;
  requestSource: string;
  requestedBy: string;
  requestedTaskCategory: RoutingTaskCategory | null;
  requestedResponsibilityKey: string | null;
  requestMetadata: Record<string, unknown>;
  requestedExecutionTarget: string | null;
  resolvedExecutiveId: ExecutiveId | null;
  resolvedDepartmentId: DepartmentId | null;
  resolvedLeadAgentId: LeadAgentId | null;
  resolvedSubAgentId: SubAgentId | null;
  executionAgentId: AgentId | null;
  policyDecision: AssignmentPolicyDecision;
  policyDecisionReason: string;
  routingDecision: RoutingDecision | null;
  routingTrace: string[];
  createdAt: string;
  updatedAt: string;
};

export type ExecutionRunState =
  | "requested"
  | "validated"
  | "routed"
  | "blocked"
  | "executing"
  | "retriable"
  | "succeeded"
  | "failed";

export type ExecutionRunRecord = {
  tenantId: string;
  runRecordId: string;
  assignmentRecordId: string;
  executionId: string | null;
  currentState: ExecutionRunState;
  requestedAt: string;
  validatedAt: string | null;
  routedAt: string | null;
  blockedAt: string | null;
  executionStartedAt: string | null;
  retriableAt: string | null;
  executionEndedAt: string | null;
  failureCategory: string | null;
  failureMessage: string | null;
  retryable: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ExecutionRunTransition =
  | "validate"
  | "route"
  | "block"
  | "start_execution"
  | "mark_retriable"
  | "succeed"
  | "fail";
