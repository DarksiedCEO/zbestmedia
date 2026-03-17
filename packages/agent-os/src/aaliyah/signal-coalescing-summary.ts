import type { CoalescedSignalDraft, CoalescedSignalType } from './signal-coalescing-types.js';

export function buildCoalescedSignalTitle(type: CoalescedSignalType): string {
  switch (type) {
    case 'blocked_execution_cluster':
      return 'Blocked execution cluster';
    case 'follow_up_gap_cluster':
      return 'Follow-up gap cluster';
    case 'opportunity_cluster':
      return 'Opportunity cluster';
    case 'attention_cluster':
      return 'Attention cluster';
    case 'noop':
      return 'No cluster';
  }
}

export function buildCoalescedSignalSummary(type: CoalescedSignalType, count: number): string {
  switch (type) {
    case 'blocked_execution_cluster':
      return `${count} related blocked records point to the same execution problem.`;
    case 'follow_up_gap_cluster':
      return `${count} related stale and follow-up-gap records are describing the same missed next step.`;
    case 'opportunity_cluster':
      return `${count} opportunity records are clustering around the same source of leverage.`;
    case 'attention_cluster':
      return `${count} high-signal records are competing for founder attention around the same issue.`;
    case 'noop':
      return 'No coalesced signal qualified.';
  }
}

export function buildCoalescedSignalDraft(args: {
  signalType: CoalescedSignalType;
  reason: string;
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: CoalescedSignalDraft['sourceRecordTypes'];
  dominantSourceType: CoalescedSignalDraft['dominantSourceType'];
  suppressedRecordIds: string[];
  metadata: Record<string, unknown>;
  evaluatedAtIso: string;
}): CoalescedSignalDraft {
  return {
    signalType: args.signalType,
    status: 'active',
    title: buildCoalescedSignalTitle(args.signalType),
    summary: buildCoalescedSignalSummary(args.signalType, args.sourceRecordIds.length),
    reason: args.reason,
    idempotencyKey: args.idempotencyKey,
    sourceRecordIds: args.sourceRecordIds,
    sourceRecordTypes: args.sourceRecordTypes,
    dominantSourceType: args.dominantSourceType,
    suppressedRecordIds: args.suppressedRecordIds,
    metadata: args.metadata,
    evaluatedAtIso: args.evaluatedAtIso
  };
}

export function buildCoalescedSignalMessage(count: number, replayedCount: number): string {
  if (count === 0) {
    return 'No priority clusters qualified for persistence.';
  }
  if (replayedCount === 0) {
    return count === 1 ? 'Priority cluster created successfully.' : 'Priority clusters created successfully.';
  }
  return `${count} priority clusters returned (${replayedCount} replayed).`;
}
