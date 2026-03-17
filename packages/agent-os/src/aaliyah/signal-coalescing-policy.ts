import { createHash } from 'node:crypto';

import type {
  CoalescedSignalDraft,
  CoalescedSignalRecord,
  CoalescedSignalType,
  CoalescedSourceRecordType
} from './signal-coalescing-types.js';

export const COALESCED_SIGNAL_PRIORITY: CoalescedSignalType[] = [
  'attention_cluster',
  'blocked_execution_cluster',
  'follow_up_gap_cluster',
  'opportunity_cluster'
];

function hash(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

export function buildCoalescedSignalIdempotencyKey(args: {
  signalType: CoalescedSignalType;
  clusterKey: string;
  sourceVersion: string;
}) {
  return `coal:${args.signalType}:${args.clusterKey}:${hash([args.sourceVersion])}`;
}

export function buildTimeBucket(iso: string): string {
  return iso.slice(0, 13);
}

export function normalizeClusterKey(parts: Array<string | null | undefined>): string {
  const value = parts.find((part) => typeof part === 'string' && part.trim().length > 0);
  return value?.trim() ?? 'global';
}

export function dominantSourceType(types: CoalescedSourceRecordType[]): CoalescedSourceRecordType {
  const counts = new Map<CoalescedSourceRecordType, number>();
  for (const type of types) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const ordered: CoalescedSourceRecordType[] = [
    'strategic_insight',
    'notification',
    'recommendation',
    'opportunity',
    'follow_through_record'
  ];
  return ordered.sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0))[0] ?? 'notification';
}

export function buildCoalescedSignalListMessage(count: number): string {
  return count === 1 ? 'Priority cluster loaded successfully.' : 'Priority clusters loaded successfully.';
}

export function sortCoalescedSignals<T extends Pick<CoalescedSignalDraft | CoalescedSignalRecord, 'signalType' | 'evaluatedAtIso'>>(signals: T[]): T[] {
  const index = new Map(COALESCED_SIGNAL_PRIORITY.map((item, position) => [item, position]));
  return [...signals].sort((left, right) => {
    const priority = (index.get(left.signalType) ?? 999) - (index.get(right.signalType) ?? 999);
    if (priority !== 0) return priority;
    return right.evaluatedAtIso.localeCompare(left.evaluatedAtIso);
  });
}
