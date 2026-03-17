export type NotificationType =
  | 'stale_critical_work'
  | 'blocked_recommendation'
  | 'founder_review_required'
  | 'high_priority_follow_through'
  | 'opportunity_signal'
  | 'noop';

export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationStatus = 'active' | 'acknowledged' | 'dismissed';

export type NotificationSourceType =
  | 'follow_through_record'
  | 'recommendation'
  | 'task'
  | 'founder_command'
  | 'contact'
  | 'account';

export type NotificationSourceRef = {
  sourceType: NotificationSourceType;
  sourceId: string;
};

export type NotificationRecord = {
  id: string;
  tenantId: string;
  source: NotificationSourceRef;
  notificationType: NotificationType;
  severity: NotificationSeverity;
  status: NotificationStatus;
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedRecommendationId: string | null;
  relatedTaskId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type NotificationDraft = Omit<NotificationRecord, 'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'acknowledgedAtIso' | 'dismissedAtIso'>;

export type NotificationFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type NotificationResult =
  | {
      ok: true;
      notification: NotificationRecord;
      replayed: boolean;
      message: string;
    }
  | NotificationFailureResult;

export type NotificationListResult =
  | {
      ok: true;
      notifications: NotificationRecord[];
      message: string;
    }
  | NotificationFailureResult;

export type NotificationAuditEventType =
  | 'aaliyah.notification.created'
  | 'aaliyah.notification.replayed'
  | 'aaliyah.notification.acknowledged'
  | 'aaliyah.notification.dismissed'
  | 'aaliyah.notification.noop';

export type NotificationAuditEvent = {
  eventType: NotificationAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type NotificationSourceBundle = {
  source: NotificationSourceRef;
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
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    updatedAt: string;
  } | null;
  sourceVersion: string;
};
