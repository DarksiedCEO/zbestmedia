export type DigestType = 'daily_founder_digest' | 'weekly_founder_brief' | 'critical_digest';
export type DigestStatus = 'composed' | 'sent' | 'skipped' | 'replayed';

export type DigestRecord = {
  id: string;
  tenantId: string;
  digestType: DigestType;
  digestStatus: DigestStatus;
  title: string;
  summary: string;
  bodyText: string;
  idempotencyKey: string;
  relatedNotificationIds: string[];
  relatedOpportunityIds: string[];
  relatedInsightIds: string[];
  relatedRecommendationIds: string[];
  relatedFollowThroughIds: string[];
  deliveryRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  composedAtIso: string;
  sentAtIso: string | null;
};

export type DigestWindowKey = string;

export type DigestSourceBundle = {
  generatedAtIso: string;
  strategicInsights: Array<{
    id: string;
    insightType: string;
    title: string;
    summary: string;
    reason: string;
    status: string;
  }>;
  notifications: Array<{
    id: string;
    notificationType: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    summary: string;
    reason: string;
    status: string;
  }>;
  opportunities: Array<{
    id: string;
    opportunityType: string;
    summary: string;
    reason: string;
    status: string;
  }>;
  recommendations: Array<{
    id: string;
    recommendationType: string;
    summary: string;
    reason: string;
    status: string;
  }>;
  followThroughRecords: Array<{
    id: string;
    decisionType: string;
    status: string;
    summary: string;
    reason: string;
  }>;
};

export type DigestCompositionDraft = {
  digestType: DigestType;
  digestStatus: DigestStatus;
  title: string;
  summary: string;
  bodyText: string;
  idempotencyKey: string;
  windowKey: DigestWindowKey;
  relatedNotificationIds: string[];
  relatedOpportunityIds: string[];
  relatedInsightIds: string[];
  relatedRecommendationIds: string[];
  relatedFollowThroughIds: string[];
  metadata: Record<string, unknown>;
  composedAtIso: string;
};

export type DigestAuditEvent = {
  eventType:
    | 'aaliyah.digest.composed'
    | 'aaliyah.digest.sent'
    | 'aaliyah.digest.replayed'
    | 'aaliyah.digest.skipped';
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type DigestFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type DigestResult =
  | {
      ok: true;
      digest: DigestRecord;
      replayed: boolean;
      message: string;
    }
  | DigestFailureResult;

export type DigestListResult =
  | {
      ok: true;
      digests: DigestRecord[];
      message: string;
    }
  | DigestFailureResult;
