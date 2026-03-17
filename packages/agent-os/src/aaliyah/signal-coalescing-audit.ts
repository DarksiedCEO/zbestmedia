import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { CoalescingAuditEvent } from './signal-coalescing-types.js';

export class AaliyahSignalCoalescingAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: CoalescingAuditEvent): Promise<string | null> {
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
    signalId: string;
    signalType: string;
    idempotencyKey: string;
    sourceRecordIds: string[];
    sourceRecordTypes: string[];
    dominantSourceType: string;
    suppressedRecordIds: string[];
    reason: string;
    summary: string;
    replayed: boolean;
  }): Record<string, unknown> {
    return {
      signalId: args.signalId,
      signalType: args.signalType,
      idempotencyKey: args.idempotencyKey,
      sourceRecordIds: args.sourceRecordIds,
      sourceRecordTypes: args.sourceRecordTypes,
      dominantSourceType: args.dominantSourceType,
      suppressedRecordIds: args.suppressedRecordIds,
      reason: args.reason,
      summary: args.summary,
      replayed: args.replayed
    };
  }
}

function mapEventType(eventType: CoalescingAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.signal_coalescing.created':
      return 'signal_coalescing_created' as const;
    case 'aaliyah.signal_coalescing.replayed':
      return 'signal_coalescing_replayed' as const;
    case 'aaliyah.signal_coalescing.acknowledged':
      return 'signal_coalescing_acknowledged' as const;
    case 'aaliyah.signal_coalescing.dismissed':
      return 'signal_coalescing_dismissed' as const;
    case 'aaliyah.signal_coalescing.noop':
      return 'signal_coalescing_noop' as const;
  }
}
