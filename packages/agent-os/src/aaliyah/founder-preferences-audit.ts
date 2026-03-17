import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';

export class AaliyahFounderPreferencesAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(args: {
    eventType: 'aaliyah.founder_preferences.updated' | 'aaliyah.founder_preferences.resolved';
    principalId: string;
    tenantId: string;
    mode: FounderBriefingMode;
    timestamp: string;
    metadata: Record<string, unknown>;
  }) {
    if (!this.diagnostics) {
      return null;
    }
    const eventType = args.eventType === 'aaliyah.founder_preferences.updated'
      ? 'founder_preferences_updated'
      : 'founder_preferences_resolved';
    return this.diagnostics.recordEvent({
      tenantId: args.tenantId,
      actorId: args.principalId,
      principalContext: 'founder',
      activeMode: args.mode,
      eventType,
      eventSource: 'aaliyah_runtime',
      signalKey: 'founder_preferences_controls',
      payload: args.metadata,
      createdAt: args.timestamp
    });
  }
}
