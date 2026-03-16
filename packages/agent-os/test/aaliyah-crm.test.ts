import { describe, expect, it, vi } from 'vitest';

import { AaliyahCrmService } from '../src/aaliyah/crm-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const account = {
    id: 'crm-account:1',
    tenantId,
    name: 'ACME Corp',
    website: 'https://acme.example/',
    industry: 'Media',
    status: 'active' as const,
    notesSummary: 'Important client',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z'
  };
  const contact = {
    id: 'crm-contact:1',
    tenantId,
    principalId: actorId,
    email: 'john@acme.com',
    firstName: 'John',
    lastName: 'Smith',
    accountId: account.id,
    roleTitle: 'CEO',
    phone: null,
    status: 'lead' as const,
    relationshipStage: 'follow_up' as const,
    lastTouchedAt: '2026-03-10T00:00:00.000Z',
    nextActionAt: '2026-03-20T00:00:00.000Z',
    notesSummary: 'Waiting on proposal revision',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z'
  };
  const note = {
    id: 'crm-note:1',
    tenantId,
    contactId: contact.id,
    accountId: account.id,
    authorPrincipalId: actorId,
    note: 'Waiting on proposal revision',
    createdAt: '2026-03-15T00:00:00.000Z'
  };
  return {
    getAaliyahCrmContactByEmail: vi.fn(async ({ email }: { email: string }) => (email === contact.email ? contact : null)),
    getAaliyahCrmContactById: vi.fn(async ({ contactId }: { contactId: string }) => (contactId === contact.id ? contact : null)),
    createAaliyahCrmContact: vi.fn(async (args: any) => ({ ...contact, ...args, id: args.contactId, updatedAt: args.createdAt })),
    updateAaliyahCrmContact: vi.fn(async (args: any) => ({ ...contact, ...args, id: args.contactId })),
    getAaliyahCrmAccountById: vi.fn(async ({ accountId }: { accountId: string }) => (accountId === account.id ? account : null)),
    createAaliyahCrmAccount: vi.fn(async (args: any) => ({ ...account, ...args, id: args.accountId, updatedAt: args.createdAt })),
    updateAaliyahCrmAccount: vi.fn(async (args: any) => ({ ...account, ...args, id: args.accountId })),
    createAaliyahCrmNote: vi.fn(async (args: any) => ({ ...note, ...args, id: args.noteId })),
    listAaliyahCrmNotesForContext: vi.fn(async () => [note])
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => undefined)
  } as any;
}

describe('Aaliyah CRM service', () => {
  it('allows founder to create a contact', async () => {
    const repository = createRepository();
    const diagnostics = createDiagnostics();
    repository.getAaliyahCrmContactByEmail.mockResolvedValueOnce(null);
    const service = new AaliyahCrmService(repository, diagnostics);

    const result = await service.createContact({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      input: {
        email: 'John@Acme.com',
        firstName: 'John',
        accountId: 'crm-account:1',
        relationshipStage: 'contacted'
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contact.email).toBe('john@acme.com');
    }
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('denies non-founder CRM access', async () => {
    const service = new AaliyahCrmService(createRepository(), createDiagnostics());
    const result = await service.getContactByEmail({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder',
      email: 'john@acme.com'
    });

    expect(result).toEqual({
      ok: false,
      denialCode: 'ACCESS_DENIED',
      errorCode: null,
      retryable: false,
      message: 'Founder access is required for CRM actions.'
    });
  });

  it('normalizes duplicate contact email to conflict', async () => {
    const service = new AaliyahCrmService(createRepository(), createDiagnostics());
    const result = await service.createContact({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      input: { email: 'john@acme.com' }
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'CONFLICT',
      retryable: false,
      message: 'CRM contact already exists for this email.'
    });
  });

  it('creates notes and builds context summaries by email', async () => {
    const service = new AaliyahCrmService(createRepository(), createDiagnostics());

    const noteResult = await service.addNote({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      input: { contactId: 'crm-contact:1', note: 'Waiting on proposal revision' }
    });
    expect(noteResult.ok).toBe(true);

    const contextResult = await service.getContextByEmail({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      email: 'john@acme.com'
    });

    expect(contextResult.ok).toBe(true);
    if (contextResult.ok) {
      expect(contextResult.context.summary).toContain('John Smith');
      expect(contextResult.context.summary).toContain('ACME Corp');
      expect(contextResult.context.recentNotes).toHaveLength(1);
    }
  });

  it('returns not found for missing email context', async () => {
    const repository = createRepository();
    repository.getAaliyahCrmContactByEmail.mockResolvedValueOnce(null);
    const service = new AaliyahCrmService(repository, createDiagnostics());

    const result = await service.getContextByEmail({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      email: 'missing@acme.com'
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'NOT_FOUND',
      retryable: false,
      message: 'CRM contact was not found.'
    });
  });
});
