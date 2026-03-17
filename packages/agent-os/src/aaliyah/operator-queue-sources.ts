import type { AgentOsRepository } from '../persistence/repository.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type {
  OperatorQueueActionableCommandType,
  OperatorQueueActionableTargetType,
  OperatorQueueSourceBundle
} from './operator-queue-types.js';

export class AaliyahOperatorQueueSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt: string;
  }): Promise<OperatorQueueSourceBundle> {
    const [
      escalations,
      coalescedSignals,
      strategicInsights,
      notifications,
      recommendations,
      opportunities
    ] = await Promise.all([
      this.repository.listEscalations({ tenantId: args.tenantId, status: 'active', limit: 100 }),
      this.repository.listCoalescedSignals({ tenantId: args.tenantId, status: 'active', limit: 100 }),
      this.repository.listStrategicInsights({ tenantId: args.tenantId, status: 'active', limit: 100 }),
      this.repository.listNotifications({ tenantId: args.tenantId, status: 'active', limit: 100 }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listOpportunities({ tenantId: args.tenantId, status: 'active', limit: 100 })
    ]);

    return {
      escalations: escalations.map((record) => ({
        id: record.id,
        sourceType: 'escalation',
        title: record.title,
        summary: record.summary,
        reason: record.reason,
        status: record.status,
        clusterKey: record.relatedClusterId ?? firstMeaningfulId(record.sourceRecordIds) ?? record.id,
        semanticTag: record.escalationType === 'attention_overload_escalation' ? 'attention' : 'blocked',
        severityScore: record.escalationLevel === 'critical' ? 100 : record.escalationLevel === 'high' ? 90 : 80,
        priorityHint: record.escalationLevel === 'critical' ? 'critical' : 'high',
        relatedRecordIds: record.sourceRecordIds,
        relatedRecordTypes: record.sourceRecordTypes,
        actionableCommandType: null,
        actionableTargetType: null,
        actionableTargetId: null,
        createdAtIso: record.createdAtIso,
        metadata: {
          escalationType: record.escalationType,
          relatedClusterId: record.relatedClusterId,
          sourceRecordIds: record.sourceRecordIds,
          sourceRecordTypes: record.sourceRecordTypes,
          escalationLevel: record.escalationLevel,
          ...record.metadata
        }
      })),
      coalescedSignals: coalescedSignals.map((record) => ({
        id: record.id,
        sourceType: 'coalesced_signal',
        title: record.title,
        summary: record.summary,
        reason: record.reason,
        status: record.status,
        clusterKey: String(record.metadata.clusterKey ?? firstMeaningfulId(record.sourceRecordIds) ?? record.id),
        semanticTag:
          record.signalType === 'attention_cluster'
            ? 'attention'
            : record.signalType === 'opportunity_cluster'
              ? 'opportunity'
              : record.signalType === 'follow_up_gap_cluster'
                ? 'watch'
                : 'blocked',
        severityScore:
          record.signalType === 'attention_cluster'
            ? 92
            : record.signalType === 'blocked_execution_cluster'
              ? 88
              : record.signalType === 'follow_up_gap_cluster'
                ? 82
                : 78,
        priorityHint:
          record.signalType === 'attention_cluster'
            ? 'critical'
            : record.signalType === 'blocked_execution_cluster'
              ? 'high'
              : 'normal',
        relatedRecordIds: record.sourceRecordIds,
        relatedRecordTypes: record.sourceRecordTypes,
        actionableCommandType: null,
        actionableTargetType: null,
        actionableTargetId: null,
        createdAtIso: record.createdAtIso,
        metadata: {
          signalType: record.signalType,
          dominantSourceType: record.dominantSourceType,
          suppressedRecordIds: record.suppressedRecordIds,
          ...record.metadata
        }
      })),
      strategicInsights: strategicInsights.map((record) => ({
        id: record.id,
        sourceType: 'strategic_insight',
        title: record.title,
        summary: record.summary,
        reason: record.reason,
        status: record.status,
        clusterKey: firstMeaningfulId(record.relatedEntityIds) ?? firstMeaningfulId(record.relatedRecordIds) ?? record.id,
        semanticTag:
          record.insightType === 'attention_priority'
            ? 'attention'
            : record.insightType === 'blocked_pattern'
              ? 'blocked'
              : record.insightType === 'opportunity_cluster'
                ? 'opportunity'
                : 'summary',
        severityScore:
          record.insightType === 'attention_priority'
            ? 86
            : record.insightType === 'blocked_pattern'
              ? 82
              : record.insightType === 'execution_bottleneck'
                ? 80
                : 70,
        priorityHint:
          record.insightType === 'attention_priority' || record.insightType === 'blocked_pattern'
            ? 'high'
            : 'normal',
        relatedRecordIds: record.relatedRecordIds,
        relatedRecordTypes: dedupeStrings(record.relatedRecordIds.map(resolveRelatedRecordType)),
        actionableCommandType: null,
        actionableTargetType: null,
        actionableTargetId: null,
        createdAtIso: record.createdAtIso,
        metadata: {
          insightType: record.insightType,
          relatedEntityIds: record.relatedEntityIds,
          ...record.metadata
        }
      })),
      notifications: notifications.map((record) => ({
        id: record.id,
        sourceType: 'notification',
        title: record.title,
        summary: record.summary,
        reason: record.reason,
        status: record.status,
        clusterKey: String(
          record.metadata.clusterKey ??
            record.relatedTaskId ??
            record.relatedRecommendationId ??
            `${record.source.sourceType}:${record.source.sourceId}`
        ),
        semanticTag:
          record.notificationType === 'blocked_recommendation'
            ? 'blocked'
            : record.notificationType === 'opportunity_signal'
              ? 'opportunity'
              : record.severity === 'critical'
                ? 'attention'
                : 'watch',
        severityScore: record.severity === 'critical' ? 84 : record.severity === 'warning' ? 72 : 60,
        priorityHint: record.severity === 'critical' ? 'critical' : record.severity === 'warning' ? 'high' : 'normal',
        relatedRecordIds: compact([record.relatedRecommendationId, record.relatedTaskId]),
        relatedRecordTypes: compact([
          record.relatedRecommendationId ? 'recommendation' : null,
          record.relatedTaskId ? 'task' : null
        ]),
        actionableCommandType: null,
        actionableTargetType: null,
        actionableTargetId: null,
        createdAtIso: record.createdAtIso,
        metadata: {
          notificationType: record.notificationType,
          severity: record.severity,
          sourceType: record.source.sourceType,
          sourceId: record.source.sourceId,
          ...record.metadata
        }
      })),
      recommendations: recommendations
        .filter((record) => record.status === 'active')
        .map((record) => ({
          id: record.id,
          sourceType: 'recommendation',
          title: recommendationTitle(record.recommendationType),
          summary: record.summary,
          reason: record.reason,
          status: record.status,
          clusterKey: String(record.relatedTaskId ?? `${record.source.sourceType}:${record.source.sourceId}`),
          semanticTag:
            record.recommendationType === 'review_blocked'
              ? 'blocked'
              : record.recommendationType === 'revive_contact'
                ? 'opportunity'
                : record.recommendationType === 'escalate_now'
                  ? 'attention'
                  : 'watch',
          severityScore:
            record.recommendationType === 'escalate_now'
              ? 76
              : record.recommendationType === 'review_blocked'
                ? 74
                : record.recommendationType === 'follow_up_now' || record.recommendationType === 'send_now'
                  ? 70
                  : 64,
          priorityHint:
            record.recommendationType === 'escalate_now' || record.recommendationType === 'review_blocked'
              ? 'high'
              : 'normal',
          relatedRecordIds: compact([record.relatedCommandId, record.relatedTaskId]),
          relatedRecordTypes: compact([
            record.relatedCommandId ? 'founder_command' : null,
            record.relatedTaskId ? 'task' : null
          ]),
          actionableCommandType: resolveRecommendationCommandType(record.recommendationType),
          actionableTargetType: resolveRecommendationTargetType(record),
          actionableTargetId: resolveRecommendationTargetId(record),
          createdAtIso: record.createdAtIso,
          metadata: {
            recommendationType: record.recommendationType,
            sourceType: record.source.sourceType,
            sourceId: record.source.sourceId,
            relatedTaskId: record.relatedTaskId,
            ...record.metadata
          }
        })),
      opportunities: opportunities.map((record) => ({
        id: record.id,
        sourceType: 'opportunity',
        title: opportunityTitle(record.opportunityType),
        summary: record.summary,
        reason: record.reason,
        status: record.status,
        clusterKey: String(record.relatedTaskId ?? `${record.source.sourceType}:${record.source.sourceId}`),
        semanticTag:
          record.opportunityType === 'recurring_block_pattern'
            ? 'blocked'
            : record.opportunityType === 'missed_follow_up_window'
              ? 'watch'
              : 'opportunity',
        severityScore:
          record.opportunityType === 'missed_follow_up_window'
            ? 68
            : record.opportunityType === 'recurring_block_pattern'
              ? 66
              : 62,
        priorityHint:
          record.opportunityType === 'missed_follow_up_window' || record.opportunityType === 'recurring_block_pattern'
            ? 'high'
            : 'normal',
        relatedRecordIds: compact([record.relatedTaskId, record.relatedRecommendationId]),
        relatedRecordTypes: compact([
          record.relatedTaskId ? 'task' : null,
          record.relatedRecommendationId ? 'recommendation' : null
        ]),
        actionableCommandType: resolveOpportunityCommandType(record.opportunityType),
        actionableTargetType: resolveOpportunityTargetType(record),
        actionableTargetId: resolveOpportunityTargetId(record),
        createdAtIso: record.createdAtIso,
        metadata: {
          opportunityType: record.opportunityType,
          sourceType: record.source.sourceType,
          sourceId: record.source.sourceId,
          relatedTaskId: record.relatedTaskId,
          ...record.metadata
        }
      })),
      sourceVersion:
        [
          ...escalations.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`),
          ...coalescedSignals.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`),
          ...strategicInsights.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`),
          ...notifications.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`),
          ...recommendations.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`),
          ...opportunities.map((item) => `${item.id}:${item.status}:${item.evaluatedAtIso}`)
        ].join('|') || 'operator-queue:empty'
    };
  }
}

function resolveRecommendationCommandType(type: string): OperatorQueueActionableCommandType | null {
  switch (type) {
    case 'escalate_now':
      return 'escalate_task';
    case 'follow_up_now':
    case 'send_now':
    case 'revive_contact':
      return 'create_follow_up';
    case 'schedule_next':
      return 'override_schedule';
    default:
      return null;
  }
}

function resolveRecommendationTargetType(record: {
  recommendationType: string;
  source: { sourceType: string; sourceId: string };
  relatedTaskId: string | null;
}): OperatorQueueActionableTargetType | null {
  if (record.recommendationType === 'escalate_now' && record.relatedTaskId) {
    return 'task';
  }
  if (record.recommendationType === 'schedule_next' && record.source.sourceType === 'calendar_event') {
    return 'calendar_event';
  }
  if (record.source.sourceType === 'contact') return 'contact';
  if (record.source.sourceType === 'account') return 'account';
  if (record.source.sourceType === 'task') return 'task';
  if (record.source.sourceType === 'gmail_draft') return 'gmail_draft';
  if (record.source.sourceType === 'calendar_event') return 'calendar_event';
  return null;
}

function resolveRecommendationTargetId(record: {
  source: { sourceType: string; sourceId: string };
  relatedTaskId: string | null;
  recommendationType: string;
}): string | null {
  if (record.recommendationType === 'escalate_now' && record.relatedTaskId) {
    return record.relatedTaskId;
  }
  return record.source.sourceId ?? null;
}

function resolveOpportunityCommandType(type: string): OperatorQueueActionableCommandType | null {
  switch (type) {
    case 'dormant_contact':
    case 'missed_follow_up_window':
    case 'engagement_spike':
      return 'create_follow_up';
    default:
      return null;
  }
}

function resolveOpportunityTargetType(record: {
  source: { sourceType: string; sourceId: string };
  relatedTaskId: string | null;
}): OperatorQueueActionableTargetType | null {
  if (record.source.sourceType === 'contact') return 'contact';
  if (record.source.sourceType === 'account') return 'account';
  if (record.source.sourceType === 'calendar_event') return 'calendar_event';
  if (record.source.sourceType === 'task') return 'task';
  if (record.relatedTaskId) return 'task';
  return null;
}

function resolveOpportunityTargetId(record: {
  source: { sourceType: string; sourceId: string };
  relatedTaskId: string | null;
}): string | null {
  return record.source.sourceId ?? record.relatedTaskId ?? null;
}

function recommendationTitle(type: string) {
  switch (type) {
    case 'escalate_now':
      return 'Escalate now';
    case 'follow_up_now':
      return 'Follow up now';
    case 'review_blocked':
      return 'Review blocked issue';
    case 'revive_contact':
      return 'Revive contact';
    case 'schedule_next':
      return 'Schedule next step';
    case 'send_now':
      return 'Send now';
    default:
      return 'Recommendation';
  }
}

function opportunityTitle(type: string) {
  switch (type) {
    case 'dormant_contact':
      return 'Dormant contact opportunity';
    case 'stalled_pipeline':
      return 'Stalled pipeline opportunity';
    case 'missed_follow_up_window':
      return 'Missed follow-up opportunity';
    case 'engagement_spike':
      return 'Engagement spike opportunity';
    case 'recurring_block_pattern':
      return 'Recurring block pattern opportunity';
    default:
      return 'Opportunity';
  }
}

function resolveRelatedRecordType(recordId: string) {
  if (recordId.startsWith('notification:')) return 'notification';
  if (recordId.startsWith('recommendation:')) return 'recommendation';
  if (recordId.startsWith('opportunity:')) return 'opportunity';
  if (recordId.startsWith('coalesced-signal:')) return 'coalesced_signal';
  if (recordId.startsWith('escalation:')) return 'escalation';
  return 'record';
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function compact<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null);
}

function firstMeaningfulId(values: Array<string | null | undefined>) {
  return values.find((value) => Boolean(value)) ?? null;
}
