import { describe, expect, it, vi } from 'vitest';

import { AaliyahTasksService } from '../src/aaliyah/tasks-service.js';

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
    notesSummary: null,
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
    status: 'active' as const,
    relationshipStage: 'follow_up' as const,
    lastTouchedAt: '2026-03-10T00:00:00.000Z',
    nextActionAt: '2026-03-20T00:00:00.000Z',
    notesSummary: null,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z'
  };
  const task = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Follow up with John',
    description: 'Send proposal follow-up before 3 PM',
    status: 'open' as const,
    priority: 'high' as const,
    source: 'crm_follow_up' as const,
    contactId: contact.id,
    accountId: account.id,
    relatedEmailDraftId: 'draft:1',
    relatedCalendarEventId: null,
    dueAt: '2026-03-20T22:00:00.000Z',
    remindAt: '2026-03-20T18:00:00.000Z',
    blockedReason: null,
    completionNote: null,
    nextStepSummary: 'Task is open, high priority.',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    completedAt: null
  };
  return {
    getAaliyahCrmContactById: vi.fn(async ({ contactId }: { contactId: string }) => (contactId === contact.id ? contact : null)),
    getAaliyahCrmAccountById: vi.fn(async ({ accountId }: { accountId: string }) => (accountId === account.id ? account : null)),
    createAaliyahTask: vi.fn(async (args: any) => ({ ...task, ...args, id: args.taskId, nextStepSummary: args.nextStepSummary, createdAt: args.createdAt, updatedAt: args.createdAt })),
    updateAaliyahTask: vi.fn(async (args: any) => ({ ...task, ...args, id: args.taskId, source: task.source, contactId: task.contactId, accountId: task.accountId, relatedEmailDraftId: task.relatedEmailDraftId, relatedCalendarEventId: task.relatedCalendarEventId, createdAt: task.createdAt, updatedAt: args.updatedAt })),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => (taskId === task.id ? task : null)),
    listAaliyahOpenTasks: vi.fn(async () => [task]),
    listAaliyahTasksByContactId: vi.fn(async () => [task]),
    listAaliyahTasksByAccountId: vi.fn(async () => [task])
  } as any;
}

function createDiagnostics() {
  return { recordEvent: vi.fn(async () => undefined) } as any;
}

describe('Aaliyah tasks service', () => {
  it('allows founder to create a task', async () => {
    const repository = createRepository();
    const diagnostics = createDiagnostics();
    const service = new AaliyahTasksService(repository, diagnostics);

    const result = await service.createTask({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      input: {
        title: '  Follow up with John  ',
        contactId: 'crm-contact:1',
        accountId: 'crm-account:1',
        priority: 'high',
        source: 'crm_follow_up'
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task.title).toBe('Follow up with John');
      expect(result.task.status).toBe('open');
      expect(result.task.nextStepSummary).toContain('John Smith');
    }
    expect(diagnostics.recordEvent).toHaveBeenCalled();
  });

  it('denies non-founder task access', async () => {
    const service = new AaliyahTasksService(createRepository(), createDiagnostics());
    const result = await service.listOpenTasks({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder'
    });

    expect(result).toEqual({
      ok: false,
      denialCode: 'ACCESS_DENIED',
      errorCode: null,
      retryable: false,
      message: 'Founder access is required for task actions.'
    });
  });

  it('requires a blocked reason when blocking a task', async () => {
    const service = new AaliyahTasksService(createRepository(), createDiagnostics());
    const result = await service.updateTask({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      taskId: 'task:1',
      input: { status: 'blocked' }
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'INVALID_INPUT',
      retryable: false,
      message: 'Blocked tasks require a blocked reason.'
    });
  });

  it('marks completed tasks with completedAt', async () => {
    const repository = createRepository();
    const service = new AaliyahTasksService(repository, createDiagnostics());

    const result = await service.updateTask({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      taskId: 'task:1',
      input: { status: 'completed', completionNote: 'Email sent' },
      generatedAt: '2026-03-16T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task.status).toBe('completed');
      expect(result.task.completedAt).toBe('2026-03-16T12:00:00.000Z');
    }
  });

  it('lists tasks by contact and account', async () => {
    const service = new AaliyahTasksService(createRepository(), createDiagnostics());

    const byContact = await service.listTasksByContactId({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      contactId: 'crm-contact:1'
    });
    const byAccount = await service.listTasksByAccountId({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      accountId: 'crm-account:1'
    });

    expect(byContact.ok && byContact.tasks).toHaveLength(1);
    expect(byAccount.ok && byAccount.tasks).toHaveLength(1);
  });

  it('normalizes not-found responses', async () => {
    const repository = createRepository();
    repository.getAaliyahTaskById.mockResolvedValueOnce(null);
    const service = new AaliyahTasksService(repository, createDiagnostics());

    const result = await service.getTaskById({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      taskId: 'task:missing'
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'NOT_FOUND',
      retryable: false,
      message: 'Task was not found.'
    });
  });
});
