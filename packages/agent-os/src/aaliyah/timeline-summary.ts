import type { TimelineEventType } from './timeline-types.js';

export function buildTimelineTitle(args: { eventType: TimelineEventType; title?: string; headline?: string; queueTitle?: string }) {
  switch (args.eventType) {
    case 'queue_item_created':
      return args.queueTitle ?? 'Queue item surfaced';
    case 'queue_item_refreshed':
      return args.queueTitle ?? 'Queue item refreshed';
    case 'queue_item_suppressed':
      return args.queueTitle ?? 'Queue item suppressed';
    case 'queue_item_executed':
      return args.queueTitle ?? 'Queue item executed';
    case 'operator_action_failed':
      return args.queueTitle ?? 'Operator action failed';
    case 'issue_resolved':
      return 'Issue resolved';
    case 'issue_reopened':
      return 'Issue reopened';
    case 'recommendation_rejected':
      return 'Recommendation rejected';
    case 'opportunity_converted':
      return 'Opportunity converted';
    case 'escalation_persisting':
      return 'Escalation still persisting';
    case 'brief_generated':
      return args.headline ?? 'Founder brief generated';
    default:
      return args.title ?? 'Outcome recorded';
  }
}

export function buildTimelineSummary(args: { eventType: TimelineEventType; title?: string; summary?: string; headline?: string; notes?: string | null }) {
  switch (args.eventType) {
    case 'queue_item_created':
      return args.summary ?? 'A new ranked queue item entered the founder decision flow.';
    case 'queue_item_refreshed':
      return args.summary ?? 'A queue item was refreshed against current source truth.';
    case 'queue_item_suppressed':
      return args.summary ?? 'A weaker queue item was collapsed behind stronger issue truth.';
    case 'queue_item_executed':
      return args.summary ?? 'Founder executed the resolved queue action.';
    case 'operator_action_failed':
      return args.summary ?? 'An operator action failed before reaching resolution.';
    case 'issue_resolved':
      return args.notes ?? 'Outcome feedback confirmed the issue is resolved.';
    case 'issue_reopened':
      return args.notes ?? 'Outcome feedback reopened an issue that was previously closed.';
    case 'recommendation_rejected':
      return args.notes ?? 'Founder rejected the recommendation; the issue remains part of history.';
    case 'opportunity_converted':
      return args.notes ?? 'An opportunity converted into a verified outcome.';
    case 'escalation_persisting':
      return args.notes ?? 'An escalation remained unresolved after action and review.';
    case 'brief_generated':
      return args.headline ?? 'A founder brief snapshot was generated.';
    default:
      return args.notes ?? args.summary ?? 'A timeline outcome was recorded.';
  }
}
