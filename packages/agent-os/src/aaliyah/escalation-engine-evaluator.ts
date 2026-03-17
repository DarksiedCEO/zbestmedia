import { buildEscalationIdempotencyKey, sortEscalations } from './escalation-engine-policy.js';
import { buildEscalationDraft } from './escalation-engine-summary.js';
import type { FounderEscalationPreferences } from './founder-preferences-types.js';
import type {
  EscalationDraft,
  EscalationSourceBundle,
  EscalationSourceRecordType
} from './escalation-engine-types.js';

function sourceTypes(ids: string[], type: EscalationSourceRecordType) {
  return ids.map(() => type);
}

export function evaluateEscalations(args: {
  bundle: EscalationSourceBundle;
  preferences: FounderEscalationPreferences;
  evaluatedAtIso: string;
}): EscalationDraft[] {
  const drafts: EscalationDraft[] = [];

  for (const notification of args.bundle.notifications) {
    if (notification.severity !== 'critical' || notification.ageHours < args.preferences.criticalEscalationHours) {
      continue;
    }
    drafts.push(
      buildEscalationDraft({
        escalationType: 'stale_critical_escalation',
        escalationLevel: 'critical',
        reason: 'A critical notification has remained active beyond the founder escalation threshold without resolution.',
        summary: `${notification.summary} It has remained active for ${notification.ageHours} hours.`,
        idempotencyKey: buildEscalationIdempotencyKey({
          escalationType: 'stale_critical_escalation',
          scopeKey: notification.clusterEntityId,
          sourceVersion: `${args.bundle.sourceVersion}:${notification.id}:${notification.ageHours}`
        }),
        sourceRecordIds: [notification.id],
        sourceRecordTypes: ['notification'],
        relatedClusterId: typeof notification.metadata.clusterId === 'string' ? notification.metadata.clusterId : null,
        metadata: {
          clusterEntityId: notification.clusterEntityId,
          ageHours: notification.ageHours,
          sourceSeverity: notification.severity
        },
        evaluatedAtIso: args.evaluatedAtIso
      })
    );
  }

  for (const signal of args.bundle.coalescedSignals) {
    if (signal.signalType === 'blocked_execution_cluster' && signal.contributingCount >= args.preferences.blockedPatternEscalationCount) {
      drafts.push(
        buildEscalationDraft({
          escalationType: 'blocked_pattern_escalation',
          escalationLevel: 'high',
          reason: 'A blocked execution cluster has accumulated enough repeated pressure to become a founder-level issue.',
          summary: `${signal.summary} ${signal.contributingCount} overlapping records are still unresolved.`,
          idempotencyKey: buildEscalationIdempotencyKey({
            escalationType: 'blocked_pattern_escalation',
            scopeKey: signal.clusterEntityId,
            sourceVersion: `${args.bundle.sourceVersion}:${signal.id}:${signal.contributingCount}`
          }),
          sourceRecordIds: [signal.id, ...signal.sourceRecordIds],
          sourceRecordTypes: ['coalesced_signal', ...signal.sourceRecordTypes],
          relatedClusterId: signal.id,
          metadata: {
            clusterEntityId: signal.clusterEntityId,
            contributingCount: signal.contributingCount
          },
          evaluatedAtIso: args.evaluatedAtIso
        })
      );
    }

    if (
      (signal.signalType === 'follow_up_gap_cluster' || signal.signalType === 'attention_cluster') &&
      signal.contributingCount >= args.preferences.clusterPressureThreshold
    ) {
      drafts.push(
        buildEscalationDraft({
          escalationType: 'cluster_pressure_escalation',
          escalationLevel: signal.signalType === 'attention_cluster' ? 'critical' : 'high',
          reason: 'A coalesced cluster is growing dense enough that the underlying problem now warrants explicit escalation.',
          summary: `${signal.summary} ${signal.contributingCount} related records are clustering around the same issue.`,
          idempotencyKey: buildEscalationIdempotencyKey({
            escalationType: 'cluster_pressure_escalation',
            scopeKey: signal.clusterEntityId,
            sourceVersion: `${args.bundle.sourceVersion}:${signal.id}:${signal.contributingCount}`
          }),
          sourceRecordIds: [signal.id, ...signal.sourceRecordIds],
          sourceRecordTypes: ['coalesced_signal', ...signal.sourceRecordTypes],
          relatedClusterId: signal.id,
          metadata: {
            clusterEntityId: signal.clusterEntityId,
            contributingCount: signal.contributingCount,
            signalType: signal.signalType
          },
          evaluatedAtIso: args.evaluatedAtIso
        })
      );
    }
  }

  for (const opportunity of args.bundle.opportunities) {
    if (opportunity.opportunityType !== 'missed_follow_up_window' || opportunity.ageHours < args.preferences.missedFollowUpEscalationHours) {
      continue;
    }
    drafts.push(
      buildEscalationDraft({
        escalationType: 'missed_follow_up_escalation',
        escalationLevel: 'high',
        reason: 'A missed follow-up opportunity stayed unresolved beyond the secondary escalation window.',
        summary: `${opportunity.summary} It has remained unresolved for ${opportunity.ageHours} hours.`,
        idempotencyKey: buildEscalationIdempotencyKey({
          escalationType: 'missed_follow_up_escalation',
          scopeKey: opportunity.clusterEntityId,
          sourceVersion: `${args.bundle.sourceVersion}:${opportunity.id}:${opportunity.ageHours}`
        }),
        sourceRecordIds: [opportunity.id],
        sourceRecordTypes: ['opportunity'],
        relatedClusterId: null,
        metadata: {
          clusterEntityId: opportunity.clusterEntityId,
          ageHours: opportunity.ageHours
        },
        evaluatedAtIso: args.evaluatedAtIso
      })
    );
  }

  const criticalNotificationIds = args.bundle.notifications.filter((item) => item.severity === 'critical').map((item) => item.id);
  const attentionClusterIds = args.bundle.coalescedSignals.filter((item) => item.signalType === 'attention_cluster').map((item) => item.id);
  const attentionInsightIds = args.bundle.strategicInsights.filter((item) => item.insightType === 'attention_priority').map((item) => item.id);
  const escalationRecommendationIds = args.bundle.recommendations.filter((item) => item.recommendationType === 'escalate_now').map((item) => item.id);
  const attentionIds = [
    ...criticalNotificationIds,
    ...attentionClusterIds,
    ...attentionInsightIds,
    ...escalationRecommendationIds
  ];
  if (attentionIds.length >= args.preferences.attentionOverloadThreshold) {
    drafts.push(
      buildEscalationDraft({
        escalationType: 'attention_overload_escalation',
        escalationLevel: 'critical',
        reason: 'The founder attention queue has grown beyond the configured tolerance and now needs deliberate triage.',
        summary: `${attentionIds.length} high-pressure signals are active across notifications, clusters, insights, and recommendations.`,
        idempotencyKey: buildEscalationIdempotencyKey({
          escalationType: 'attention_overload_escalation',
          scopeKey: 'global',
          sourceVersion: `${args.bundle.sourceVersion}:${attentionIds.length}`
        }),
        sourceRecordIds: attentionIds,
        sourceRecordTypes: [
          ...sourceTypes(criticalNotificationIds, 'notification'),
          ...sourceTypes(attentionClusterIds, 'coalesced_signal'),
          ...sourceTypes(attentionInsightIds, 'strategic_insight'),
          ...sourceTypes(escalationRecommendationIds, 'recommendation')
        ],
        relatedClusterId: null,
        metadata: {
          notificationCount: criticalNotificationIds.length,
          clusterCount: attentionClusterIds.length,
          strategicCount: attentionInsightIds.length,
          recommendationCount: escalationRecommendationIds.length
        },
        evaluatedAtIso: args.evaluatedAtIso
      })
    );
  }

  return sortEscalations(drafts);
}
