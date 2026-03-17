import { createHash } from 'node:crypto';

import type {
  TimelineDecisionClass,
  TimelineEventType,
  TimelineFilters,
  TimelineSeverity
} from './timeline-types.js';

export function assertTimelineFilters(filters: TimelineFilters) {
  if (filters.windowStartAtIso && Number.isNaN(Date.parse(filters.windowStartAtIso))) {
    throw new Error('timeline_invalid_window_start');
  }
  if (filters.windowEndAtIso && Number.isNaN(Date.parse(filters.windowEndAtIso))) {
    throw new Error('timeline_invalid_window_end');
  }
  if (filters.windowStartAtIso && filters.windowEndAtIso && filters.windowStartAtIso > filters.windowEndAtIso) {
    throw new Error('timeline_invalid_window_range');
  }
}

export function buildTimelineIdempotencyKey(args: {
  eventType: TimelineEventType;
  sourceType: string;
  sourceId: string;
  eventAtIso: string;
  canonicalIssueKey?: string | null;
  detailSeed?: string | null;
}) {
  const suffix = createHash('sha256')
    .update([
      args.eventType,
      args.sourceType,
      args.sourceId,
      args.eventAtIso,
      args.canonicalIssueKey ?? 'none',
      args.detailSeed ?? 'none'
    ].join('|'))
    .digest('hex')
    .slice(0, 12);
  return `timeline:${args.eventType}:${args.sourceType}:${args.sourceId}:${suffix}`;
}

export function classifyTimelineDecision(eventType: TimelineEventType): TimelineDecisionClass {
  switch (eventType) {
    case 'queue_item_created':
    case 'queue_item_refreshed':
      return 'attention';
    case 'queue_item_executed':
    case 'operator_action_failed':
      return 'execution';
    case 'issue_resolved':
    case 'issue_reopened':
      return 'resolution';
    case 'queue_item_suppressed':
      return 'suppression';
    case 'brief_generated':
      return 'briefing';
    default:
      return 'outcome';
  }
}

export function classifyTimelineSeverity(args: {
  eventType: TimelineEventType;
  priorityBand?: string | null;
  outcomeStatus?: string | null;
  queueStatus?: string | null;
}) : TimelineSeverity {
  if (args.eventType === 'issue_reopened' || args.eventType === 'escalation_persisting') return 'critical';
  if (args.eventType === 'operator_action_failed') return 'high';
  if (args.eventType === 'queue_item_suppressed') return 'low';
  if (args.priorityBand === 'critical') return 'critical';
  if (args.priorityBand === 'high') return 'high';
  if (args.outcomeStatus === 'needs_follow_through') return 'high';
  if (args.queueStatus === 'executed') return 'medium';
  return 'info';
}

export function buildTimelineListMessage(count: number) {
  return count === 1 ? 'Loaded 1 timeline event.' : `Loaded ${count} timeline events.`;
}
