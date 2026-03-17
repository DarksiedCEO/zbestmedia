import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { OutcomeFeedbackAuditEvent } from './outcome-feedback-types.js';

export class AaliyahOutcomeFeedbackAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: OutcomeFeedbackAuditEvent) {
    if (!this.diagnostics) return null;
    const entry = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: mapAuditEventType(event.eventType),
      eventSource: 'aaliyah_follow_through',
      signalKey: `outcome-feedback:${event.metadata?.canonicalIssueKey ?? 'unknown'}`,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return entry.eventId;
  }

  buildMetadata(args: Record<string, unknown>) {
    return args;
  }
}

function mapAuditEventType(eventType: OutcomeFeedbackAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.outcome_feedback.recorded':
      return 'outcome_feedback_recorded' as const;
    case 'aaliyah.outcome_feedback.replayed':
      return 'outcome_feedback_replayed' as const;
    case 'aaliyah.outcome_feedback.rejected':
      return 'outcome_feedback_rejected' as const;
  }
}
