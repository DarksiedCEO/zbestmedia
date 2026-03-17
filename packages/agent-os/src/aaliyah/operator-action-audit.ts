import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { OperatorActionAuditEvent, OperatorActionExecutionStatus } from './operator-action-types.js';

export class AaliyahOperatorActionAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: OperatorActionAuditEvent): Promise<string | null> {
    if (!this.diagnostics) return null;
    const created = await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: mapEventType(event.eventType),
      eventSource: 'aaliyah_follow_through',
      signalKey: `operator-action:${event.metadata?.queueItemId ?? 'unknown'}`,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
    return created.eventId;
  }

  buildMetadata(args: {
    queueItemId: string;
    actionPath: string;
    executionStatus: OperatorActionExecutionStatus;
    canonicalIssueKey: string | null;
    commandId?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
    suppressedQueueItemIds?: string[];
  }) {
    return {
      queueItemId: args.queueItemId,
      actionPath: args.actionPath,
      executionStatus: args.executionStatus,
      canonicalIssueKey: args.canonicalIssueKey,
      commandId: args.commandId ?? null,
      failureCode: args.failureCode ?? null,
      failureReason: args.failureReason ?? null,
      suppressedQueueItemIds: args.suppressedQueueItemIds ?? []
    };
  }
}

function mapEventType(eventType: OperatorActionAuditEvent['eventType']) {
  switch (eventType) {
    case 'aaliyah.operator_action.executed':
      return 'operator_action_executed' as const;
    case 'aaliyah.operator_action.replayed':
      return 'operator_action_replayed' as const;
    default:
      return 'operator_action_failed' as const;
  }
}
