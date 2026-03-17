import type { StrategicInsightDraft, StrategicInsightType } from './strategic-intelligence-types.js';

function titleFor(type: StrategicInsightType) {
  switch (type) {
    case 'attention_priority':
      return 'Founder attention is needed now';
    case 'blocked_pattern':
      return 'Blocked work is repeating in the same lane';
    case 'follow_through_gap':
      return 'Follow-through is being created faster than it closes';
    case 'opportunity_cluster':
      return 'Opportunities are clustering around one entity';
    case 'execution_bottleneck':
      return 'A single execution stage is slowing the system';
    case 'daily_brief':
      return 'Daily founder brief';
    case 'weekly_brief':
      return 'Weekly founder brief';
    case 'noop':
    default:
      return 'No strategic insight is active';
  }
}

function summaryFor(type: StrategicInsightType) {
  switch (type) {
    case 'attention_priority':
      return 'Critical signal is accumulating and needs founder attention before momentum slips.';
    case 'blocked_pattern':
      return 'Blocked recommendations and follow-through are clustering around the same workstream.';
    case 'follow_through_gap':
      return 'The system is generating next steps, but stale work is outpacing closure.';
    case 'opportunity_cluster':
      return 'Multiple leverage signals point to the same relationship or account cluster.';
    case 'execution_bottleneck':
      return 'One recurring operational stage is slowing progress more than the rest.';
    case 'daily_brief':
      return 'A concise founder brief summarizing the top priorities, bottlenecks, and clusters from today.';
    case 'weekly_brief':
      return 'A concise founder brief summarizing the top priorities, bottlenecks, and clusters from this week.';
    case 'noop':
    default:
      return 'No strategic pattern currently justifies a persisted insight.';
  }
}

export function buildStrategicInsightDraft(args: {
  insightType: StrategicInsightDraft['insightType'];
  reason: string;
  idempotencyKey: string;
  relatedEntityIds?: string[];
  relatedRecordIds?: string[];
  metadata?: Record<string, unknown>;
  evaluatedAtIso: string;
}): StrategicInsightDraft {
  return {
    insightType: args.insightType,
    status: 'active',
    title: titleFor(args.insightType),
    summary: summaryFor(args.insightType),
    reason: args.reason,
    idempotencyKey: args.idempotencyKey,
    relatedEntityIds: args.relatedEntityIds ?? [],
    relatedRecordIds: args.relatedRecordIds ?? [],
    metadata: args.metadata ?? {},
    evaluatedAtIso: args.evaluatedAtIso
  };
}

export function buildStrategicInsightMessage(count: number, replayedCount: number) {
  if (count === 0) {
    return 'No new strategic insight qualified for persistence.';
  }
  if (replayedCount === 0) {
    return count === 1
      ? 'Created 1 strategic insight.'
      : `Created ${count} strategic insights.`;
  }
  return `Resolved ${count} strategic insights with ${replayedCount} replayed.`;
}
