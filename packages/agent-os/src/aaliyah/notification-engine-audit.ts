import type { AaliyahDiagnosticsService } from './diagnostics.js';

import type { NotificationAuditEvent } from './notification-engine-types.js';

export class AaliyahNotificationEngineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: NotificationAuditEvent): Promise<string | null> {
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
    notificationId: string;
    sourceType: string;
    sourceId: string;
    notificationType: string;
    idempotencyKey: string;
    severity: string;
    relatedRecommendationId?: string | null;
    relatedTaskId?: string | null;
    reason: string;
    summary: string;
    replayed?: boolean;
  }) {
    return {
      notificationId: args.notificationId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      notificationType: args.notificationType,
      idempotencyKey: args.idempotencyKey,
      severity: args.severity,
      relatedRecommendationId: args.relatedRecommendationId ?? null,
      relatedTaskId: args.relatedTaskId ?? null,
      reason: args.reason,
      summary: args.summary,
      replayed: Boolean(args.replayed)
    };
  }

  private mapEventType(eventType: NotificationAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.notification.created':
        return 'notification_engine_created' as const;
      case 'aaliyah.notification.replayed':
        return 'notification_engine_replayed' as const;
      case 'aaliyah.notification.acknowledged':
        return 'notification_engine_acknowledged' as const;
      case 'aaliyah.notification.dismissed':
        return 'notification_engine_dismissed' as const;
      case 'aaliyah.notification.noop':
        return 'notification_engine_noop' as const;
    }
  }
}
