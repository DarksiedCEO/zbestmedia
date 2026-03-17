export type EscalationType =
  | 'stale_critical_escalation'
  | 'blocked_pattern_escalation'
  | 'cluster_pressure_escalation'
  | 'missed_follow_up_escalation'
  | 'attention_overload_escalation'
  | 'noop';

export type EscalationStatus = 'active' | 'acknowledged' | 'dismissed' | 'resolved';
export type EscalationLevel = 'warning' | 'high' | 'critical';
export type EscalationSourceRecordType =
  | 'notification'
  | 'recommendation'
  | 'opportunity'
  | 'strategic_insight'
  | 'coalesced_signal'
  | 'follow_through_record';

export type EscalationRecord = {
  id: string;
  tenantId: string;
  escalationType: EscalationType;
  status: EscalationStatus;
  title: string;
  summary: string;
  reason: string;
  escalationLevel: EscalationLevel;
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: EscalationSourceRecordType[];
  relatedClusterId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
  resolvedAtIso: string | null;
};

export type EscalationDraft = Omit<
  EscalationRecord,
  'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'acknowledgedAtIso' | 'dismissedAtIso' | 'resolvedAtIso'
>;

export type EscalationFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type EscalationResult =
  | {
      ok: true;
      escalations: EscalationRecord[];
      replayedCount: number;
      message: string;
    }
  | EscalationFailureResult;

export type EscalationListResult =
  | {
      ok: true;
      escalations: EscalationRecord[];
      message: string;
    }
  | EscalationFailureResult;

export type EscalationDetailResult =
  | {
      ok: true;
      escalation: EscalationRecord;
      message: string;
    }
  | EscalationFailureResult;

export type EscalationAuditEventType =
  | 'aaliyah.escalation.created'
  | 'aaliyah.escalation.replayed'
  | 'aaliyah.escalation.acknowledged'
  | 'aaliyah.escalation.dismissed'
  | 'aaliyah.escalation.resolved'
  | 'aaliyah.escalation.noop';

export type EscalationAuditEvent = {
  eventType: EscalationAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type EscalationSourceBundle = {
  notifications: Array<{
    id: string;
    notificationType: string;
    severity: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    relatedRecordIds: string[];
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  recommendations: Array<{
    id: string;
    recommendationType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    relatedRecordIds: string[];
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  opportunities: Array<{
    id: string;
    opportunityType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    relatedRecordIds: string[];
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  strategicInsights: Array<{
    id: string;
    insightType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    relatedRecordIds: string[];
    metadata: Record<string, unknown>;
  }>;
  coalescedSignals: Array<{
    id: string;
    signalType: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    contributingCount: number;
    sourceRecordIds: string[];
    sourceRecordTypes: EscalationSourceRecordType[];
    metadata: Record<string, unknown>;
  }>;
  followThroughRecords: Array<{
    id: string;
    status: string;
    summary: string;
    reason: string;
    createdAtIso: string;
    ageHours: number;
    clusterEntityId: string;
    relatedRecordIds: string[];
    policyKey: string;
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  sourceVersion: string;
};
