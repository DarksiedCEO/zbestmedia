import { DELIVERY_MAX_ATTEMPTS } from './delivery-router-policy.js';
import type { DeliveryRecord } from './delivery-router-types.js';

export function nextAttemptCount(record: DeliveryRecord) {
  return record.attemptCount + 1;
}

export function assertRetryable(record: DeliveryRecord) {
  if (record.deliveryStatus !== 'failed') {
    throw new Error('delivery_retry_requires_failed_status');
  }
  if (record.attemptCount >= DELIVERY_MAX_ATTEMPTS) {
    throw new Error('delivery_retry_attempt_limit_reached');
  }
}
