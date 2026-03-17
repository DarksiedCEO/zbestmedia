export type CoalescedSignalType =
  | 'blocked_execution_cluster'
  | 'follow_up_gap_cluster'
  | 'opportunity_cluster'
  | 'attention_cluster'
  | 'noop';

export type CoalescedSignalStatus = 'active' | 'acknowledged' | 'dismissed' | 'resolved';

export type CoalescedSourceRecordType =
  | 'notification'
  | 'recommendation'
  | 'opportunity'
  | 'strategic_insight'
  | 'follow_through_record';

export type CoalescedSignalRecord = {
  id: string;
  tenantId: string;
  signalType: CoalescedSignalType;
  status: CoalescedSignalStatus;
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: CoalescedSourceRecordType[];
  dominantSourceType: CoalescedSourceRecordType;
  suppressedRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type CoalescedSignalDraft = Omit<
  CoalescedSignalRecord,
  'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'acknowledgedAtIso' | 'dismissedAtIso'
>;

export type CoalescedSignalFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type CoalescedSignalResult =
  | {
      ok: true;
      signals: CoalescedSignalRecord[];
      replayedCount: number;
      message: string;
    }
  | CoalescedSignalFailureResult;

export type CoalescedSignalListResult =
  | {
      ok: true;
      signals: CoalescedSignalRecord[];
      message: string;
    }
  | CoalescedSignalFailureResult;

export type CoalescedSignalDetailResult =
  | {
      ok: true;
      signal: CoalescedSignalRecord;
      message: string;
    }
  | CoalescedSignalFailureResult;

export type CoalescingAuditEventType =
  | 'aaliyah.signal_coalescing.created'
  | 'aaliyah.signal_coalescing.replayed'
  | 'aaliyah.signal_coalescing.acknowledged'
  | 'aaliyah.signal_coalescing.dismissed'
  | 'aaliyah.signal_coalescing.noop';

export type CoalescingAuditEvent = {
  eventType: CoalescingAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type CoalescedSignalSourceRecord = {
  id: string;
  recordType: CoalescedSourceRecordType;
  sourceType: string;
  sourceId: string;
  status: string;
  semanticTag: 'blocked' | 'follow_up_gap' | 'opportunity' | 'attention';
  severityScore: number;
  summary: string;
  reason: string;
  relatedRecordIds: string[];
  metadata: Record<string, unknown>;
  createdAtIso: string;
  clusterKey: string;
  timeBucket: string;
};

export type CoalescedSignalSourceBundle = {
  records: CoalescedSignalSourceRecord[];
  sourceVersion: string;
};
