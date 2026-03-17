import {
  buildCoalescedSignalIdempotencyKey,
  dominantSourceType,
  sortCoalescedSignals
} from './signal-coalescing-policy.js';
import { buildCoalescedSignalDraft } from './signal-coalescing-summary.js';
import type {
  CoalescedSignalDraft,
  CoalescedSignalSourceBundle,
  CoalescedSignalSourceRecord,
  CoalescedSignalType
} from './signal-coalescing-types.js';

function groupByCluster(records: CoalescedSignalSourceRecord[], semanticTag: CoalescedSignalSourceRecord['semanticTag']) {
  const clusters = new Map<string, CoalescedSignalSourceRecord[]>();
  for (const record of records.filter((item) => item.semanticTag === semanticTag)) {
    const key = `${semanticTag}:${record.clusterKey}:${record.timeBucket}`;
    const bucket = clusters.get(key) ?? [];
    bucket.push(record);
    clusters.set(key, bucket);
  }
  return clusters;
}

function relatedTypes(records: CoalescedSignalSourceRecord[]) {
  return records.map((item) => item.recordType);
}

function uniqueIds(values: string[]) {
  return [...new Set(values)];
}

function buildDraft(args: {
  signalType: CoalescedSignalType;
  reason: string;
  clusterKey: string;
  records: CoalescedSignalSourceRecord[];
  sourceVersion: string;
  evaluatedAtIso: string;
}): CoalescedSignalDraft {
  const sourceRecordIds = args.records.map((item) => item.id);
  return buildCoalescedSignalDraft({
    signalType: args.signalType,
    reason: args.reason,
    idempotencyKey: buildCoalescedSignalIdempotencyKey({
      signalType: args.signalType,
      clusterKey: args.clusterKey,
      sourceVersion: `${args.sourceVersion}:${sourceRecordIds.join(',')}`
    }),
    sourceRecordIds,
    sourceRecordTypes: relatedTypes(args.records),
    dominantSourceType: dominantSourceType(relatedTypes(args.records)),
    suppressedRecordIds: sourceRecordIds.slice(1),
    metadata: {
      clusterKey: args.clusterKey,
      contributingCount: args.records.length,
      contributingRecords: args.records.map((item) => ({
        id: item.id,
        type: item.recordType,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        semanticTag: item.semanticTag,
        severityScore: item.severityScore
      }))
    },
    evaluatedAtIso: args.evaluatedAtIso
  });
}

export function evaluateSignalCoalescing(args: {
  bundle: CoalescedSignalSourceBundle;
  evaluatedAtIso: string;
}): CoalescedSignalDraft[] {
  const drafts: CoalescedSignalDraft[] = [];

  for (const [clusterKey, records] of groupByCluster(args.bundle.records, 'blocked')) {
    const types = new Set(records.map((item) => item.recordType));
    if (records.length >= 2 && (types.size >= 2 || records.some((item) => item.recordType === 'strategic_insight'))) {
      drafts.push(buildDraft({
        signalType: 'blocked_execution_cluster',
        reason: 'Blocked recommendations, follow-through records, or insight patterns are pointing at the same unresolved execution problem.',
        clusterKey,
        records,
        sourceVersion: args.bundle.sourceVersion,
        evaluatedAtIso: args.evaluatedAtIso
      }));
    }
  }

  for (const [clusterKey, records] of groupByCluster(args.bundle.records, 'follow_up_gap')) {
    const types = new Set(records.map((item) => item.recordType));
    if (records.length >= 2 && (types.has('notification') || types.has('follow_through_record') || types.has('opportunity'))) {
      drafts.push(buildDraft({
        signalType: 'follow_up_gap_cluster',
        reason: 'Stale records and missed follow-up signals are describing the same next-step gap rather than separate problems.',
        clusterKey,
        records,
        sourceVersion: args.bundle.sourceVersion,
        evaluatedAtIso: args.evaluatedAtIso
      }));
    }
  }

  const opportunityByEntity = new Map<string, CoalescedSignalSourceRecord[]>();
  for (const record of args.bundle.records.filter((item) => item.semanticTag === 'opportunity')) {
    const bucket = opportunityByEntity.get(record.clusterKey) ?? [];
    bucket.push(record);
    opportunityByEntity.set(record.clusterKey, bucket);
  }
  for (const [clusterKey, records] of opportunityByEntity) {
    if (records.length >= 2) {
      drafts.push(buildDraft({
        signalType: 'opportunity_cluster',
        reason: 'Multiple opportunity records are clustering around the same entity or workstream and should be treated as one leverage target.',
        clusterKey,
        records,
        sourceVersion: args.bundle.sourceVersion,
        evaluatedAtIso: args.evaluatedAtIso
      }));
    }
  }

  const attentionCandidates = args.bundle.records.filter((item) => item.semanticTag === 'attention' && item.severityScore >= 3);
  const attentionByEntity = new Map<string, CoalescedSignalSourceRecord[]>();
  for (const record of attentionCandidates) {
    const bucket = attentionByEntity.get(record.clusterKey) ?? [];
    bucket.push(record);
    attentionByEntity.set(record.clusterKey, bucket);
  }
  for (const [clusterKey, records] of attentionByEntity) {
    const dominantTypes = uniqueIds(records.map((item) => item.recordType));
    if (records.length >= 2 && dominantTypes.length >= 2) {
      drafts.push(buildDraft({
        signalType: 'attention_cluster',
        reason: 'High-priority notifications, recommendations, or insights are all competing for attention around the same issue.',
        clusterKey,
        records,
        sourceVersion: args.bundle.sourceVersion,
        evaluatedAtIso: args.evaluatedAtIso
      }));
    }
  }

  return sortCoalescedSignals(drafts);
}
