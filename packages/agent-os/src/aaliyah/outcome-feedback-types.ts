import type { OperatorQueueSourceType } from './operator-queue-types.js';

export type OutcomeFeedbackType =
  | 'issue_resolved'
  | 'issue_unresolved'
  | 'issue_reopened'
  | 'opportunity_converted'
  | 'opportunity_lost'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'escalation_cleared'
  | 'escalation_persisting'
  | 'action_failed_downstream'
  | 'action_deferred';

export type OutcomeFeedbackStatus = 'confirmed' | 'partial' | 'rejected' | 'needs_follow_through';
export type CanonicalIssueState = 'open' | 'in_progress' | 'resolved' | 'unresolved' | 'reopened' | 'dismissed';

export type OutcomeFeedbackRecord = {
  id: string;
  tenantId: string;
  queueItemId: string;
  operatorActionLogId: string | null;
  commandId: string | null;
  canonicalIssueKey: string;
  sourceType: OperatorQueueSourceType;
  sourceId: string;
  outcomeType: OutcomeFeedbackType;
  outcomeStatus: OutcomeFeedbackStatus;
  reasonCode: string | null;
  notes: string | null;
  reportedByFounderActorId: string;
  reportedAtIso: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  createdAtIso: string;
};

export type IssueStateRecord = {
  tenantId: string;
  canonicalIssueKey: string;
  currentState: CanonicalIssueState;
  lastOutcomeType: OutcomeFeedbackType | null;
  lastOutcomeStatus: OutcomeFeedbackStatus | null;
  lastQueueItemId: string | null;
  lastOperatorActionLogId: string | null;
  lastCommandId: string | null;
  lastUpdatedAtIso: string;
  lastOutcomeAtIso: string | null;
  reopenCount: number;
  resolutionCount: number;
  metadata: {
    lastReasonCode: string | null;
    wasRecentlyRejected: boolean;
    wasRecentlyResolved: boolean;
    hasRepeatedFailure: boolean;
  };
};

export type OutcomeFeedbackSignals = {
  lastOutcomeAtIso: string;
  lastOutcomeType: OutcomeFeedbackType;
  lastOutcomeStatus: OutcomeFeedbackStatus;
  reopenCount: number;
  resolutionCount: number;
  wasRecentlyRejected: boolean;
  wasRecentlyResolved: boolean;
  hasRepeatedFailure: boolean;
};

export type RecordOutcomeFeedbackRequest = {
  queueItemId: string;
  operatorActionLogId: string | null;
  outcomeType: OutcomeFeedbackType;
  outcomeStatus: OutcomeFeedbackStatus;
  reasonCode?: string | null;
  notes?: string | null;
  idempotencyKey: string;
  reportedAtIso?: string;
};

export type OutcomeFeedbackFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type OutcomeFeedbackWriteResult =
  | {
      ok: true;
      outcome: OutcomeFeedbackRecord;
      issueState: IssueStateRecord;
      replayed: boolean;
      message: string;
    }
  | OutcomeFeedbackFailureResult;

export type OutcomeFeedbackDetailResult =
  | {
      ok: true;
      outcome: OutcomeFeedbackRecord;
      issueState: IssueStateRecord | null;
      message: string;
    }
  | OutcomeFeedbackFailureResult;

export type OutcomeFeedbackListResult =
  | {
      ok: true;
      outcomes: OutcomeFeedbackRecord[];
      issueState: IssueStateRecord | null;
      message: string;
    }
  | OutcomeFeedbackFailureResult;

export type OutcomeFeedbackAuditEventType =
  | 'aaliyah.outcome_feedback.recorded'
  | 'aaliyah.outcome_feedback.replayed'
  | 'aaliyah.outcome_feedback.rejected';

export type OutcomeFeedbackAuditEvent = {
  eventType: OutcomeFeedbackAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type OutcomeFeedbackLineage = {
  queueItem: {
    id: string;
    tenantId: string;
    canonicalIssueKey: string | null;
    sourceType: OperatorQueueSourceType;
    sourceId: string;
    status: string;
    actionableCommandType: string | null;
  };
  operatorActionLog: {
    id: string;
    queueItemId: string;
    commandId: string | null;
    executionStatus: string;
    canonicalIssueKey: string | null;
  } | null;
  command: {
    id: string;
    commandType: string;
    targetType: string;
    targetId: string;
    executionStatus: string;
  } | null;
  issueState: IssueStateRecord | null;
};

export type OutcomeFeedbackResolution = {
  currentState: CanonicalIssueState;
  reopenCount: number;
  resolutionCount: number;
  signals: OutcomeFeedbackSignals;
};
