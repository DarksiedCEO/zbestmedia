import type { NotificationRecord } from './notification-engine-types.js';
import type { DeliveryChannel, DeliveryRecord, DeliverySourceType } from './delivery-router-types.js';
import type { DigestRecord } from './digest-composer-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';
import { severityMeetsThreshold } from './founder-preferences-policy.js';

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
  preferences?: FounderPreferencesRecord;
}) {
  if (args.channel === 'console') {
    return (args.preferences?.delivery.consoleEnabled ?? true)
      && severityMeetsThreshold(args.notification.severity, args.preferences?.notification.minimumConsoleSeverity ?? 'info');
  }
  return (args.preferences?.delivery.emailEnabled ?? true)
    && severityMeetsThreshold(args.notification.severity, args.preferences?.notification.minimumEmailSeverity ?? 'critical');
}

export function isChannelEligibleForDigest(args: {
  channel: DeliveryChannel;
  digest: DigestRecord;
  preferences?: FounderPreferencesRecord;
}) {
  if (args.digest.digestStatus === 'skipped') {
    return false;
  }
  if (args.channel === 'console') {
    return args.preferences?.delivery.consoleEnabled ?? true;
  }
  return args.preferences?.delivery.emailEnabled ?? true;
}

export function canRetryDelivery(record: DeliveryRecord, maxAttempts = DELIVERY_MAX_ATTEMPTS) {
  return record.deliveryStatus === 'failed' && record.attemptCount < maxAttempts;
}
