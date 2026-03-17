import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { EscalationAuditEvent } from './escalation-engine-types.js';

export class AaliyahEscalationEngineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: EscalationAuditEvent): Promise<string | null> {
    if (!this.diagnostics) return null;
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
    escalationId: string;
    escalationType: string;
    escalationLevel: string;
    idempotencyKey: string;
    sourceRecordIds: string[];
    sourceRecordTypes: string[];
    relatedClusterId: string | null;
    reason: string;
    summary: string;
    replayed: boolean;
  }) {
    return {
      escalationId: args.escalationId,
      escalationType: args.escalationType,
      escalationLevel: args.escalationLevel,
      idempotencyKey: args.idempotencyKey,
      sourceRecordIds: args.sourceRecordIds,
      sourceRecordTypes: args.sourceRecordTypes,
      relatedClusterId: args.relatedClusterId,
      reason: args.reason,
      summary: args.summary,
      replayed: args.replayed
    };
  }
}

function mapEventType(eventType: EscalationAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.escalation.created':
      return 'escalation_engine_created' as const;
    case 'aaliyah.escalation.replayed':
      return 'escalation_engine_replayed' as const;
    case 'aaliyah.escalation.acknowledged':
      return 'escalation_engine_acknowledged' as const;
    case 'aaliyah.escalation.dismissed':
      return 'escalation_engine_dismissed' as const;
    case 'aaliyah.escalation.resolved':
      return 'escalation_engine_resolved' as const;
    case 'aaliyah.escalation.noop':
      return 'escalation_engine_noop' as const;
  }
}
