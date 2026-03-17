export function buildOperatorQueueMessage(count: number, replayedCount: number, suppressedCount: number) {
  const replayedSuffix = replayedCount > 0 ? ` ${replayedCount} replayed.` : '';
  return `Resolved ${count} operator queue items.${replayedSuffix} Suppressed ${suppressedCount} redundant candidates.`;
}
