export type FollowThroughSourceType =
  | 'founder_command'
  | 'task'
  | 'gmail_draft'
  | 'calendar_event'
  | 'contact'
  | 'account';

export type FollowThroughDecisionType =
  | 'create_task'
  | 'queue_founder_review'
  | 'flag_stale'
  | 'record_blocked'
  | 'noop';

export type FollowThroughEvaluationStatus = 'eligible' | 'blocked' | 'stale' | 'noop';

export type FollowThroughPolicyKey =
  | 'FT-001-approved-draft-next-step'
  | 'FT-002-workflow-dependency-next-step'
  | 'FT-003-overdue-task-stale'
  | 'FT-004-event-linked-recap'
  | 'FT-005-rejected-intent-context';

export type FollowThroughSourceRef = {
  sourceType: FollowThroughSourceType;
  sourceId: string;
};

export type FollowThroughSuggestedTaskPayload = {
  title: string;
  description?: string;
  dueAtIso?: string;
  remindAtIso?: string;
  priority?: 'normal' | 'high' | 'critical';
  channel?: 'email' | 'call' | 'meeting' | 'internal';
  attachToTaskId?: string;
  attachToContactId?: string;
  attachToAccountId?: string;
  attachToDraftId?: string;
  attachToCalendarEventId?: string;
};

export type FollowThroughEngineRecord = {
  id: string;
  tenantId: string;
  source: FollowThroughSourceRef;
  policyKey: FollowThroughPolicyKey;
  decisionType: FollowThroughDecisionType;
  status: FollowThroughEvaluationStatus;
  reason: string;
  summary: string;
  idempotencyKey: string;
  createdArtifactIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  evaluatedAtIso: string;
};

export type FollowThroughEvaluationResult = FollowThroughEngineRecord;

export type FollowThroughEvaluationDraft = Omit<FollowThroughEngineRecord, "id" | "tenantId" | "createdAt" | "createdArtifactIds" | "auditEventId">;

export type FollowThroughEvaluateSuccessResult = {
  ok: true;
  record: FollowThroughEngineRecord;
  message: string;
};

export type FollowThroughDenialCode = 'ACCESS_DENIED' | 'INVALID_MODE';
export type FollowThroughErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export type FollowThroughFailureResult = {
  ok: false;
  denialCode: FollowThroughDenialCode | null;
  errorCode: FollowThroughErrorCode | null;
  retryable: boolean;
  message: string;
};

export type FollowThroughEvaluateResult = FollowThroughEvaluateSuccessResult | FollowThroughFailureResult;

export type FollowThroughListResult =
  | {
      ok: true;
      records: FollowThroughEngineRecord[];
      message: string;
    }
  | FollowThroughFailureResult;

export type NormalizedRejectedIntentContext = {
  eventId: string;
  requestId: string | null;
  commandId: string | null;
  commandType: string | null;
  targetType: string | null;
  targetId: string | null;
  signalKey: string;
  createdAt: string;
};

export type NormalizedFounderCommandContext = {
  commandId: string;
  commandType: string;
  targetType: string;
  targetId: string;
  executionStatus: 'executed' | 'noop';
  createdAt: string;
  executedAt: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type NormalizedTaskContext = {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  contactId: string | null;
  accountId: string | null;
  relatedEmailDraftId: string | null;
  relatedCalendarEventId: string | null;
  dueAt: string | null;
  remindAt: string | null;
  updatedAt: string;
  completedAt: string | null;
};

export type FollowThroughEvaluationInputs = {
  source: FollowThroughSourceRef;
  founderCommand: NormalizedFounderCommandContext | null;
  task: NormalizedTaskContext | null;
  linkedTask: NormalizedTaskContext | null;
  contactId: string | null;
  accountId: string | null;
  relatedEmailDraftId: string | null;
  relatedCalendarEventId: string | null;
  existingRecords: FollowThroughEngineRecord[];
  rejectedIntent: NormalizedRejectedIntentContext[];
  sourceVersion: string;
};

export type FollowThroughEngineAuditEventType =
  | 'aaliyah.follow_through.executed'
  | 'aaliyah.follow_through.blocked'
  | 'aaliyah.follow_through.stale'
  | 'aaliyah.follow_through.noop';

export type FollowThroughEngineAuditEvent = {
  eventType: FollowThroughEngineAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};
