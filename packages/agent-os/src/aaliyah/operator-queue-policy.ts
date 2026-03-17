import type { OperatorQueueDraft, OperatorQueuePriorityBand, OperatorQueueRecord } from './operator-queue-types.js';

export const OPERATOR_QUEUE_PRIORITY_ORDER: Record<OperatorQueuePriorityBand, number> = {
  critical: 0,
  high: 1,
  normal: 2
};

export function buildOperatorQueueIdempotencyKey(args: {
  sourceType: string;
  sourceId: string;
  queueItemType: string;
  sourceVersion: string;
}) {
  return `oq:${args.sourceType}:${args.sourceId}:${args.queueItemType}:${args.sourceVersion}`;
}

export function buildOperatorQueueListMessage(count: number) {
  return count === 0
    ? 'Operator queue is empty.'
    : `Operator queue contains ${count} ranked founder items.`;
}

export function buildOperatorQueueTopMessage(immediateCount: number, totalCount: number) {
  return `Operator queue top view contains ${immediateCount} immediate actions and ${totalCount} ranked items.`;
}

type SortableOperatorQueueRecord = Pick<OperatorQueueRecord | OperatorQueueDraft, 'priorityBand' | 'priorityScore' | 'evaluatedAtIso'> & {
  createdAtIso?: string;
};

export function sortOperatorQueueRecords<T extends SortableOperatorQueueRecord>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const bandDelta = OPERATOR_QUEUE_PRIORITY_ORDER[left.priorityBand] - OPERATOR_QUEUE_PRIORITY_ORDER[right.priorityBand];
    if (bandDelta !== 0) {
      return bandDelta;
    }
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    const leftTime = ('createdAtIso' in left ? left.createdAtIso : undefined) ?? left.evaluatedAtIso;
    const rightTime = ('createdAtIso' in right ? right.createdAtIso : undefined) ?? right.evaluatedAtIso;
    return rightTime.localeCompare(leftTime);
  });
}
