import { describe, expect, it, vi } from 'vitest';

import { AaliyahFounderCommandService } from '../src/aaliyah/founder-command-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const task = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Follow up with John',
    description: 'Send proposal follow-up',
    status: 'open' as const,
    priority: 'normal' as const,
    source: 'crm_follow_up' as const,
    contactId: 'crm-contact:1',
    accountId: 'crm-account:1',
    relatedEmailDraftId: 'draft:1',
    relatedCalendarEventId: null,
    dueAt: null,
    remindAt: null,
    blockedReason: null,
    completionNote: null,
    nextStepSummary: 'Task is open.',
    createdAt: '2026-03-16T00:00:00.000Z',
    updatedAt: '2026-03-16T00:00:00.000Z',
    completedAt: null
  };
  return {
    getFounderCommandByIdempotencyKey: vi.fn(async () => null),
    createFounderCommand: vi.fn(async (args: any) => ({
      id: 'founder-command:1',
      tenantId: args.tenantId,
      requestId: args.requestId,
      actorUserId: args.actorUserId,
      actorRole: 'founder',
      commandType: args.commandType,
      targetType: args.targetType,
      targetId: args.targetId,
      payload: args.payload,
      idempotencyKey: args.idempotencyKey,
      executionStatus: args.executionStatus,
      summary: args.summary,
      auditEventId: args.auditEventId,
      metadata: args.metadata ?? {},
      createdAt: args.createdAt,
      executedAt: args.executedAt ?? args.createdAt
    })),
    getFounderCommandById: vi.fn(async ({ commandId }: { commandId: string }) =>
      commandId === 'founder-command:1'
        ? {
            id: 'founder-command:1',
            tenantId,
            requestId: 'req-1',
            actorUserId: actorId,
            actorRole: 'founder' as const,
            commandType: 'approve_draft' as const,
            targetType: 'gmail_draft' as const,
            targetId: 'email-review:1',
            payload: { approvalMode: 'approved_for_send' },
            idempotencyKey: 'idem-1',
            executionStatus: 'executed' as const,
            summary: 'Draft approved for send readiness and audit logged.',
            auditEventId: 'diag:1',
            metadata: {},
            createdAt: '2026-03-16T00:00:00.000Z',
            executedAt: '2026-03-16T00:00:00.000Z'
          }
        : null
    ),
    listFounderCommands: vi.fn(async () => [
      {
        id: 'founder-command:1',
        tenantId,
        requestId: 'req-1',
        actorUserId: actorId,
        actorRole: 'founder' as const,
        commandType: 'approve_draft' as const,
        targetType: 'gmail_draft' as const,
        targetId: 'email-review:1',
        payload: { approvalMode: 'approved_for_send' },
        idempotencyKey: 'idem-1',
        executionStatus: 'executed' as const,
        summary: 'Draft approved for send readiness and audit logged.',
        auditEventId: 'diag:1',
        metadata: {},
        createdAt: '2026-03-16T00:00:00.000Z',
        executedAt: '2026-03-16T00:00:00.000Z'
      }
    ]),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => (taskId === 'task:1' ? task : null)),
    getAaliyahCrmContactById: vi.fn(async ({ contactId }: { contactId: string }) =>
      contactId === 'crm-contact:1'
        ? {
            id: 'crm-contact:1',
            tenantId,
            principalId: actorId,
            email: 'john@acme.com',
            firstName: 'John',
            lastName: 'Smith',
            accountId: 'crm-account:1',
            roleTitle: 'CEO',
            phone: null,
            status: 'active' as const,
            relationshipStage: 'follow_up' as const,
            lastTouchedAt: null,
            nextActionAt: null,
            notesSummary: null,
            createdAt: '2026-03-16T00:00:00.000Z',
            updatedAt: '2026-03-16T00:00:00.000Z'
          }
        : null
    ),
    getAaliyahCrmAccountById: vi.fn(async ({ accountId }: { accountId: string }) =>
      accountId === 'crm-account:1'
        ? {
            id: 'crm-account:1',
            tenantId,
            name: 'ACME Corp',
            website: null,
            industry: null,
            status: 'active' as const,
            notesSummary: null,
            createdAt: '2026-03-16T00:00:00.000Z',
            updatedAt: '2026-03-16T00:00:00.000Z'
          }
        : null
    )
  } as any;
}

