import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { DeliveryAuditEvent } from './delivery-router-types.js';

export class AaliyahDeliveryRouterAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: DeliveryAuditEvent): Promise<string | null> {
    if (!this.diagnostics) {
      return null;
    }
    const result = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: this.mapEventType(event.eventType),
      eventSource: 'aaliyah_runtime',
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return result.eventId;
  }

  buildMetadata(args: {
    deliveryId: string;
    channel: string;
    sourceType: string;
    sourceId: string;
    attemptCount: number;
    status: string;
    idempotencyKey: string;
    error?: string | null;
    replayed?: boolean;
  }) {
    return {
      deliveryId: args.deliveryId,
      channel: args.channel,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      attemptCount: args.attemptCount,
      status: args.status,
      idempotencyKey: args.idempotencyKey,
      error: args.error ?? null,
      replayed: Boolean(args.replayed)
    };
  }

  private mapEventType(eventType: DeliveryAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.delivery.sent':
        return 'delivery_router_sent' as const;
      case 'aaliyah.delivery.failed':
        return 'delivery_router_failed' as const;
      case 'aaliyah.delivery.replayed':
        return 'delivery_router_replayed' as const;
    }
  }
}
