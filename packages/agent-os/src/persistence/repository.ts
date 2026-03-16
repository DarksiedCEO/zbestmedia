import type { Pool, PoolClient } from "pg";

import type { AgentId } from "../agents/registry.js";
import {
  AGENT_DEFINITIONS,
  getAgentDefinition
} from "../agents/registry.js";
import {
  AGENT_LIFECYCLE_PROFILES,
  isLifecycleTransitionAllowed,
  type AgentLifecycleStatus
} from "../lifecycle/config.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import type {
  AgentLifecycleEventRecord,
  AaliyahDiagnosticsEventRecord,
  AaliyahMutationIdempotencyRecord,
  AaliyahSessionContextRecord,
  AaliyahFounderPreferenceRecord,
  FollowThroughHistoryEntry,
  FollowThroughRecord,
  AgentRecord,
  AssignmentRecord,
  ApprovalDecision,
  ApprovalDecisionRecord,
  ApprovalRequestRecord,
  ExecutionRecord,
  ExecutionRunRecord,
  ExecutionRunState,
  ExecutionStatus,
  ExecutionStepRecord,
  ExecutionStepStatus,
  EvalRunRecord,
  EvalScoreRecord,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  EmailAccountConnectionRecord,
  EmailAccountConnectionStatus,
  EmailDispatchPolicyResult,
  EmailDispatchRecord,
  EmailDispatchStatus,
  EmailDraftReviewRecord,
  EmailDraftReviewStatus,
  VoiceCallRecord,
  MemoryEntryRecord,
  OrchestrationOpsSnapshotExportRecord,
  OrchestrationAlertAckRecord,
  OrchestrationBundleExportRecord,
  WorkerHeartbeatRecord
} from "./contracts.js";
import { buildAgentOsFoundationBundle } from "./foundation.js";
import { withTenant } from "./withTenant.js";

export type RunWithTenant = <T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
) => Promise<T>;

type AgentRow = {
  tenant_id: string;
  agent_id: AgentId;
  display_name: string;
  task_domain: AgentRecord["taskDomain"];
  workflow_role: AgentRecord["workflowRole"];
  policy_profile_id: string;
  memory_partition_id: string;
  lifecycle_profile_id: string;
  eval_profile_id: string;
  current_version_id: string;
  current_status: AgentLifecycleStatus;
  prohibited_domains: AgentRecord["prohibitedDomains"];
  created_at: string | Date;
  updated_at: string | Date;
  retired_at: string | Date | null;
};

type AgentVersionRow = {
  tenant_id: string;
  agent_version_id: string;
  agent_id: AgentId;
  version_label: string;
  definition_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string | Date;
  replaced_by_version_id: string | null;
};

type ApprovalRequestRow = {
  tenant_id: string;
  approval_request_id: string;
  agent_id: AgentId;
  subject_type: string;
  subject_id: string;
  requested_by: string;
  required_approvers: string[];
  status: ApprovalRequestRecord["status"];
  payload: Record<string, unknown>;
  created_at: string | Date;
  resolved_at: string | Date | null;
  escalated_at: string | Date | null;
  escalation_count: number;
};

type ApprovalDecisionRow = {
  tenant_id: string;
  approval_decision_id: string;
  approval_request_id: string;
  approver_id: string;
  decision: ApprovalDecision;
  rationale: string;
  payload: Record<string, unknown>;
  created_at: string | Date;
};

