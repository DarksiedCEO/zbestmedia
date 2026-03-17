import { createHash } from 'node:crypto';

import type { NotificationRecord, NotificationSourceRef, NotificationType } from './notification-engine-types.js';

function hash(parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12);
}

export const NOTIFICATION_POLICY_ORDER = [
  'NOTIF-001-stale-critical-work',
  'NOTIF-002-blocked-recommendation',
  'NOTIF-003-founder-review-required',
  'NOTIF-004-high-priority-follow-through',
  'NOTIF-005-opportunity-signal',
  'NOTIF-006-no-action'
] as const;

export type NotificationPolicyKey = typeof NOTIFICATION_POLICY_ORDER[number];

export function buildNotificationIdempotencyKey(args: {
  notificationType: NotificationType;
  source: NotificationSourceRef;
  sourceVersion: string;
}) {
  return `notif:${args.notificationType}:${args.source.sourceType}:${args.source.sourceId}:${hash([args.sourceVersion])}`;
}

export function clusterKeyForNotification(record: Pick<NotificationRecord, 'source' | 'notificationType' | 'severity'>) {
  return `${record.source.sourceType}:${record.source.sourceId}:${record.notificationType}:${record.severity}`;
}
