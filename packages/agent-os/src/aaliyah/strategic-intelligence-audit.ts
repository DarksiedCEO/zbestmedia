import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { StrategicIntelligenceAuditEvent } from './strategic-intelligence-types.js';

export class AaliyahStrategicIntelligenceAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: StrategicIntelligenceAuditEvent): Promise<string | null> {
    if (!this.diagnostics) {
      return null;
    }
    const recorded = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: mapEventType(event.eventType),
      eventSource: 'aaliyah_runtime',
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return recorded.eventId;
  }

  buildMetadata(args: {
    insightId: string;
    insightType: string;
    idempotencyKey: string;
    relatedEntityIds: string[];
    relatedRecordIds: string[];
    reason: string;
    summary: string;
    replayed: boolean;
  }): Record<string, unknown> {
    return {
      insightId: args.insightId,
      insightType: args.insightType,
      idempotencyKey: args.idempotencyKey,
      relatedEntityIds: args.relatedEntityIds,
      relatedRecordIds: args.relatedRecordIds,
      reason: args.reason,
      summary: args.summary,
      replayed: args.replayed
    };
  }
}

function mapEventType(eventType: StrategicIntelligenceAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.strategic_insight.created':
      return 'strategic_intelligence_created' as const;
    case 'aaliyah.strategic_insight.replayed':
      return 'strategic_intelligence_replayed' as const;
    case 'aaliyah.strategic_insight.acknowledged':
      return 'strategic_intelligence_acknowledged' as const;
    case 'aaliyah.strategic_insight.dismissed':
      return 'strategic_intelligence_dismissed' as const;
    case 'aaliyah.strategic_insight.noop':
      return 'strategic_intelligence_noop' as const;
  }
}
