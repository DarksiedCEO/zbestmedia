import {
  buildStrategicInsightIdempotencyKey,
  countActive,
  isOverdue,
  sortInsightDrafts,
  topEntityCluster
} from './strategic-intelligence-policy.js';
import { buildStrategicInsightDraft } from './strategic-intelligence-summary.js';
import type {
  StrategicInsightDraft,
  StrategicIntelligenceSourceBundle
} from './strategic-intelligence-types.js';

function priorityEntityId(metadata: Record<string, unknown>, fallbackId: string) {
  if (typeof metadata.accountId === 'string') return metadata.accountId;
  if (typeof metadata.targetId === 'string') return metadata.targetId;
  return fallbackId;
}

export function evaluateStrategicIntelligence(args: {
  bundle: StrategicIntelligenceSourceBundle;
  evaluatedAtIso: string;
}): StrategicInsightDraft[] {
  const { bundle, evaluatedAtIso } = args;
  const drafts: StrategicInsightDraft[] = [];

  const activeNotifications = bundle.notifications.filter((item) => item.status === 'active');
  const activeRecommendations = bundle.recommendations.filter((item) => item.status === 'active' && item.type !== 'noop');
  const activeOpportunities = bundle.opportunities.filter((item) => item.status === 'active' && item.type !== 'noop');
  const staleTasks = bundle.tasks.filter((task) => ['open', 'in_progress', 'blocked'].includes(task.status) && isOverdue(evaluatedAtIso, task.dueAtIso));
  const blockedFollowThrough = bundle.followThroughRecords.filter((item) => item.status === 'blocked');
  const staleFollowThrough = bundle.followThroughRecords.filter((item) => item.status === 'stale');
  const blockedRecommendations = activeRecommendations.filter((item) => item.type === 'review_blocked');
  const criticalNotifications = activeNotifications.filter((item) => item.severity === 'critical');
  const attentionCandidates = [
    ...criticalNotifications.map((item) => item.id),
    ...activeRecommendations.filter((item) => ['escalate_now', 'review_blocked'].includes(item.type)).map((item) => item.id),
    ...activeOpportunities.filter((item) => ['recurring_block_pattern', 'missed_follow_up_window', 'stalled_pipeline'].includes(item.type)).map((item) => item.id)
  ];
  const acknowledgedRecently = activeNotifications.some((item) => item.acknowledgedAtIso);
  if ((criticalNotifications.length > 0 || attentionCandidates.length >= 3) && !acknowledgedRecently) {
    const topIds = attentionCandidates.slice(0, 5);
    drafts.push(buildStrategicInsightDraft({
      insightType: 'attention_priority',
      reason: 'Critical notifications and active recommendation pressure are stacking up faster than founder acknowledgement.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: 'attention_priority',
        scopeKey: bundle.scope,
        versionHash: [bundle.scope, ...topIds, bundle.sourceVersion].join(':')
      }),
      relatedEntityIds: [
        ...new Set([
          ...criticalNotifications.map((item) => item.sourceId),
          ...activeRecommendations.map((item) => item.sourceId),
          ...activeOpportunities.map((item) => item.sourceId)
        ])
      ].slice(0, 6),
      relatedRecordIds: topIds,
      metadata: {
        criticalNotificationCount: criticalNotifications.length,
        activeRecommendationCount: activeRecommendations.length,
        activeOpportunityCount: activeOpportunities.length
      },
      evaluatedAtIso
    }));
  }

  const blockedCluster = topEntityCluster([
    ...blockedFollowThrough.map((item) => ({
      entityId: typeof item.metadata.linkedTaskId === 'string' ? item.metadata.linkedTaskId : item.sourceId,
      recordId: item.id
    })),
    ...blockedRecommendations.map((item) => ({
      entityId: priorityEntityId(item.metadata, item.sourceId),
      recordId: item.id
    })),
    ...activeOpportunities.filter((item) => item.type === 'recurring_block_pattern').map((item) => ({
      entityId: priorityEntityId(item.metadata, item.sourceId),
      recordId: item.id
    }))
  ]);
  if (blockedCluster && blockedCluster.recordIds.length >= 2) {
    drafts.push(buildStrategicInsightDraft({
      insightType: 'blocked_pattern',
      reason: 'Blocked recommendations and follow-through records are recurring around the same entity cluster instead of resolving cleanly.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: 'blocked_pattern',
        scopeKey: blockedCluster.entityId,
        versionHash: [blockedCluster.entityId, ...blockedCluster.recordIds, bundle.sourceVersion].join(':')
      }),
      relatedEntityIds: [blockedCluster.entityId],
      relatedRecordIds: blockedCluster.recordIds,
      metadata: {
        clusterEntityId: blockedCluster.entityId,
        blockedCount: blockedCluster.recordIds.length
      },
      evaluatedAtIso
    }));
  }

  const reviewPressure = blockedRecommendations.length + blockedFollowThrough.length;
  const recapPressure = bundle.followThroughRecords.filter((item) => item.policyKey === 'FT-004-event-linked-recap').length;
  const bottleneckStage = reviewPressure >= recapPressure && reviewPressure >= 2 ? 'review' : recapPressure >= 2 ? 'recap' : null;
  if (bottleneckStage) {
    const relatedIds = bottleneckStage === 'review'
      ? [...blockedRecommendations.map((item) => item.id), ...blockedFollowThrough.map((item) => item.id)].slice(0, 6)
      : bundle.followThroughRecords.filter((item) => item.policyKey === 'FT-004-event-linked-recap').map((item) => item.id).slice(0, 6);
    drafts.push(buildStrategicInsightDraft({
      insightType: 'execution_bottleneck',
      reason: bottleneckStage === 'review'
        ? 'Review and blocked-intent work is accumulating faster than the founder is clearing it.'
        : 'Meeting recap and next-step execution are repeatedly stalling after events complete.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: 'execution_bottleneck',
        scopeKey: bottleneckStage,
        versionHash: [bottleneckStage, ...relatedIds, bundle.sourceVersion].join(':')
      }),
      relatedEntityIds: [],
      relatedRecordIds: relatedIds,
      metadata: {
        stage: bottleneckStage,
        reviewPressure,
        recapPressure
      },
      evaluatedAtIso
    }));
  }

  if (staleFollowThrough.length >= 1 && staleTasks.length >= 2) {
    drafts.push(buildStrategicInsightDraft({
      insightType: 'follow_through_gap',
      reason: 'Next-step records are being created, but stale work is accumulating faster than the system is closing it.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: 'follow_through_gap',
        scopeKey: bundle.scope,
        versionHash: [
          bundle.scope,
          ...staleFollowThrough.map((item) => item.id),
          ...staleTasks.map((item) => item.id),
          bundle.sourceVersion
        ].join(':')
      }),
      relatedEntityIds: [...new Set(staleTasks.map((item) => item.accountId ?? item.contactId).filter(Boolean) as string[])],
      relatedRecordIds: [...staleFollowThrough.map((item) => item.id), ...staleTasks.map((item) => item.id)].slice(0, 8),
      metadata: {
        staleFollowThroughCount: staleFollowThrough.length,
        staleTaskCount: staleTasks.length
      },
      evaluatedAtIso
    }));
  }

  const opportunityCluster = topEntityCluster(
    activeOpportunities.map((item) => ({
      entityId: priorityEntityId(item.metadata, item.sourceId),
      recordId: item.id
    }))
  );
  if (opportunityCluster && opportunityCluster.recordIds.length >= 2) {
    drafts.push(buildStrategicInsightDraft({
      insightType: 'opportunity_cluster',
      reason: 'Multiple live opportunities are clustering around the same entity, which makes it a founder-level leverage target rather than trivia.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: 'opportunity_cluster',
        scopeKey: opportunityCluster.entityId,
        versionHash: [opportunityCluster.entityId, ...opportunityCluster.recordIds, bundle.sourceVersion].join(':')
      }),
      relatedEntityIds: [opportunityCluster.entityId],
      relatedRecordIds: opportunityCluster.recordIds,
      metadata: {
        clusterEntityId: opportunityCluster.entityId,
        opportunityCount: opportunityCluster.recordIds.length
      },
      evaluatedAtIso
    }));
  }

  if (bundle.scope !== 'current' && drafts.length > 0) {
    drafts.push(buildStrategicInsightDraft({
      insightType: bundle.scope === 'weekly' ? 'weekly_brief' : 'daily_brief',
      reason: 'A concise founder brief is justified because multiple strategic patterns are active across the ledgers.',
      idempotencyKey: buildStrategicInsightIdempotencyKey({
        insightType: bundle.scope === 'weekly' ? 'weekly_brief' : 'daily_brief',
        scopeKey: `${bundle.scope}:${evaluatedAtIso.slice(0, 10)}`,
        versionHash: [bundle.scope, drafts.map((item) => item.insightType).join(','), bundle.sourceVersion].join(':')
      }),
      relatedEntityIds: [...new Set(drafts.flatMap((item) => item.relatedEntityIds))].slice(0, 6),
      relatedRecordIds: drafts.flatMap((item) => item.relatedRecordIds).slice(0, 10),
      metadata: {
        insightTypes: drafts.map((item) => item.insightType),
        activeNotificationCount: countActive(activeNotifications),
        activeRecommendationCount: countActive(activeRecommendations),
        activeOpportunityCount: countActive(activeOpportunities)
      },
      evaluatedAtIso
    }));
  }

  return sortInsightDrafts(drafts);
}
