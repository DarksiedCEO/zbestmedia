import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { DigestAuditEvent } from './digest-composer-types.js';

export class AaliyahDigestComposerAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: DigestAuditEvent): Promise<string | null> {
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
}

function mapEventType(eventType: DigestAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.digest.composed':
      return 'digest_composer_composed' as const;
    case 'aaliyah.digest.sent':
      return 'digest_composer_sent' as const;
    case 'aaliyah.digest.replayed':
      return 'digest_composer_replayed' as const;
    case 'aaliyah.digest.skipped':
      return 'digest_composer_skipped' as const;
  }
}
