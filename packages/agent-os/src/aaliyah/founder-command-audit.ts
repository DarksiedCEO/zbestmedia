import { createHash } from 'node:crypto';

import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { FounderCommandAuditEvent } from './founder-command-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AaliyahFounderCommandAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: FounderCommandAuditEvent): Promise<string | null> {
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
    commandId?: string | null;
    requestId?: string | null;
    commandType?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    idempotencyKey?: string | null;
    executionStatus?: string | null;
    summary?: string | null;
    resultCode?: string | null;
  }) {
    return {
      commandId: args.commandId ?? null,
      requestId: args.requestId ?? null,
      commandType: args.commandType ?? null,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      idempotencyKeyHash: args.idempotencyKey ? sha256(args.idempotencyKey) : null,
      executionStatus: args.executionStatus ?? null,
      summaryHash: args.summary ? sha256(args.summary) : null,
      resultCode: args.resultCode ?? null
    };
  }

  private mapEventType(eventType: FounderCommandAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.founder_command.executed':
        return 'founder_command_executed' as const;
      case 'aaliyah.founder_command.rejected':
        return 'founder_command_rejected' as const;
      case 'aaliyah.founder_command.noop':
        return 'founder_command_noop' as const;
    }
  }
}
