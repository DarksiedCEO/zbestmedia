import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { OperatorQueueAuditEvent } from './operator-queue-types.js';

export class AaliyahOperatorQueueAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: OperatorQueueAuditEvent): Promise<string | null> {
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
    queueItemId: string;
    sourceType: string;
    sourceId: string;
    queueItemType: string;
    priorityScore: number;
    priorityBand: string;
    relatedRecordIds: string[];
    relatedRecordTypes: string[];
    actionableCommandType: string | null;
    actionableTargetType: string | null;
    actionableTargetId: string | null;
    reason: string;
    summary: string;
    replayed: boolean;
  }): Record<string, unknown> {
    return {
      queueItemId: args.queueItemId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      queueItemType: args.queueItemType,
      priorityScore: args.priorityScore,
      priorityBand: args.priorityBand,
      relatedRecordIds: args.relatedRecordIds,
      relatedRecordTypes: args.relatedRecordTypes,
      actionableCommandType: args.actionableCommandType,
      actionableTargetType: args.actionableTargetType,
      actionableTargetId: args.actionableTargetId,
      reason: args.reason,
      summary: args.summary,
      replayed: args.replayed
    };
  }
}

function mapEventType(eventType: OperatorQueueAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.operator_queue.created':
      return 'operator_queue_created' as const;
    case 'aaliyah.operator_queue.replayed':
      return 'operator_queue_replayed' as const;
    case 'aaliyah.operator_queue.refreshed':
      return 'operator_queue_refreshed' as const;
    case 'aaliyah.operator_queue.invalidated':
      return 'operator_queue_invalidated' as const;
    case 'aaliyah.operator_queue.suppressed':
      return 'operator_queue_suppressed' as const;
    case 'aaliyah.operator_queue.noop':
      return 'operator_queue_noop' as const;
  }
}
