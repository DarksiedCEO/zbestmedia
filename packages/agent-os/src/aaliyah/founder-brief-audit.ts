import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { FounderBriefAuditEvent } from './founder-brief-types.js';

export class AaliyahFounderBriefAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: FounderBriefAuditEvent): Promise<string | null> {
    if (!this.diagnostics) {
      return null;
    }
    const result = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: event.eventType === 'aaliyah.founder_brief.generated'
        ? 'founder_brief_generated'
        : 'founder_brief_replayed',
      eventSource: 'aaliyah_founder_brief',
      signalKey: 'aaliyah.founder_brief',
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return result.eventId;
  }
}
