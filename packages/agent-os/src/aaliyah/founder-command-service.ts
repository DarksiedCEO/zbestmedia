import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import {
  AaliyahFounderCommandAuditService
} from './founder-command-audit.js';
import {
  FounderCommandAccessDeniedError,
  FounderCommandConflictError,
  FounderCommandInternalError,
  FounderCommandInvalidModeError,
  FounderCommandNotFoundError,
  FounderCommandValidationError
} from './founder-command-errors.js';
import {
  assertFounderCommandAllowed,
  assertFounderCommandIdempotency,
  assertFounderCommandPayload,
  assertNotCompletedTaskTransition
} from './founder-command-policy.js';
import { buildFounderCommandSummary } from './founder-command-summary.js';
import type {
  FounderApproveDraftPayload,
  FounderCommandFailureResult,
  FounderCommandListResult,
  FounderCommandRecord,
  FounderCommandRequest,
  FounderCommandResult,
  FounderCommandSuccessResult,
  FounderCreateFollowUpPayload,
  FounderEscalateTaskPayload,
  FounderOverrideSchedulePayload,
  FounderTriggerWorkflowPayload
} from './founder-command-types.js';
import type { AaliyahTasksService } from './tasks-service.js';
import type { AgentOsRepository } from '../persistence/repository.js';
import type { EmailAssistantService } from '../email/service.js';

