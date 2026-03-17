export type OpportunityType =
  | 'dormant_contact'
  | 'stalled_pipeline'
  | 'missed_follow_up_window'
  | 'engagement_spike'
  | 'recurring_block_pattern'
  | 'noop';

export type OpportunitySourceType =
  | 'contact'
  | 'account'
  | 'task'
  | 'calendar_event'
  | 'follow_through_record'
  | 'recommendation'
  | 'founder_command';

export type OpportunitySourceRef = {
  sourceType: OpportunitySourceType;
  sourceId: string;
};

export type OpportunityStatus = 'active' | 'acknowledged' | 'converted' | 'dismissed' | 'noop';

export type OpportunityRecord = {
  id: string;
  tenantId: string;
  source: OpportunitySourceRef;
  opportunityType: OpportunityType;
  status: OpportunityStatus;
  reason: string;
  summary: string;
  idempotencyKey: string;
  relatedTaskId: string | null;
  relatedRecommendationId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type OpportunityDraft = Omit<OpportunityRecord, 'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'acknowledgedAtIso' | 'dismissedAtIso'>;

export type OpportunityFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type OpportunityResult =
  | {
      ok: true;
      opportunity: OpportunityRecord;
      replayed: boolean;
      message: string;
    }
  | OpportunityFailureResult;

export type OpportunityListResult =
  | {
      ok: true;
      opportunities: OpportunityRecord[];
      message: string;
    }
  | OpportunityFailureResult;

export type OpportunityAuditEventType =
  | 'aaliyah.opportunity.created'
  | 'aaliyah.opportunity.replayed'
  | 'aaliyah.opportunity.acknowledged'
  | 'aaliyah.opportunity.dismissed'
  | 'aaliyah.opportunity.noop';

export type OpportunityAuditEvent = {
  eventType: OpportunityAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type OpportunitySourceBundle = {
  source: OpportunitySourceRef;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    relationshipStage: string;
    status: string;
    accountId: string | null;
    lastTouchedAt: string | null;
    nextActionAt: string | null;
    updatedAt: string;
  } | null;
  account: {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
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
  followThroughRecord: {
    id: string;
    policyKey: string;
    decisionType: string;
    status: string;
    reason: string;
    summary: string;
    metadata: Record<string, unknown>;
    createdArtifactIds: string[];
    evaluatedAtIso: string;
  } | null;
  recommendation: {
    id: string;
    recommendationType: string;
    status: string;
    reason: string;
    summary: string;
    relatedTaskId: string | null;
    metadata: Record<string, unknown>;
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
  openTasksForContact: Array<{ id: string; status: string; priority: string; dueAt: string | null; updatedAt: string }>;
  openTasksForAccount: Array<{ id: string; status: string; priority: string; dueAt: string | null; updatedAt: string }>;
  activeFollowThrough: Array<{ id: string; status: string; policyKey: string; sourceType: string; sourceId: string; metadata: Record<string, unknown> }>;
  activeRecommendations: Array<{ id: string; type: string; status: string; relatedTaskId: string | null; metadata: Record<string, unknown> }>;
  diagnosticsHints: Array<{ eventId: string; eventType: string; signalKey: string; createdAt: string; payload: Record<string, unknown> }>;
  sourceVersion: string;
};
