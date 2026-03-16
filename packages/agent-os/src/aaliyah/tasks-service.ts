import { randomUUID } from 'node:crypto';

import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahAccessControlService } from './access.js';
import { AaliyahTasksAuditService } from './tasks-audit.js';
import {
  AaliyahTaskAccessDeniedError,
  AaliyahTaskConflictError,
  AaliyahTaskInternalError,
  AaliyahTaskInvalidModeError,
  AaliyahTaskNotFoundError,
  AaliyahTaskValidationError
} from './tasks-errors.js';
import { buildAaliyahTaskNextStepSummary } from './tasks-summary.js';
import type {
  AaliyahCreateTaskInput,
  AaliyahTask,
  AaliyahTaskListResult,
  AaliyahTaskPriority,
  AaliyahTaskResult,
  AaliyahTaskSource,
  AaliyahTaskStatus,
  AaliyahUpdateTaskInput
} from './tasks-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

const TITLE_MAX_LENGTH = 200;

export class AaliyahTasksService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahTasksAuditService;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahTasksAuditService(diagnostics);
  }

  async createTask(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    input: AaliyahCreateTaskInput;
    generatedAt?: string;
  }): Promise<AaliyahTaskResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    await this.audit.record({
      eventType: 'aaliyah.tasks.requested',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: generatedAt,
      metadata: this.audit.buildTaskMetadata({
        title: args.input.title ?? null,
        priority: args.input.priority ?? null,
        source: args.input.source ?? null,
        contactId: args.input.contactId ?? null,
        accountId: args.input.accountId ?? null,
        relatedEmailDraftId: args.input.relatedEmailDraftId ?? null,
        relatedCalendarEventId: args.input.relatedCalendarEventId ?? null
      })
    });

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const input = await this.normalizeCreateInput(args.tenantId, args.input);
      const summary = await this.buildNextStepSummary(args.tenantId, {
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        dueAt: input.dueAt,
        blockedReason: null,
        completionNote: null,
        contactId: input.contactId,
        accountId: input.accountId
      });
      const task = await this.repository.createAaliyahTask({
        tenantId: args.tenantId,
        taskId: `task:${randomUUID()}`,
        principalId: args.actorId,
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        source: input.source,
        contactId: input.contactId,
        accountId: input.accountId,
        relatedEmailDraftId: input.relatedEmailDraftId,
        relatedCalendarEventId: input.relatedCalendarEventId,
        dueAt: input.dueAt,
        remindAt: input.remindAt,
        blockedReason: null,
        completionNote: null,
        nextStepSummary: summary,
        completedAt: null,
        createdAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.tasks.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildTaskMetadata({
          taskId: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          source: task.source,
          contactId: task.contactId,
          accountId: task.accountId,
          relatedEmailDraftId: task.relatedEmailDraftId,
          relatedCalendarEventId: task.relatedCalendarEventId,
          resultCode: 'ok'
        })
      });
      return { ok: true, task, message: 'Task created successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahTaskResult>({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        error,
        metadata: this.audit.buildTaskMetadata({
          title: args.input.title ?? null,
          contactId: args.input.contactId ?? null,
          accountId: args.input.accountId ?? null
        })
      });
    }
  }

  async updateTask(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    taskId: string;
    input: AaliyahUpdateTaskInput;
    generatedAt?: string;
  }): Promise<AaliyahTaskResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    await this.audit.record({
      eventType: 'aaliyah.tasks.requested',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: generatedAt,
      metadata: this.audit.buildTaskMetadata({ taskId: args.taskId, status: args.input.status ?? null, priority: args.input.priority ?? null })
    });

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.requireTask(args.tenantId, args.taskId);
      const input = this.normalizeUpdateInput(args.input, existing);
      const nextStatus = input.status ?? existing.status;
      const completedAt = nextStatus === 'completed' ? existing.completedAt ?? generatedAt : null;
      const blockedReason = nextStatus === 'blocked' ? input.blockedReason ?? existing.blockedReason : null;
      const completionNote = nextStatus === 'completed' ? input.completionNote ?? existing.completionNote : null;
      const summary = await this.buildNextStepSummary(args.tenantId, {
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        status: nextStatus,
        priority: input.priority ?? existing.priority,
        dueAt: input.dueAt ?? existing.dueAt,
        blockedReason,
        completionNote,
        contactId: existing.contactId,
        accountId: existing.accountId
      });
      const task = await this.repository.updateAaliyahTask({
        tenantId: args.tenantId,
        taskId: args.taskId,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        status: nextStatus,
        priority: input.priority ?? existing.priority,
        dueAt: input.dueAt ?? existing.dueAt,
        remindAt: input.remindAt ?? existing.remindAt,
        blockedReason,
        completionNote,
        nextStepSummary: summary,
        completedAt,
        updatedAt: generatedAt
      });
      await this.audit.record({
        eventType: task.status === 'completed' ? 'aaliyah.tasks.completed' : task.status === 'blocked' ? 'aaliyah.tasks.blocked' : 'aaliyah.tasks.updated',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildTaskMetadata({
          taskId: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          source: task.source,
          contactId: task.contactId,
          accountId: task.accountId,
          relatedEmailDraftId: task.relatedEmailDraftId,
          relatedCalendarEventId: task.relatedCalendarEventId,
          resultCode: 'ok'
        })
      });
      return { ok: true, task, message: 'Task updated successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahTaskResult>({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        error,
        metadata: this.audit.buildTaskMetadata({ taskId: args.taskId, status: args.input.status ?? null })
      });
    }
  }

  async getTaskById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    taskId: string;
    generatedAt?: string;
  }): Promise<AaliyahTaskResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const task = await this.requireTask(args.tenantId, args.taskId);
      return { ok: true, task, message: 'Task loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahTaskResult>({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        error,
        metadata: this.audit.buildTaskMetadata({ taskId: args.taskId })
      });
    }
  }

  async listOpenTasks(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<AaliyahTaskListResult> {
    return this.listTasksInternal({ ...args, source: 'open' });
  }

  async listTasksByContactId(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    contactId: string;
    generatedAt?: string;
  }): Promise<AaliyahTaskListResult> {
    return this.listTasksInternal({ ...args, source: 'contact', contactId: args.contactId });
  }

  async listTasksByAccountId(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    accountId: string;
    generatedAt?: string;
  }): Promise<AaliyahTaskListResult> {
    return this.listTasksInternal({ ...args, source: 'account', accountId: args.accountId });
  }

  private async listTasksInternal(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: 'open' | 'contact' | 'account';
    contactId?: string;
    accountId?: string;
    generatedAt?: string;
  }): Promise<AaliyahTaskListResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    await this.audit.record({
      eventType: 'aaliyah.tasks.list.requested',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: generatedAt,
      metadata: this.audit.buildTaskMetadata({ contactId: args.contactId ?? null, accountId: args.accountId ?? null, resultCode: args.source })
    });

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      if (args.source === 'contact') {
        await this.requireContact(args.tenantId, args.contactId!);
      }
      if (args.source === 'account') {
        await this.requireAccount(args.tenantId, args.accountId!);
      }
      const tasks = args.source === 'open'
        ? await this.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId })
        : args.source === 'contact'
          ? await this.repository.listAaliyahTasksByContactId({ tenantId: args.tenantId, contactId: args.contactId! })
          : await this.repository.listAaliyahTasksByAccountId({ tenantId: args.tenantId, accountId: args.accountId! });
      return { ok: true, tasks, message: 'Tasks loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahTaskListResult>({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        error,
        metadata: this.audit.buildTaskMetadata({ contactId: args.contactId ?? null, accountId: args.accountId ?? null, resultCode: args.source })
      });
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new AaliyahTaskAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new AaliyahTaskInvalidModeError();
    }
  }

  private async normalizeCreateInput(tenantId: string, input: AaliyahCreateTaskInput) {
    const title = this.normalizeTitle(input.title);
    const description = this.normalizeOptionalText(input.description);
    const dueAt = this.normalizeOptionalDate(input.dueAt, 'dueAt');
    const remindAt = this.normalizeOptionalDate(input.remindAt, 'remindAt');
    if (dueAt && remindAt && Date.parse(remindAt) > Date.parse(dueAt)) {
      throw new AaliyahTaskValidationError('Reminder time must be on or before the due date.');
    }
    const contactId = this.normalizeOptionalId(input.contactId);
    const accountId = this.normalizeOptionalId(input.accountId);
    if (contactId) {
      await this.requireContact(tenantId, contactId);
    }
    if (accountId) {
      await this.requireAccount(tenantId, accountId);
    }
    return {
      title,
      description,
      priority: input.priority ?? 'normal',
      source: input.source ?? 'manual',
      contactId,
      accountId,
      relatedEmailDraftId: this.normalizeOptionalId(input.relatedEmailDraftId),
      relatedCalendarEventId: this.normalizeOptionalId(input.relatedCalendarEventId),
      dueAt,
      remindAt
    } satisfies {
      title: string;
      description: string | null;
      priority: AaliyahTaskPriority;
      source: AaliyahTaskSource;
      contactId: string | null;
      accountId: string | null;
      relatedEmailDraftId: string | null;
      relatedCalendarEventId: string | null;
      dueAt: string | null;
      remindAt: string | null;
    };
  }

  private normalizeUpdateInput(input: AaliyahUpdateTaskInput, existing: AaliyahTask) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new AaliyahTaskValidationError('Task update requires at least one field.');
    }
    if ((existing.status === 'completed' || existing.status === 'cancelled') && input.status && input.status !== existing.status) {
      throw new AaliyahTaskConflictError('Terminal task states cannot be reopened in this pack.');
    }
    const title = input.title === undefined ? undefined : this.normalizeTitle(input.title);
    const description = input.description === undefined ? undefined : this.normalizeOptionalText(input.description);
    const dueAt = input.dueAt === undefined ? undefined : this.normalizeOptionalDate(input.dueAt, 'dueAt');
    const remindAt = input.remindAt === undefined ? undefined : this.normalizeOptionalDate(input.remindAt, 'remindAt');
    const status = input.status;
    if (status === 'blocked' && !this.normalizeOptionalText(input.blockedReason)) {
      throw new AaliyahTaskValidationError('Blocked tasks require a blocked reason.');
    }
    if (status && status !== 'blocked' && input.blockedReason !== undefined) {
      this.normalizeOptionalText(input.blockedReason);
    }
    if (status === 'completed') {
      this.normalizeOptionalText(input.completionNote);
    }
    const effectiveDueAt = dueAt === undefined ? existing.dueAt : dueAt;
    const effectiveRemindAt = remindAt === undefined ? existing.remindAt : remindAt;
    if (effectiveDueAt && effectiveRemindAt && Date.parse(effectiveRemindAt) > Date.parse(effectiveDueAt)) {
      throw new AaliyahTaskValidationError('Reminder time must be on or before the due date.');
    }
    return {
      title,
      description,
      status,
      priority: input.priority,
      dueAt,
      remindAt,
      blockedReason: input.blockedReason === undefined ? undefined : this.normalizeOptionalText(input.blockedReason),
      completionNote: input.completionNote === undefined ? undefined : this.normalizeOptionalText(input.completionNote)
    };
  }

  private normalizeTitle(value: string): string {
    const title = value.trim();
    if (!title) {
      throw new AaliyahTaskValidationError('Task title is required.');
    }
    if (title.length > TITLE_MAX_LENGTH) {
      throw new AaliyahTaskValidationError(`Task title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
    }
    return title;
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalDate(value: string | undefined, label: string): string | null {
    if (value === undefined) {
      return null;
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new AaliyahTaskValidationError(`${label} must be a valid ISO datetime.`);
    }
    return new Date(timestamp).toISOString();
  }

  private normalizeOptionalId(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private async requireTask(tenantId: string, taskId: string): Promise<AaliyahTask> {
    const task = await this.repository.getAaliyahTaskById({ tenantId, taskId });
    if (!task) {
      throw new AaliyahTaskNotFoundError();
    }
    return task;
  }

  private async requireContact(tenantId: string, contactId: string) {
    const contact = await this.repository.getAaliyahCrmContactById({ tenantId, contactId });
    if (!contact) {
      throw new AaliyahTaskValidationError('Linked CRM contact was not found.');
    }
    return contact;
  }

  private async requireAccount(tenantId: string, accountId: string) {
    const account = await this.repository.getAaliyahCrmAccountById({ tenantId, accountId });
    if (!account) {
      throw new AaliyahTaskValidationError('Linked CRM account was not found.');
    }
    return account;
  }

  private async buildNextStepSummary(
    tenantId: string,
    args: {
      title: string;
      description: string | null;
      status: AaliyahTaskStatus;
      priority: AaliyahTaskPriority;
      dueAt: string | null;
      blockedReason: string | null;
      completionNote: string | null;
      contactId: string | null;
      accountId: string | null;
    }
  ): Promise<string> {
    const contact = args.contactId ? await this.repository.getAaliyahCrmContactById({ tenantId, contactId: args.contactId }) : null;
    const account = args.accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId, accountId: args.accountId }) : contact?.accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId, accountId: contact.accountId }) : null;
    return buildAaliyahTaskNextStepSummary({
      task: {
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        dueAt: args.dueAt,
        blockedReason: args.blockedReason,
        completionNote: args.completionNote
      },
      contact,
      account
    });
  }

  private async normalizeFailure<T extends AaliyahTaskResult | AaliyahTaskListResult>(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    error: unknown;
    metadata: Record<string, unknown>;
  }): Promise<T> {
    const error = args.error;
    let denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null = null;
    let errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null = null;
    let retryable = false;
    let message = 'Task action failed.';
    let eventType: 'aaliyah.tasks.denied' | 'aaliyah.tasks.failed' = 'aaliyah.tasks.failed';

    if (error instanceof AaliyahTaskAccessDeniedError) {
      denialCode = 'ACCESS_DENIED';
      message = error.message;
      eventType = 'aaliyah.tasks.denied';
    } else if (error instanceof AaliyahTaskInvalidModeError) {
      denialCode = 'INVALID_MODE';
      message = error.message;
      eventType = 'aaliyah.tasks.denied';
    } else if (error instanceof AaliyahTaskValidationError) {
      errorCode = 'INVALID_INPUT';
      message = error.message;
    } else if (error instanceof AaliyahTaskNotFoundError) {
      errorCode = 'NOT_FOUND';
      message = error.message;
    } else if (error instanceof AaliyahTaskConflictError) {
      errorCode = 'CONFLICT';
      message = error.message;
    } else if ((error as Error)?.message === 'aaliyah_task_not_found') {
      errorCode = 'NOT_FOUND';
      message = 'Task was not found.';
    } else if ((error as Error)?.message === 'aaliyah_task_conflict') {
      errorCode = 'CONFLICT';
      message = 'Task state update conflicted with current data.';
      retryable = true;
    } else if (error instanceof Error) {
      errorCode = 'INTERNAL_ERROR';
      message = new AaliyahTaskInternalError().message;
    }

    await this.audit.record({
      eventType,
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: args.generatedAt,
      metadata: {
        ...args.metadata,
        resultCode: denialCode ?? errorCode ?? 'INTERNAL_ERROR'
      }
    });

    return {
      ok: false,
      denialCode,
      errorCode,
      retryable,
      message
    } as T;
  }
}
