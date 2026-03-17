import type { FounderBriefingMode } from './briefing-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';
import { AaliyahFounderPreferencesResolver } from './founder-preferences-resolver.js';
import type { EscalationSourceBundle } from './escalation-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function clusterEntityId(args: {
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  relatedIds?: string[];
}) {
  return [
    typeof args.metadata.accountId === 'string' ? args.metadata.accountId : null,
    typeof args.metadata.contactId === 'string' ? args.metadata.contactId : null,
    typeof args.metadata.targetId === 'string' ? args.metadata.targetId : null,
    typeof args.metadata.clusterEntityId === 'string' ? args.metadata.clusterEntityId : null,
    typeof args.metadata.linkedTaskId === 'string' ? args.metadata.linkedTaskId : null,
    ...(args.relatedIds ?? []),
    args.sourceId,
    args.sourceType
  ].find((value): value is string => Boolean(value)) ?? `${args.sourceType}:${args.sourceId}`;
}

function elapsedHours(createdAtIso: string, generatedAt: string) {
  return Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(createdAtIso)) / 3_600_000));
}

function buildNotificationRecords(
  notifications: Awaited<ReturnType<AgentOsRepository['listNotifications']>>,
  generatedAt: string
): EscalationSourceBundle['notifications'] {
  return notifications
    .filter((item) => item.status === 'active' && item.notificationType !== 'noop')
    .map((item) => {
      const metadata = asRecord(item.metadata);
      return {
        id: item.id,
        notificationType: item.notificationType,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        severity: item.severity,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso,
        ageHours: elapsedHours(item.createdAtIso, generatedAt),
        clusterEntityId: clusterEntityId({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value))
        }),
        relatedRecordIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value)),
        metadata
      };
    });
}

function buildRecommendationRecords(
  recommendations: Awaited<ReturnType<AgentOsRepository['listRecommendations']>>,
  generatedAt: string
): EscalationSourceBundle['recommendations'] {
  return recommendations
    .filter((item) => item.status === 'active' && item.recommendationType !== 'noop')
    .map((item) => {
      const metadata = asRecord(item.metadata);
      return {
        id: item.id,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        recommendationType: item.recommendationType,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso,
        ageHours: elapsedHours(item.createdAtIso, generatedAt),
        clusterEntityId: clusterEntityId({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedTaskId, item.relatedCommandId].filter((value): value is string => Boolean(value))
        }),
        relatedRecordIds: [item.relatedTaskId, item.relatedCommandId].filter((value): value is string => Boolean(value)),
        metadata
      };
    });
}

function buildOpportunityRecords(
  opportunities: Awaited<ReturnType<AgentOsRepository['listOpportunities']>>,
  generatedAt: string
): EscalationSourceBundle['opportunities'] {
  return opportunities
    .filter((item) => item.status === 'active' && item.opportunityType !== 'noop')
    .map((item) => {
      const metadata = asRecord(item.metadata);
      return {
        id: item.id,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        opportunityType: item.opportunityType,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso,
        ageHours: elapsedHours(item.createdAtIso, generatedAt),
        clusterEntityId: clusterEntityId({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value))
        }),
        relatedRecordIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value)),
        metadata
      };
    });
}

function buildStrategicInsightRecords(
  insights: Awaited<ReturnType<AgentOsRepository['listStrategicInsights']>>,
  generatedAt: string
): EscalationSourceBundle['strategicInsights'] {
  return insights
    .filter((item) => item.status === 'active' && item.insightType !== 'noop')
    .map((item) => ({
      id: item.id,
      insightType: item.insightType,
      status: item.status,
      summary: item.summary,
      reason: item.reason,
      createdAtIso: item.createdAtIso,
      ageHours: elapsedHours(item.createdAtIso, generatedAt),
      clusterEntityId: item.relatedEntityIds[0] ?? item.relatedRecordIds[0] ?? item.id,
      relatedRecordIds: item.relatedRecordIds,
      metadata: asRecord(item.metadata)
    }));
}

function buildCoalescedSignalRecords(
  signals: Awaited<ReturnType<AgentOsRepository['listCoalescedSignals']>>,
  generatedAt: string
): EscalationSourceBundle['coalescedSignals'] {
  return signals
    .filter((item) => item.status === 'active' && item.signalType !== 'noop')
    .map((item) => ({
      id: item.id,
      signalType: item.signalType,
      status: item.status,
      summary: item.summary,
      reason: item.reason,
      createdAtIso: item.createdAtIso,
      ageHours: elapsedHours(item.createdAtIso, generatedAt),
      clusterEntityId: String(asRecord(item.metadata).clusterKey ?? item.sourceRecordIds[0] ?? item.id),
      contributingCount: item.sourceRecordIds.length,
      sourceRecordIds: item.sourceRecordIds,
      sourceRecordTypes: item.sourceRecordTypes,
      metadata: asRecord(item.metadata)
    }));
}

function buildFollowThroughRecords(
  records: Awaited<ReturnType<AgentOsRepository['listFollowThroughEngineRecords']>>,
  generatedAt: string
): EscalationSourceBundle['followThroughRecords'] {
  return records
    .filter((item) => item.status === 'blocked' || item.status === 'stale')
    .map((item) => ({
      id: item.id,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      status: item.status,
      policyKey: item.policyKey,
      summary: item.summary,
      reason: item.reason,
      createdAtIso: item.createdAt,
      ageHours: elapsedHours(item.createdAt, generatedAt),
      clusterEntityId: clusterEntityId({
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        metadata: asRecord(item.metadata),
        relatedIds: item.createdArtifactIds
      }),
      relatedRecordIds: item.createdArtifactIds,
      metadata: asRecord(item.metadata)
    }));
}

export class AaliyahEscalationEngineSources {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly preferencesResolver: AaliyahFounderPreferencesResolver
  ) {}

  async loadBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt: string;
  }): Promise<EscalationSourceBundle & { preferences: FounderPreferencesRecord }> {
    const [preferences, notifications, recommendations, opportunities, strategicInsights, coalescedSignals, followThroughRecords] = await Promise.all([
      this.preferencesResolver.resolve({
        tenantId: args.tenantId,
        actorUserId: args.actorId,
        generatedAt: args.generatedAt
      }),
      this.repository.listNotifications({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listOpportunities({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listStrategicInsights({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listCoalescedSignals({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 200 })
    ]);

    const bundle: EscalationSourceBundle = {
      notifications: buildNotificationRecords(notifications, args.generatedAt),
      recommendations: buildRecommendationRecords(recommendations, args.generatedAt),
      opportunities: buildOpportunityRecords(opportunities, args.generatedAt),
      strategicInsights: buildStrategicInsightRecords(strategicInsights, args.generatedAt),
      coalescedSignals: buildCoalescedSignalRecords(coalescedSignals, args.generatedAt),
      followThroughRecords: buildFollowThroughRecords(followThroughRecords, args.generatedAt),
      sourceVersion: [
        ...notifications.map((item) => `${item.id}:${item.status}:${item.createdAtIso}`),
        ...recommendations.map((item) => `${item.id}:${item.status}:${item.createdAtIso}`),
        ...opportunities.map((item) => `${item.id}:${item.status}:${item.createdAtIso}`),
        ...strategicInsights.map((item) => `${item.id}:${item.status}:${item.createdAtIso}`),
        ...coalescedSignals.map((item) => `${item.id}:${item.status}:${item.createdAtIso}`),
        ...followThroughRecords.map((item) => `${item.id}:${item.status}:${item.createdAt}`)
      ].join('|')
    };

    return { ...bundle, preferences };
  }
}
