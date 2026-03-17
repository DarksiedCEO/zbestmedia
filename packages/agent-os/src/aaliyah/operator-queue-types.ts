export type OperatorQueueSourceType =
  | 'escalation'
  | 'coalesced_signal'
  | 'strategic_insight'
  | 'notification'
  | 'recommendation'
  | 'opportunity';

export type OperatorQueueItemType =
  | 'immediate_action'
  | 'review_required'
  | 'watch_item'
  | 'summary_item';

export type OperatorQueuePriorityBand = 'critical' | 'high' | 'normal';

export type OperatorQueueStatus =
  | 'active'
  | 'suppressed'
  | 'executed'
  | 'invalidated'
  | 'superseded';

export type OperatorQueueActionableCommandType =
  | 'approve_draft'
  | 'create_follow_up'
  | 'escalate_task'
  | 'override_schedule'
  | 'trigger_workflow';

export type OperatorQueueActionableTargetType =
  | 'gmail_draft'
  | 'task'
  | 'calendar_event'
  | 'contact'
  | 'account'
  | 'workflow';

export type OperatorQueueRecord = {
  id: string;
  tenantId: string;
  sourceType: OperatorQueueSourceType;
  sourceId: string;
  queueItemType: OperatorQueueItemType;
  priorityScore: number;
  priorityBand: OperatorQueuePriorityBand;
  status: OperatorQueueStatus;
  rankingVersion: number;
  staleAfterAtIso: string;
  canonicalIssueKey: string | null;
  supersededByQueueItemId: string | null;
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedRecordIds: string[];
  relatedRecordTypes: string[];
  actionableCommandType: OperatorQueueActionableCommandType | null;
  actionableTargetType: OperatorQueueActionableTargetType | null;
  actionableTargetId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  lastRefreshedAtIso: string | null;
  lastExecutedAtIso: string | null;
};

export type OperatorQueueDraft = Omit<
  OperatorQueueRecord,
  'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'lastRefreshedAtIso' | 'lastExecutedAtIso'
>;

export type OperatorQueueFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type OperatorQueueResult =
  | {
      ok: true;
      queueItems: OperatorQueueRecord[];
      replayedCount: number;
      suppressedCount: number;
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueListResult =
  | {
      ok: true;
      queueItems: OperatorQueueRecord[];
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueDetailResult =
  | {
      ok: true;
      queueItem: OperatorQueueRecord;
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueTopResult =
  | {
      ok: true;
      immediateActions: OperatorQueueRecord[];
      topQueueItems: OperatorQueueRecord[];
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueRefreshResult =
  | {
      ok: true;
      queueItem: OperatorQueueRecord;
      refreshed: boolean;
      invalidated: boolean;
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueRefreshAllResult =
  | {
      ok: true;
      refreshedCount: number;
      invalidatedCount: number;
      queueItems: OperatorQueueRecord[];
      message: string;
    }
  | OperatorQueueFailureResult;

export type OperatorQueueAuditEventType =
  | 'aaliyah.operator_queue.created'
  | 'aaliyah.operator_queue.replayed'
  | 'aaliyah.operator_queue.noop'
  | 'aaliyah.operator_queue.refreshed'
  | 'aaliyah.operator_queue.invalidated'
  | 'aaliyah.operator_queue.suppressed';

export type OperatorQueueAuditEvent = {
  eventType: OperatorQueueAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type OperatorQueueComparableRecord = {
  id: string;
  sourceType: OperatorQueueSourceType;
  title: string;
  summary: string;
  reason: string;
  status: string;
  clusterKey: string;
  semanticTag: 'attention' | 'blocked' | 'opportunity' | 'summary' | 'watch';
  severityScore: number;
  priorityHint: 'critical' | 'high' | 'normal';
  relatedRecordIds: string[];
  relatedRecordTypes: string[];
  actionableCommandType: OperatorQueueActionableCommandType | null;
  actionableTargetType: OperatorQueueActionableTargetType | null;
  actionableTargetId: string | null;
  createdAtIso: string;
  metadata: Record<string, unknown>;
};

export type OperatorQueueSourceBundle = {
  escalations: OperatorQueueComparableRecord[];
  coalescedSignals: OperatorQueueComparableRecord[];
  strategicInsights: OperatorQueueComparableRecord[];
  notifications: OperatorQueueComparableRecord[];
  recommendations: OperatorQueueComparableRecord[];
  opportunities: OperatorQueueComparableRecord[];
  sourceVersion: string;
};