type ExecutionRow = {
  tenant_id: string;
  execution_id: string;
  agent_id: AgentId;
  agent_version_id: string;
  correlation_id: string;
  request_source: string;
  requested_by: string;
  subject_type: string;
  subject_id: string;
  status: ExecutionStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  failure_class: string | null;
  failure_message: string | null;
  approval_request_id: string | null;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | Date | null;
  dead_lettered_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AssignmentRecordRow = {
  tenant_id: string;
  assignment_record_id: string;
  manifest_version: string;
  correlation_id: string;
  request_source: string;
  requested_by: string;
  requested_task_category: string | null;
  requested_responsibility_key: string | null;
  request_metadata: Record<string, unknown>;
  requested_execution_target: string | null;
  resolved_executive_id: string | null;
  resolved_department_id: string | null;
  resolved_lead_agent_id: string | null;
  resolved_sub_agent_id: string | null;
  execution_agent_id: string | null;
  policy_decision: AssignmentRecord["policyDecision"];
  policy_decision_reason: string;
  routing_decision: Record<string, unknown> | null;
  routing_trace: string[];
  created_at: string | Date;
  updated_at: string | Date;
};

type ExecutionRunRecordRow = {
  tenant_id: string;
  run_record_id: string;
  assignment_record_id: string;
  execution_id: string | null;
  current_state: ExecutionRunState;
  requested_at: string | Date;
  validated_at: string | Date | null;
  routed_at: string | Date | null;
  blocked_at: string | Date | null;
  execution_started_at: string | Date | null;
  retriable_at: string | Date | null;
  execution_ended_at: string | Date | null;
  failure_category: string | null;
  failure_message: string | null;
  retryable: boolean;
  metadata: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

type IncidentRow = {
  tenant_id: string;
  incident_id: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owning_executive_id: IncidentRecord["owningExecutiveId"];
  owning_department_id: IncidentRecord["owningDepartmentId"];
  owning_lead_agent_id: IncidentRecord["owningLeadAgentId"];
  owning_sub_agent_id: IncidentRecord["owningSubAgentId"];
  source_system: string;
  related_signal_type: string | null;
  related_assignment_record_id: string | null;
  related_run_record_id: string | null;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  recommended_action: string;
  release_blocking: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  acknowledged_at: string | Date | null;
  acknowledged_by: string | null;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

type EmailDraftReviewRow = {
  tenant_id: string;
  review_item_id: string;
  draft_id: string;
  account_id: string;
  thread_id: string;
  assignment_record_id: string | null;
  run_record_id: string | null;
  intent_category: EmailDraftReviewRecord["intentCategory"];
  priority: EmailDraftReviewRecord["priority"];
  risk_level: EmailDraftReviewRecord["riskLevel"];
  required_approval: true;
  review_status: EmailDraftReviewStatus;
  recommended_executive_id: string | null;
  recommended_department_id: string | null;
  recommended_lead_agent_id: string | null;
  recommended_sub_agent_id: string | null;
  draft_summary: string;
  proposed_reply_subject: string;
  proposed_reply_body: string;
  confidence_score: number;
  risk_score: number;
  escalation_recommended: boolean;
  blocked_auto_send: true;
  manifest_version: string;
  routing_provenance: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
  reviewed_at: string | Date | null;
  reviewed_by: string | null;
  review_note: string | null;
};

type EmailAccountConnectionRow = {
  tenant_id: string;
  account_id: string;
  provider: EmailAccountConnectionRecord["provider"];
  principal_id: string;
  account_email_address: string | null;
  connection_status: EmailAccountConnectionStatus;
  granted_scopes: string[];
  token_reference: string | null;
  external_account_id: string | null;
  draft_only_mode: true;
  processing_enabled: boolean;
  processing_mode: EmailAccountConnectionRecord["processingMode"];
  max_batch_threads: number;
  allowed_label_ids: string[];
  oauth_state: string | null;
  oauth_state_expires_at: string | Date | null;
  last_processed_at: string | Date | null;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type EmailDispatchRow = {
  tenant_id: string;
  dispatch_id: string;
  review_item_id: string;
  draft_id: string;
  account_id: string;
  thread_id: string;
  assignment_record_id: string | null;
  run_record_id: string | null;
  dispatch_status: EmailDispatchStatus;
  dispatch_policy: EmailDispatchPolicyResult;
  requested_at: string | Date;
  dispatched_at: string | Date | null;
  failure_category: string | null;
  failure_message: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  audit_metadata: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

type VoiceCallRow = {
  tenant_id: string;
  call_id: string;
  external_call_id: string | null;
  source_system: string;
  caller_phone_number: string;
  caller_display_name: string | null;
  caller_organization_name: string | null;
  transcript: string;
  call_summary_text: string | null;
  duration_seconds: number | null;
  intent: VoiceCallRecord["intent"];
  urgency: VoiceCallRecord["urgency"];
  risk_level: VoiceCallRecord["riskLevel"];
  company_mode: VoiceCallRecord["companyMode"];
  routing_target: VoiceCallRecord["routingTarget"];
  assignment_record_id: string | null;
  run_record_id: string | null;
  outcome: VoiceCallRecord["outcome"];
  founder_attention_required: boolean;
  escalation_recommended: boolean;
  interruption_class: VoiceCallRecord["interruptionClass"];
  recommended_next_action: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type AaliyahFounderPreferenceRow = {
  tenant_id: string;
  preference_id: string;
  category: AaliyahFounderPreferenceRecord["category"];
  value: AaliyahFounderPreferenceRecord["value"];
  scope: AaliyahFounderPreferenceRecord["scope"];
  source_type: AaliyahFounderPreferenceRecord["sourceType"];
  confidence_level: AaliyahFounderPreferenceRecord["confidenceLevel"];
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  deactivated_at: string | Date | null;
  created_by: string;
  deactivated_by: string | null;
};

type AaliyahSessionContextRow = {
  tenant_id: string;
  actor_id: string;
  principal_context: AaliyahSessionContextRecord["principalContext"];
  session_id: string;
  company_scope: AaliyahSessionContextRecord["companyScope"];
  active_mode_state: AaliyahSessionContextRecord["activeModeState"];
  interaction_state: AaliyahSessionContextRecord["interactionState"];
  retention_policy: AaliyahSessionContextRecord["retentionPolicy"];
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
  hard_expires_at: string | Date;
  last_reset_at: string | Date | null;
  last_reset_reason: AaliyahSessionContextRecord["lastResetReason"];
  version: number;
};

type FollowThroughRecordRow = {
  tenant_id: string;
  follow_through_id: string;
  version: number;
  session_id: string;
  actor_id: string;
  principal_context: FollowThroughRecord["principalContext"];
  active_mode: FollowThroughRecord["activeMode"];
  company_scope: FollowThroughRecord["companyScope"];
  working_item_type: FollowThroughRecord["workingItemType"];
  source_subsystem: string;
  source_item_id: string;
  queue_item_id: string | null;
  review_item_id: string | null;
  call_id: string | null;
  incident_id: string | null;
  dispatch_id: string | null;
  title: string;
  summary: string;
  status: FollowThroughRecord["status"];
  closure_state: FollowThroughRecord["closureState"];
  closure_reason: FollowThroughRecord["closureReason"];
  next_governed_action: FollowThroughRecord["nextGovernedAction"];
  founder_declared_completion: boolean;
  downstream_action_ref: string | null;
  escalation_target: string | null;
  escalation_class: FollowThroughRecord["escalationClass"];
  escalation_rationale: string | null;
  escalation_provenance: Record<string, unknown> | null;
  note: string | null;
  provenance: FollowThroughRecord["provenance"];
  created_at: string | Date;
  updated_at: string | Date;
  closed_at: string | Date | null;
};

type AaliyahMutationIdempotencyRow = {
  tenant_id: string;
  actor_id: string;
  principal_context: AaliyahMutationIdempotencyRecord["principalContext"];
  operation_name: AaliyahMutationIdempotencyRecord["operationName"];
  idempotency_key: string;
  request_fingerprint: string;
  state: AaliyahMutationIdempotencyRecord["state"];
  response_payload: Record<string, unknown> | null;
  error_code: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  completed_at: string | Date | null;
};

type FollowThroughHistoryEntryRow = {
  tenant_id: string;
  event_id: string;
  follow_through_id: string;
  action: FollowThroughHistoryEntry["action"];
  previous_status: FollowThroughHistoryEntry["previousStatus"];
  resulting_status: FollowThroughHistoryEntry["resultingStatus"];
  closure_state: FollowThroughHistoryEntry["closureState"];
  closure_reason: FollowThroughHistoryEntry["closureReason"];
  next_governed_action: FollowThroughHistoryEntry["nextGovernedAction"];
  founder_declared_completion: boolean;
  downstream_action_ref: string | null;
  escalation_target: string | null;
  escalation_class: FollowThroughHistoryEntry["escalationClass"];
  escalation_rationale: string | null;
  escalation_provenance: Record<string, unknown> | null;
  note: string | null;
  actor_id: string;
  created_at: string | Date;
};

type AaliyahDiagnosticsEventRow = {
  tenant_id: string;
  event_id: string;
  actor_id: string;
  principal_context: AaliyahDiagnosticsEventRecord["principalContext"];
  active_mode: AaliyahDiagnosticsEventRecord["activeMode"];
  event_type: AaliyahDiagnosticsEventRecord["eventType"];
  event_source: AaliyahDiagnosticsEventRecord["eventSource"];
  signal_key: string;
  payload: Record<string, unknown>;
  created_at: string | Date;
};

type EvalRunRow = {
  tenant_id: string;
  eval_run_id: string;
  agent_id: AgentId;
  agent_version_id: string;
  suite_name: string;
  status: EvalRunRecord["status"];
  score_summary: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | Date | null;
  dead_lettered_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
  completed_at: string | Date | null;
};

type ExecutionStepRow = {
  tenant_id: string;
  execution_step_id: string;
  execution_id: string;
  step_name: string;
  step_order: number;
  status: ExecutionStepStatus;
  payload: Record<string, unknown>;
  created_at: string | Date;
};

type OrchestrationBundleExportRow = {
  tenant_id: string;
  export_id: string;
  execution_id: string;
  exported_by: string;
  payload_hash: string;
  signature: string;
  sealed_at: string | Date;
  bundle_snapshot: Record<string, unknown>;
  created_at: string | Date;
};

type OrchestrationOpsSnapshotExportRow = {
  tenant_id: string;
  export_id: string;
  snapshot_type: "worker_freshness" | "alerts" | "diagnostics" | "inventory";
  exported_by: string;
  payload_hash: string;
  signature: string;
  sealed_at: string | Date;
  snapshot: Record<string, unknown>;
  created_at: string | Date;
};

type WorkerHeartbeatRow = {
  tenant_id: string;
  worker_heartbeat_id: string;
  worker_id: string;
  worker_kind: string;
  agent_id: AgentId | null;
  status: WorkerHeartbeatRecord["status"];
  details: Record<string, unknown>;
  observed_at: string | Date;
};

type OrchestrationAlertAckRow = {
  tenant_id: string;
  alert_ack_id: string;
  alert_code: string;
  acknowledged_by: string;
  reason: string;
  details: Record<string, unknown>;
  created_at: string | Date;
  reopened_at: string | Date | null;
  reopened_by: string | null;
  reopen_reason: string | null;
};

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildScopedId(prefix: string, parts: string[]): string {
  return [prefix, ...parts].join(":");
}

function mapAgentRow(row: AgentRow): AgentRecord {
  return {
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    displayName: row.display_name,
    taskDomain: row.task_domain,
    workflowRole: row.workflow_role,
    policyProfileId: row.policy_profile_id,
    memoryPartitionId: row.memory_partition_id,
    lifecycleProfileId: row.lifecycle_profile_id,
    evalProfileId: row.eval_profile_id,
    currentVersionId: row.current_version_id,
    currentStatus: row.current_status,
    prohibitedDomains: row.prohibited_domains,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    retiredAt: row.retired_at ? toIsoString(row.retired_at) : null
  };
}

function mapAgentVersionRow(row: AgentVersionRow) {
  return {
    tenantId: row.tenant_id,
    agentVersionId: row.agent_version_id,
    agentId: row.agent_id,
    versionLabel: row.version_label,
    definitionSnapshot: row.definition_snapshot,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    replacedByVersionId: row.replaced_by_version_id
  };
}

function mapApprovalRequestRow(row: ApprovalRequestRow): ApprovalRequestRecord {
  return {
    tenantId: row.tenant_id,
    approvalRequestId: row.approval_request_id,
    agentId: row.agent_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requestedBy: row.requested_by,
    requiredApprovers: row.required_approvers,
    status: row.status,
    payload: row.payload,
    createdAt: toIsoString(row.created_at),
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    escalatedAt: row.escalated_at ? toIsoString(row.escalated_at) : null,
    escalationCount: row.escalation_count
  };
}

function mapApprovalDecisionRow(row: ApprovalDecisionRow): ApprovalDecisionRecord {
  return {
    tenantId: row.tenant_id,
    approvalDecisionId: row.approval_decision_id,
    approvalRequestId: row.approval_request_id,
    approverId: row.approver_id,
    decision: row.decision,
    rationale: row.rationale,
    payload: row.payload,
    createdAt: toIsoString(row.created_at)
  };
}

function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    tenantId: row.tenant_id,
    executionId: row.execution_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    correlationId: row.correlation_id,
    requestSource: row.request_source,
    requestedBy: row.requested_by,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    status: row.status,
    inputPayload: row.input_payload,
    outputPayload: row.output_payload,
    failureClass: row.failure_class,
    failureMessage: row.failure_message,
    approvalRequestId: row.approval_request_id,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at ? toIsoString(row.next_retry_at) : null,
    deadLetteredAt: row.dead_lettered_at ? toIsoString(row.dead_lettered_at) : null,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapAssignmentRecordRow(row: AssignmentRecordRow): AssignmentRecord {
  return {
    tenantId: row.tenant_id,
    assignmentRecordId: row.assignment_record_id,
    manifestVersion: row.manifest_version,
    correlationId: row.correlation_id,
    requestSource: row.request_source,
    requestedBy: row.requested_by,
    requestedTaskCategory: row.requested_task_category as AssignmentRecord["requestedTaskCategory"],
    requestedResponsibilityKey: row.requested_responsibility_key,
    requestMetadata: row.request_metadata,
    requestedExecutionTarget: row.requested_execution_target,
    resolvedExecutiveId: row.resolved_executive_id as AssignmentRecord["resolvedExecutiveId"],
    resolvedDepartmentId: row.resolved_department_id as AssignmentRecord["resolvedDepartmentId"],
    resolvedLeadAgentId: row.resolved_lead_agent_id as AssignmentRecord["resolvedLeadAgentId"],
    resolvedSubAgentId: row.resolved_sub_agent_id as AssignmentRecord["resolvedSubAgentId"],
    executionAgentId: row.execution_agent_id as AssignmentRecord["executionAgentId"],
    policyDecision: row.policy_decision,
    policyDecisionReason: row.policy_decision_reason,
    routingDecision: row.routing_decision as AssignmentRecord["routingDecision"],
    routingTrace: row.routing_trace,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapExecutionRunRecordRow(row: ExecutionRunRecordRow): ExecutionRunRecord {
  return {
    tenantId: row.tenant_id,
    runRecordId: row.run_record_id,
    assignmentRecordId: row.assignment_record_id,
    executionId: row.execution_id,
    currentState: row.current_state,
    requestedAt: toIsoString(row.requested_at),
    validatedAt: row.validated_at ? toIsoString(row.validated_at) : null,
    routedAt: row.routed_at ? toIsoString(row.routed_at) : null,
    blockedAt: row.blocked_at ? toIsoString(row.blocked_at) : null,
    executionStartedAt: row.execution_started_at ? toIsoString(row.execution_started_at) : null,
    retriableAt: row.retriable_at ? toIsoString(row.retriable_at) : null,
    executionEndedAt: row.execution_ended_at ? toIsoString(row.execution_ended_at) : null,
    failureCategory: row.failure_category,
    failureMessage: row.failure_message,
    retryable: row.retryable,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapIncidentRow(row: IncidentRow): IncidentRecord {
  return {
    tenantId: row.tenant_id,
    incidentId: row.incident_id,
    incidentType: row.incident_type,
    severity: row.severity,
    status: row.status,
    owningExecutiveId: row.owning_executive_id,
    owningDepartmentId: row.owning_department_id,
    owningLeadAgentId: row.owning_lead_agent_id,
    owningSubAgentId: row.owning_sub_agent_id,
    sourceSystem: row.source_system,
    relatedSignalType: row.related_signal_type,
    relatedAssignmentRecordId: row.related_assignment_record_id,
    relatedRunRecordId: row.related_run_record_id,
    title: row.title,
    summary: row.summary,
    details: row.details,
    recommendedAction: row.recommended_action,
    releaseBlocking: row.release_blocking,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    acknowledgedAt: row.acknowledged_at ? toIsoString(row.acknowledged_at) : null,
    acknowledgedBy: row.acknowledged_by,
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    resolvedBy: row.resolved_by,
    resolutionNote: row.resolution_note
  };
}

function mapEmailDraftReviewRow(row: EmailDraftReviewRow): EmailDraftReviewRecord {
  return {
    tenantId: row.tenant_id,
    reviewItemId: row.review_item_id,
    draftId: row.draft_id,
    accountId: row.account_id,
    threadId: row.thread_id,
    assignmentRecordId: row.assignment_record_id,
    runRecordId: row.run_record_id,
    intentCategory: row.intent_category,
    priority: row.priority,
    riskLevel: row.risk_level,
    requiredApproval: true,
    reviewStatus: row.review_status,
    recommendedExecutiveId: row.recommended_executive_id,
    recommendedDepartmentId: row.recommended_department_id,
    recommendedLeadAgentId: row.recommended_lead_agent_id,
    recommendedSubAgentId: row.recommended_sub_agent_id,
    draftSummary: row.draft_summary,
    proposedReplySubject: row.proposed_reply_subject,
    proposedReplyBody: row.proposed_reply_body,
    confidenceScore: row.confidence_score,
    riskScore: row.risk_score,
    escalationRecommended: row.escalation_recommended,
    blockedAutoSend: true,
    manifestVersion: row.manifest_version,
    routingProvenance: row.routing_provenance as never,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note
  };
}

function mapEmailAccountConnectionRow(row: EmailAccountConnectionRow): EmailAccountConnectionRecord {
  return {
    tenantId: row.tenant_id,
    accountId: row.account_id,
    provider: row.provider,
    principalId: row.principal_id,
    accountEmailAddress: row.account_email_address,
    connectionStatus: row.connection_status,
    grantedScopes: row.granted_scopes,
    tokenReference: row.token_reference,
    externalAccountId: row.external_account_id,
    draftOnlyMode: row.draft_only_mode,
    processingEnabled: row.processing_enabled,
    processingMode: row.processing_mode,
    maxBatchThreads: row.max_batch_threads,
    allowedLabelIds: row.allowed_label_ids,
    oauthState: row.oauth_state,
    oauthStateExpiresAt: row.oauth_state_expires_at ? toIsoString(row.oauth_state_expires_at) : null,
    lastProcessedAt: row.last_processed_at ? toIsoString(row.last_processed_at) : null,
    lastError: row.last_error,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapEmailDispatchRow(row: EmailDispatchRow): EmailDispatchRecord {
  return {
    tenantId: row.tenant_id,
    dispatchId: row.dispatch_id,
    reviewItemId: row.review_item_id,
    draftId: row.draft_id,
    accountId: row.account_id,
    threadId: row.thread_id,
    assignmentRecordId: row.assignment_record_id,
    runRecordId: row.run_record_id,
    dispatchStatus: row.dispatch_status,
    dispatchPolicy: row.dispatch_policy,
    requestedAt: toIsoString(row.requested_at),
    dispatchedAt: row.dispatched_at ? toIsoString(row.dispatched_at) : null,
    failureCategory: row.failure_category,
    failureMessage: row.failure_message,
    gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id,
    auditMetadata: row.audit_metadata,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapVoiceCallRow(row: VoiceCallRow): VoiceCallRecord {
  return {
    tenantId: row.tenant_id,
    callId: row.call_id,
    externalCallId: row.external_call_id,
    sourceSystem: row.source_system,
    callerPhoneNumber: row.caller_phone_number,
    callerDisplayName: row.caller_display_name,
    callerOrganizationName: row.caller_organization_name,
    transcript: row.transcript,
    callSummaryText: row.call_summary_text,
    durationSeconds: row.duration_seconds,
    intent: row.intent,
    urgency: row.urgency,
    riskLevel: row.risk_level,
    companyMode: row.company_mode,
    routingTarget: row.routing_target,
    assignmentRecordId: row.assignment_record_id,
    runRecordId: row.run_record_id,
    outcome: row.outcome,
    founderAttentionRequired: row.founder_attention_required,
    escalationRecommended: row.escalation_recommended,
    interruptionClass: row.interruption_class,
    recommendedNextAction: row.recommended_next_action,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapAaliyahFounderPreferenceRow(row: AaliyahFounderPreferenceRow): AaliyahFounderPreferenceRecord {
  return {
    tenantId: row.tenant_id,
    preferenceId: row.preference_id,
    category: row.category,
    value: row.value,
    scope: row.scope,
    sourceType: row.source_type,
    confidenceLevel: row.confidence_level,
    active: row.active,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    deactivatedAt: row.deactivated_at ? toIsoString(row.deactivated_at)! : null,
    createdBy: row.created_by,
    deactivatedBy: row.deactivated_by
  };
}

function mapAaliyahSessionContextRow(row: AaliyahSessionContextRow): AaliyahSessionContextRecord {
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    principalContext: row.principal_context,
    sessionId: row.session_id,
    companyScope: row.company_scope,
    activeModeState: row.active_mode_state,
    interactionState: row.interaction_state,
    retentionPolicy: row.retention_policy,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    expiresAt: toIsoString(row.expires_at)!,
    hardExpiresAt: toIsoString(row.hard_expires_at)!,
    lastResetAt: row.last_reset_at ? toIsoString(row.last_reset_at)! : null,
    lastResetReason: row.last_reset_reason,
    version: row.version
  };
}

function mapFollowThroughRecordRow(row: FollowThroughRecordRow): FollowThroughRecord {
  return {
    tenantId: row.tenant_id,
    followThroughId: row.follow_through_id,
    version: row.version,
    sessionId: row.session_id,
    actorId: row.actor_id,
    principalContext: row.principal_context,
    activeMode: row.active_mode,
    companyScope: row.company_scope,
    workingItemType: row.working_item_type,
    sourceSubsystem: row.source_subsystem,
    sourceItemId: row.source_item_id,
    queueItemId: row.queue_item_id,
    reviewItemId: row.review_item_id,
    callId: row.call_id,
    incidentId: row.incident_id,
    dispatchId: row.dispatch_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    closureState: row.closure_state,
    closureReason: row.closure_reason,
    nextGovernedAction: row.next_governed_action,
    founderDeclaredCompletion: row.founder_declared_completion,
    downstreamActionRef: row.downstream_action_ref,
    escalationTarget: row.escalation_target,
    escalationClass: row.escalation_class,
    escalationRationale: row.escalation_rationale,
    escalationProvenance: row.escalation_provenance,
    note: row.note,
    provenance: row.provenance,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    closedAt: row.closed_at ? toIsoString(row.closed_at)! : null
  };
}

function mapAaliyahMutationIdempotencyRow(row: AaliyahMutationIdempotencyRow): AaliyahMutationIdempotencyRecord {
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    principalContext: row.principal_context,
    operationName: row.operation_name,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    state: row.state,
    responsePayload: row.response_payload,
    errorCode: row.error_code,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    completedAt: row.completed_at ? toIsoString(row.completed_at)! : null
  };
}

function mapFollowThroughHistoryEntryRow(row: FollowThroughHistoryEntryRow): FollowThroughHistoryEntry {
  return {
    tenantId: row.tenant_id,
    eventId: row.event_id,
    followThroughId: row.follow_through_id,
    action: row.action,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    closureState: row.closure_state,
    closureReason: row.closure_reason,
    nextGovernedAction: row.next_governed_action,
    founderDeclaredCompletion: row.founder_declared_completion,
    downstreamActionRef: row.downstream_action_ref,
    escalationTarget: row.escalation_target,
    escalationClass: row.escalation_class,
    escalationRationale: row.escalation_rationale,
    escalationProvenance: row.escalation_provenance,
    note: row.note,
    actorId: row.actor_id,
    createdAt: toIsoString(row.created_at)!
  };
}

function mapAaliyahDiagnosticsEventRow(row: AaliyahDiagnosticsEventRow): AaliyahDiagnosticsEventRecord {
  return {
    tenantId: row.tenant_id,
    eventId: row.event_id,
    actorId: row.actor_id,
    principalContext: row.principal_context,
    activeMode: row.active_mode,
    eventType: row.event_type,
    eventSource: row.event_source,
    signalKey: row.signal_key,
    payload: row.payload,
    createdAt: toIsoString(row.created_at)!
  };
}

function mapEvalRunRow(row: EvalRunRow): EvalRunRecord {
  return {
    tenantId: row.tenant_id,
    evalRunId: row.eval_run_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    suiteName: row.suite_name,
    status: row.status,
    scoreSummary: row.score_summary,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at ? toIsoString(row.next_retry_at) : null,
    deadLetteredAt: row.dead_lettered_at ? toIsoString(row.dead_lettered_at) : null,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null
  };
}

function mapOrchestrationBundleExportRow(row: OrchestrationBundleExportRow): OrchestrationBundleExportRecord {
  return {
    tenantId: row.tenant_id,
    exportId: row.export_id,
    executionId: row.execution_id,
    exportedBy: row.exported_by,
    payloadHash: row.payload_hash,
    signature: row.signature,
    sealedAt: toIsoString(row.sealed_at),
    bundleSnapshot: row.bundle_snapshot,
    createdAt: toIsoString(row.created_at)
  };
}

function mapOrchestrationOpsSnapshotExportRow(
  row: OrchestrationOpsSnapshotExportRow
): OrchestrationOpsSnapshotExportRecord {
  return {
    tenantId: row.tenant_id,
    exportId: row.export_id,
    snapshotType: row.snapshot_type,
    exportedBy: row.exported_by,
    payloadHash: row.payload_hash,
    signature: row.signature,
    sealedAt: toIsoString(row.sealed_at),
    snapshot: row.snapshot,
    createdAt: toIsoString(row.created_at)
  };
}

function mapWorkerHeartbeatRow(row: WorkerHeartbeatRow): WorkerHeartbeatRecord {
  return {
    tenantId: row.tenant_id,
    workerHeartbeatId: row.worker_heartbeat_id,
    workerId: row.worker_id,
    workerKind: row.worker_kind,
    agentId: row.agent_id,
    status: row.status,
    details: row.details,
    observedAt: toIsoString(row.observed_at)
  };
}

function mapOrchestrationAlertAckRow(row: OrchestrationAlertAckRow): OrchestrationAlertAckRecord {
  return {
    tenantId: row.tenant_id,
    alertAckId: row.alert_ack_id,
    alertCode: row.alert_code,
    acknowledgedBy: row.acknowledged_by,
    reason: row.reason,
    details: row.details,
    createdAt: toIsoString(row.created_at),
    reopenedAt: row.reopened_at ? toIsoString(row.reopened_at) : null,
    reopenedBy: row.reopened_by,
    reopenReason: row.reopen_reason
  };
}

function mapExecutionStepRow(row: ExecutionStepRow): ExecutionStepRecord {
  return {
    tenantId: row.tenant_id,
    executionStepId: row.execution_step_id,
    executionId: row.execution_id,
    stepName: row.step_name,
    stepOrder: row.step_order,
    status: row.status,
    payload: row.payload,
    createdAt: toIsoString(row.created_at)
  };
}

export class AgentLifecycleStateError extends Error {
  constructor(
    public readonly agentId: AgentId,
    public readonly from: AgentLifecycleStatus,
    public readonly to: AgentLifecycleStatus
  ) {
    super(`illegal_agent_lifecycle_transition:${agentId}:${from}->${to}`);
  }
}

export class AgentOsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly runWithTenant: RunWithTenant = withTenant
  ) {}

  async provisionFoundation(args: {
    tenantId: string;
    createdBy: string;
    versionLabel: string;
    createdAt?: string;
  }): Promise<{ agents: AgentRecord[] }> {
    const bundle = buildAgentOsFoundationBundle(args);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      for (const agent of bundle.agents) {
        await client.query(
          `
          INSERT INTO agents (
            tenant_id, agent_id, display_name, task_domain, workflow_role,
            policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
            current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12::text[], $13, $14, $15
          )
          ON CONFLICT (tenant_id, agent_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            task_domain = EXCLUDED.task_domain,
            workflow_role = EXCLUDED.workflow_role,
            policy_profile_id = EXCLUDED.policy_profile_id,
            memory_partition_id = EXCLUDED.memory_partition_id,
            lifecycle_profile_id = EXCLUDED.lifecycle_profile_id,
            eval_profile_id = EXCLUDED.eval_profile_id,
            current_version_id = EXCLUDED.current_version_id,
            prohibited_domains = EXCLUDED.prohibited_domains,
            updated_at = EXCLUDED.updated_at
          `,
          [
            agent.tenantId,
            agent.agentId,
            agent.displayName,
            agent.taskDomain,
            agent.workflowRole,
            agent.policyProfileId,
            agent.memoryPartitionId,
            agent.lifecycleProfileId,
            agent.evalProfileId,
            agent.currentVersionId,
            agent.currentStatus,
            agent.prohibitedDomains,
            agent.createdAt,
            agent.updatedAt,
            agent.retiredAt
          ]
        );
      }

      for (const version of bundle.versions) {
        await client.query(
          `
          INSERT INTO agent_versions (
            tenant_id, agent_version_id, agent_id, version_label,
            definition_snapshot, created_by, created_at, replaced_by_version_id
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
          ON CONFLICT (tenant_id, agent_version_id) DO UPDATE SET
            definition_snapshot = EXCLUDED.definition_snapshot,
            replaced_by_version_id = EXCLUDED.replaced_by_version_id
          `,
          [
            version.tenantId,
            version.agentVersionId,
            version.agentId,
            version.versionLabel,
            JSON.stringify(version.definitionSnapshot),
            version.createdBy,
            version.createdAt,
            version.replacedByVersionId
          ]
        );
      }

      for (const profile of bundle.policyProfiles) {
        await client.query(
          `
          INSERT INTO agent_policy_profiles (
            tenant_id, policy_profile_id, agent_id, allowed_capabilities,
            denied_capabilities, profile_snapshot, created_at
          ) VALUES ($1, $2, $3, $4::text[], $5::text[], $6::jsonb, $7)
          ON CONFLICT (tenant_id, policy_profile_id) DO UPDATE SET
            allowed_capabilities = EXCLUDED.allowed_capabilities,
            denied_capabilities = EXCLUDED.denied_capabilities,
            profile_snapshot = EXCLUDED.profile_snapshot
          `,
          [
            profile.tenantId,
            profile.policyProfileId,
            profile.agentId,
            profile.allowedCapabilities,
            profile.deniedCapabilities,
            JSON.stringify(profile.profileSnapshot),
            profile.createdAt
          ]
        );
      }

      for (const partition of bundle.memoryPartitions) {
        await client.query(
          `
          INSERT INTO agent_memory_partitions (
            tenant_id, partition_id, agent_id, namespace,
            owned_collections, shared_access, partition_snapshot, created_at
          ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8)
          ON CONFLICT (tenant_id, partition_id) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            owned_collections = EXCLUDED.owned_collections,
            shared_access = EXCLUDED.shared_access,
            partition_snapshot = EXCLUDED.partition_snapshot
          `,
          [
            partition.tenantId,
            partition.partitionId,
            partition.agentId,
            partition.namespace,
            partition.ownedCollections,
            partition.sharedAccess,
            JSON.stringify(partition.partitionSnapshot),
            partition.createdAt
          ]
        );
      }
    });

    return { agents: bundle.agents };
  }

  async listAgents(tenantId: string): Promise<AgentRecord[]> {
    const res = await this.runWithTenant(this.pool, tenantId, (client) =>
      client.query<AgentRow>(
        `
        SELECT tenant_id, agent_id, display_name, task_domain, workflow_role,
               policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
               current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
        FROM agents
        ORDER BY agent_id
        `
      )
    );

    return res.rows.map(mapAgentRow);
  }

  async getAgent(args: { tenantId: string; agentId: AgentId }): Promise<AgentRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AgentRow>(
        `
        SELECT tenant_id, agent_id, display_name, task_domain, workflow_role,
               policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
               current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
        FROM agents
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId]
      )
    );

    return res.rows[0] ? mapAgentRow(res.rows[0]) : null;
  }

  async createAgentVersion(args: {
    tenantId: string;
    agentId: AgentId;
    versionLabel: string;
    definitionSnapshot: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const agentVersionId = `${args.agentId}:${args.versionLabel}`;

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO agent_versions (
          tenant_id, agent_version_id, agent_id, version_label,
          definition_snapshot, created_by, created_at, replaced_by_version_id
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL)
        `,
        [
          args.tenantId,
          agentVersionId,
          args.agentId,
          args.versionLabel,
          JSON.stringify(args.definitionSnapshot),
          args.createdBy,
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      agentVersionId,
      agentId: args.agentId,
      versionLabel: args.versionLabel,
      definitionSnapshot: args.definitionSnapshot,
      createdBy: args.createdBy,
      createdAt,
      replacedByVersionId: null
    };
  }

  async listAgentVersions(args: { tenantId: string; agentId: AgentId }) {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AgentVersionRow>(
        `
        SELECT tenant_id, agent_version_id, agent_id, version_label,
               definition_snapshot, created_by, created_at, replaced_by_version_id
        FROM agent_versions
        WHERE tenant_id = $1 AND agent_id = $2
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId]
      )
    );

    return res.rows.map(mapAgentVersionRow);
  }

  async promoteAgentVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
    promotedBy: string;
    reason: string;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const currentAgent = await client.query<{ current_version_id: string; current_status: AgentLifecycleStatus }>(
        `SELECT current_version_id, current_status FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const versionRes = await client.query<AgentVersionRow>(
        `
        SELECT tenant_id, agent_version_id, agent_id, version_label,
               definition_snapshot, created_by, created_at, replaced_by_version_id
        FROM agent_versions
        WHERE tenant_id = $1 AND agent_version_id = $2 AND agent_id = $3
        `,
        [args.tenantId, args.agentVersionId, args.agentId]
      );

      const current = currentAgent.rows[0];
      const promoted = versionRes.rows[0];
      if (!current || !promoted) {
        throw new Error("agent_or_version_not_found");
      }

      await client.query(
        `
        UPDATE agents
        SET current_version_id = $3, updated_at = $4
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId, args.agentVersionId, createdAt]
      );

      await client.query(
        `
        UPDATE agent_versions
        SET replaced_by_version_id = $4
        WHERE tenant_id = $1 AND agent_version_id = $2 AND agent_id = $3
        `,
        [args.tenantId, current.current_version_id, args.agentId, args.agentVersionId]
      );

      const lifecycleEventId = buildScopedId("lifecycle", [args.agentId, "replacement", createdAt]);
      await client.query(
        `
        INSERT INTO agent_lifecycle_events (
          tenant_id, lifecycle_event_id, agent_id, from_status, to_status,
          actor_id, reason, metrics_snapshot, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8::jsonb, $9)
        `,
        [
          args.tenantId,
          lifecycleEventId,
          args.agentId,
          current.current_status,
          current.current_status,
          args.promotedBy,
          args.reason,
          JSON.stringify({
            replacedVersionId: current.current_version_id,
            promotedVersionId: args.agentVersionId
          }),
          createdAt
        ]
      );

      return {
        promotedVersion: mapAgentVersionRow(promoted),
        previousVersionId: current.current_version_id
      };
    });
  }

  async appendLifecycleEvent(args: {
    tenantId: string;
    agentId: AgentId;
    toStatus: AgentLifecycleStatus;
    actorId: string;
    reason: string;
    metricsSnapshot?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<AgentLifecycleEventRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const currentRes = await client.query<{ current_status: AgentLifecycleStatus }>(
        `SELECT current_status FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );

      const current = currentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      if (!isLifecycleTransitionAllowed(args.agentId, current.current_status, args.toStatus)) {
        throw new AgentLifecycleStateError(args.agentId, current.current_status, args.toStatus);
      }

      const lifecycleEventId = buildScopedId("lifecycle", [args.agentId, createdAt]);
      await client.query(
        `
        INSERT INTO agent_lifecycle_events (
          tenant_id, lifecycle_event_id, agent_id, from_status, to_status,
          actor_id, reason, metrics_snapshot, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
        `,
        [
          args.tenantId,
          lifecycleEventId,
          args.agentId,
          current.current_status,
          args.toStatus,
          args.actorId,
          args.reason,
          JSON.stringify(args.metricsSnapshot ?? {}),
          JSON.stringify(args.metadata ?? {}),
          createdAt
        ]
      );

      await client.query(
        `
        UPDATE agents
        SET current_status = $3, updated_at = $4
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId, args.toStatus, createdAt]
      );

      return {
        tenantId: args.tenantId,
        lifecycleEventId,
        agentId: args.agentId,
        fromStatus: current.current_status,
        toStatus: args.toStatus,
        actorId: args.actorId,
        reason: args.reason,
        metricsSnapshot: args.metricsSnapshot ?? {},
        metadata: args.metadata ?? {},
        createdAt
      };
    });
  }

  async createApprovalRequest(args: {
    tenantId: string;
    agentId: AgentId;
    subjectType: string;
    subjectId: string;
    requestedBy: string;
    requiredApprovers: string[];
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ApprovalRequestRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const approvalRequestId = buildScopedId("approval", [args.agentId, args.subjectId, createdAt]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO approval_requests (
          tenant_id, approval_request_id, agent_id, subject_type, subject_id,
          requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], 'PENDING', $8::jsonb, $9, NULL, NULL, 0)
        `,
        [
          args.tenantId,
          approvalRequestId,
          args.agentId,
          args.subjectType,
          args.subjectId,
          args.requestedBy,
          args.requiredApprovers,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      approvalRequestId,
      agentId: args.agentId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      requestedBy: args.requestedBy,
      requiredApprovers: args.requiredApprovers,
      status: "PENDING",
      payload: args.payload ?? {},
      createdAt,
      resolvedAt: null,
      escalatedAt: null,
      escalationCount: 0
    };
  }

  async recordApprovalDecision(args: {
    tenantId: string;
    approvalRequestId: string;
    approverId: string;
    decision: ApprovalDecision;
    rationale: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ApprovalDecisionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const approvalDecisionId = buildScopedId("decision", [args.approvalRequestId, args.approverId, createdAt]);
    const requestStatus = args.decision === "APPROVE" ? "APPROVED" : "REJECTED";

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO approval_decisions (
          tenant_id, approval_decision_id, approval_request_id,
          approver_id, decision, rationale, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        `,
        [
          args.tenantId,
          approvalDecisionId,
          args.approvalRequestId,
          args.approverId,
          args.decision,
          args.rationale,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );

      await client.query(
        `
        UPDATE approval_requests
        SET status = $3, resolved_at = $4
        WHERE tenant_id = $1 AND approval_request_id = $2
        `,
        [args.tenantId, args.approvalRequestId, requestStatus, createdAt]
      );
    });

    return {
      tenantId: args.tenantId,
      approvalDecisionId,
      approvalRequestId: args.approvalRequestId,
      approverId: args.approverId,
      decision: args.decision,
      rationale: args.rationale,
      payload: args.payload ?? {},
      createdAt
    };
  }

  async listApprovalRequests(args: {
    tenantId: string;
    agentId?: AgentId;
    status?: ApprovalRequestRecord["status"];
  }): Promise<ApprovalRequestRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR agent_id = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId ?? null, args.status ?? null]
      )
    );

    return res.rows.map(mapApprovalRequestRow);
  }

  async getApprovalRequest(args: { tenantId: string; approvalRequestId: string }): Promise<{
    request: ApprovalRequestRecord;
    decisions: ApprovalDecisionRecord[];
  } | null> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const requestRes = await client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1 AND approval_request_id = $2
        `,
        [args.tenantId, args.approvalRequestId]
      );
      const request = requestRes.rows[0];
      if (!request) return null;

      const decisionsRes = await client.query<ApprovalDecisionRow>(
        `
        SELECT tenant_id, approval_decision_id, approval_request_id, approver_id,
               decision, rationale, payload, created_at
        FROM approval_decisions
        WHERE tenant_id = $1 AND approval_request_id = $2
        ORDER BY created_at ASC
        `,
        [args.tenantId, args.approvalRequestId]
      );

      return {
        request: mapApprovalRequestRow(request),
        decisions: decisionsRes.rows.map(mapApprovalDecisionRow)
      };
    });
  }

  async listStaleApprovalRequests(args: {
    tenantId: string;
    olderThanIso: string;
    agentId?: AgentId;
    limit?: number;
  }): Promise<ApprovalRequestRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1
          AND status = 'PENDING'
          AND escalated_at IS NULL
          AND created_at <= $2
          AND ($3::text IS NULL OR agent_id = $3)
        ORDER BY created_at ASC
        LIMIT $4
        `,
        [args.tenantId, args.olderThanIso, args.agentId ?? null, args.limit ?? 100]
      )
    );

    return res.rows.map(mapApprovalRequestRow);
  }

  async markApprovalEscalated(args: {
    tenantId: string;
    approvalRequestId: string;
    escalatedAt?: string;
  }): Promise<ApprovalRequestRecord> {
    const escalatedAt = args.escalatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        UPDATE approval_requests
        SET escalated_at = $3,
            escalation_count = escalation_count + 1
        WHERE tenant_id = $1
          AND approval_request_id = $2
        RETURNING tenant_id, approval_request_id, agent_id, subject_type, subject_id,
                  requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        `,
        [args.tenantId, args.approvalRequestId, escalatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("approval_request_not_found");
    }

    return mapApprovalRequestRow(res.rows[0]);
  }

  async createEvalRun(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    scores: Array<{ metric: string; score: number; metadata?: Record<string, unknown> }>;
    createdAt?: string;
  }): Promise<{ evalRun: EvalRunRecord; scores: EvalScoreRecord[] }> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const agentDefinition = getAgentDefinition(args.agentId);
    const evalProfile = AGENT_EVAL_PROFILES[args.agentId];
    const evalRunId = buildScopedId("eval", [args.agentId, args.suiteName, createdAt]);

    const scoreRows: EvalScoreRecord[] = args.scores.map((scoreInput) => {
      const spec = evalProfile.metrics.find((metric) => metric.metric === scoreInput.metric);
      const passed = spec
        ? (spec.minScore === undefined || scoreInput.score >= spec.minScore) &&
          (spec.maxScore === undefined || scoreInput.score <= spec.maxScore)
        : false;

      return {
        tenantId: args.tenantId,
        evalScoreId: buildScopedId("eval-score", [evalRunId, scoreInput.metric]),
        evalRunId,
        metric: scoreInput.metric,
        score: scoreInput.score,
        thresholdMin: spec?.minScore ?? null,
        thresholdMax: spec?.maxScore ?? null,
        passed,
        metadata: scoreInput.metadata ?? {},
        createdAt
      };
    });

    const scoreSummary = {
      total: scoreRows.length,
      passed: scoreRows.filter((row) => row.passed).length,
      failed: scoreRows.filter((row) => !row.passed).length,
      lifecycleProfileId: AGENT_LIFECYCLE_PROFILES[args.agentId].profileId,
      evalProfileId: agentDefinition.evalProfileId
    };

    const { agentVersionId } = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );

      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      await client.query(
        `
        INSERT INTO eval_runs (
          tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
          status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at, created_by, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6::jsonb, 0, 2, NULL, NULL, $7, $8, $9)
        `,
        [
          args.tenantId,
          evalRunId,
          args.agentId,
          current.current_version_id,
          args.suiteName,
          JSON.stringify(scoreSummary),
          args.createdBy,
          createdAt,
          createdAt
        ]
      );

      for (const scoreRow of scoreRows) {
        await client.query(
          `
          INSERT INTO eval_scores (
            tenant_id, eval_score_id, eval_run_id, metric, score,
            threshold_min, threshold_max, passed, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          `,
          [
            scoreRow.tenantId,
            scoreRow.evalScoreId,
            scoreRow.evalRunId,
            scoreRow.metric,
            scoreRow.score,
            scoreRow.thresholdMin,
            scoreRow.thresholdMax,
            scoreRow.passed,
            JSON.stringify(scoreRow.metadata),
            scoreRow.createdAt
          ]
        );
      }

      return { agentVersionId: current.current_version_id };
    });

    return {
      evalRun: {
        tenantId: args.tenantId,
        evalRunId,
        agentId: args.agentId,
        agentVersionId,
        suiteName: args.suiteName,
        status: "COMPLETED",
        scoreSummary,
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        createdBy: args.createdBy,
        createdAt,
        completedAt: createdAt
      },
      scores: scoreRows
    };
  }

  async getLatestEvalRunForVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
  }): Promise<EvalRunRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        SELECT tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
               status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
               created_by, created_at, completed_at
        FROM eval_runs
        WHERE tenant_id = $1
          AND agent_id = $2
          AND agent_version_id = $3
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.agentId, args.agentVersionId]
      )
    );

    return res.rows[0] ? mapEvalRunRow(res.rows[0]) : null;
  }

  async createExecution(args: {
    tenantId: string;
    agentId: AgentId;
    correlationId: string;
    requestSource: string;
    requestedBy: string;
    subjectType: string;
    subjectId: string;
    inputPayload: Record<string, unknown>;
    status?: ExecutionStatus;
    approvalRequestId?: string | null;
    createdAt?: string;
  }): Promise<ExecutionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      const executionId = buildScopedId("execution", [args.agentId, args.subjectId, createdAt]);
      const status = args.status ?? "QUEUED";
      const startedAt = status === "RUNNING" ? createdAt : null;

      await client.query(
        `
        INSERT INTO executions (
          tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
          request_source, requested_by, subject_type, subject_id, status,
          input_payload, output_payload, failure_class, failure_message, approval_request_id,
          retry_count, max_retries, next_retry_at, dead_lettered_at,
          started_at, completed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11::jsonb, NULL, NULL, NULL, $12,
          0, 2, NULL, NULL,
          $13, NULL, $14, $15
        )
        `,
        [
          args.tenantId,
          executionId,
          args.agentId,
          current.current_version_id,
          args.correlationId,
          args.requestSource,
          args.requestedBy,
          args.subjectType,
          args.subjectId,
          status,
          JSON.stringify(args.inputPayload),
          args.approvalRequestId ?? null,
          startedAt,
          createdAt,
          createdAt
        ]
      );

      return {
        tenantId: args.tenantId,
        executionId,
        agentId: args.agentId,
        agentVersionId: current.current_version_id,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.requestedBy,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        status,
        inputPayload: args.inputPayload,
        outputPayload: null,
        failureClass: null,
        failureMessage: null,
        approvalRequestId: args.approvalRequestId ?? null,
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        startedAt,
        completedAt: null,
        createdAt,
        updatedAt: createdAt
      };
    });
  }

  async createAssignmentRecord(args: {
    tenantId: string;
    manifestVersion: string;
    correlationId: string;
    requestSource: string;
    requestedBy: string;
    requestedTaskCategory: AssignmentRecord["requestedTaskCategory"];
    requestedResponsibilityKey?: string | null;
    requestMetadata: Record<string, unknown>;
    requestedExecutionTarget?: string | null;
    resolvedExecutiveId?: AssignmentRecord["resolvedExecutiveId"];
    resolvedDepartmentId?: AssignmentRecord["resolvedDepartmentId"];
    resolvedLeadAgentId?: AssignmentRecord["resolvedLeadAgentId"];
    resolvedSubAgentId?: AssignmentRecord["resolvedSubAgentId"];
    executionAgentId?: AssignmentRecord["executionAgentId"];
    policyDecision: AssignmentRecord["policyDecision"];
    policyDecisionReason: string;
    routingDecision?: AssignmentRecord["routingDecision"];
    routingTrace?: string[];
    createdAt?: string;
  }): Promise<AssignmentRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const assignmentRecordId = buildScopedId("assignment", [args.correlationId, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AssignmentRecordRow>(
        `
        INSERT INTO assignment_records (
          tenant_id, assignment_record_id, manifest_version, correlation_id, request_source,
          requested_by, requested_task_category, requested_responsibility_key, request_metadata,
          requested_execution_target, resolved_executive_id, resolved_department_id, resolved_lead_agent_id,
          resolved_sub_agent_id, execution_agent_id, policy_decision, policy_decision_reason,
          routing_decision, routing_trace, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9::jsonb,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18::jsonb, $19::jsonb, $20, $21
        )
        RETURNING tenant_id, assignment_record_id, manifest_version, correlation_id, request_source,
                  requested_by, requested_task_category, requested_responsibility_key, request_metadata,
                  requested_execution_target, resolved_executive_id, resolved_department_id, resolved_lead_agent_id,
                  resolved_sub_agent_id, execution_agent_id, policy_decision, policy_decision_reason,
                  routing_decision, routing_trace, created_at, updated_at
        `,
        [
          args.tenantId,
          assignmentRecordId,
          args.manifestVersion,
          args.correlationId,
          args.requestSource,
          args.requestedBy,
          args.requestedTaskCategory,
          args.requestedResponsibilityKey ?? null,
          JSON.stringify(args.requestMetadata),
          args.requestedExecutionTarget ?? null,
          args.resolvedExecutiveId ?? null,
          args.resolvedDepartmentId ?? null,
          args.resolvedLeadAgentId ?? null,
          args.resolvedSubAgentId ?? null,
          args.executionAgentId ?? null,
          args.policyDecision,
          args.policyDecisionReason,
          JSON.stringify(args.routingDecision ?? null),
          JSON.stringify(args.routingTrace ?? []),
          createdAt,
          createdAt
        ]
      )
    );

    return mapAssignmentRecordRow(res.rows[0]!);
  }

  async getAssignmentRecord(args: {
    tenantId: string;
    assignmentRecordId: string;
  }): Promise<AssignmentRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AssignmentRecordRow>(
        `
        SELECT tenant_id, assignment_record_id, manifest_version, correlation_id, request_source,
               requested_by, requested_task_category, requested_responsibility_key, request_metadata,
               requested_execution_target, resolved_executive_id, resolved_department_id, resolved_lead_agent_id,
               resolved_sub_agent_id, execution_agent_id, policy_decision, policy_decision_reason,
               routing_decision, routing_trace, created_at, updated_at
        FROM assignment_records
        WHERE tenant_id = $1 AND assignment_record_id = $2
        `,
        [args.tenantId, args.assignmentRecordId]
      )
    );

    return res.rows[0] ? mapAssignmentRecordRow(res.rows[0]) : null;
  }

  async listAssignmentRecords(args: {
    tenantId: string;
    limit?: number;
  }): Promise<AssignmentRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AssignmentRecordRow>(
        `
        SELECT tenant_id, assignment_record_id, manifest_version, correlation_id, request_source,
               requested_by, requested_task_category, requested_responsibility_key, request_metadata,
               requested_execution_target, resolved_executive_id, resolved_department_id, resolved_lead_agent_id,
               resolved_sub_agent_id, execution_agent_id, policy_decision, policy_decision_reason,
               routing_decision, routing_trace, created_at, updated_at
        FROM assignment_records
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [args.tenantId, args.limit ?? 50]
      )
    );

    return res.rows.map(mapAssignmentRecordRow);
  }

  async createExecutionRunRecord(args: {
    tenantId: string;
    assignmentRecordId: string;
    executionId?: string | null;
    currentState: ExecutionRunState;
    metadata?: Record<string, unknown>;
    requestedAt?: string;
  }): Promise<ExecutionRunRecord> {
    const requestedAt = args.requestedAt ?? new Date().toISOString();
    const runRecordId = buildScopedId("run", [args.assignmentRecordId, requestedAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRunRecordRow>(
        `
        INSERT INTO execution_run_records (
          tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
          requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
          execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, NULL, false, $7::jsonb, $8, $9
        )
        RETURNING tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
                  requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
                  execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        `,
        [
          args.tenantId,
          runRecordId,
          args.assignmentRecordId,
          args.executionId ?? null,
          args.currentState,
          requestedAt,
          JSON.stringify(args.metadata ?? {}),
          requestedAt,
          requestedAt
        ]
      )
    );

    return mapExecutionRunRecordRow(res.rows[0]!);
  }

  async transitionExecutionRunRecord(args: {
    tenantId: string;
    runRecordId: string;
    fromState: ExecutionRunState;
    toState: ExecutionRunState;
    executionId?: string | null;
    failureCategory?: string | null;
    failureMessage?: string | null;
    retryable?: boolean;
    metadata?: Record<string, unknown>;
    transitionedAt?: string;
  }): Promise<ExecutionRunRecord> {
    const transitionedAt = args.transitionedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRunRecordRow>(
        `
        UPDATE execution_run_records
        SET current_state = $4,
            execution_id = COALESCE($5, execution_id),
            validated_at = CASE WHEN $4 = 'validated' THEN $6 ELSE validated_at END,
            routed_at = CASE WHEN $4 = 'routed' THEN $6 ELSE routed_at END,
            blocked_at = CASE WHEN $4 = 'blocked' THEN $6 ELSE blocked_at END,
            execution_started_at = CASE WHEN $4 = 'executing' THEN $6 ELSE execution_started_at END,
            retriable_at = CASE WHEN $4 = 'retriable' THEN $6 ELSE retriable_at END,
            execution_ended_at = CASE WHEN $4 IN ('succeeded', 'failed') THEN $6 ELSE execution_ended_at END,
            failure_category = $7,
            failure_message = $8,
            retryable = COALESCE($9, retryable),
            metadata = CASE
              WHEN $10::jsonb IS NULL THEN metadata
              ELSE metadata || $10::jsonb
            END,
            updated_at = $6
        WHERE tenant_id = $1
          AND run_record_id = $2
          AND current_state = $3
        RETURNING tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
                  requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
                  execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        `,
        [
          args.tenantId,
          args.runRecordId,
          args.fromState,
          args.toState,
          args.executionId ?? null,
          transitionedAt,
          args.failureCategory ?? null,
          args.failureMessage ?? null,
          args.retryable ?? null,
          args.metadata ? JSON.stringify(args.metadata) : null
        ]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_run_state_conflict");
    }

    return mapExecutionRunRecordRow(res.rows[0]);
  }

  async getExecutionRunRecord(args: {
    tenantId: string;
    runRecordId: string;
  }): Promise<ExecutionRunRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRunRecordRow>(
        `
        SELECT tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
               requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
               execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        FROM execution_run_records
        WHERE tenant_id = $1 AND run_record_id = $2
        `,
        [args.tenantId, args.runRecordId]
      )
    );

    return res.rows[0] ? mapExecutionRunRecordRow(res.rows[0]) : null;
  }

  async getExecutionRunRecordByExecutionId(args: {
    tenantId: string;
    executionId: string;
  }): Promise<ExecutionRunRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRunRecordRow>(
        `
        SELECT tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
               requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
               execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        FROM execution_run_records
        WHERE tenant_id = $1 AND execution_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.executionId]
      )
    );

    return res.rows[0] ? mapExecutionRunRecordRow(res.rows[0]) : null;
  }

  async listExecutionRunRecords(args: {
    tenantId: string;
    currentState?: ExecutionRunState;
    limit?: number;
  }): Promise<ExecutionRunRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRunRecordRow>(
        `
        SELECT tenant_id, run_record_id, assignment_record_id, execution_id, current_state,
               requested_at, validated_at, routed_at, blocked_at, execution_started_at, retriable_at,
               execution_ended_at, failure_category, failure_message, retryable, metadata, created_at, updated_at
        FROM execution_run_records
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR current_state = $2)
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [args.tenantId, args.currentState ?? null, args.limit ?? 50]
      )
    );

    return res.rows.map(mapExecutionRunRecordRow);
  }

  async createIncidentRecord(args: {
    tenantId: string;
    incidentType: IncidentType;
    severity: IncidentSeverity;
    status?: IncidentStatus;
    owningExecutiveId: IncidentRecord["owningExecutiveId"];
    owningDepartmentId: IncidentRecord["owningDepartmentId"];
    owningLeadAgentId: IncidentRecord["owningLeadAgentId"];
    owningSubAgentId: IncidentRecord["owningSubAgentId"];
    sourceSystem: string;
    relatedSignalType?: string | null;
    relatedAssignmentRecordId?: string | null;
    relatedRunRecordId?: string | null;
    title: string;
    summary: string;
    details?: Record<string, unknown>;
    recommendedAction: string;
    releaseBlocking: boolean;
    createdAt?: string;
  }): Promise<IncidentRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const incidentId = buildScopedId("incident", [args.incidentType, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<IncidentRow>(
        `
        INSERT INTO incidents (
          tenant_id, incident_id, incident_type, severity, status,
          owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
          source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
          title, summary, details, recommended_action, release_blocking,
          created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16::jsonb, $17, $18,
          $19, $19, NULL, NULL, NULL, NULL, NULL
        )
        RETURNING tenant_id, incident_id, incident_type, severity, status,
                  owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
                  source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
                  title, summary, details, recommended_action, release_blocking,
                  created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        `,
        [
          args.tenantId,
          incidentId,
          args.incidentType,
          args.severity,
          args.status ?? "open",
          args.owningExecutiveId,
          args.owningDepartmentId,
          args.owningLeadAgentId,
          args.owningSubAgentId,
          args.sourceSystem,
          args.relatedSignalType ?? null,
          args.relatedAssignmentRecordId ?? null,
          args.relatedRunRecordId ?? null,
          args.title,
          args.summary,
          JSON.stringify(args.details ?? {}),
          args.recommendedAction,
          args.releaseBlocking,
          createdAt
        ]
      )
    );

    return mapIncidentRow(res.rows[0]!);
  }

  async createEmailDraftReviewItem(args: {
    tenantId: string;
    draftId: string;
    accountId: string;
    threadId: string;
    assignmentRecordId?: string | null;
    runRecordId?: string | null;
    intentCategory: EmailDraftReviewRecord["intentCategory"];
    priority: EmailDraftReviewRecord["priority"];
    riskLevel: EmailDraftReviewRecord["riskLevel"];
    reviewStatus?: EmailDraftReviewStatus;
    recommendedExecutiveId?: string | null;
    recommendedDepartmentId?: string | null;
    recommendedLeadAgentId?: string | null;
    recommendedSubAgentId?: string | null;
    draftSummary: string;
    proposedReplySubject: string;
    proposedReplyBody: string;
    confidenceScore: number;
    riskScore: number;
    escalationRecommended: boolean;
    manifestVersion: string;
    routingProvenance: Record<string, unknown>;
    createdAt?: string;
  }): Promise<EmailDraftReviewRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const reviewItemId = buildScopedId("email-review", [args.accountId, args.threadId, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDraftReviewRow>(
        `
        INSERT INTO email_draft_review_items (
          tenant_id, review_item_id, draft_id, account_id, thread_id, assignment_record_id, run_record_id,
          intent_category, priority, risk_level, required_approval, review_status,
          recommended_executive_id, recommended_department_id, recommended_lead_agent_id, recommended_sub_agent_id,
          draft_summary, proposed_reply_subject, proposed_reply_body, confidence_score, risk_score,
          escalation_recommended, blocked_auto_send, manifest_version, routing_provenance,
          created_at, updated_at, reviewed_at, reviewed_by, review_note
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,true,$11,
          $12,$13,$14,$15,
          $16,$17,$18,$19,$20,
          $21,true,$22,$23::jsonb,
          $24,$24,NULL,NULL,NULL
        )
        RETURNING tenant_id, review_item_id, draft_id, account_id, thread_id, assignment_record_id, run_record_id,
                  intent_category, priority, risk_level, required_approval, review_status,
                  recommended_executive_id, recommended_department_id, recommended_lead_agent_id, recommended_sub_agent_id,
                  draft_summary, proposed_reply_subject, proposed_reply_body, confidence_score, risk_score,
                  escalation_recommended, blocked_auto_send, manifest_version, routing_provenance,
                  created_at, updated_at, reviewed_at, reviewed_by, review_note
        `,
        [
          args.tenantId, reviewItemId, args.draftId, args.accountId, args.threadId, args.assignmentRecordId ?? null, args.runRecordId ?? null,
          args.intentCategory, args.priority, args.riskLevel, args.reviewStatus ?? "pending_review",
          args.recommendedExecutiveId ?? null, args.recommendedDepartmentId ?? null, args.recommendedLeadAgentId ?? null, args.recommendedSubAgentId ?? null,
          args.draftSummary, args.proposedReplySubject, args.proposedReplyBody, args.confidenceScore, args.riskScore,
          args.escalationRecommended, args.manifestVersion, JSON.stringify(args.routingProvenance), createdAt
        ]
      )
    );
    return mapEmailDraftReviewRow(res.rows[0]!);
  }

  async listEmailDraftReviewItems(args: {
    tenantId: string;
    status?: EmailDraftReviewStatus;
    accountId?: string;
    priority?: EmailDraftReviewRecord["priority"];
    limit?: number;
  }): Promise<EmailDraftReviewRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDraftReviewRow>(
        `
        SELECT tenant_id, review_item_id, draft_id, account_id, thread_id, assignment_record_id, run_record_id,
               intent_category, priority, risk_level, required_approval, review_status,
               recommended_executive_id, recommended_department_id, recommended_lead_agent_id, recommended_sub_agent_id,
               draft_summary, proposed_reply_subject, proposed_reply_body, confidence_score, risk_score,
               escalation_recommended, blocked_auto_send, manifest_version, routing_provenance,
               created_at, updated_at, reviewed_at, reviewed_by, review_note
        FROM email_draft_review_items
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR review_status = $2)
          AND ($3::text IS NULL OR account_id = $3)
          AND ($4::text IS NULL OR priority = $4)
        ORDER BY created_at DESC
        LIMIT $5
        `,
        [args.tenantId, args.status ?? null, args.accountId ?? null, args.priority ?? null, args.limit ?? 50]
      )
    );
    return res.rows.map(mapEmailDraftReviewRow);
  }

  async getEmailDraftReviewItem(args: { tenantId: string; reviewItemId: string; }): Promise<EmailDraftReviewRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDraftReviewRow>(
        `
        SELECT tenant_id, review_item_id, draft_id, account_id, thread_id, assignment_record_id, run_record_id,
               intent_category, priority, risk_level, required_approval, review_status,
               recommended_executive_id, recommended_department_id, recommended_lead_agent_id, recommended_sub_agent_id,
               draft_summary, proposed_reply_subject, proposed_reply_body, confidence_score, risk_score,
               escalation_recommended, blocked_auto_send, manifest_version, routing_provenance,
               created_at, updated_at, reviewed_at, reviewed_by, review_note
        FROM email_draft_review_items
        WHERE tenant_id = $1 AND review_item_id = $2
        `,
        [args.tenantId, args.reviewItemId]
      )
    );
    return res.rows[0] ? mapEmailDraftReviewRow(res.rows[0]) : null;
  }

  async transitionEmailDraftReviewItem(args: {
    tenantId: string;
    reviewItemId: string;
    fromStatus: EmailDraftReviewStatus;
    toStatus: EmailDraftReviewStatus;
    reviewedBy: string;
    reviewNote?: string | null;
    reviewedAt?: string;
  }): Promise<EmailDraftReviewRecord> {
    const reviewedAt = args.reviewedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDraftReviewRow>(
        `
        UPDATE email_draft_review_items
        SET review_status = $4,
            reviewed_at = $5,
            reviewed_by = $6,
            review_note = $7,
            updated_at = $5
        WHERE tenant_id = $1
          AND review_item_id = $2
          AND review_status = $3
        RETURNING tenant_id, review_item_id, draft_id, account_id, thread_id, assignment_record_id, run_record_id,
                  intent_category, priority, risk_level, required_approval, review_status,
                  recommended_executive_id, recommended_department_id, recommended_lead_agent_id, recommended_sub_agent_id,
                  draft_summary, proposed_reply_subject, proposed_reply_body, confidence_score, risk_score,
                  escalation_recommended, blocked_auto_send, manifest_version, routing_provenance,
                  created_at, updated_at, reviewed_at, reviewed_by, review_note
        `,
        [args.tenantId, args.reviewItemId, args.fromStatus, args.toStatus, reviewedAt, args.reviewedBy, args.reviewNote ?? null]
      )
    );
    if (!res.rows[0]) {
      throw new Error("email_review_state_conflict");
    }
    return mapEmailDraftReviewRow(res.rows[0]);
  }

  async createEmailDispatchRecord(args: {
    tenantId: string;
    reviewItemId: string;
    draftId: string;
    accountId: string;
    threadId: string;
    assignmentRecordId?: string | null;
    runRecordId?: string | null;
    dispatchStatus?: EmailDispatchStatus;
    dispatchPolicy: EmailDispatchPolicyResult;
    requestedAt?: string;
    dispatchedAt?: string | null;
    failureCategory?: string | null;
    failureMessage?: string | null;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
    auditMetadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<EmailDispatchRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const dispatchId = buildScopedId("email-dispatch", [args.accountId, args.threadId, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDispatchRow>(
        `
        INSERT INTO email_dispatch_records (
          tenant_id, dispatch_id, review_item_id, draft_id, account_id, thread_id,
          assignment_record_id, run_record_id, dispatch_status, dispatch_policy, requested_at,
          dispatched_at, failure_category, failure_message, gmail_message_id, gmail_thread_id,
          audit_metadata, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10::jsonb,$11,
          $12,$13,$14,$15,$16,
          $17::jsonb,$18,$18
        )
        RETURNING tenant_id, dispatch_id, review_item_id, draft_id, account_id, thread_id,
                  assignment_record_id, run_record_id, dispatch_status, dispatch_policy, requested_at,
                  dispatched_at, failure_category, failure_message, gmail_message_id, gmail_thread_id,
                  audit_metadata, created_at, updated_at
        `,
        [
          args.tenantId,
          dispatchId,
          args.reviewItemId,
          args.draftId,
          args.accountId,
          args.threadId,
          args.assignmentRecordId ?? null,
          args.runRecordId ?? null,
          args.dispatchStatus ?? "dispatch_pending",
          JSON.stringify(args.dispatchPolicy),
          args.requestedAt ?? createdAt,
          args.dispatchedAt ?? null,
          args.failureCategory ?? null,
          args.failureMessage ?? null,
          args.gmailMessageId ?? null,
          args.gmailThreadId ?? null,
          JSON.stringify(args.auditMetadata ?? {}),
          createdAt
        ]
      )
    );
    return mapEmailDispatchRow(res.rows[0]!);
  }

  async updateEmailDispatchRecord(args: {
    tenantId: string;
    dispatchId: string;
    dispatchStatus: EmailDispatchStatus;
    dispatchPolicy?: EmailDispatchPolicyResult;
    dispatchedAt?: string | null;
    failureCategory?: string | null;
    failureMessage?: string | null;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
    auditMetadata?: Record<string, unknown>;
    updatedAt?: string;
  }): Promise<EmailDispatchRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDispatchRow>(
        `
        UPDATE email_dispatch_records
        SET dispatch_status = $3,
            dispatch_policy = COALESCE($4::jsonb, dispatch_policy),
            dispatched_at = COALESCE($5, dispatched_at),
            failure_category = $6,
            failure_message = $7,
            gmail_message_id = $8,
            gmail_thread_id = $9,
            audit_metadata = COALESCE($10::jsonb, audit_metadata),
            updated_at = $11
        WHERE tenant_id = $1
          AND dispatch_id = $2
        RETURNING tenant_id, dispatch_id, review_item_id, draft_id, account_id, thread_id,
                  assignment_record_id, run_record_id, dispatch_status, dispatch_policy, requested_at,
                  dispatched_at, failure_category, failure_message, gmail_message_id, gmail_thread_id,
                  audit_metadata, created_at, updated_at
        `,
        [
          args.tenantId,
          args.dispatchId,
          args.dispatchStatus,
          args.dispatchPolicy ? JSON.stringify(args.dispatchPolicy) : null,
          args.dispatchedAt ?? null,
          args.failureCategory ?? null,
          args.failureMessage ?? null,
          args.gmailMessageId ?? null,
          args.gmailThreadId ?? null,
          args.auditMetadata ? JSON.stringify(args.auditMetadata) : null,
          updatedAt
        ]
      )
    );
    if (!res.rows[0]) {
      throw new Error("email_dispatch_not_found");
    }
    return mapEmailDispatchRow(res.rows[0]);
  }

  async getEmailDispatchRecord(args: { tenantId: string; dispatchId: string }): Promise<EmailDispatchRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDispatchRow>(
        `
        SELECT tenant_id, dispatch_id, review_item_id, draft_id, account_id, thread_id,
               assignment_record_id, run_record_id, dispatch_status, dispatch_policy, requested_at,
               dispatched_at, failure_category, failure_message, gmail_message_id, gmail_thread_id,
               audit_metadata, created_at, updated_at
        FROM email_dispatch_records
        WHERE tenant_id = $1 AND dispatch_id = $2
        `,
        [args.tenantId, args.dispatchId]
      )
    );
    return res.rows[0] ? mapEmailDispatchRow(res.rows[0]) : null;
  }

  async getLatestEmailDispatchRecordForReviewItem(args: {
    tenantId: string;
    reviewItemId: string;
  }): Promise<EmailDispatchRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailDispatchRow>(
        `
        SELECT tenant_id, dispatch_id, review_item_id, draft_id, account_id, thread_id,
               assignment_record_id, run_record_id, dispatch_status, dispatch_policy, requested_at,
               dispatched_at, failure_category, failure_message, gmail_message_id, gmail_thread_id,
               audit_metadata, created_at, updated_at
        FROM email_dispatch_records
        WHERE tenant_id = $1
          AND review_item_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.reviewItemId]
      )
    );
    return res.rows[0] ? mapEmailDispatchRow(res.rows[0]) : null;
  }

  async createVoiceCallRecord(args: {
    tenantId: string;
    externalCallId?: string | null;
    sourceSystem: string;
    callerPhoneNumber: string;
    callerDisplayName?: string | null;
    callerOrganizationName?: string | null;
    transcript: string;
    callSummaryText?: string | null;
    durationSeconds?: number | null;
    intent: VoiceCallRecord["intent"];
    urgency: VoiceCallRecord["urgency"];
    riskLevel: VoiceCallRecord["riskLevel"];
    companyMode: VoiceCallRecord["companyMode"];
    routingTarget: VoiceCallRecord["routingTarget"];
    assignmentRecordId?: string | null;
    runRecordId?: string | null;
    outcome: VoiceCallRecord["outcome"];
    founderAttentionRequired: boolean;
    escalationRecommended: boolean;
    interruptionClass: VoiceCallRecord["interruptionClass"];
    recommendedNextAction: string;
    createdAt?: string;
  }): Promise<VoiceCallRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const callId = buildScopedId("voice-call", [args.sourceSystem, args.callerPhoneNumber, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<VoiceCallRow>(
        `
        INSERT INTO voice_call_records (
          tenant_id, call_id, external_call_id, source_system, caller_phone_number, caller_display_name,
          caller_organization_name, transcript, call_summary_text, duration_seconds, intent, urgency,
          risk_level, company_mode, routing_target, assignment_record_id, run_record_id, outcome,
          founder_attention_required, escalation_recommended, interruption_class, recommended_next_action,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,
          $13,$14,$15::jsonb,$16,$17,$18,
          $19,$20,$21,$22,
          $23,$23
        )
        RETURNING tenant_id, call_id, external_call_id, source_system, caller_phone_number, caller_display_name,
                  caller_organization_name, transcript, call_summary_text, duration_seconds, intent, urgency,
                  risk_level, company_mode, routing_target, assignment_record_id, run_record_id, outcome,
                  founder_attention_required, escalation_recommended, interruption_class, recommended_next_action,
                  created_at, updated_at
        `,
        [
          args.tenantId,
          callId,
          args.externalCallId ?? null,
          args.sourceSystem,
          args.callerPhoneNumber,
          args.callerDisplayName ?? null,
          args.callerOrganizationName ?? null,
          args.transcript,
          args.callSummaryText ?? null,
          args.durationSeconds ?? null,
          args.intent,
          args.urgency,
          args.riskLevel,
          args.companyMode,
          JSON.stringify(args.routingTarget),
          args.assignmentRecordId ?? null,
          args.runRecordId ?? null,
          args.outcome,
          args.founderAttentionRequired,
          args.escalationRecommended,
          args.interruptionClass,
          args.recommendedNextAction,
          createdAt
        ]
      )
    );
    return mapVoiceCallRow(res.rows[0]!);
  }

  async getVoiceCallRecord(args: { tenantId: string; callId: string }): Promise<VoiceCallRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<VoiceCallRow>(
        `
        SELECT tenant_id, call_id, external_call_id, source_system, caller_phone_number, caller_display_name,
               caller_organization_name, transcript, call_summary_text, duration_seconds, intent, urgency,
               risk_level, company_mode, routing_target, assignment_record_id, run_record_id, outcome,
               founder_attention_required, escalation_recommended, interruption_class, recommended_next_action,
               created_at, updated_at
        FROM voice_call_records
        WHERE tenant_id = $1 AND call_id = $2
        `,
        [args.tenantId, args.callId]
      )
    );
    return res.rows[0] ? mapVoiceCallRow(res.rows[0]) : null;
  }

  async listVoiceCallRecords(args: {
    tenantId: string;
    founderAttentionRequired?: boolean;
    limit?: number;
  }): Promise<VoiceCallRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<VoiceCallRow>(
        `
        SELECT tenant_id, call_id, external_call_id, source_system, caller_phone_number, caller_display_name,
               caller_organization_name, transcript, call_summary_text, duration_seconds, intent, urgency,
               risk_level, company_mode, routing_target, assignment_record_id, run_record_id, outcome,
               founder_attention_required, escalation_recommended, interruption_class, recommended_next_action,
               created_at, updated_at
        FROM voice_call_records
        WHERE tenant_id = $1
          AND ($2::boolean IS NULL OR founder_attention_required = $2)
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [args.tenantId, args.founderAttentionRequired ?? null, args.limit ?? 50]
      )
    );
    return res.rows.map(mapVoiceCallRow);
  }

  async listVoiceCallRecordsWindow(args: {
    tenantId: string;
    since: string;
    until: string;
    limit?: number;
  }): Promise<VoiceCallRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<VoiceCallRow>(
        `
        SELECT tenant_id, call_id, external_call_id, source_system, caller_phone_number, caller_display_name,
               caller_organization_name, transcript, call_summary_text, duration_seconds, intent, urgency,
               risk_level, company_mode, routing_target, assignment_record_id, run_record_id, outcome,
               founder_attention_required, escalation_recommended, interruption_class, recommended_next_action,
               created_at, updated_at
        FROM voice_call_records
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
        ORDER BY created_at DESC
        LIMIT $4
        `,
        [args.tenantId, args.since, args.until, args.limit ?? 500]
      )
    );
    return res.rows.map(mapVoiceCallRow);
  }

  async createEmailAccountConnection(args: {
    tenantId: string;
    accountId: string;
    provider: EmailAccountConnectionRecord["provider"];
    principalId: string;
    accountEmailAddress?: string | null;
    connectionStatus: EmailAccountConnectionStatus;
    grantedScopes?: string[];
    tokenReference?: string | null;
    externalAccountId?: string | null;
    draftOnlyMode: true;
    processingEnabled: boolean;
    processingMode: EmailAccountConnectionRecord["processingMode"];
    maxBatchThreads: number;
    allowedLabelIds: string[];
    oauthState?: string | null;
    oauthStateExpiresAt?: string | null;
    lastProcessedAt?: string | null;
    lastError?: string | null;
    createdAt?: string;
  }): Promise<EmailAccountConnectionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        INSERT INTO email_account_connections (
          tenant_id, account_id, provider, principal_id, account_email_address,
          connection_status, granted_scopes, token_reference, external_account_id,
          draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
          allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
          last_error, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7::jsonb, $8, $9,
          $10, $11, $12, $13,
          $14::jsonb, $15, $16, $17,
          $18, $19, $19
        )
        RETURNING tenant_id, account_id, provider, principal_id, account_email_address,
                  connection_status, granted_scopes, token_reference, external_account_id,
                  draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
                  allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
                  last_error, created_at, updated_at
        `,
        [
          args.tenantId,
          args.accountId,
          args.provider,
          args.principalId,
          args.accountEmailAddress ?? null,
          args.connectionStatus,
          JSON.stringify(args.grantedScopes ?? []),
          args.tokenReference ?? null,
          args.externalAccountId ?? null,
          true,
          args.processingEnabled,
          args.processingMode,
          args.maxBatchThreads,
          JSON.stringify(args.allowedLabelIds),
          args.oauthState ?? null,
          args.oauthStateExpiresAt ?? null,
          args.lastProcessedAt ?? null,
          args.lastError ?? null,
          createdAt
        ]
      )
    );

    return mapEmailAccountConnectionRow(res.rows[0]!);
  }

  async updateEmailAccountConnection(args: {
    tenantId: string;
    accountId: string;
    connectionStatus?: EmailAccountConnectionStatus;
    accountEmailAddress?: string | null;
    grantedScopes?: string[];
    tokenReference?: string | null;
    externalAccountId?: string | null;
    processingEnabled?: boolean;
    maxBatchThreads?: number;
    allowedLabelIds?: string[];
    oauthState?: string | null;
    oauthStateExpiresAt?: string | null;
    lastProcessedAt?: string | null;
    lastError?: string | null;
    updatedAt?: string;
  }): Promise<EmailAccountConnectionRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        UPDATE email_account_connections
        SET connection_status = COALESCE($3, connection_status),
            account_email_address = COALESCE($4, account_email_address),
            granted_scopes = CASE WHEN $5::jsonb IS NULL THEN granted_scopes ELSE $5::jsonb END,
            token_reference = COALESCE($6, token_reference),
            external_account_id = COALESCE($7, external_account_id),
            processing_enabled = COALESCE($8, processing_enabled),
            max_batch_threads = COALESCE($9, max_batch_threads),
            allowed_label_ids = CASE WHEN $10::jsonb IS NULL THEN allowed_label_ids ELSE $10::jsonb END,
            oauth_state = $11,
            oauth_state_expires_at = $12,
            last_processed_at = COALESCE($13, last_processed_at),
            last_error = $14,
            updated_at = $15
        WHERE tenant_id = $1 AND account_id = $2
        RETURNING tenant_id, account_id, provider, principal_id, account_email_address,
                  connection_status, granted_scopes, token_reference, external_account_id,
                  draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
                  allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
                  last_error, created_at, updated_at
        `,
        [
          args.tenantId,
          args.accountId,
          args.connectionStatus ?? null,
          args.accountEmailAddress ?? null,
          args.grantedScopes ? JSON.stringify(args.grantedScopes) : null,
          args.tokenReference ?? null,
          args.externalAccountId ?? null,
          args.processingEnabled ?? null,
          args.maxBatchThreads ?? null,
          args.allowedLabelIds ? JSON.stringify(args.allowedLabelIds) : null,
          args.oauthState ?? null,
          args.oauthStateExpiresAt ?? null,
          args.lastProcessedAt ?? null,
          args.lastError ?? null,
          updatedAt
        ]
      )
    );

    if (!res.rows[0]) {
      throw new Error("email_account_not_found");
    }

    return mapEmailAccountConnectionRow(res.rows[0]);
  }

  async getEmailAccountConnection(args: {
    tenantId: string;
    accountId: string;
  }): Promise<EmailAccountConnectionRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        SELECT tenant_id, account_id, provider, principal_id, account_email_address,
               connection_status, granted_scopes, token_reference, external_account_id,
               draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
               allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
               last_error, created_at, updated_at
        FROM email_account_connections
        WHERE tenant_id = $1 AND account_id = $2
        `,
        [args.tenantId, args.accountId]
      )
    );
    return res.rows[0] ? mapEmailAccountConnectionRow(res.rows[0]) : null;
  }

  async getEmailAccountConnectionByOauthState(args: {
    tenantId: string;
    oauthState: string;
  }): Promise<EmailAccountConnectionRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        SELECT tenant_id, account_id, provider, principal_id, account_email_address,
               connection_status, granted_scopes, token_reference, external_account_id,
               draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
               allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
               last_error, created_at, updated_at
        FROM email_account_connections
        WHERE tenant_id = $1 AND oauth_state = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.oauthState]
      )
    );
    return res.rows[0] ? mapEmailAccountConnectionRow(res.rows[0]) : null;
  }

  async listEmailAccountConnections(args: {
    tenantId: string;
    limit?: number;
  }): Promise<EmailAccountConnectionRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        SELECT tenant_id, account_id, provider, principal_id, account_email_address,
               connection_status, granted_scopes, token_reference, external_account_id,
               draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
               allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
               last_error, created_at, updated_at
        FROM email_account_connections
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [args.tenantId, args.limit ?? 50]
      )
    );
    return res.rows.map(mapEmailAccountConnectionRow);
  }

  async getLatestConnectedEmailAccountByPrincipal(args: {
    tenantId: string;
    principalId: string;
    provider?: EmailAccountConnectionRecord["provider"];
  }): Promise<EmailAccountConnectionRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EmailAccountConnectionRow>(
        `
        SELECT tenant_id, account_id, provider, principal_id, account_email_address,
               connection_status, granted_scopes, token_reference, external_account_id,
               draft_only_mode, processing_enabled, processing_mode, max_batch_threads,
               allowed_label_ids, oauth_state, oauth_state_expires_at, last_processed_at,
               last_error, created_at, updated_at
        FROM email_account_connections
        WHERE tenant_id = $1
          AND principal_id = $2
          AND provider = $3
          AND connection_status = 'connected'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.principalId, args.provider ?? "gmail"]
      )
    );
    return res.rows[0] ? mapEmailAccountConnectionRow(res.rows[0]) : null;
  }

  async createAaliyahFounderPreference(args: {
    tenantId: string;
    category: AaliyahFounderPreferenceRecord["category"];
    value: AaliyahFounderPreferenceRecord["value"];
    scope: AaliyahFounderPreferenceRecord["scope"];
    sourceType: AaliyahFounderPreferenceRecord["sourceType"];
    confidenceLevel: AaliyahFounderPreferenceRecord["confidenceLevel"];
    active: boolean;
    createdAt?: string;
    createdBy: string;
  }): Promise<AaliyahFounderPreferenceRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const preferenceId = buildScopedId("aaliyah-pref", [args.category, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahFounderPreferenceRow>(
        `
        INSERT INTO aaliyah_founder_preferences (
          tenant_id, preference_id, category, value, scope, source_type,
          confidence_level, active, created_at, updated_at, deactivated_at,
          created_by, deactivated_by
        ) VALUES (
          $1,$2,$3,$4,$5::jsonb,$6,
          $7,$8,$9,$9,NULL,
          $10,NULL
        )
        RETURNING tenant_id, preference_id, category, value, scope, source_type,
                  confidence_level, active, created_at, updated_at, deactivated_at,
                  created_by, deactivated_by
        `,
        [
          args.tenantId,
          preferenceId,
          args.category,
          args.value,
          JSON.stringify(args.scope),
          args.sourceType,
          args.confidenceLevel,
          args.active,
          createdAt,
          args.createdBy
        ]
      )
    );
    return mapAaliyahFounderPreferenceRow(res.rows[0]!);
  }

  async listAaliyahFounderPreferences(args: {
    tenantId: string;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<AaliyahFounderPreferenceRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahFounderPreferenceRow>(
        `
        SELECT tenant_id, preference_id, category, value, scope, source_type,
               confidence_level, active, created_at, updated_at, deactivated_at,
               created_by, deactivated_by
        FROM aaliyah_founder_preferences
        WHERE tenant_id = $1
          AND ($2::boolean = false OR active = true)
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [args.tenantId, args.activeOnly ?? false, args.limit ?? 100]
      )
    );
    return res.rows.map(mapAaliyahFounderPreferenceRow);
  }

  async deactivateAaliyahFounderPreference(args: {
    tenantId: string;
    preferenceId: string;
    deactivatedBy: string;
    deactivatedAt?: string;
  }): Promise<AaliyahFounderPreferenceRecord> {
    const deactivatedAt = args.deactivatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahFounderPreferenceRow>(
        `
        UPDATE aaliyah_founder_preferences
        SET active = false,
            deactivated_at = $4,
            deactivated_by = $3,
            updated_at = $4
        WHERE tenant_id = $1
          AND preference_id = $2
          AND active = true
        RETURNING tenant_id, preference_id, category, value, scope, source_type,
                  confidence_level, active, created_at, updated_at, deactivated_at,
                  created_by, deactivated_by
        `,
        [args.tenantId, args.preferenceId, args.deactivatedBy, deactivatedAt]
      )
    );
    if (!res.rows[0]) {
      throw new Error("aaliyah_preference_not_found");
    }
    return mapAaliyahFounderPreferenceRow(res.rows[0]);
  }

  async deactivateAaliyahFounderPreferencesByCategory(args: {
    tenantId: string;
    category: AaliyahFounderPreferenceRecord["category"];
    scope: AaliyahFounderPreferenceRecord["scope"];
    deactivatedBy: string;
    deactivatedAt?: string;
  }): Promise<void> {
    const deactivatedAt = args.deactivatedAt ?? new Date().toISOString();
    await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query(
        `
        UPDATE aaliyah_founder_preferences
        SET active = false,
            deactivated_at = $5,
            deactivated_by = $4,
            updated_at = $5
        WHERE tenant_id = $1
          AND category = $2
          AND active = true
          AND scope = $3::jsonb
        `,
        [
          args.tenantId,
          args.category,
          JSON.stringify(args.scope),
          args.deactivatedBy,
          deactivatedAt
        ]
      )
    );
  }

  async getAaliyahSessionContext(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahSessionContextRecord["principalContext"];
  }): Promise<AaliyahSessionContextRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahSessionContextRow>(
        `
        SELECT tenant_id, actor_id, principal_context, session_id, company_scope,
               active_mode_state, interaction_state, retention_policy,
               created_at, updated_at, expires_at, hard_expires_at,
               last_reset_at, last_reset_reason, version
        FROM aaliyah_session_contexts
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
        `,
        [args.tenantId, args.actorId, args.principalContext]
      )
    );

    return res.rows[0] ? mapAaliyahSessionContextRow(res.rows[0]) : null;
  }

  async upsertAaliyahSessionContext(args: {
    session: AaliyahSessionContextRecord;
    expectedVersion?: number | null;
  }): Promise<AaliyahSessionContextRecord> {
    const session = args.session;
    const res = await this.runWithTenant(this.pool, session.tenantId, (client) =>
      client.query<AaliyahSessionContextRow>(
        `
        INSERT INTO aaliyah_session_contexts (
          tenant_id, actor_id, principal_context, session_id, company_scope,
          active_mode_state, interaction_state, retention_policy,
          created_at, updated_at, expires_at, hard_expires_at,
          last_reset_at, last_reset_reason, version
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6::jsonb,$7::jsonb,$8::jsonb,
          $9,$10,$11,$12,
          $13,$14,$15
        )
        ON CONFLICT (tenant_id, actor_id, principal_context)
        DO UPDATE SET
          session_id = EXCLUDED.session_id,
          company_scope = EXCLUDED.company_scope,
          active_mode_state = EXCLUDED.active_mode_state,
          interaction_state = EXCLUDED.interaction_state,
          retention_policy = EXCLUDED.retention_policy,
          updated_at = EXCLUDED.updated_at,
          expires_at = EXCLUDED.expires_at,
          hard_expires_at = EXCLUDED.hard_expires_at,
          last_reset_at = EXCLUDED.last_reset_at,
          last_reset_reason = EXCLUDED.last_reset_reason,
          version = EXCLUDED.version
        WHERE $16::int IS NULL OR aaliyah_session_contexts.version = $16
        RETURNING tenant_id, actor_id, principal_context, session_id, company_scope,
                  active_mode_state, interaction_state, retention_policy,
                  created_at, updated_at, expires_at, hard_expires_at,
                  last_reset_at, last_reset_reason, version
        `,
        [
          session.tenantId,
          session.actorId,
          session.principalContext,
          session.sessionId,
          session.companyScope,
          JSON.stringify(session.activeModeState),
          JSON.stringify(session.interactionState),
          JSON.stringify(session.retentionPolicy),
          session.createdAt,
          session.updatedAt,
          session.expiresAt,
          session.hardExpiresAt,
          session.lastResetAt,
          session.lastResetReason,
          session.version,
          args.expectedVersion ?? null
        ]
      )
    );

    if (!res.rows[0]) {
      throw new Error("aaliyah_session_version_conflict");
    }

    return mapAaliyahSessionContextRow(res.rows[0]!);
  }

  async claimAaliyahMutationIdempotency(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahMutationIdempotencyRecord["principalContext"];
    operationName: AaliyahMutationIdempotencyRecord["operationName"];
    idempotencyKey: string;
    requestFingerprint: string;
    createdAt?: string;
  }): Promise<
    | { status: "claimed"; record: AaliyahMutationIdempotencyRecord }
    | { status: "completed"; record: AaliyahMutationIdempotencyRecord }
    | { status: "in_progress"; record: AaliyahMutationIdempotencyRecord }
    | { status: "conflict"; record: AaliyahMutationIdempotencyRecord }
  > {
    const createdAt = args.createdAt ?? new Date().toISOString();
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const inserted = await client.query<AaliyahMutationIdempotencyRow>(
        `
        INSERT INTO aaliyah_mutation_idempotency (
          tenant_id, actor_id, principal_context, operation_name, idempotency_key,
          request_fingerprint, state, response_payload, error_code, created_at, updated_at, completed_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,'in_progress',NULL,NULL,$7,$7,NULL
        )
        ON CONFLICT DO NOTHING
        RETURNING tenant_id, actor_id, principal_context, operation_name, idempotency_key,
                  request_fingerprint, state, response_payload, error_code, created_at, updated_at, completed_at
        `,
        [
          args.tenantId,
          args.actorId,
          args.principalContext,
          args.operationName,
          args.idempotencyKey,
          args.requestFingerprint,
          createdAt
        ]
      );

      if (inserted.rows[0]) {
        return { status: "claimed" as const, record: mapAaliyahMutationIdempotencyRow(inserted.rows[0]) };
      }

      const existing = await client.query<AaliyahMutationIdempotencyRow>(
        `
        SELECT tenant_id, actor_id, principal_context, operation_name, idempotency_key,
               request_fingerprint, state, response_payload, error_code, created_at, updated_at, completed_at
        FROM aaliyah_mutation_idempotency
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND operation_name = $4
          AND idempotency_key = $5
        `,
        [args.tenantId, args.actorId, args.principalContext, args.operationName, args.idempotencyKey]
      );

      const record = mapAaliyahMutationIdempotencyRow(existing.rows[0]!);
      if (record.requestFingerprint !== args.requestFingerprint) {
        return { status: "conflict" as const, record };
      }
      if (record.state === "completed") {
        return { status: "completed" as const, record };
      }
      return { status: "in_progress" as const, record };
    });
  }

  async completeAaliyahMutationIdempotency(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahMutationIdempotencyRecord["principalContext"];
    operationName: AaliyahMutationIdempotencyRecord["operationName"];
    idempotencyKey: string;
    responsePayload: Record<string, unknown>;
    completedAt?: string;
  }): Promise<AaliyahMutationIdempotencyRecord> {
    const completedAt = args.completedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahMutationIdempotencyRow>(
        `
        UPDATE aaliyah_mutation_idempotency
        SET state = 'completed',
            response_payload = $6::jsonb,
            error_code = NULL,
            updated_at = $7,
            completed_at = $7
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND operation_name = $4
          AND idempotency_key = $5
        RETURNING tenant_id, actor_id, principal_context, operation_name, idempotency_key,
                  request_fingerprint, state, response_payload, error_code, created_at, updated_at, completed_at
        `,
        [
          args.tenantId,
          args.actorId,
          args.principalContext,
          args.operationName,
          args.idempotencyKey,
          JSON.stringify(args.responsePayload),
          completedAt
        ]
      )
    );
    if (!res.rows[0]) {
      throw new Error("aaliyah_idempotency_record_not_found");
    }
    return mapAaliyahMutationIdempotencyRow(res.rows[0]);
  }

  async failAaliyahMutationIdempotency(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahMutationIdempotencyRecord["principalContext"];
    operationName: AaliyahMutationIdempotencyRecord["operationName"];
    idempotencyKey: string;
    errorCode: string;
    failedAt?: string;
  }): Promise<AaliyahMutationIdempotencyRecord> {
    const failedAt = args.failedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahMutationIdempotencyRow>(
        `
        UPDATE aaliyah_mutation_idempotency
        SET state = 'failed',
            error_code = $6,
            updated_at = $7
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND operation_name = $4
          AND idempotency_key = $5
        RETURNING tenant_id, actor_id, principal_context, operation_name, idempotency_key,
                  request_fingerprint, state, response_payload, error_code, created_at, updated_at, completed_at
        `,
        [
          args.tenantId,
          args.actorId,
          args.principalContext,
          args.operationName,
          args.idempotencyKey,
          args.errorCode,
          failedAt
        ]
      )
    );
    if (!res.rows[0]) {
      throw new Error("aaliyah_idempotency_record_not_found");
    }
    return mapAaliyahMutationIdempotencyRow(res.rows[0]);
  }

  async createAaliyahDiagnosticsEvent(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahDiagnosticsEventRecord["principalContext"];
    activeMode: AaliyahDiagnosticsEventRecord["activeMode"];
    eventType: AaliyahDiagnosticsEventRecord["eventType"];
    eventSource: AaliyahDiagnosticsEventRecord["eventSource"];
    signalKey: string;
    payload: Record<string, unknown>;
    createdAt?: string;
  }): Promise<AaliyahDiagnosticsEventRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const eventId = buildScopedId("aaliyah-diagnostics", [args.eventType, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahDiagnosticsEventRow>(
        `
        INSERT INTO aaliyah_diagnostics_events (
          tenant_id, event_id, actor_id, principal_context, active_mode,
          event_type, event_source, signal_key, payload, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9::jsonb,$10
        )
        RETURNING tenant_id, event_id, actor_id, principal_context, active_mode,
                  event_type, event_source, signal_key, payload, created_at
        `,
        [
          args.tenantId,
          eventId,
          args.actorId,
          args.principalContext,
          args.activeMode,
          args.eventType,
          args.eventSource,
          args.signalKey,
          JSON.stringify(args.payload),
          createdAt
        ]
      )
    );
    return mapAaliyahDiagnosticsEventRow(res.rows[0]!);
  }

  async listAaliyahDiagnosticsEvents(args: {
    tenantId: string;
    actorId: string;
    principalContext: AaliyahDiagnosticsEventRecord["principalContext"];
    since: string;
    until: string;
    limit?: number;
  }): Promise<AaliyahDiagnosticsEventRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AaliyahDiagnosticsEventRow>(
        `
        SELECT tenant_id, event_id, actor_id, principal_context, active_mode,
               event_type, event_source, signal_key, payload, created_at
        FROM aaliyah_diagnostics_events
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND created_at >= $4
          AND created_at <= $5
        ORDER BY created_at DESC
        LIMIT $6
        `,
        [args.tenantId, args.actorId, args.principalContext, args.since, args.until, args.limit ?? 1000]
      )
    );
    return res.rows.map(mapAaliyahDiagnosticsEventRow);
  }

  async getAaliyahFollowThroughRecordBySource(args: {
    tenantId: string;
    actorId: string;
    principalContext: FollowThroughRecord["principalContext"];
    sourceItemId: string;
  }): Promise<FollowThroughRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<FollowThroughRecordRow>(
        `
        SELECT tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
               active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
               queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
               title, summary, status, closure_state, closure_reason, next_governed_action,
               founder_declared_completion, downstream_action_ref, escalation_target,
               escalation_class, escalation_rationale, escalation_provenance, note,
               provenance, created_at, updated_at, closed_at
        FROM aaliyah_follow_through_records
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND source_item_id = $4
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.actorId, args.principalContext, args.sourceItemId]
      )
    );

    return res.rows[0] ? mapFollowThroughRecordRow(res.rows[0]) : null;
  }

  async upsertAaliyahFollowThroughRecord(args: {
    record: FollowThroughRecord;
  }): Promise<FollowThroughRecord> {
    const record = args.record;
    const res = await this.runWithTenant(this.pool, record.tenantId, (client) =>
      client.query<FollowThroughRecordRow>(
        `
        INSERT INTO aaliyah_follow_through_records (
          tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
          active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
          queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
          title, summary, status, closure_state, closure_reason, next_governed_action,
          founder_declared_completion, downstream_action_ref, escalation_target,
          escalation_class, escalation_rationale, escalation_provenance, note,
          provenance, created_at, updated_at, closed_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,
          $23,$24,$25,
          $26,$27,$28::jsonb,$29,
          $30::jsonb,$31,$32,$33
        )
        ON CONFLICT (tenant_id, follow_through_id)
        DO UPDATE SET
          version = EXCLUDED.version,
          session_id = EXCLUDED.session_id,
          actor_id = EXCLUDED.actor_id,
          principal_context = EXCLUDED.principal_context,
          active_mode = EXCLUDED.active_mode,
          company_scope = EXCLUDED.company_scope,
          working_item_type = EXCLUDED.working_item_type,
          source_subsystem = EXCLUDED.source_subsystem,
          source_item_id = EXCLUDED.source_item_id,
          queue_item_id = EXCLUDED.queue_item_id,
          review_item_id = EXCLUDED.review_item_id,
          call_id = EXCLUDED.call_id,
          incident_id = EXCLUDED.incident_id,
          dispatch_id = EXCLUDED.dispatch_id,
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          status = EXCLUDED.status,
          closure_state = EXCLUDED.closure_state,
          closure_reason = EXCLUDED.closure_reason,
          next_governed_action = EXCLUDED.next_governed_action,
          founder_declared_completion = EXCLUDED.founder_declared_completion,
          downstream_action_ref = EXCLUDED.downstream_action_ref,
          escalation_target = EXCLUDED.escalation_target,
          escalation_class = EXCLUDED.escalation_class,
          escalation_rationale = EXCLUDED.escalation_rationale,
          escalation_provenance = EXCLUDED.escalation_provenance,
          note = EXCLUDED.note,
          provenance = EXCLUDED.provenance,
          updated_at = EXCLUDED.updated_at,
          closed_at = EXCLUDED.closed_at
        RETURNING tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
                  active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
                  queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
                  title, summary, status, closure_state, closure_reason, next_governed_action,
                  founder_declared_completion, downstream_action_ref, escalation_target,
                  escalation_class, escalation_rationale, escalation_provenance, note,
                  provenance, created_at, updated_at, closed_at
        `,
        [
          record.tenantId,
          record.followThroughId,
          record.version,
          record.sessionId,
          record.actorId,
          record.principalContext,
          record.activeMode,
          record.companyScope,
          record.workingItemType,
          record.sourceSubsystem,
          record.sourceItemId,
          record.queueItemId,
          record.reviewItemId,
          record.callId,
          record.incidentId,
          record.dispatchId,
          record.title,
          record.summary,
          record.status,
          record.closureState,
          record.closureReason,
          record.nextGovernedAction,
          record.founderDeclaredCompletion,
          record.downstreamActionRef,
          record.escalationTarget,
          record.escalationClass,
          record.escalationRationale,
          JSON.stringify(record.escalationProvenance ?? {}),
          record.note,
          JSON.stringify(record.provenance),
          record.createdAt,
          record.updatedAt,
          record.closedAt
        ]
      )
    );

    return mapFollowThroughRecordRow(res.rows[0]!);
  }

  async createOrGetAaliyahFollowThroughRecord(args: {
    record: FollowThroughRecord;
  }): Promise<FollowThroughRecord> {
    const record = args.record;
    return this.runWithTenant(this.pool, record.tenantId, async (client) => {
      const inserted = await client.query<FollowThroughRecordRow>(
        `
        INSERT INTO aaliyah_follow_through_records (
          tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
          active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
          queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
          title, summary, status, closure_state, closure_reason, next_governed_action,
          founder_declared_completion, downstream_action_ref, escalation_target,
          escalation_class, escalation_rationale, escalation_provenance, note,
          provenance, created_at, updated_at, closed_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,
          $23,$24,$25,
          $26,$27,$28::jsonb,$29,
          $30::jsonb,$31,$32,$33
        )
        ON CONFLICT (tenant_id, actor_id, principal_context, source_item_id) DO NOTHING
        RETURNING tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
                  active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
                  queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
                  title, summary, status, closure_state, closure_reason, next_governed_action,
                  founder_declared_completion, downstream_action_ref, escalation_target,
                  escalation_class, escalation_rationale, escalation_provenance, note,
                  provenance, created_at, updated_at, closed_at
        `,
        [
          record.tenantId,
          record.followThroughId,
          record.version,
          record.sessionId,
          record.actorId,
          record.principalContext,
          record.activeMode,
          record.companyScope,
          record.workingItemType,
          record.sourceSubsystem,
          record.sourceItemId,
          record.queueItemId,
          record.reviewItemId,
          record.callId,
          record.incidentId,
          record.dispatchId,
          record.title,
          record.summary,
          record.status,
          record.closureState,
          record.closureReason,
          record.nextGovernedAction,
          record.founderDeclaredCompletion,
          record.downstreamActionRef,
          record.escalationTarget,
          record.escalationClass,
          record.escalationRationale,
          JSON.stringify(record.escalationProvenance ?? {}),
          record.note,
          JSON.stringify(record.provenance),
          record.createdAt,
          record.updatedAt,
          record.closedAt
        ]
      );

      if (inserted.rows[0]) {
        return mapFollowThroughRecordRow(inserted.rows[0]);
      }

      const existing = await client.query<FollowThroughRecordRow>(
        `
        SELECT tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
               active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
               queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
               title, summary, status, closure_state, closure_reason, next_governed_action,
               founder_declared_completion, downstream_action_ref, escalation_target,
               escalation_class, escalation_rationale, escalation_provenance, note,
               provenance, created_at, updated_at, closed_at
        FROM aaliyah_follow_through_records
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND source_item_id = $4
        `,
        [record.tenantId, record.actorId, record.principalContext, record.sourceItemId]
      );

      return mapFollowThroughRecordRow(existing.rows[0]!);
    });
  }

  async commitAaliyahFollowThroughTransition(args: {
    session: AaliyahSessionContextRecord;
    expectedSessionVersion: number;
    record: FollowThroughRecord;
    expectedFollowThroughVersion: number;
    historyEntry: FollowThroughHistoryEntry;
  }): Promise<{ session: AaliyahSessionContextRecord; record: FollowThroughRecord; historyEntry: FollowThroughHistoryEntry }> {
    return this.runWithTenant(this.pool, args.session.tenantId, async (client) => {
      const sessionRes = await client.query<AaliyahSessionContextRow>(
        `
        UPDATE aaliyah_session_contexts
        SET session_id = $4,
            company_scope = $5,
            active_mode_state = $6::jsonb,
            interaction_state = $7::jsonb,
            retention_policy = $8::jsonb,
            updated_at = $9,
            expires_at = $10,
            hard_expires_at = $11,
            last_reset_at = $12,
            last_reset_reason = $13,
            version = $14
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND version = $15
        RETURNING tenant_id, actor_id, principal_context, session_id, company_scope,
                  active_mode_state, interaction_state, retention_policy,
                  created_at, updated_at, expires_at, hard_expires_at,
                  last_reset_at, last_reset_reason, version
        `,
        [
          args.session.tenantId,
          args.session.actorId,
          args.session.principalContext,
          args.session.sessionId,
          args.session.companyScope,
          JSON.stringify(args.session.activeModeState),
          JSON.stringify(args.session.interactionState),
          JSON.stringify(args.session.retentionPolicy),
          args.session.updatedAt,
          args.session.expiresAt,
          args.session.hardExpiresAt,
          args.session.lastResetAt,
          args.session.lastResetReason,
          args.session.version,
          args.expectedSessionVersion
        ]
      );
      if (!sessionRes.rows[0]) {
        throw new Error("aaliyah_session_version_conflict");
      }

      const recordRes = await client.query<FollowThroughRecordRow>(
        `
        UPDATE aaliyah_follow_through_records
        SET version = $3,
            session_id = $4,
            actor_id = $5,
            principal_context = $6,
            active_mode = $7,
            company_scope = $8,
            working_item_type = $9,
            source_subsystem = $10,
            source_item_id = $11,
            queue_item_id = $12,
            review_item_id = $13,
            call_id = $14,
            incident_id = $15,
            dispatch_id = $16,
            title = $17,
            summary = $18,
            status = $19,
            closure_state = $20,
            closure_reason = $21,
            next_governed_action = $22,
            founder_declared_completion = $23,
            downstream_action_ref = $24,
            escalation_target = $25,
            escalation_class = $26,
            escalation_rationale = $27,
            escalation_provenance = $28::jsonb,
            note = $29,
            provenance = $30::jsonb,
            updated_at = $31,
            closed_at = $32
        WHERE tenant_id = $1
          AND follow_through_id = $2
          AND version = $33
        RETURNING tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
                  active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
                  queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
                  title, summary, status, closure_state, closure_reason, next_governed_action,
                  founder_declared_completion, downstream_action_ref, escalation_target,
                  escalation_class, escalation_rationale, escalation_provenance, note,
                  provenance, created_at, updated_at, closed_at
        `,
        [
          args.record.tenantId,
          args.record.followThroughId,
          args.record.version,
          args.record.sessionId,
          args.record.actorId,
          args.record.principalContext,
          args.record.activeMode,
          args.record.companyScope,
          args.record.workingItemType,
          args.record.sourceSubsystem,
          args.record.sourceItemId,
          args.record.queueItemId,
          args.record.reviewItemId,
          args.record.callId,
          args.record.incidentId,
          args.record.dispatchId,
          args.record.title,
          args.record.summary,
          args.record.status,
          args.record.closureState,
          args.record.closureReason,
          args.record.nextGovernedAction,
          args.record.founderDeclaredCompletion,
          args.record.downstreamActionRef,
          args.record.escalationTarget,
          args.record.escalationClass,
          args.record.escalationRationale,
          JSON.stringify(args.record.escalationProvenance ?? {}),
          args.record.note,
          JSON.stringify(args.record.provenance),
          args.record.updatedAt,
          args.record.closedAt,
          args.expectedFollowThroughVersion
        ]
      );
      if (!recordRes.rows[0]) {
        throw new Error("aaliyah_follow_through_version_conflict");
      }

      const historyRes = await client.query<FollowThroughHistoryEntryRow>(
        `
        INSERT INTO aaliyah_follow_through_history (
          tenant_id, event_id, follow_through_id, action, previous_status,
          resulting_status, closure_state, closure_reason, next_governed_action,
          founder_declared_completion, downstream_action_ref, escalation_target,
          escalation_class, escalation_rationale, escalation_provenance, note,
          actor_id, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,$12,
          $13,$14,$15::jsonb,$16,
          $17,$18
        )
        RETURNING tenant_id, event_id, follow_through_id, action, previous_status,
                  resulting_status, closure_state, closure_reason, next_governed_action,
                  founder_declared_completion, downstream_action_ref, escalation_target,
                  escalation_class, escalation_rationale, escalation_provenance, note,
                  actor_id, created_at
        `,
        [
          args.historyEntry.tenantId,
          args.historyEntry.eventId,
          args.historyEntry.followThroughId,
          args.historyEntry.action,
          args.historyEntry.previousStatus,
          args.historyEntry.resultingStatus,
          args.historyEntry.closureState,
          args.historyEntry.closureReason,
          args.historyEntry.nextGovernedAction,
          args.historyEntry.founderDeclaredCompletion,
          args.historyEntry.downstreamActionRef,
          args.historyEntry.escalationTarget,
          args.historyEntry.escalationClass,
          args.historyEntry.escalationRationale,
          JSON.stringify(args.historyEntry.escalationProvenance ?? {}),
          args.historyEntry.note,
          args.historyEntry.actorId,
          args.historyEntry.createdAt
        ]
      );

      return {
        session: mapAaliyahSessionContextRow(sessionRes.rows[0]),
        record: mapFollowThroughRecordRow(recordRes.rows[0]),
        historyEntry: mapFollowThroughHistoryEntryRow(historyRes.rows[0])
      };
    });
  }

  async createAaliyahFollowThroughHistoryEntry(args: {
    entry: FollowThroughHistoryEntry;
  }): Promise<FollowThroughHistoryEntry> {
    const entry = args.entry;
    const query = await this.runWithTenant(this.pool, entry.tenantId, (client) =>
      client.query<FollowThroughHistoryEntryRow>(
        `
        INSERT INTO aaliyah_follow_through_history (
          tenant_id, event_id, follow_through_id, action, previous_status,
          resulting_status, closure_state, closure_reason, next_governed_action,
          founder_declared_completion, downstream_action_ref, escalation_target,
          escalation_class, escalation_rationale, escalation_provenance, note,
          actor_id, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,$12,
          $13,$14,$15::jsonb,$16,
          $17,$18
        )
        RETURNING tenant_id, event_id, follow_through_id, action, previous_status,
                  resulting_status, closure_state, closure_reason, next_governed_action,
                  founder_declared_completion, downstream_action_ref, escalation_target,
                  escalation_class, escalation_rationale, escalation_provenance, note,
                  actor_id, created_at
        `,
        [
          entry.tenantId,
          entry.eventId,
          entry.followThroughId,
          entry.action,
          entry.previousStatus,
          entry.resultingStatus,
          entry.closureState,
          entry.closureReason,
          entry.nextGovernedAction,
          entry.founderDeclaredCompletion,
          entry.downstreamActionRef,
          entry.escalationTarget,
          entry.escalationClass,
          entry.escalationRationale,
          JSON.stringify(entry.escalationProvenance ?? {}),
          entry.note,
          entry.actorId,
          entry.createdAt
        ]
      )
    );

    return mapFollowThroughHistoryEntryRow(query.rows[0]!);
  }

  async listAaliyahFollowThroughHistory(args: {
    tenantId: string;
    actorId: string;
    principalContext: FollowThroughRecord["principalContext"];
    limit: number;
  }): Promise<FollowThroughHistoryEntry[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<FollowThroughHistoryEntryRow>(
        `
        SELECT h.tenant_id, h.event_id, h.follow_through_id, h.action, h.previous_status,
               h.resulting_status, h.closure_state, h.closure_reason, h.next_governed_action,
               h.founder_declared_completion, h.downstream_action_ref, h.escalation_target,
               h.escalation_class, h.escalation_rationale, h.escalation_provenance, h.note,
               h.actor_id, h.created_at
        FROM aaliyah_follow_through_history h
        JOIN aaliyah_follow_through_records r
          ON r.tenant_id = h.tenant_id
         AND r.follow_through_id = h.follow_through_id
        WHERE h.tenant_id = $1
          AND r.actor_id = $2
          AND r.principal_context = $3
        ORDER BY h.created_at DESC
        LIMIT $4
        `,
        [args.tenantId, args.actorId, args.principalContext, args.limit]
      )
    );

    return res.rows.map(mapFollowThroughHistoryEntryRow);
  }

  async listAaliyahFollowThroughHistoryWindow(args: {
    tenantId: string;
    actorId: string;
    principalContext: FollowThroughRecord["principalContext"];
    since: string;
    until: string;
    limit?: number;
  }): Promise<FollowThroughHistoryEntry[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<FollowThroughHistoryEntryRow>(
        `
        SELECT h.tenant_id, h.event_id, h.follow_through_id, h.action, h.previous_status,
               h.resulting_status, h.closure_state, h.closure_reason, h.next_governed_action,
               h.founder_declared_completion, h.downstream_action_ref, h.escalation_target,
               h.escalation_class, h.escalation_rationale, h.escalation_provenance, h.note,
               h.actor_id, h.created_at
        FROM aaliyah_follow_through_history h
        JOIN aaliyah_follow_through_records r
          ON r.tenant_id = h.tenant_id
         AND r.follow_through_id = h.follow_through_id
        WHERE h.tenant_id = $1
          AND r.actor_id = $2
          AND r.principal_context = $3
          AND h.created_at >= $4
          AND h.created_at <= $5
        ORDER BY h.created_at DESC
        LIMIT $6
        `,
        [args.tenantId, args.actorId, args.principalContext, args.since, args.until, args.limit ?? 1000]
      )
    );

    return res.rows.map(mapFollowThroughHistoryEntryRow);
  }

  async listAaliyahFollowThroughRecordsBySourceIds(args: {
    tenantId: string;
    actorId: string;
    principalContext: FollowThroughRecord["principalContext"];
    sourceItemIds: string[];
  }): Promise<FollowThroughRecord[]> {
    if (args.sourceItemIds.length === 0) {
      return [];
    }
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<FollowThroughRecordRow>(
        `
        SELECT DISTINCT ON (source_item_id)
               tenant_id, follow_through_id, version, session_id, actor_id, principal_context,
               active_mode, company_scope, working_item_type, source_subsystem, source_item_id,
               queue_item_id, review_item_id, call_id, incident_id, dispatch_id,
               title, summary, status, closure_state, closure_reason, next_governed_action,
               founder_declared_completion, downstream_action_ref, escalation_target,
               escalation_class, escalation_rationale, escalation_provenance, note,
               provenance, created_at, updated_at, closed_at
        FROM aaliyah_follow_through_records
        WHERE tenant_id = $1
          AND actor_id = $2
          AND principal_context = $3
          AND source_item_id = ANY($4::text[])
        ORDER BY source_item_id, updated_at DESC
        `,
        [args.tenantId, args.actorId, args.principalContext, args.sourceItemIds]
      )
    );

    return res.rows.map(mapFollowThroughRecordRow);
  }

  async listIncidentRecords(args: {
    tenantId: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    incidentType?: IncidentType;
    limit?: number;
  }): Promise<IncidentRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<IncidentRow>(
        `
        SELECT tenant_id, incident_id, incident_type, severity, status,
               owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
               source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
               title, summary, details, recommended_action, release_blocking,
               created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        FROM incidents
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR severity = $3)
          AND ($4::text IS NULL OR incident_type = $4)
        ORDER BY created_at DESC
        LIMIT $5
        `,
        [args.tenantId, args.status ?? null, args.severity ?? null, args.incidentType ?? null, args.limit ?? 50]
      )
    );

    return res.rows.map(mapIncidentRow);
  }

  async getIncidentRecord(args: {
    tenantId: string;
    incidentId: string;
  }): Promise<IncidentRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<IncidentRow>(
        `
        SELECT tenant_id, incident_id, incident_type, severity, status,
               owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
               source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
               title, summary, details, recommended_action, release_blocking,
               created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        FROM incidents
        WHERE tenant_id = $1 AND incident_id = $2
        `,
        [args.tenantId, args.incidentId]
      )
    );

    return res.rows[0] ? mapIncidentRow(res.rows[0]) : null;
  }

  async acknowledgeIncidentRecord(args: {
    tenantId: string;
    incidentId: string;
    acknowledgedBy: string;
    acknowledgedAt?: string;
  }): Promise<IncidentRecord> {
    const acknowledgedAt = args.acknowledgedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<IncidentRow>(
        `
        UPDATE incidents
        SET status = 'acknowledged',
            acknowledged_at = $3,
            acknowledged_by = $4,
            updated_at = $3
        WHERE tenant_id = $1
          AND incident_id = $2
          AND status <> 'resolved'
        RETURNING tenant_id, incident_id, incident_type, severity, status,
                  owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
                  source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
                  title, summary, details, recommended_action, release_blocking,
                  created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        `,
        [args.tenantId, args.incidentId, acknowledgedAt, args.acknowledgedBy]
      )
    );

    if (!res.rows[0]) {
      throw new Error("incident_not_found_or_resolved");
    }

    return mapIncidentRow(res.rows[0]);
  }

  async resolveIncidentRecord(args: {
    tenantId: string;
    incidentId: string;
    resolvedBy: string;
    resolutionNote: string;
    resolvedAt?: string;
  }): Promise<IncidentRecord> {
    const resolvedAt = args.resolvedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<IncidentRow>(
        `
        UPDATE incidents
        SET status = 'resolved',
            resolved_at = $3,
            resolved_by = $4,
            resolution_note = $5,
            updated_at = $3
        WHERE tenant_id = $1 AND incident_id = $2
        RETURNING tenant_id, incident_id, incident_type, severity, status,
                  owning_executive_id, owning_department_id, owning_lead_agent_id, owning_sub_agent_id,
                  source_system, related_signal_type, related_assignment_record_id, related_run_record_id,
                  title, summary, details, recommended_action, release_blocking,
                  created_at, updated_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note
        `,
        [args.tenantId, args.incidentId, resolvedAt, args.resolvedBy, args.resolutionNote]
      )
    );

    if (!res.rows[0]) {
      throw new Error("incident_not_found");
    }

    return mapIncidentRow(res.rows[0]);
  }

  async appendExecutionStep(args: {
    tenantId: string;
    executionId: string;
    stepName: string;
    stepOrder: number;
    status: ExecutionStepStatus;
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ExecutionStepRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const executionStepId = buildScopedId("execution-step", [args.executionId, String(args.stepOrder), createdAt]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO execution_steps (
          tenant_id, execution_step_id, execution_id, step_name,
          step_order, status, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        `,
        [
          args.tenantId,
          executionStepId,
          args.executionId,
          args.stepName,
          args.stepOrder,
          args.status,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      executionStepId,
      executionId: args.executionId,
      stepName: args.stepName,
      stepOrder: args.stepOrder,
      status: args.status,
      payload: args.payload ?? {},
      createdAt
    };
  }

  async completeExecution(args: {
    tenantId: string;
    executionId: string;
    outputPayload: Record<string, unknown>;
    completedAt?: string;
  }): Promise<void> {
    const completedAt = args.completedAt ?? new Date().toISOString();
    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        UPDATE executions
        SET status = 'COMPLETED',
            output_payload = $3::jsonb,
            failure_class = NULL,
            failure_message = NULL,
            completed_at = $4,
            updated_at = $4
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId, JSON.stringify(args.outputPayload), completedAt]
      );
    });
  }

  async getExecution(args: { tenantId: string; executionId: string }): Promise<{
    execution: ExecutionRecord;
    steps: ExecutionStepRecord[];
  } | null> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const executionRes = await client.query<ExecutionRow>(
        `
        SELECT tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
               request_source, requested_by, subject_type, subject_id, status,
               input_payload, output_payload, failure_class, failure_message, approval_request_id,
               retry_count, max_retries, next_retry_at, dead_lettered_at,
               started_at, completed_at, created_at, updated_at
        FROM executions
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId]
      );
      const execution = executionRes.rows[0];
      if (!execution) return null;

      const stepsRes = await client.query<ExecutionStepRow>(
        `
        SELECT tenant_id, execution_step_id, execution_id, step_name, step_order, status, payload, created_at
        FROM execution_steps
        WHERE tenant_id = $1 AND execution_id = $2
        ORDER BY step_order ASC, created_at ASC
        `,
        [args.tenantId, args.executionId]
      );

      return {
        execution: mapExecutionRow(execution),
        steps: stepsRes.rows.map(mapExecutionStepRow)
      };
    });
  }

  async createOrchestrationBundleExport(args: {
    tenantId: string;
    executionId: string;
    exportedBy: string;
    payloadHash: string;
    signature: string;
    sealedAt: string;
    bundleSnapshot: Record<string, unknown>;
    createdAt?: string;
  }): Promise<OrchestrationBundleExportRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const exportId = buildScopedId("bundle-export", [args.executionId, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationBundleExportRow>(
        `
        INSERT INTO orchestration_bundle_exports (
          tenant_id, export_id, execution_id, exported_by,
          payload_hash, signature, sealed_at, bundle_snapshot, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING tenant_id, export_id, execution_id, exported_by,
                  payload_hash, signature, sealed_at, bundle_snapshot, created_at
        `,
        [
          args.tenantId,
          exportId,
          args.executionId,
          args.exportedBy,
          args.payloadHash,
          args.signature,
          args.sealedAt,
          JSON.stringify(args.bundleSnapshot),
          createdAt
        ]
      )
    );

    return mapOrchestrationBundleExportRow(res.rows[0]!);
  }

  async listOrchestrationBundleExports(args: {
    tenantId: string;
    executionId: string;
  }): Promise<OrchestrationBundleExportRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationBundleExportRow>(
        `
        SELECT tenant_id, export_id, execution_id, exported_by,
               payload_hash, signature, sealed_at, bundle_snapshot, created_at
        FROM orchestration_bundle_exports
        WHERE tenant_id = $1 AND execution_id = $2
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.executionId]
      )
    );

    return res.rows.map(mapOrchestrationBundleExportRow);
  }

  async createOrchestrationOpsSnapshotExport(args: {
    tenantId: string;
    snapshotType: "worker_freshness" | "alerts" | "diagnostics" | "inventory";
    exportedBy: string;
    payloadHash: string;
    signature: string;
    sealedAt: string;
    snapshot: Record<string, unknown>;
    createdAt?: string;
  }): Promise<OrchestrationOpsSnapshotExportRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const exportId = buildScopedId("ops-export", [args.snapshotType, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationOpsSnapshotExportRow>(
        `
        INSERT INTO orchestration_ops_snapshot_exports (
          tenant_id, export_id, snapshot_type, exported_by,
          payload_hash, signature, sealed_at, snapshot, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING tenant_id, export_id, snapshot_type, exported_by,
                  payload_hash, signature, sealed_at, snapshot, created_at
        `,
        [
          args.tenantId,
          exportId,
          args.snapshotType,
          args.exportedBy,
          args.payloadHash,
          args.signature,
          args.sealedAt,
          JSON.stringify(args.snapshot),
          createdAt
        ]
      )
    );

    return mapOrchestrationOpsSnapshotExportRow(res.rows[0]!);
  }

  async listOrchestrationOpsSnapshotExports(args: {
    tenantId: string;
    snapshotType: "worker_freshness" | "alerts" | "diagnostics" | "inventory";
  }): Promise<OrchestrationOpsSnapshotExportRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationOpsSnapshotExportRow>(
        `
        SELECT tenant_id, export_id, snapshot_type, exported_by,
               payload_hash, signature, sealed_at, snapshot, created_at
        FROM orchestration_ops_snapshot_exports
        WHERE tenant_id = $1 AND snapshot_type = $2
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.snapshotType]
      )
    );

    return res.rows.map(mapOrchestrationOpsSnapshotExportRow);
  }

  async listExecutions(args: {
    tenantId: string;
    agentId?: AgentId;
    status?: ExecutionStatus;
  }): Promise<ExecutionRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        SELECT tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
               request_source, requested_by, subject_type, subject_id, status,
               input_payload, output_payload, failure_class, failure_message, approval_request_id,
               retry_count, max_retries, next_retry_at, dead_lettered_at,
               started_at, completed_at, created_at, updated_at
        FROM executions
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR agent_id = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId ?? null, args.status ?? null]
      )
    );

    return res.rows.map(mapExecutionRow);
  }

  async recordWorkerHeartbeat(args: {
    tenantId: string;
    workerId: string;
    workerKind: string;
    agentId?: AgentId;
    status: WorkerHeartbeatRecord["status"];
    details?: Record<string, unknown>;
    observedAt?: string;
  }): Promise<WorkerHeartbeatRecord> {
    const observedAt = args.observedAt ?? new Date().toISOString();
    const workerHeartbeatId = buildScopedId("worker-heartbeat", [args.workerId, observedAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<WorkerHeartbeatRow>(
        `
        INSERT INTO worker_heartbeats (
          tenant_id, worker_heartbeat_id, worker_id, worker_kind,
          agent_id, status, details, observed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING tenant_id, worker_heartbeat_id, worker_id, worker_kind,
                  agent_id, status, details, observed_at
        `,
        [
          args.tenantId,
          workerHeartbeatId,
          args.workerId,
          args.workerKind,
          args.agentId ?? null,
          args.status,
          JSON.stringify(args.details ?? {}),
          observedAt
        ]
      )
    );

    return mapWorkerHeartbeatRow(res.rows[0]!);
  }

  async listWorkerHeartbeats(args: {
    tenantId: string;
    workerKind?: string;
    agentId?: AgentId;
  }): Promise<WorkerHeartbeatRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<WorkerHeartbeatRow>(
        `
        SELECT tenant_id, worker_heartbeat_id, worker_id, worker_kind,
               agent_id, status, details, observed_at
        FROM worker_heartbeats
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR worker_kind = $2)
          AND ($3::text IS NULL OR agent_id = $3)
        ORDER BY observed_at DESC
        `,
        [args.tenantId, args.workerKind ?? null, args.agentId ?? null]
      )
    );

    return res.rows.map(mapWorkerHeartbeatRow);
  }

  async acknowledgeOrchestrationAlert(args: {
    tenantId: string;
    alertCode: string;
    acknowledgedBy: string;
    reason: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<OrchestrationAlertAckRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const alertAckId = buildScopedId("alert-ack", [args.alertCode, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationAlertAckRow>(
        `
        INSERT INTO orchestration_alert_acks (
          tenant_id, alert_ack_id, alert_code, acknowledged_by,
          reason, details, created_at, reopened_at, reopened_by, reopen_reason
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL, NULL, NULL)
        RETURNING tenant_id, alert_ack_id, alert_code, acknowledged_by, reason, details, created_at,
                  reopened_at, reopened_by, reopen_reason
        `,
        [
          args.tenantId,
          alertAckId,
          args.alertCode,
          args.acknowledgedBy,
          args.reason,
          JSON.stringify(args.details ?? {}),
          createdAt
        ]
      )
    );

    return mapOrchestrationAlertAckRow(res.rows[0]!);
  }

  async listOrchestrationAlertAcks(args: {
    tenantId: string;
    alertCode?: string;
  }): Promise<OrchestrationAlertAckRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationAlertAckRow>(
        `
        SELECT tenant_id, alert_ack_id, alert_code, acknowledged_by, reason, details, created_at,
               reopened_at, reopened_by, reopen_reason
        FROM orchestration_alert_acks
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR alert_code = $2)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.alertCode ?? null]
      )
    );

    return res.rows.map(mapOrchestrationAlertAckRow);
  }

  async reopenOrchestrationAlertAck(args: {
    tenantId: string;
    alertAckId: string;
    reopenedBy: string;
    reopenReason: string;
    reopenedAt?: string;
  }): Promise<OrchestrationAlertAckRecord> {
    const reopenedAt = args.reopenedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationAlertAckRow>(
        `
        UPDATE orchestration_alert_acks
        SET reopened_at = $3,
            reopened_by = $4,
            reopen_reason = $5
        WHERE tenant_id = $1 AND alert_ack_id = $2
        RETURNING tenant_id, alert_ack_id, alert_code, acknowledged_by, reason, details, created_at,
                  reopened_at, reopened_by, reopen_reason
        `,
        [args.tenantId, args.alertAckId, reopenedAt, args.reopenedBy, args.reopenReason]
      )
    );

    if (!res.rows[0]) {
      throw new Error("alert_ack_not_found");
    }

    return mapOrchestrationAlertAckRow(res.rows[0]);
  }

  async claimQueuedExecutions(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    startedAt?: string;
  }): Promise<ExecutionRecord[]> {
    const startedAt = args.startedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        WITH queued AS (
          SELECT execution_id
          FROM executions
          WHERE tenant_id = $1
            AND status = 'QUEUED'
            AND (next_retry_at IS NULL OR next_retry_at <= $4)
            AND ($2::text IS NULL OR agent_id = $2)
          ORDER BY created_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE executions e
        SET status = 'RUNNING',
            started_at = $4,
            updated_at = $4
        FROM queued
        WHERE e.tenant_id = $1
          AND e.execution_id = queued.execution_id
        RETURNING e.tenant_id, e.execution_id, e.agent_id, e.agent_version_id, e.correlation_id,
                  e.request_source, e.requested_by, e.subject_type, e.subject_id, e.status,
                  e.input_payload, e.output_payload, e.failure_class, e.failure_message, e.approval_request_id,
                  e.retry_count, e.max_retries, e.next_retry_at, e.dead_lettered_at,
                  e.started_at, e.completed_at, e.created_at, e.updated_at
        `,
        [args.tenantId, args.agentId ?? null, args.limit]
      )
    );

    return res.rows.map(mapExecutionRow);
  }

  async scheduleExecutionRetry(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    nextRetryAt: string;
    updatedAt?: string;
  }): Promise<ExecutionRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'QUEUED',
            failure_class = $3,
            failure_message = $4,
            retry_count = retry_count + 1,
            next_retry_at = $5,
            updated_at = $6
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, args.nextRetryAt, updatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async deadLetterExecution(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    deadLetteredAt?: string;
  }): Promise<ExecutionRecord> {
    const deadLetteredAt = args.deadLetteredAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'FAILED',
            failure_class = $3,
            failure_message = $4,
            dead_lettered_at = $5,
            completed_at = $5,
            updated_at = $5
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, deadLetteredAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async requeueExecution(args: {
    tenantId: string;
    executionId: string;
    updatedAt?: string;
  }): Promise<ExecutionRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'QUEUED',
            failure_class = NULL,
            failure_message = NULL,
            next_retry_at = NULL,
            dead_lettered_at = NULL,
            started_at = NULL,
            completed_at = NULL,
            updated_at = $3
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, updatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async failExecution(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    completedAt?: string;
  }): Promise<void> {
    const completedAt = args.completedAt ?? new Date().toISOString();
    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        UPDATE executions
        SET status = 'FAILED',
            failure_class = $3,
            failure_message = $4,
            completed_at = $5,
            updated_at = $5
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, completedAt]
      );
    });
  }

  async storeMemoryEntry(args: {
    tenantId: string;
    partitionId: string;
    agentId: AgentId;
    collection: string;
    entryKey: string;
    entryValue: Record<string, unknown>;
    classification: "owned" | "shared_policy";
    createdBy: string;
    createdAt?: string;
  }): Promise<MemoryEntryRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const memoryEntryId = buildScopedId("memory", [args.partitionId, args.collection, args.entryKey]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO agent_memory_entries (
          tenant_id, memory_entry_id, partition_id, agent_id, collection_name,
          entry_key, entry_value, classification, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, partition_id, collection_name, entry_key) DO UPDATE SET
          entry_value = EXCLUDED.entry_value,
          classification = EXCLUDED.classification,
          created_by = EXCLUDED.created_by,
          updated_at = EXCLUDED.updated_at
        `,
        [
          args.tenantId,
          memoryEntryId,
          args.partitionId,
          args.agentId,
          args.collection,
          args.entryKey,
          JSON.stringify(args.entryValue),
          args.classification,
          args.createdBy,
          createdAt,
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      memoryEntryId,
      partitionId: args.partitionId,
      agentId: args.agentId,
      collection: args.collection,
      entryKey: args.entryKey,
      entryValue: args.entryValue,
      classification: args.classification,
      createdBy: args.createdBy,
      createdAt,
      updatedAt: createdAt
    };
  }

  async listMemoryEntries(args: {
    tenantId: string;
    partitionId: string;
    collection?: string;
  }): Promise<MemoryEntryRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      return client.query<{
        tenant_id: string;
        memory_entry_id: string;
        partition_id: string;
        agent_id: AgentId;
        collection_name: string;
        entry_key: string;
        entry_value: Record<string, unknown>;
        classification: "owned" | "shared_policy";
        created_by: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
        SELECT tenant_id, memory_entry_id, partition_id, agent_id, collection_name, entry_key,
               entry_value, classification, created_by, created_at, updated_at
        FROM agent_memory_entries
        WHERE tenant_id = $1
          AND partition_id = $2
          AND ($3::text IS NULL OR collection_name = $3)
        ORDER BY updated_at DESC, entry_key ASC
        `,
        [args.tenantId, args.partitionId, args.collection ?? null]
      );
    });

    return res.rows.map((row) => ({
      tenantId: row.tenant_id,
      memoryEntryId: row.memory_entry_id,
      partitionId: row.partition_id,
      agentId: row.agent_id,
      collection: row.collection_name,
      entryKey: row.entry_key,
      entryValue: row.entry_value,
      classification: row.classification,
      createdBy: row.created_by,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    }));
  }

  async queueEvalRun(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    createdAt?: string;
  }): Promise<EvalRunRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const evalRunId = buildScopedId("eval", [args.agentId, args.suiteName, createdAt]);

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      await client.query(
        `
        INSERT INTO eval_runs (
          tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
          status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at, created_by, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', '{}'::jsonb, 0, 2, NULL, NULL, $6, $7, NULL)
        `,
        [args.tenantId, evalRunId, args.agentId, current.current_version_id, args.suiteName, args.createdBy, createdAt]
      );

      return {
        tenantId: args.tenantId,
        evalRunId,
        agentId: args.agentId,
        agentVersionId: current.current_version_id,
        suiteName: args.suiteName,
        status: "PENDING",
        scoreSummary: {},
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        createdBy: args.createdBy,
        createdAt,
        completedAt: null
      };
    });
  }

  async completeEvalRun(args: {
    tenantId: string;
    evalRunId: string;
    scoreSummary: Record<string, unknown>;
    scores: Array<{
      metric: string;
      score: number;
      thresholdMin?: number | null;
      thresholdMax?: number | null;
      passed: boolean;
      metadata?: Record<string, unknown>;
    }>;
    completedAt?: string;
  }): Promise<{ evalRun: EvalRunRecord; scores: EvalScoreRecord[] }> {
    const completedAt = args.completedAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const runRes = await client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'COMPLETED',
            score_summary = $3::jsonb,
            completed_at = $4
        WHERE tenant_id = $1
          AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, JSON.stringify(args.scoreSummary), completedAt]
      );

      const run = runRes.rows[0];
      if (!run) {
        throw new Error("eval_run_not_found");
      }

      const scoreRows: EvalScoreRecord[] = [];
      for (const score of args.scores) {
        const evalScoreId = buildScopedId("eval-score", [args.evalRunId, score.metric]);
        await client.query(
          `
          INSERT INTO eval_scores (
            tenant_id, eval_score_id, eval_run_id, metric, score,
            threshold_min, threshold_max, passed, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          ON CONFLICT (tenant_id, eval_score_id) DO UPDATE SET
            score = EXCLUDED.score,
            threshold_min = EXCLUDED.threshold_min,
            threshold_max = EXCLUDED.threshold_max,
            passed = EXCLUDED.passed,
            metadata = EXCLUDED.metadata
          `,
          [
            args.tenantId,
            evalScoreId,
            args.evalRunId,
            score.metric,
            score.score,
            score.thresholdMin ?? null,
            score.thresholdMax ?? null,
            score.passed,
            JSON.stringify(score.metadata ?? {}),
            completedAt
          ]
        );
        scoreRows.push({
          tenantId: args.tenantId,
          evalScoreId,
          evalRunId: args.evalRunId,
          metric: score.metric,
          score: score.score,
          thresholdMin: score.thresholdMin ?? null,
          thresholdMax: score.thresholdMax ?? null,
          passed: score.passed,
          metadata: score.metadata ?? {},
          createdAt: completedAt
        });
      }

      return {
        evalRun: mapEvalRunRow(run),
        scores: scoreRows
      };
    });
  }

  async claimPendingEvalRuns(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
  }): Promise<EvalRunRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        WITH queued AS (
          SELECT eval_run_id
          FROM eval_runs
          WHERE tenant_id = $1
            AND status = 'PENDING'
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND ($2::text IS NULL OR agent_id = $2)
          ORDER BY created_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE eval_runs e
        SET status = 'RUNNING'
        FROM queued
        WHERE e.tenant_id = $1
          AND e.eval_run_id = queued.eval_run_id
        RETURNING e.tenant_id, e.eval_run_id, e.agent_id, e.agent_version_id, e.suite_name,
                  e.status, e.score_summary, e.retry_count, e.max_retries, e.next_retry_at, e.dead_lettered_at,
                  e.created_by, e.created_at, e.completed_at
        `,
        [args.tenantId, args.agentId ?? null, args.limit]
      )
    );

    return res.rows.map(mapEvalRunRow);
  }

  async scheduleEvalRetry(args: {
    tenantId: string;
    evalRunId: string;
    nextRetryAt: string;
  }): Promise<EvalRunRecord> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'PENDING',
            retry_count = retry_count + 1,
            next_retry_at = $3
        WHERE tenant_id = $1 AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, args.nextRetryAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("eval_run_not_found");
    }

    return mapEvalRunRow(res.rows[0]);
  }

  async deadLetterEvalRun(args: {
    tenantId: string;
    evalRunId: string;
    deadLetteredAt?: string;
  }): Promise<EvalRunRecord> {
    const deadLetteredAt = args.deadLetteredAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'FAILED',
            dead_lettered_at = $3,
            completed_at = $3
        WHERE tenant_id = $1 AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, deadLetteredAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("eval_run_not_found");
    }

    return mapEvalRunRow(res.rows[0]);
  }
}
