export type DeliveryChannel = 'console' | 'email';
export type DeliverySourceType = 'notification' | 'digest';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'replayed';

export type DeliveryRecord = {
  id: string;
  tenantId: string;
  channel: DeliveryChannel;
  sourceType: DeliverySourceType;
  sourceId: string;
  deliveryStatus: DeliveryStatus;
  attemptCount: number;
  lastError: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  sentAtIso: string | null;
};

export type DeliveryFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type DeliveryResult =
  | {
      ok: true;
      delivery: DeliveryRecord;
      replayed: boolean;
      message: string;
    }
  | DeliveryFailureResult;

export type DeliveryListResult =
  | {
      ok: true;
      deliveries: DeliveryRecord[];
      message: string;
    }
  | DeliveryFailureResult;

export type DeliveryAuditEventType =
  | 'aaliyah.delivery.sent'
  | 'aaliyah.delivery.failed'
  | 'aaliyah.delivery.replayed';

export type DeliveryAuditEvent = {
  eventType: DeliveryAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};
