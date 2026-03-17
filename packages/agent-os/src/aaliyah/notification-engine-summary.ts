import type { NotificationRecord } from './notification-engine-types.js';

export function buildNotificationTitle(args: {
  notificationType: NotificationRecord['notificationType'];
}) {
  switch (args.notificationType) {
    case 'stale_critical_work':
      return 'Critical task has gone stale';
    case 'blocked_recommendation':
      return 'Blocked recommendation requires review';
    case 'founder_review_required':
      return 'Founder review required';
    case 'high_priority_follow_through':
      return 'High-priority follow-through created';
    case 'opportunity_signal':
      return 'Opportunity signal surfaced';
    default:
      return 'No active notification';
  }
}

export function buildNotificationSummary(args: {
  notificationType: NotificationRecord['notificationType'];
  sourceType: NotificationRecord['source']['sourceType'];
}) {
  switch (args.notificationType) {
    case 'stale_critical_work':
      return 'A stale high-priority item needs founder attention now.';
    case 'blocked_recommendation':
      return 'A blocked recommendation is still unresolved and visible to the founder.';
    case 'founder_review_required':
      return 'Aaliyah has reached a founder-review checkpoint.';
    case 'high_priority_follow_through':
      return 'A new high-priority follow-through item was created and should be seen.';
    case 'opportunity_signal':
      return 'A meaningful opportunity signal is ready for founder review.';
    default:
      return `No notification is active for ${args.sourceType.replace(/_/g, ' ')}.`;
  }
}

export function buildNotificationReason(reason: string) {
  return reason.trim();
}

export function buildNotificationListMessage(count: number) {
  return count === 1 ? 'Loaded 1 notification.' : `Loaded ${count} notifications.`;
}
