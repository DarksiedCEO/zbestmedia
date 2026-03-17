export type StrategicInsightType =
  | 'attention_priority'
  | 'blocked_pattern'
  | 'follow_through_gap'
  | 'opportunity_cluster'
  | 'execution_bottleneck'
  | 'daily_brief'
  | 'weekly_brief'
  | 'noop';

export type StrategicInsightStatus = 'active' | 'superseded' | 'acknowledged' | 'dismissed';

export type StrategicIntelligenceEvaluationScope = 'current' | 'daily' | 'weekly';

export type StrategicInsightRecord = {
  id: string;
  tenantId: string;
  insightType: StrategicInsightType;
  status: StrategicInsightStatus;
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedEntityIds: string[];
  relatedRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type StrategicInsightDraft = Omit<
  StrategicInsightRecord,
  'id' | 'tenantId' | 'auditEventId' | 'createdAtIso' | 'acknowledgedAtIso' | 'dismissedAtIso'
>;

export type StrategicInsightFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type StrategicInsightResult =
  | {
      ok: true;
      insights: StrategicInsightRecord[];
      replayedCount: number;
      message: string;
    }
  | StrategicInsightFailureResult;

export type StrategicInsightListResult =
  | {
      ok: true;
      insights: StrategicInsightRecord[];
      message: string;
    }
  | StrategicInsightFailureResult;

export type StrategicInsightDetailResult =
  | {
      ok: true;
      insight: StrategicInsightRecord;
      message: string;
    }
  | StrategicInsightFailureResult;

export type StrategicIntelligenceAuditEventType =
  | 'aaliyah.strategic_insight.created'
  | 'aaliyah.strategic_insight.replayed'
  | 'aaliyah.strategic_insight.acknowledged'
  | 'aaliyah.strategic_insight.dismissed'
  | 'aaliyah.strategic_insight.noop';

export type StrategicIntelligenceAuditEvent = {
  eventType: StrategicIntelligenceAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type StrategicIntelligenceSourceBundle = {
  scope: StrategicIntelligenceEvaluationScope;
  notifications: Array<{
    id: string;
    type: string;
    severity: string;
    status: string;
    sourceType: string;
    sourceId: string;
    summary: string;
    reason: string;
    relatedRecommendationId: string | null;
    relatedTaskId: string | null;
    acknowledgedAtIso: string | null;
    createdAtIso: string;
  }>;
  recommendations: Array<{
    id: string;
    type: string;
    status: string;
    sourceType: string;
    sourceId: string;
    summary: string;
    reason: string;
    relatedCommandId: string | null;
    relatedTaskId: string | null;
    metadata: Record<string, unknown>;
    createdAtIso: string;
  }>;
  opportunities: Array<{
    id: string;
    type: string;
    status: string;
    sourceType: string;
    sourceId: string;
    summary: string;
    reason: string;
    relatedTaskId: string | null;
    relatedRecommendationId: string | null;
    metadata: Record<string, unknown>;
    createdAtIso: string;
  }>;
  followThroughRecords: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    policyKey: string;
    decisionType: string;
    status: string;
    summary: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdArtifactIds: string[];
    createdAtIso: string;
  }>;
  founderCommands: Array<{
    id: string;
    commandType: string;
    targetType: string;
    targetId: string;
    executionStatus: string;
    summary: string;
    metadata: Record<string, unknown>;
    executedAtIso: string | null;
    createdAtIso: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    source: string;
    contactId: string | null;
    accountId: string | null;
    relatedEmailDraftId: string | null;
    relatedCalendarEventId: string | null;
    dueAtIso: string | null;
    updatedAtIso: string;
  }>;
  diagnostics: Array<{
    eventId: string;
    eventType: string;
    signalKey: string;
    createdAtIso: string;
    payload: Record<string, unknown>;
  }>;
  sourceVersion: string;
};
