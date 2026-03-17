import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { TimelineAuditEvent } from './timeline-types.js';

export class AaliyahTimelineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: TimelineAuditEvent): Promise<string | null> {
    if (!this.diagnostics) {
      return null;
    }
    const result = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: event.eventType === 'aaliyah.timeline.composed' ? 'timeline_composed' : 'timeline_replayed',
      eventSource: 'aaliyah_timeline',
      signalKey: 'aaliyah.timeline',
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return result.eventId;
  }
}
