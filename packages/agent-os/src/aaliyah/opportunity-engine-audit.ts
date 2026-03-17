import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { OpportunityAuditEvent } from './opportunity-engine-types.js';

export class AaliyahOpportunityEngineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: OpportunityAuditEvent): Promise<string | null> {
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
    opportunityId: string;
    sourceType: string;
    sourceId: string;
    opportunityType: string;
    idempotencyKey: string;
    relatedTaskId: string | null;
    relatedRecommendationId: string | null;
    reason: string;
    summary: string;
    replayed: boolean;
  }): Record<string, unknown> {
    return {
      opportunityId: args.opportunityId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      opportunityType: args.opportunityType,
      idempotencyKey: args.idempotencyKey,
      relatedTaskId: args.relatedTaskId,
      relatedRecommendationId: args.relatedRecommendationId,
      reason: args.reason,
      summary: args.summary,
      replayed: args.replayed
    };
  }
}

function mapEventType(eventType: OpportunityAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.opportunity.created':
      return 'opportunity_engine_created' as const;
    case 'aaliyah.opportunity.replayed':
      return 'opportunity_engine_replayed' as const;
    case 'aaliyah.opportunity.acknowledged':
      return 'opportunity_engine_acknowledged' as const;
    case 'aaliyah.opportunity.dismissed':
      return 'opportunity_engine_dismissed' as const;
    case 'aaliyah.opportunity.noop':
      return 'opportunity_engine_noop' as const;
  }
}
