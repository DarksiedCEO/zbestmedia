export type RecommendationType =
  | 'send_now'
  | 'follow_up_now'
  | 'review_blocked'
  | 'escalate_now'
  | 'revive_contact'
  | 'schedule_next'
  | 'noop';

export type RecommendationSourceType =
  | 'follow_through_record'
  | 'founder_command'
  | 'task'
  | 'gmail_draft'
  | 'calendar_event'
  | 'contact'
  | 'account';

export type RecommendationSourceRef = {
  sourceType: RecommendationSourceType;
  sourceId: string;
};

export type RecommendationStatus = 'active' | 'dismissed' | 'accepted' | 'noop';

export type RecommendationRecord = {
  id: string;
  tenantId: string;
  source: RecommendationSourceRef;
  recommendationType: RecommendationType;
  status: RecommendationStatus;
  reason: string;
  summary: string;
  idempotencyKey: string;
  relatedCommandId: string | null;
  relatedTaskId: string | null;
  metadata: Record<string, unknown>;
  auditEventId: string | null;
  createdAtIso: string;
  evaluatedAtIso: string;
};

export type RecommendationEvaluationResult = {
  ok: true;
  recommendation: RecommendationRecord;
  replayed: boolean;
  message: string;
};

export type RecommendationDenialCode = 'ACCESS_DENIED' | 'INVALID_MODE';
export type RecommendationErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export type RecommendationFailureResult = {
  ok: false;
  denialCode: RecommendationDenialCode | null;
  errorCode: RecommendationErrorCode | null;
  retryable: boolean;
  message: string;
};

export type RecommendationResult = RecommendationEvaluationResult | RecommendationFailureResult;
export type RecommendationListResult =
  | { ok: true; recommendations: RecommendationRecord[]; message: string }
  | RecommendationFailureResult;

export type RecommendationDraft = Omit<RecommendationRecord, 'id' | 'tenantId' | 'createdAtIso' | 'auditEventId'>;

export type RecommendationAuditEventType =
  | 'aaliyah.recommendation.created'
  | 'aaliyah.recommendation.replayed'
  | 'aaliyah.recommendation.noop';

export type RecommendationAuditEvent = {
  eventType: RecommendationAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type RecommendationSourceBundle = {
  source: RecommendationSourceRef;
  followThroughRecord: {
    id: string;
    policyKey: string;
    decisionType: string;
    status: string;
    summary: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdArtifactIds: string[];
    evaluatedAtIso: string;
  } | null;
  founderCommand: {
    id: string;
    commandType: string;
    targetType: string;
    targetId: string;
    executionStatus: string;
    metadata: Record<string, unknown>;
    executedAt: string | null;
    createdAt: string;
  } | null;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    source: string;
    contactId: string | null;
    accountId: string | null;
    relatedEmailDraftId: string | null;
    relatedCalendarEventId: string | null;
    dueAt: string | null;
    updatedAt: string;
  } | null;
  contact: {
    id: string;
    relationshipStage: string;
    lastTouchedAt: string | null;
    accountId: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  account: {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
  } | null;
  openTasksForContact: Array<{ id: string; status: string }>;
  diagnosticsHints: Array<{ eventId: string; eventType: string; signalKey: string; createdAt: string }>;
  sourceVersion: string;
};
