import { describe, expect, it, vi } from 'vitest';

import { AaliyahFollowThroughEngineService } from '../src/aaliyah/follow-through-engine-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const founderCommand = {
    id: 'founder-command:1',
    tenantId,
    requestId: 'req-1',
    actorUserId: actorId,
    actorRole: 'founder' as const,
    commandType: 'approve_draft' as const,
    targetType: 'gmail_draft' as const,
    targetId: 'email-review:1',
    payload: { approvalMode: 'approved_for_send' },
    idempotencyKey: 'founder-command-1',
    executionStatus: 'executed' as const,
    summary: 'Draft approved for send readiness and audit logged.',
    auditEventId: 'aaliyah-diagnostics:event-1',
    metadata: { reviewItemId: 'email-review:1', draftId: 'draft:1', reviewStatus: 'approved' },
    createdAt: '2026-03-16T18:00:00.000Z',
    executedAt: '2026-03-16T18:00:00.000Z'
  };
  const workflowCommand = {
    ...founderCommand,
    id: 'founder-command:workflow',
    commandType: 'trigger_workflow' as const,
    targetType: 'workflow' as const,
    targetId: 'draft_follow_up',
    payload: { workflowName: 'draft_follow_up' },
    metadata: { workflowName: 'draft_follow_up' }
  };
  const task = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Send recap',
    description: 'Meeting follow-up',
    status: 'open' as const,
    priority: 'high' as const,
    source: 'calendar_follow_up' as const,
    contactId: 'crm-contact:1',
    accountId: 'crm-account:1',
    relatedEmailDraftId: null,
    relatedCalendarEventId: 'event:1',
    dueAt: '2026-03-15T12:00:00.000Z',
    remindAt: '2026-03-15T11:00:00.000Z',
    blockedReason: null,
    completionNote: null,
    nextStepSummary: 'Send recap',
    createdAt: '2026-03-14T12:00:00.000Z',
    updatedAt: '2026-03-14T12:00:00.000Z',
    completedAt: null
  };

  return {
    getFounderCommandById: vi.fn(async ({ commandId }: { commandId: string }) => {
      if (commandId === founderCommand.id) {
        return founderCommand;
      }
      if (commandId === workflowCommand.id) {
        return workflowCommand;
      }
      return null;
    }),
    listFounderCommands: vi.fn(async () => [founderCommand, workflowCommand]),
    listAaliyahDiagnosticsEvents: vi.fn(async () => []),
    listFollowThroughEngineRecordsBySource: vi.fn(async () => []),
    getFollowThroughEngineRecordByIdempotencyKey: vi.fn(async () => null),
    createFollowThroughEngineRecord: vi.fn(async (args: any) => ({
      id: args.recordId,
      tenantId: args.tenantId,
      source: {
        sourceType: args.sourceType,
        sourceId: args.sourceId
      },
      policyKey: args.policyKey,
      decisionType: args.decisionType,
      status: args.evaluationStatus,
      reason: args.reason,
      summary: args.summary,
      idempotencyKey: args.idempotencyKey,
      createdArtifactIds: args.createdArtifactIds,
      auditEventId: args.auditEventId,
      metadata: args.metadata ?? {},
      createdAt: args.createdAt,
      evaluatedAtIso: args.evaluatedAt
    })),
    getFollowThroughEngineRecordById: vi.fn(async ({ recordId }: { recordId: string }) => recordId === 'follow-through-engine:1' ? {
      id: 'follow-through-engine:1',
      tenantId,
      source: { sourceType: 'founder_command' as const, sourceId: founderCommand.id },
      policyKey: 'FT-001-approved-draft-next-step' as const,
      decisionType: 'create_task' as const,
      status: 'eligible' as const,
      reason: 'Approved draft command requires tracked follow-through.',
      summary: 'Created follow-up task after approved draft command.',
      idempotencyKey: 'ft:key',
      createdArtifactIds: ['task:created:1'],
      auditEventId: 'diag:1',
      metadata: {},
      createdAt: '2026-03-16T18:05:00.000Z',
      evaluatedAtIso: '2026-03-16T18:05:00.000Z'
    } : null),
    listFollowThroughEngineRecords: vi.fn(async () => []),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => (taskId === task.id ? task : null)),
    listAaliyahOpenTasks: vi.fn(async () => [task]),
    getAaliyahCrmContactById: vi.fn(async () => ({ id: 'crm-contact:1', tenantId, principalId: actorId, accountId: 'crm-account:1', email: 'john@acme.com', firstName: 'John', lastName: 'Smith', roleTitle: null, phone: null, status: 'active', relationshipStage: 'follow_up', lastTouchedAt: null, nextActionAt: null, notesSummary: null, createdAt: '2026-03-16T00:00:00.000Z', updatedAt: '2026-03-16T00:00:00.000Z' })),
    getAaliyahCrmAccountById: vi.fn(async () => ({ id: 'crm-account:1', tenantId, name: 'ACME', website: null, industry: null, status: 'active', notesSummary: null, createdAt: '2026-03-16T00:00:00.000Z', updatedAt: '2026-03-16T00:00:00.000Z' }))
  } as any;
}

