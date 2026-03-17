import { createHash } from 'node:crypto';

import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { RecommendationAuditEvent } from './recommendation-engine-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AaliyahRecommendationEngineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: RecommendationAuditEvent): Promise<string | null> {
    if (!this.diagnostics) {
      return null;
    }
    const recorded = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: this.mapEventType(event.eventType),
      eventSource: 'aaliyah_runtime',
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return recorded.eventId;
  }

  buildMetadata(args: {
    recommendationId: string;
    sourceType: string;
    sourceId: string;
    recommendationType: string;
    idempotencyKey: string;
    relatedCommandId?: string | null;
    relatedTaskId?: string | null;
    reason?: string | null;
    summary?: string | null;
    replayed?: boolean;
  }) {
    return {
      recommendationId: args.recommendationId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      recommendationType: args.recommendationType,
      idempotencyKeyHash: sha256(args.idempotencyKey),
      relatedCommandId: args.relatedCommandId ?? null,
      relatedTaskId: args.relatedTaskId ?? null,
      reasonHash: args.reason ? sha256(args.reason) : null,
      summaryHash: args.summary ? sha256(args.summary) : null,
      replayed: Boolean(args.replayed)
    };
  }

  private mapEventType(eventType: RecommendationAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.recommendation.created':
        return 'recommendation_engine_created' as const;
      case 'aaliyah.recommendation.replayed':
        return 'recommendation_engine_replayed' as const;
      case 'aaliyah.recommendation.noop':
        return 'recommendation_engine_noop' as const;
    }
  }
}
