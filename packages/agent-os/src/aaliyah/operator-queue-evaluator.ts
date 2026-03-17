import {
  buildOperatorQueueIdempotencyKey,
  sortOperatorQueueRecords
} from './operator-queue-policy.js';
import { computeOperatorQueueStaleAfter } from './operator-action-policy.js';
import { canonicalIssueKeyForComparable } from './operator-queue-canonicalization.js';
import type {
  OperatorQueueComparableRecord,
  OperatorQueueDraft,
  OperatorQueueItemType,
  OperatorQueueSourceBundle
} from './operator-queue-types.js';

export function evaluateOperatorQueue(args: {
  bundle: OperatorQueueSourceBundle;
  evaluatedAtIso: string;
}): {
  drafts: OperatorQueueDraft[];
  suppressedIds: string[];
} {
  const suppressionIds = buildSuppressionSet(args.bundle);
  const drafts = sortSourceRecords(args.bundle)
    .filter((record) => !suppressionIds.has(record.id))
    .map((record) => {
      const queueItemType = resolveQueueItemType(record);
      const canonicalIssueKey = canonicalIssueKeyForComparable(record);
      return {
        sourceType: record.sourceType,
        sourceId: record.id,
        queueItemType,
        priorityScore: record.severityScore,
        priorityBand: record.priorityHint,
        status: 'active' as const,
        rankingVersion: 1,
        staleAfterAtIso: computeOperatorQueueStaleAfter({
          evaluatedAtIso: args.evaluatedAtIso,
          sourceType: record.sourceType,
          priorityBand: record.priorityHint
        }),
        canonicalIssueKey,
        supersededByQueueItemId: null,
        title: record.title,
        summary: record.summary,
        reason: record.reason,
        idempotencyKey: buildOperatorQueueIdempotencyKey({
          sourceType: record.sourceType,
          sourceId: record.id,
          queueItemType,
          sourceVersion: `${args.bundle.sourceVersion}:${record.id}`
        }),
        relatedRecordIds: record.relatedRecordIds,
        relatedRecordTypes: record.relatedRecordTypes,
        actionableCommandType: record.actionableCommandType,
        actionableTargetType: record.actionableTargetType,
        actionableTargetId: record.actionableTargetId,
        metadata: {
          clusterKey: record.clusterKey,
          semanticTag: record.semanticTag,
          canonicalIssueKey,
          ...record.metadata
        },
        evaluatedAtIso: args.evaluatedAtIso,
        createdAtIso: args.evaluatedAtIso
      };
    });

  return {
    drafts: sortOperatorQueueRecords(drafts).map(({ createdAtIso, ...draft }) => draft),
    suppressedIds: Array.from(suppressionIds)
  };
}

function sortSourceRecords(bundle: OperatorQueueSourceBundle) {
  const records = [
    ...bundle.escalations,
    ...bundle.coalescedSignals,
    ...bundle.strategicInsights,
    ...bundle.notifications,
    ...bundle.recommendations,
    ...bundle.opportunities
  ];
  return [...records].sort((left, right) => {
    if (right.severityScore !== left.severityScore) {
      return right.severityScore - left.severityScore;
    }
    return right.createdAtIso.localeCompare(left.createdAtIso);
  });
}

function buildSuppressionSet(bundle: OperatorQueueSourceBundle) {
  const suppressed = new Set<string>();
  for (const record of bundle.escalations) {
    for (const relatedId of record.relatedRecordIds) {
      suppressed.add(relatedId);
    }
    const relatedClusterId = typeof record.metadata.relatedClusterId === 'string' ? record.metadata.relatedClusterId : null;
    if (relatedClusterId) {
      suppressed.add(relatedClusterId);
    }
  }
  for (const record of bundle.coalescedSignals) {
    for (const relatedId of record.relatedRecordIds) {
      suppressed.add(relatedId);
    }
    const suppressedIds = Array.isArray(record.metadata.suppressedRecordIds)
      ? record.metadata.suppressedRecordIds.filter((value): value is string => typeof value === 'string')
      : [];
    for (const suppressedId of suppressedIds) {
      suppressed.add(suppressedId);
    }
  }
  return suppressed;
}

export function resolveQueueItemType(record: OperatorQueueComparableRecord): OperatorQueueItemType {
  if (record.sourceType === 'escalation') {
    return 'immediate_action';
  }
  if (record.sourceType === 'coalesced_signal') {
    return record.semanticTag === 'attention' || record.semanticTag === 'blocked'
      ? 'review_required'
      : 'watch_item';
  }
  if (record.sourceType === 'strategic_insight') {
    return 'summary_item';
  }
  if (record.sourceType === 'recommendation') {
    return record.actionableCommandType ? 'immediate_action' : 'review_required';
  }
  if (record.sourceType === 'opportunity') {
    return record.actionableCommandType ? 'review_required' : 'watch_item';
  }
  return record.priorityHint === 'critical' ? 'review_required' : 'watch_item';
}
