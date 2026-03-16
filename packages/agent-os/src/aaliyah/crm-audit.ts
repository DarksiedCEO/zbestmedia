import { createHash } from 'node:crypto';

import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { AaliyahCrmAuditEvent } from './crm-types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AaliyahCrmAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: AaliyahCrmAuditEvent): Promise<void> {
    if (!this.diagnostics) {
      return;
    }

    await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: 'founder',
      activeMode: event.mode,
      eventType: this.mapEventType(event.eventType),
      eventSource: 'aaliyah_workspace',
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
  }

  buildContactMetadata(args: { email?: string | null; contactId?: string | null; accountId?: string | null; resultCode?: string | null }) {
    return {
      emailHash: args.email ? sha256(args.email) : null,
      contactId: args.contactId ?? null,
      accountId: args.accountId ?? null,
      resultCode: args.resultCode ?? null
    };
  }

  buildAccountMetadata(args: { accountId?: string | null; name?: string | null; resultCode?: string | null }) {
    return {
      accountId: args.accountId ?? null,
      nameHash: args.name ? sha256(args.name) : null,
      resultCode: args.resultCode ?? null
    };
  }

  buildNoteMetadata(args: { contactId?: string | null; accountId?: string | null; note?: string | null; resultCode?: string | null }) {
    return {
      contactId: args.contactId ?? null,
      accountId: args.accountId ?? null,
      noteHash: args.note ? sha256(args.note) : null,
      resultCode: args.resultCode ?? null
    };
  }

  private mapEventType(eventType: AaliyahCrmAuditEvent['eventType']) {
    switch (eventType) {
      case 'aaliyah.crm.contact.created':
        return 'crm_contact_created' as const;
      case 'aaliyah.crm.contact.updated':
        return 'crm_contact_updated' as const;
      case 'aaliyah.crm.account.created':
        return 'crm_account_created' as const;
      case 'aaliyah.crm.account.updated':
        return 'crm_account_updated' as const;
      case 'aaliyah.crm.note.created':
        return 'crm_note_created' as const;
      case 'aaliyah.crm.context.requested':
        return 'crm_context_requested' as const;
      case 'aaliyah.crm.denied':
        return 'crm_denied' as const;
      case 'aaliyah.crm.failed':
        return 'crm_failed' as const;
    }
  }
}
