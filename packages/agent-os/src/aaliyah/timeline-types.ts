export type TimelineEventType =
  | 'queue_item_created'
  | 'queue_item_refreshed'
  | 'queue_item_suppressed'
  | 'queue_item_executed'
  | 'operator_action_failed'
  | 'outcome_recorded'
  | 'issue_resolved'
  | 'issue_reopened'
  | 'brief_generated'
  | 'recommendation_rejected'
  | 'opportunity_converted'
  | 'escalation_persisting';

export type TimelineDecisionClass =
  | 'attention'
  | 'execution'
  | 'outcome'
  | 'briefing'
  | 'resolution'
  | 'suppression';

export type TimelineSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type TimelineSourceType =
  | 'operator_queue'
  | 'operator_action'
  | 'outcome_feedback'
  | 'issue_state'
  | 'founder_brief';

export type TimelineEventRecord = {
  id: string;
  tenantId: string;
  eventType: TimelineEventType;
  eventAtIso: string;
  canonicalIssueKey: string | null;
  queueItemId: string | null;
  operatorActionLogId: string | null;
  outcomeFeedbackId: string | null;
  briefId: string | null;
  sourceType: TimelineSourceType;
  sourceId: string;
  decisionClass: TimelineDecisionClass;
  severity: TimelineSeverity;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAtIso: string;
};

export type TimelineEventDraft = Omit<TimelineEventRecord, 'id' | 'tenantId' | 'createdAtIso'>;

export type TimelineFilters = {
  windowStartAtIso?: string;
  windowEndAtIso?: string;
  eventTypes?: TimelineEventType[];
  decisionClass?: TimelineDecisionClass;
  severity?: TimelineSeverity;
  canonicalIssueKey?: string;
  queueItemId?: string;
  briefId?: string;
  limit?: number;
};

export type TimelineFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type TimelineListResult =
  | {
      ok: true;
      events: TimelineEventRecord[];
      generatedCount: number;
      replayedCount: number;
      message: string;
    }
  | TimelineFailureResult;

export type TimelineDetailResult =
  | {
      ok: true;
      event: TimelineEventRecord;
      message: string;
    }
  | TimelineFailureResult;

export type TimelineAuditEventType =
  | 'aaliyah.timeline.composed'
  | 'aaliyah.timeline.replayed';

export type TimelineAuditEvent = {
  eventType: TimelineAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type TimelineSourceBundle = {
  queueItems: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    queueItemType: string;
    priorityScore: number;
    priorityBand: 'critical' | 'high' | 'normal';
    status: string;
    canonicalIssueKey: string | null;
    supersededByQueueItemId: string | null;
    title: string;
    summary: string;
    reason: string;
    actionableCommandType: string | null;
    actionableTargetType: string | null;
    actionableTargetId: string | null;
    metadata: Record<string, unknown>;
    createdAtIso: string;
    evaluatedAtIso: string;
    lastRefreshedAtIso: string | null;
    lastExecutedAtIso: string | null;
    issueState: string | null;
    lastOutcomeType: string | null;
    lastOutcomeStatus: string | null;
    lastOutcomeAtIso: string | null;
  }>;
  actionLogs: Array<{
    id: string;
    queueItemId: string;
    canonicalIssueKey: string | null;
    commandId: string | null;
    executionStatus: string;
    failureCode: string | null;
    failureReason: string | null;
    executedAtIso: string;
  }>;
  outcomes: Array<{
    id: string;
    queueItemId: string;
    operatorActionLogId: string | null;
    commandId: string | null;
    canonicalIssueKey: string;
    sourceType: string;
    sourceId: string;
    outcomeType: string;
    outcomeStatus: string;
    reasonCode: string | null;
    notes: string | null;
    reportedAtIso: string;
  }>;
  issueStates: Array<{
    canonicalIssueKey: string;
    currentState: string;
    lastOutcomeType: string | null;
    lastOutcomeStatus: string | null;
    lastQueueItemId: string | null;
    lastOperatorActionLogId: string | null;
    lastCommandId: string | null;
    lastUpdatedAtIso: string;
    lastOutcomeAtIso: string | null;
    reopenCount: number;
    resolutionCount: number;
    metadata: Record<string, unknown>;
  }>;
  briefs: Array<{
    id: string;
    briefDate: string;
    briefKind: string;
    headline: string;
    summary: Record<string, unknown>;
    generatedAtIso: string;
    items: Array<{
      id: string;
      section: string;
      queueItemId: string | null;
      canonicalIssueKey: string | null;
      operatorActionLogId: string | null;
      outcomeFeedbackId: string | null;
      priorityScore: number;
      deltaType: string;
      payload: Record<string, unknown>;
      createdAtIso: string;
    }>;
  }>;
  sourceVersion: string;
};
