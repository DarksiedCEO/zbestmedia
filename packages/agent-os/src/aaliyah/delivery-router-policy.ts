import type { NotificationRecord } from './notification-engine-types.js';
import type { DeliveryChannel, DeliveryRecord, DeliverySourceType } from './delivery-router-types.js';

export const DELIVERY_CHANNEL_ORDER: DeliveryChannel[] = ['console', 'email'];
export const DELIVERY_MAX_ATTEMPTS = 3;

export function buildDeliveryIdempotencyKey(args: {
  channel: DeliveryChannel;
  sourceType: DeliverySourceType;
  sourceId: string;
}) {
  return `delivery:${args.channel}:${args.sourceType}:${args.sourceId}`;
}

export function isChannelEligibleForNotification(args: {
  channel: DeliveryChannel;
  notification: NotificationRecord;
}) {
  if (args.channel === 'console') {
    return true;
  }
  return args.notification.severity === 'critical';
}

export function canRetryDelivery(record: DeliveryRecord, maxAttempts = DELIVERY_MAX_ATTEMPTS) {
  return record.deliveryStatus === 'failed' && record.attemptCount < maxAttempts;
}