function createTasksService() {
  return {
    createTask: vi.fn(async ({ input }: { input: { title: string } }) => ({
      ok: true,
      task: {
        id: `task:created:${input.title}`,
        tenantId,
        principalId: actorId,
        title: input.title,
        description: null,
        status: 'open',
        priority: 'high',
        source: 'email_follow_up',
        contactId: null,
        accountId: null,
        relatedEmailDraftId: null,
        relatedCalendarEventId: null,
        dueAt: null,
        remindAt: null,
        blockedReason: null,
        completionNote: null,
        nextStepSummary: null,
        createdAt: '2026-03-16T18:05:00.000Z',
        updatedAt: '2026-03-16T18:05:00.000Z',
        completedAt: null
      },
      message: 'Task created successfully.'
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-2' }))
  } as any;
}

describe('Aaliyah follow-through engine service', () => {
  it('creates a follow-up task from an approved draft command', async () => {
    const repository = createRepository();
    const tasksService = createTasksService();
    const service = new AaliyahFollowThroughEngineService(repository, tasksService, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'founder_command', sourceId: 'founder-command:1' },
      generatedAt: '2026-03-16T18:05:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.policyKey).toBe('FT-001-approved-draft-next-step');
      expect(result.record.createdArtifactIds).toHaveLength(1);
    }
    expect(tasksService.createTask).toHaveBeenCalled();
  });

  it('replays an existing idempotent evaluation', async () => {
    const repository = createRepository();
    repository.getFollowThroughEngineRecordByIdempotencyKey.mockResolvedValueOnce({
      id: 'follow-through-engine:existing',
      tenantId,
      source: { sourceType: 'founder_command', sourceId: 'founder-command:1' },
      policyKey: 'FT-001-approved-draft-next-step',
      decisionType: 'create_task',
      status: 'eligible',
      reason: 'Approved draft command requires tracked follow-through.',
      summary: 'Created follow-up task after approved draft command.',
      idempotencyKey: 'ft:key',
      createdArtifactIds: ['task:created:1'],
      auditEventId: 'diag:1',
      metadata: {},
      createdAt: '2026-03-16T18:05:00.000Z',
      evaluatedAtIso: '2026-03-16T18:05:00.000Z'
    });
    const tasksService = createTasksService();
    const service = new AaliyahFollowThroughEngineService(repository, tasksService, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'founder_command', sourceId: 'founder-command:1' },
      generatedAt: '2026-03-16T18:05:00.000Z'
    });

    expect(result.ok).toBe(true);
    expect(tasksService.createTask).not.toHaveBeenCalled();
    expect(repository.createFollowThroughEngineRecord).not.toHaveBeenCalled();
  });

  it('flags overdue tasks as stale', async () => {
    const repository = createRepository();
    repository.getAaliyahTaskById.mockResolvedValueOnce({
      ...(await repository.getAaliyahTaskById({ taskId: 'task:1' })),
      relatedCalendarEventId: null,
      source: 'crm_follow_up',
      dueAt: '2026-03-14T12:00:00.000Z'
    });
    const service = new AaliyahFollowThroughEngineService(repository, createTasksService(), createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'task', sourceId: 'task:1' },
      generatedAt: '2026-03-16T18:05:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.policyKey).toBe('FT-003-overdue-task-stale');
      expect(result.record.decisionType).toBe('flag_stale');
    }
  });

  it('does not create false follow-through from rejected founder intent', async () => {
    const repository = createRepository();
    repository.getFounderCommandById.mockResolvedValueOnce(null);
    repository.listAaliyahDiagnosticsEvents.mockResolvedValueOnce([
      {
        tenantId,
        eventId: 'diag:rejected:1',
        actorId,
        principalContext: 'founder',
        activeMode: 'founder',
        eventType: 'founder_command_rejected',
        eventSource: 'aaliyah_runtime',
        signalKey: 'aaliyah.founder_command.rejected',
        payload: {
          requestId: 'req-rejected',
          commandType: 'approve_draft',
          targetType: 'gmail_draft',
          targetId: 'email-review:1'
        },
        createdAt: '2026-03-16T18:06:00.000Z'
      }
    ]);
    const tasksService = createTasksService();
    const service = new AaliyahFollowThroughEngineService(repository, tasksService, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'founder_command', sourceId: 'req-rejected' },
      generatedAt: '2026-03-16T18:07:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.policyKey).toBe('FT-005-rejected-intent-context');
      expect(result.record.decisionType).toBe('record_blocked');
    }
    expect(tasksService.createTask).not.toHaveBeenCalled();
  });

  it('creates recap task from event-linked context', async () => {
    const repository = createRepository();
    const tasksService = createTasksService();
    const service = new AaliyahFollowThroughEngineService(repository, tasksService, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'calendar_event', sourceId: 'event:1' },
      generatedAt: '2026-03-16T18:05:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.policyKey).toBe('FT-004-event-linked-recap');
    }
    expect(tasksService.createTask).toHaveBeenCalled();
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahFollowThroughEngineService(createRepository(), createTasksService(), createDiagnostics());

    const result = await service.listRecords({
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
      message: 'Founder access is required for follow-through actions.'
    });
  });
});
