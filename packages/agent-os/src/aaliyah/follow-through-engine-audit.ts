import { createHash } from 'node:crypto';

import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { FollowThroughEngineAuditEvent } from './follow-through-engine-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AaliyahFollowThroughEngineAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: FollowThroughEngineAuditEvent): Promise<string | null> {
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
    evaluationId: string;
    sourceType: string;
    sourceId: string;
    policyKey: string;
    decisionType: string;
    idempotencyKey: string;
    createdArtifactIds?: string[];
    includedRejectedIntentContext?: boolean;
    linkedCommandId?: string | null;
    linkedTaskId?: string | null;
    reason?: string | null;
    summary?: string | null;
  }) {
    return {
      evaluationId: args.evaluationId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      policyKey: args.policyKey,
      decisionType: args.decisionType,
      idempotencyKeyHash: sha256(args.idempotencyKey),
      createdArtifactIds: args.createdArtifactIds ?? [],
      includedRejectedIntentContext: Boolean(args.includedRejectedIntentContext),
      linkedCommandId: args.linkedCommandId ?? null,
      linkedTaskId: args.linkedTaskId ?? null,
      reasonHash: args.reason ? sha256(args.reason) : null,
      summaryHash: args.summary ? sha256(args.summary) : null
    };
  }

  private mapEventType(eventType: FollowThroughEngineAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.follow_through.executed':
        return 'follow_through_engine_executed' as const;
      case 'aaliyah.follow_through.blocked':
        return 'follow_through_engine_blocked' as const;
      case 'aaliyah.follow_through.stale':
        return 'follow_through_engine_stale' as const;
      case 'aaliyah.follow_through.noop':
        return 'follow_through_engine_noop' as const;
    }
  }
}
