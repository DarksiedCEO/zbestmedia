import { createHash } from 'node:crypto';

import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { AaliyahTasksAuditEvent } from './tasks-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AaliyahTasksAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: AaliyahTasksAuditEvent): Promise<void> {
    if (!this.diagnostics) {
      return;
    }

    await this.diagnostics.recordEvent({
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
  }

  buildTaskMetadata(args: {
    taskId?: string | null;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    source?: string | null;
    contactId?: string | null;
    accountId?: string | null;
    relatedEmailDraftId?: string | null;
    relatedCalendarEventId?: string | null;
    resultCode?: string | null;
  }) {
    return {
      taskId: args.taskId ?? null,
      titleHash: args.title ? sha256(args.title) : null,
      status: args.status ?? null,
      priority: args.priority ?? null,
      source: args.source ?? null,
      contactId: args.contactId ?? null,
      accountId: args.accountId ?? null,
      relatedEmailDraftId: args.relatedEmailDraftId ?? null,
      relatedCalendarEventId: args.relatedCalendarEventId ?? null,
      resultCode: args.resultCode ?? null
    };
  }

  private mapEventType(eventType: AaliyahTasksAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.tasks.created':
        return 'tasks_created' as const;
      case 'aaliyah.tasks.updated':
        return 'tasks_updated' as const;
      case 'aaliyah.tasks.completed':
        return 'tasks_completed' as const;
      case 'aaliyah.tasks.blocked':
        return 'tasks_blocked' as const;
      case 'aaliyah.tasks.requested':
        return 'tasks_requested' as const;
      case 'aaliyah.tasks.list.requested':
        return 'tasks_list_requested' as const;
      case 'aaliyah.tasks.denied':
        return 'tasks_denied' as const;
      case 'aaliyah.tasks.failed':
        return 'tasks_failed' as const;
    }
  }
}
