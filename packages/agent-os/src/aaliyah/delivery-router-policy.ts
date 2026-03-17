import type { NotificationRecord } from './notification-engine-types.js';
import type { DeliveryChannel, DeliveryRecord, DeliverySourceType } from './delivery-router-types.js';
import type { DigestRecord } from './digest-composer-types.js';

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

export function isChannelEligibleForDigest(args: {
  channel: DeliveryChannel;
  digest: DigestRecord;
}) {
  if (args.digest.digestStatus === 'skipped') {
    return false;
  }
  return args.channel === 'console' || args.channel === 'email';
}

export function canRetryDelivery(record: DeliveryRecord, maxAttempts = DELIVERY_MAX_ATTEMPTS) {
  return record.deliveryStatus === 'failed' && record.attemptCount < maxAttempts;
}