function createEmailService() {
  return {
    getReviewItem: vi.fn(async ({ reviewItemId }: { reviewItemId: string }) =>
      reviewItemId === 'email-review:1'
        ? {
            reviewItemId: 'email-review:1',
            draftId: 'draft:1',
            reviewStatus: 'pending_review'
          }
        : null
    ),
    approveReviewItem: vi.fn(async () => ({ reviewItemId: 'email-review:1' })),
    requestReviewRevision: vi.fn(async () => ({ reviewItemId: 'email-review:1' }))
  } as any;
}

function createTasksService() {
  return {
    createTask: vi.fn(async ({ input }: { input: { title: string; contactId?: string; accountId?: string; relatedEmailDraftId?: string } }) => ({
      ok: true,
      task: {
        id: 'task:new',
        tenantId,
        principalId: actorId,
        title: input.title,
        description: null,
        status: 'open',
        priority: 'normal',
        source: 'manual',
        contactId: input.contactId ?? null,
        accountId: input.accountId ?? null,
        relatedEmailDraftId: input.relatedEmailDraftId ?? null,
        relatedCalendarEventId: null,
        dueAt: null,
        remindAt: null,
        blockedReason: null,
        completionNote: null,
        nextStepSummary: 'Task is open.',
        createdAt: '2026-03-16T00:00:00.000Z',
        updatedAt: '2026-03-16T00:00:00.000Z',
        completedAt: null
      },
      message: 'Task created successfully.'
    })),
    updateTask: vi.fn(async ({ input }: { input: { priority?: string; status?: string; dueAt?: string } }) => ({
      ok: true,
      task: {
        id: 'task:1',
        tenantId,
        principalId: actorId,
        title: 'Follow up with John',
        description: 'Send proposal follow-up',
        status: input.status ?? 'open',
        priority: input.priority ?? 'critical',
        source: 'crm_follow_up',
        contactId: 'crm-contact:1',
        accountId: 'crm-account:1',
        relatedEmailDraftId: 'draft:1',
        relatedCalendarEventId: null,
        dueAt: input.dueAt ?? null,
        remindAt: input.dueAt ?? null,
        blockedReason: input.status === 'blocked' ? 'Waiting on client' : null,
        completionNote: null,
        nextStepSummary: 'Task updated.',
        createdAt: '2026-03-16T00:00:00.000Z',
        updatedAt: '2026-03-16T00:00:00.000Z',
        completedAt: null
      },
      message: 'Task updated successfully.'
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async ({ eventType }: { eventType: string }) => ({
      tenantId,
      eventId: `diag:${eventType}`,
      actorId,
      principalContext: 'founder',
      activeMode: 'founder',
      eventType,
      eventSource: 'aaliyah_runtime',
      signalKey: eventType,
      payload: {},
      createdAt: '2026-03-16T00:00:00.000Z'
    }))
  } as any;
}

describe('Aaliyah founder command service', () => {
  it('approves a draft through the email service', async () => {
    const repository = createRepository();
    const emailService = createEmailService();
    const diagnostics = createDiagnostics();
    const service = new AaliyahFounderCommandService(repository, emailService, createTasksService(), {}, {}, diagnostics);

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-16T18:00:00.000Z',
      request: {
        commandType: 'approve_draft',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-1',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'gmail_draft',
          targetId: 'email-review:1'
        },
        payload: {
          approvalMode: 'approved_for_send'
        },
        idempotencyKey: 'idem-1'
      }
    });

    expect(result.ok).toBe(true);
    expect(emailService.approveReviewItem).toHaveBeenCalled();
    expect(repository.createFounderCommand).toHaveBeenCalled();
    expect(diagnostics.recordEvent).toHaveBeenCalled();
  });

  it('creates a follow-up from contact context', async () => {
    const service = new AaliyahFounderCommandService(createRepository(), createEmailService(), createTasksService(), {}, {}, createDiagnostics());

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        commandType: 'create_follow_up',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-2',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'contact',
          targetId: 'crm-contact:1'
        },
        payload: {
          title: 'Send client follow-up'
        },
        idempotencyKey: 'idem-2'
      }
    });

    expect(result.ok).toBe(true);
  });

  it('escalates a task', async () => {
    const tasksService = createTasksService();
    const service = new AaliyahFounderCommandService(createRepository(), createEmailService(), tasksService, {}, {}, createDiagnostics());

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        commandType: 'escalate_task',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-3',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'task',
          targetId: 'task:1'
        },
        payload: {
          escalationReason: 'urgent',
          priority: 'critical'
        },
        idempotencyKey: 'idem-3'
      }
    });

    expect(result.ok).toBe(true);
    expect(tasksService.updateTask).toHaveBeenCalled();
  });

  it('returns an idempotent noop on duplicate command replay', async () => {
    const repository = createRepository();
    repository.getFounderCommandByIdempotencyKey.mockResolvedValueOnce({
      id: 'founder-command:1',
      tenantId,
      requestId: 'req-1',
      actorUserId: actorId,
      actorRole: 'founder',
      commandType: 'approve_draft',
      targetType: 'gmail_draft',
      targetId: 'email-review:1',
      payload: { approvalMode: 'approved_for_send' },
      idempotencyKey: 'idem-1',
      executionStatus: 'executed',
      summary: 'Draft approved for send readiness and audit logged.',
      auditEventId: 'diag:1',
      metadata: {},
      createdAt: '2026-03-16T00:00:00.000Z',
      executedAt: '2026-03-16T00:00:00.000Z'
    });
    const emailService = createEmailService();
    const service = new AaliyahFounderCommandService(repository, emailService, createTasksService(), {}, {}, createDiagnostics());

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        commandType: 'approve_draft',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-1',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'gmail_draft',
          targetId: 'email-review:1'
        },
        payload: {
          approvalMode: 'approved_for_send'
        },
        idempotencyKey: 'idem-1'
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('noop');
    }
    expect(emailService.approveReviewItem).not.toHaveBeenCalled();
  });

  it('rejects illegal command-target pairs', async () => {
    const service = new AaliyahFounderCommandService(createRepository(), createEmailService(), createTasksService(), {}, {}, createDiagnostics());

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        commandType: 'approve_draft',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-4',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'task',
          targetId: 'task:1'
        },
        payload: {
          approvalMode: 'approved_for_send'
        },
        idempotencyKey: 'idem-4'
      }
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'INVALID_INPUT',
      retryable: false,
      message: 'Command approve_draft is not allowed for target task.'
    });
  });

  it('requires reasons for schedule overrides', async () => {
    const service = new AaliyahFounderCommandService(createRepository(), createEmailService(), createTasksService(), {}, {}, createDiagnostics());

    const result = await service.executeCommand({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        commandType: 'override_schedule',
        actor: {
          actorUserId: actorId,
          actorRole: 'founder',
          requestId: 'req-5',
          issuedAtIso: '2026-03-16T18:00:00.000Z'
        },
        target: {
          targetType: 'task',
          targetId: 'task:1'
        },
        payload: {
          overrideMode: 'defer'
        },
        idempotencyKey: 'idem-5'
      }
    });

    expect(result).toEqual({
      ok: false,
      denialCode: null,
      errorCode: 'INVALID_INPUT',
      retryable: false,
      message: 'Schedule overrides require a reason.'
    });
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahFounderCommandService(createRepository(), createEmailService(), createTasksService(), {}, {}, createDiagnostics());

    const result = await service.listCommands({
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
      message: 'Founder access is required for founder commands.'
    });
  });
});
