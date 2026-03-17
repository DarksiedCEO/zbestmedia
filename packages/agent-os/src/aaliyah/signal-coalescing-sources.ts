import type { FounderBriefingMode } from './briefing-types.js';
import { buildTimeBucket, normalizeClusterKey } from './signal-coalescing-policy.js';
import type {
  CoalescedSignalSourceBundle,
  CoalescedSignalSourceRecord
} from './signal-coalescing-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function deriveClusterKey(args: {
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  relatedIds?: string[];
  fallbackEntityIds?: string[];
}) {
  return normalizeClusterKey([
    typeof args.metadata.accountId === 'string' ? args.metadata.accountId : null,
    typeof args.metadata.contactId === 'string' ? args.metadata.contactId : null,
    typeof args.metadata.targetId === 'string' ? args.metadata.targetId : null,
    typeof args.metadata.clusterEntityId === 'string' ? args.metadata.clusterEntityId : null,
    typeof args.metadata.linkedTaskId === 'string' ? args.metadata.linkedTaskId : null,
    ...(args.relatedIds ?? []),
    ...(args.fallbackEntityIds ?? []),
    args.sourceId,
    args.sourceType
  ]);
}

export class AaliyahSignalCoalescingSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt: string;
  }): Promise<CoalescedSignalSourceBundle> {
    const [notifications, recommendations, opportunities, strategicInsights, followThroughRecords] = await Promise.all([
      this.repository.listNotifications({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listOpportunities({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listStrategicInsights({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 200 })
    ]);

    const records: CoalescedSignalSourceRecord[] = [];

    for (const item of notifications.filter((entry) => entry.status === 'active' && entry.notificationType !== 'noop')) {
      const metadata = asRecord(item.metadata);
      const semanticTag = item.notificationType === 'blocked_recommendation'
        ? 'blocked'
        : item.notificationType === 'stale_critical_work' || item.notificationType === 'high_priority_follow_through'
          ? 'follow_up_gap'
          : item.notificationType === 'opportunity_signal' || item.notificationType === 'founder_review_required'
            ? 'attention'
            : 'attention';
      records.push({
        id: item.id,
        recordType: 'notification',
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        semanticTag,
        severityScore: item.severity === 'critical' ? 4 : item.severity === 'warning' ? 3 : 2,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: [item.relatedRecommendationId, item.relatedTaskId].filter((value): value is string => Boolean(value)),
        metadata,
        createdAtIso: item.createdAtIso,
        clusterKey: deriveClusterKey({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedRecommendationId, item.relatedTaskId].filter((value): value is string => Boolean(value))
        }),
        timeBucket: buildTimeBucket(item.createdAtIso)
      });
    }

    for (const item of recommendations.filter((entry) => entry.status === 'active' && entry.recommendationType !== 'noop')) {
      const metadata = asRecord(item.metadata);
      records.push({
        id: item.id,
        recordType: 'recommendation',
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        semanticTag: item.recommendationType === 'review_blocked'
          ? 'blocked'
          : item.recommendationType === 'follow_up_now' || item.recommendationType === 'schedule_next'
            ? 'follow_up_gap'
            : item.recommendationType === 'escalate_now' || item.recommendationType === 'send_now'
              ? 'attention'
              : 'opportunity',
        severityScore: item.recommendationType === 'escalate_now' ? 4 : item.recommendationType === 'review_blocked' ? 3 : 2,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: [item.relatedTaskId, item.relatedCommandId].filter((value): value is string => Boolean(value)),
        metadata,
        createdAtIso: item.createdAtIso,
        clusterKey: deriveClusterKey({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedTaskId, item.relatedCommandId].filter((value): value is string => Boolean(value))
        }),
        timeBucket: buildTimeBucket(item.createdAtIso)
      });
    }

    for (const item of opportunities.filter((entry) => entry.status === 'active' && entry.opportunityType !== 'noop')) {
      const metadata = asRecord(item.metadata);
      records.push({
        id: item.id,
        recordType: 'opportunity',
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        semanticTag: item.opportunityType === 'recurring_block_pattern'
          ? 'blocked'
          : item.opportunityType === 'missed_follow_up_window'
            ? 'follow_up_gap'
            : 'opportunity',
        severityScore: item.opportunityType === 'recurring_block_pattern' ? 3 : item.opportunityType === 'missed_follow_up_window' ? 3 : 2,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value)),
        metadata,
        createdAtIso: item.createdAtIso,
        clusterKey: deriveClusterKey({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: [item.relatedTaskId, item.relatedRecommendationId].filter((value): value is string => Boolean(value))
        }),
        timeBucket: buildTimeBucket(item.createdAtIso)
      });
    }

    for (const item of strategicInsights.filter((entry) => entry.status === 'active' && entry.insightType !== 'noop')) {
      const metadata = asRecord(item.metadata);
      records.push({
        id: item.id,
        recordType: 'strategic_insight',
        sourceType: 'strategic_intelligence',
        sourceId: item.id,
        status: item.status,
        semanticTag: item.insightType === 'blocked_pattern'
          ? 'blocked'
          : item.insightType === 'follow_through_gap'
            ? 'follow_up_gap'
            : item.insightType === 'opportunity_cluster'
              ? 'opportunity'
              : 'attention',
        severityScore: item.insightType === 'attention_priority' || item.insightType === 'execution_bottleneck' ? 4 : 3,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: item.relatedRecordIds,
        metadata,
        createdAtIso: item.createdAtIso,
        clusterKey: deriveClusterKey({
          sourceType: 'strategic_intelligence',
          sourceId: item.id,
          metadata,
          relatedIds: item.relatedRecordIds,
          fallbackEntityIds: item.relatedEntityIds
        }),
        timeBucket: buildTimeBucket(item.createdAtIso)
      });
    }

    for (const item of followThroughRecords.filter((entry) => entry.status === 'blocked' || entry.status === 'stale')) {
      const metadata = asRecord(item.metadata);
      records.push({
        id: item.id,
        recordType: 'follow_through_record',
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        status: item.status,
        semanticTag: item.status === 'blocked' ? 'blocked' : 'follow_up_gap',
        severityScore: item.status === 'blocked' ? 3 : 2,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: item.createdArtifactIds,
        metadata,
        createdAtIso: item.createdAt,
        clusterKey: deriveClusterKey({
          sourceType: item.source.sourceType,
          sourceId: item.source.sourceId,
          metadata,
          relatedIds: item.createdArtifactIds
        }),
        timeBucket: buildTimeBucket(item.createdAt)
      });
    }

    return {
      records,
      sourceVersion: records.map((item) => `${item.recordType}:${item.id}:${item.status}:${item.clusterKey}:${item.timeBucket}`).join('|')
    };
  }
}
