import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { EvaluationSchedulerAuditEvent } from './evaluation-scheduler-types.js';

export class AaliyahEvaluationSchedulerAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: EvaluationSchedulerAuditEvent) {
    if (!this.diagnostics) {
      return null;
    }
    const recorded = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventSource: 'aaliyah_follow_through',
      eventType: mapEventType(event.eventType),
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return recorded.eventId;
  }

  buildMetadata(metadata: Record<string, unknown>) {
    return metadata;
  }
}

function mapEventType(eventType: EvaluationSchedulerAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.evaluation_schedule.created':
      return 'evaluation_schedule_created' as const;
    case 'aaliyah.evaluation_schedule.updated':
      return 'evaluation_schedule_updated' as const;
    case 'aaliyah.evaluation_schedule.paused':
      return 'evaluation_schedule_paused' as const;
    case 'aaliyah.evaluation_schedule.resumed':
      return 'evaluation_schedule_resumed' as const;
    case 'aaliyah.evaluation_run.started':
      return 'evaluation_run_started' as const;
    case 'aaliyah.evaluation_run.completed':
      return 'evaluation_run_completed' as const;
    case 'aaliyah.evaluation_run.failed':
      return 'evaluation_run_failed' as const;
    case 'aaliyah.evaluation_run.replayed':
      return 'evaluation_run_replayed' as const;
  }
}