export class AaliyahFounderCommandService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahFounderCommandAuditService;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly emailService: EmailAssistantService,
    private readonly tasksService: AaliyahTasksService,
    _crmService: unknown,
    _calendarService: unknown,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahFounderCommandAuditService(diagnostics);
  }

  async executeCommand(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt?: string;
  }): Promise<FounderCommandResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      this.validateRequest(args.request);

      const existing = await this.repository.getFounderCommandByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: args.request.idempotencyKey
      });
      if (existing) {
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.founder_command.noop',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            commandId: existing.id,
            requestId: existing.requestId,
            commandType: existing.commandType,
            targetType: existing.targetType,
            targetId: existing.targetId,
            idempotencyKey: existing.idempotencyKey,
            executionStatus: 'noop',
            summary: existing.summary,
            resultCode: 'idempotent_replay'
          })
        });
        return this.successFromRecord(existing, auditEventId ?? existing.auditEventId, 'noop');
      }

      const execution = await this.executeByType({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        request: args.request,
        generatedAt
      });
      const summary = buildFounderCommandSummary({
        commandType: args.request.commandType,
        target: args.request.target,
        status: execution.status,
        details: execution.summaryDetails
      });
      const auditEventId = await this.audit.record({
        eventType: execution.status === 'noop' ? 'aaliyah.founder_command.noop' : 'aaliyah.founder_command.executed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          requestId: args.request.actor.requestId,
          commandType: args.request.commandType,
          targetType: args.request.target.targetType,
          targetId: args.request.target.targetId,
          idempotencyKey: args.request.idempotencyKey,
          executionStatus: execution.status,
          summary,
          resultCode: 'ok'
        })
      });

      const record = await this.repository.createFounderCommand({
        tenantId: args.tenantId,
        requestId: args.request.actor.requestId,
        actorUserId: args.actorId,
        actorRole: 'founder',
        commandType: args.request.commandType,
        targetType: args.request.target.targetType,
        targetId: args.request.target.targetId,
        payload: args.request.payload,
        idempotencyKey: args.request.idempotencyKey,
        executionStatus: execution.status,
        summary,
        auditEventId,
        metadata: execution.metadata,
        createdAt: generatedAt,
        executedAt: generatedAt
      });

      return this.successFromRecord(record, auditEventId, execution.status);
    } catch (error) {
      return this.normalizeFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        request: args.request,
        generatedAt,
        error
      });
    }
  }

  async getCommandById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    commandId: string;
    generatedAt?: string;
  }): Promise<FounderCommandResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const record = await this.repository.getFounderCommandById({ tenantId: args.tenantId, commandId: args.commandId });
      if (!record) {
        throw new FounderCommandNotFoundError('Founder command was not found.');
      }
      return this.successFromRecord(record, record.auditEventId, record.executionStatus);
    } catch (error) {
      return this.normalizeFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        request: null,
        generatedAt: args.generatedAt ?? new Date().toISOString(),
        error
      });
    }
  }

  async listCommands(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    generatedAt?: string;
  }): Promise<FounderCommandListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const commands = await this.repository.listFounderCommands({ tenantId: args.tenantId, limit: args.limit });
      return { ok: true, commands, message: 'Founder commands loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        request: null,
        generatedAt: args.generatedAt ?? new Date().toISOString(),
        error
      });
    }
  }

  private async executeByType(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }): Promise<{
    status: 'executed' | 'noop';
    summaryDetails: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }> {
    switch (args.request.commandType) {
      case 'approve_draft':
        return this.executeApproveDraft(args);
      case 'create_follow_up':
        return this.executeCreateFollowUp(args);
      case 'escalate_task':
        return this.executeEscalateTask(args);
      case 'override_schedule':
        return this.executeOverrideSchedule(args);
      case 'trigger_workflow':
        return this.executeTriggerWorkflow(args);
    }
  }

  private async executeApproveDraft(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }) {
    const reviewItem = await this.emailService.getReviewItem({
      tenantId: args.tenantId,
      reviewItemId: args.request.target.targetId
    });
    if (!reviewItem) {
      throw new FounderCommandNotFoundError('Draft review item was not found.');
    }
    const payload = args.request.payload as FounderApproveDraftPayload;
    if (payload.approvalMode === 'approved_for_revision') {
      await this.emailService.requestReviewRevision({
        tenantId: args.tenantId,
        reviewItemId: reviewItem.reviewItemId,
        actorId: args.actorId,
        note: payload.notes!.trim(),
        reviewedAt: args.generatedAt,
        idempotencyKey: args.request.idempotencyKey
      });
    } else {
      await this.emailService.approveReviewItem({
        tenantId: args.tenantId,
        reviewItemId: reviewItem.reviewItemId,
        actorId: args.actorId,
        note: typeof payload.notes === 'string' ? payload.notes.trim() || undefined : undefined,
        reviewedAt: args.generatedAt,
        idempotencyKey: args.request.idempotencyKey
      });
    }
    return {
      status: 'executed' as const,
      summaryDetails: { approvalMode: payload.approvalMode },
      metadata: {
        reviewItemId: reviewItem.reviewItemId,
        draftId: reviewItem.draftId,
        reviewStatus: payload.approvalMode === 'approved_for_revision' ? 'revision_requested' : 'approved'
      }
    };
  }

  private async executeCreateFollowUp(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }) {
    const payload = args.request.payload as FounderCreateFollowUpPayload;
    const resolved = await this.resolveTargetContext(args.tenantId, args.request.target.targetType, args.request.target.targetId);
    const taskResult = await this.tasksService.createTask({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      generatedAt: args.generatedAt,
      input: {
        title: payload.title,
        description: payload.description,
        source: this.mapSourceFromTarget(args.request.target.targetType),
        priority: 'normal',
        contactId: payload.attachToContactId ?? resolved.contactId ?? undefined,
        accountId: payload.attachToAccountId ?? resolved.accountId ?? undefined,
        relatedEmailDraftId: resolved.relatedEmailDraftId ?? undefined,
        relatedCalendarEventId: resolved.relatedCalendarEventId ?? undefined,
        dueAt: payload.dueAtIso,
        remindAt: payload.remindAtIso
      }
    });
    if (!taskResult.ok) {
      throw new FounderCommandInternalError(taskResult.message);
    }
    return {
      status: 'executed' as const,
      summaryDetails: { createdTaskId: taskResult.task.id },
      metadata: {
        createdTaskId: taskResult.task.id,
        contactId: taskResult.task.contactId,
        accountId: taskResult.task.accountId,
        relatedEmailDraftId: taskResult.task.relatedEmailDraftId,
        relatedCalendarEventId: taskResult.task.relatedCalendarEventId
      }
    };
  }

  private async executeEscalateTask(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }) {
    const task = await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: args.request.target.targetId });
    if (!task) {
      throw new FounderCommandNotFoundError('Task was not found.');
    }
    assertNotCompletedTaskTransition(task.status);
    const payload = args.request.payload as FounderEscalateTaskPayload;
    const update = await this.tasksService.updateTask({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      taskId: task.id,
      generatedAt: args.generatedAt,
      input: {
        priority: payload.priority,
        status: payload.escalationReason === 'blocked' ? 'blocked' : task.status,
        blockedReason: payload.escalationReason === 'blocked' ? payload.notes ?? 'Founder escalation marked this task blocked.' : undefined
      }
    });
    if (!update.ok) {
      throw new FounderCommandInternalError(update.message);
    }
    return {
      status: 'executed' as const,
      summaryDetails: { priority: update.task.priority },
      metadata: {
        taskId: update.task.id,
        status: update.task.status,
        priority: update.task.priority,
        escalationReason: payload.escalationReason
      }
    };
  }

  private async executeOverrideSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }) {
    const payload = args.request.payload as FounderOverrideSchedulePayload;
    if (args.request.target.targetType === 'task') {
      const task = await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: args.request.target.targetId });
      if (!task) {
        throw new FounderCommandNotFoundError('Task was not found.');
      }
      assertNotCompletedTaskTransition(task.status);
      const update = await this.tasksService.updateTask({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        taskId: task.id,
        generatedAt: args.generatedAt,
        input: {
          dueAt: payload.startAtIso,
          remindAt: payload.startAtIso,
          description: payload.description ?? task.description ?? undefined
        }
      });
      if (!update.ok) {
        throw new FounderCommandInternalError(update.message);
      }
      return {
        status: 'executed' as const,
        summaryDetails: { overrideMode: payload.overrideMode },
        metadata: {
          taskId: update.task.id,
          dueAt: update.task.dueAt,
          remindAt: update.task.remindAt,
          overrideReason: payload.reason
        }
      };
    }

    return {
      status: 'noop' as const,
      summaryDetails: { overrideMode: payload.overrideMode },
      metadata: {
        targetType: args.request.target.targetType,
        targetId: args.request.target.targetId,
        overrideReason: payload.reason,
        liveCalendarMutationApplied: false
      }
    };
  }

  private async executeTriggerWorkflow(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: FounderCommandRequest;
    generatedAt: string;
  }) {
    const payload = args.request.payload as FounderTriggerWorkflowPayload;
    const target = await this.resolveTargetContext(args.tenantId, args.request.target.targetType, args.request.target.targetId);
    const workflowDefaults = {
      draft_follow_up: {
        title: 'Founder follow-up draft review',
        source: 'email_follow_up' as const,
        relatedEmailDraftId: target.relatedEmailDraftId
      },
      contact_revival: {
        title: 'Founder contact revival follow-up',
        source: 'crm_follow_up' as const,
        relatedEmailDraftId: null
      },
      post_meeting_recap: {
        title: 'Founder post-meeting recap follow-up',
        source: 'calendar_follow_up' as const,
        relatedEmailDraftId: null
      }
    }[payload.workflowName];

    const taskResult = await this.tasksService.createTask({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      generatedAt: args.generatedAt,
      input: {
        title: typeof payload.input?.title === 'string' ? payload.input.title : workflowDefaults.title,
        description: typeof payload.input?.description === 'string' ? payload.input.description : undefined,
        source: workflowDefaults.source,
        priority: 'high',
        contactId: target.contactId ?? undefined,
        accountId: target.accountId ?? undefined,
        relatedEmailDraftId: workflowDefaults.relatedEmailDraftId ?? undefined,
        relatedCalendarEventId: target.relatedCalendarEventId ?? undefined,
        dueAt: typeof payload.input?.dueAtIso === 'string' ? payload.input.dueAtIso : undefined,
        remindAt: typeof payload.input?.remindAtIso === 'string' ? payload.input.remindAtIso : undefined
      }
    });
    if (!taskResult.ok) {
      throw new FounderCommandInternalError(taskResult.message);
    }
    return {
      status: 'executed' as const,
      summaryDetails: { workflowName: payload.workflowName },
      metadata: {
        workflowName: payload.workflowName,
        createdTaskId: taskResult.task.id,
        contactId: taskResult.task.contactId,
        accountId: taskResult.task.accountId
      }
    };
  }

  private async resolveTargetContext(tenantId: string, targetType: FounderCommandRequest['target']['targetType'], targetId: string) {
    switch (targetType) {
      case 'gmail_draft': {
        const reviewItem = await this.emailService.getReviewItem({ tenantId, reviewItemId: targetId });
        if (!reviewItem) {
          throw new FounderCommandNotFoundError('Draft review item was not found.');
        }
        return {
          relatedEmailDraftId: reviewItem.draftId,
          relatedCalendarEventId: null,
          contactId: null,
          accountId: null
        };
      }
      case 'task': {
        const task = await this.repository.getAaliyahTaskById({ tenantId, taskId: targetId });
        if (!task) {
          throw new FounderCommandNotFoundError('Task was not found.');
        }
        return {
          relatedEmailDraftId: task.relatedEmailDraftId,
          relatedCalendarEventId: task.relatedCalendarEventId,
          contactId: task.contactId,
          accountId: task.accountId
        };
      }
      case 'contact': {
        const contact = await this.repository.getAaliyahCrmContactById({ tenantId, contactId: targetId });
        if (!contact) {
          throw new FounderCommandNotFoundError('CRM contact was not found.');
        }
        return {
          relatedEmailDraftId: null,
          relatedCalendarEventId: null,
          contactId: contact.id,
          accountId: contact.accountId
        };
      }
      case 'account': {
        const account = await this.repository.getAaliyahCrmAccountById({ tenantId, accountId: targetId });
        if (!account) {
          throw new FounderCommandNotFoundError('CRM account was not found.');
        }
        return {
          relatedEmailDraftId: null,
          relatedCalendarEventId: null,
          contactId: null,
          accountId: account.id
        };
      }
      case 'calendar_event':
        return {
          relatedEmailDraftId: null,
          relatedCalendarEventId: targetId,
          contactId: null,
          accountId: null
        };
      case 'workflow':
        return {
          relatedEmailDraftId: null,
          relatedCalendarEventId: null,
          contactId: null,
          accountId: null
        };
    }
  }

  private mapSourceFromTarget(targetType: FounderCommandRequest['target']['targetType']) {
    switch (targetType) {
      case 'gmail_draft':
        return 'email_follow_up' as const;
      case 'calendar_event':
        return 'calendar_follow_up' as const;
      case 'contact':
      case 'account':
        return 'crm_follow_up' as const;
      case 'task':
      case 'workflow':
        return 'manual' as const;
    }
  }

  private validateRequest(request: FounderCommandRequest) {
    assertFounderCommandIdempotency(request.idempotencyKey);
    assertFounderCommandAllowed(request.actor.actorRole, request.commandType, request.target.targetType);
    assertFounderCommandPayload(request.commandType, request.payload);
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new FounderCommandAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new FounderCommandInvalidModeError();
    }
  }

  private successFromRecord(record: FounderCommandRecord, auditEventId: string | null, status: 'executed' | 'noop'): FounderCommandSuccessResult {
    return {
      ok: true,
      commandId: record.id,
      commandType: record.commandType,
      target: {
        targetType: record.targetType,
        targetId: record.targetId
      },
      status,
      summary: record.summary,
      auditEventId,
      executedAtIso: record.executedAt ?? record.createdAt
    };
  }

  private async normalizeFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    request: FounderCommandRequest | null;
    generatedAt: string;
    error: unknown;
  }): Promise<FounderCommandFailureResult> {
    const error = args.error instanceof Error ? args.error : new FounderCommandInternalError();
    const result: FounderCommandFailureResult =
      error instanceof FounderCommandAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
        ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for founder commands.' }
        : error instanceof FounderCommandInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
          ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for founder commands.' }
          : error instanceof FounderCommandValidationError
            ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
            : error instanceof FounderCommandNotFoundError
              ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
              : error instanceof FounderCommandConflictError
                ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
                : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Founder command execution failed.' };

    await this.audit.record({
      eventType: 'aaliyah.founder_command.rejected',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: args.generatedAt,
      metadata: this.audit.buildMetadata({
        requestId: args.request?.actor.requestId ?? null,
        commandType: args.request?.commandType ?? null,
        targetType: args.request?.target.targetType ?? null,
        targetId: args.request?.target.targetId ?? null,
        idempotencyKey: args.request?.idempotencyKey ?? null,
        executionStatus: 'rejected',
        summary: result.message,
        resultCode: result.errorCode ?? result.denialCode ?? 'error'
      })
    });

    return result;
  }
}
