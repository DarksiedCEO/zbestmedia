export type FounderBriefKind = 'daily' | 'ad_hoc';
export type FounderBriefDeliveryStatus = 'not_sent' | 'sent';

export type FounderBriefSection =
  | 'immediate_founder_actions'
  | 'newly_resolved'
  | 'reopened_or_persisting'
  | 'high_value_opportunities'
  | 'strategic_watchlist'
  | 'execution_outcome_summary';

export type FounderBriefDeltaType =
  | 'new'
  | 'unchanged'
  | 'worsened'
  | 'improved'
  | 'resolved'
  | 'reopened'
  | 'suppressed';

export type FounderBriefHeadlineCounts = {
  immediateActions: number;
  resolved: number;
  reopenedOrPersisting: number;
  opportunities: number;
  watchlist: number;
};

export type FounderBriefSummary = {
  headline: string;
  generatedAtIso: string;
  previousBriefId: string | null;
  counts: FounderBriefHeadlineCounts;
  sectionOrder: FounderBriefSection[];
  notes: string[];
};

export type FounderBriefRecord = {
  id: string;
  tenantId: string;
  briefDate: string;
  briefKind: FounderBriefKind;
  generatedByFounderActorId: string;
  generatedAtIso: string;
  windowStartAtIso: string;
  windowEndAtIso: string;
  headline: string;
  summary: FounderBriefSummary;
  idempotencyKey: string;
  previousBriefId: string | null;
  deliveryStatus: FounderBriefDeliveryStatus;
  lastDispatchedAtIso: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
};

export type FounderBriefItemRecord = {
  id: string;
  tenantId: string;
  briefId: string;
  section: FounderBriefSection;
  queueItemId: string | null;
  canonicalIssueKey: string | null;
  operatorActionLogId: string | null;
  outcomeFeedbackId: string | null;
  priorityScore: number;
  deltaType: FounderBriefDeltaType;
  payload: Record<string, unknown>;
  createdAtIso: string;
};

export type FounderBriefDraft = {
  briefKind: FounderBriefKind;
  briefDate: string;
  windowStartAtIso: string;
  windowEndAtIso: string;
  headline: string;
  summary: FounderBriefSummary;
  idempotencyKey: string;
  previousBriefId: string | null;
  metadata: Record<string, unknown>;
  items: Array<Omit<FounderBriefItemRecord, 'id' | 'tenantId' | 'briefId' | 'createdAtIso'>>;
};

export type FounderBriefFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type FounderBriefResult =
  | {
      ok: true;
      brief: FounderBriefRecord;
      items: FounderBriefItemRecord[];
      replayed: boolean;
      message: string;
    }
  | FounderBriefFailureResult;

export type FounderBriefListResult =
  | {
      ok: true;
      briefs: FounderBriefRecord[];
      message: string;
    }
  | FounderBriefFailureResult;

export type FounderBriefAuditEventType =
  | 'aaliyah.founder_brief.generated'
  | 'aaliyah.founder_brief.replayed';

export type FounderBriefAuditEvent = {
  eventType: FounderBriefAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type FounderBriefSourceBundle = {
  generatedAtIso: string;
  briefDate: string;
  windowStartAtIso: string;
  windowEndAtIso: string;
  queueItems: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    queueItemType: string;
    priorityScore: number;
    priorityBand: 'critical' | 'high' | 'normal';
    status: string;
    title: string;
    summary: string;
    reason: string;
    canonicalIssueKey: string | null;
    actionableCommandType: string | null;
    actionableTargetType: string | null;
    actionableTargetId: string | null;
    issueState: string | null;
    lastOutcomeType: string | null;
    lastOutcomeStatus: string | null;
    lastOutcomeAtIso: string | null;
    relatedRecordIds: string[];
    relatedRecordTypes: string[];
    metadata: Record<string, unknown>;
    createdAtIso: string;
  }>;
  actionLogs: Array<{
    id: string;
    queueItemId: string;
    canonicalIssueKey: string | null;
    commandId: string | null;
    executionStatus: string;
    executedAtIso: string;
  }>;
  outcomes: Array<{
    id: string;
    queueItemId: string;
    canonicalIssueKey: string;
    outcomeType: string;
    outcomeStatus: string;
    reportedAtIso: string;
    sourceType: string;
    sourceId: string;
    notes: string | null;
  }>;
  issueStates: Array<{
    canonicalIssueKey: string;
    currentState: string;
    lastOutcomeType: string | null;
    lastOutcomeStatus: string | null;
    lastOutcomeAtIso: string | null;
    reopenCount: number;
    resolutionCount: number;
    metadata: {
      wasRecentlyRejected: boolean;
      wasRecentlyResolved: boolean;
      hasRepeatedFailure: boolean;
    };
  }>;
  strategicInsights: Array<{
    id: string;
    insightType: string;
    status: string;
    title: string;
    summary: string;
    reason: string;
    relatedRecordIds: string[];
    createdAtIso: string;
  }>;
  opportunities: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    opportunityType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
  }>;
  recommendations: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    recommendationType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
  }>;
  notifications: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    notificationType: string;
    severity: 'info' | 'warning' | 'critical';
    status: string;
    title: string;
    summary: string;
    reason: string;
    createdAtIso: string;
  }>;
  previousBrief: {
    brief: FounderBriefRecord;
    items: FounderBriefItemRecord[];
  } | null;
  sourceVersion: string;
};
