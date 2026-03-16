import type { FounderBriefingMode } from './briefing-types.js';
import {
  FollowThroughEngineNotFoundError,
  FollowThroughEngineValidationError
} from './follow-through-engine-errors.js';
import type {
  FollowThroughEngineRecord,
  FollowThroughEvaluationInputs,
  FollowThroughSourceRef,
  NormalizedFounderCommandContext,
  NormalizedRejectedIntentContext,
  NormalizedTaskContext
} from './follow-through-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function mapTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  contactId: string | null;
  accountId: string | null;
  relatedEmailDraftId: string | null;
  relatedCalendarEventId: string | null;
  dueAt: string | null;
  remindAt: string | null;
  updatedAt: string;
  completedAt: string | null;
} | null): NormalizedTaskContext | null {
  if (!task) {
    return null;
  }
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    source: task.source,
    contactId: task.contactId,
    accountId: task.accountId,
    relatedEmailDraftId: task.relatedEmailDraftId,
    relatedCalendarEventId: task.relatedCalendarEventId,
    dueAt: task.dueAt,
    remindAt: task.remindAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt
  };
}

function mapCommand(command: {
  id: string;
  commandType: string;
  targetType: string;
  targetId: string;
  executionStatus: 'executed' | 'noop';
  createdAt: string;
  executedAt: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
} | null): NormalizedFounderCommandContext | null {
  if (!command) {
    return null;
  }
  return {
    commandId: command.id,
    commandType: command.commandType,
    targetType: command.targetType,
    targetId: command.targetId,
    executionStatus: command.executionStatus,
    createdAt: command.createdAt,
    executedAt: command.executedAt,
    payload: command.payload,
    metadata: command.metadata
  };
}

function mapRejectedIntent(event: {
  eventId: string;
  signalKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
}): NormalizedRejectedIntentContext {
  const payload = asRecord(event.payload);
  return {
    eventId: event.eventId,
    requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
    commandId: typeof payload.commandId === 'string' ? payload.commandId : null,
    commandType: typeof payload.commandType === 'string' ? payload.commandType : null,
    targetType: typeof payload.targetType === 'string' ? payload.targetType : null,
    targetId: typeof payload.targetId === 'string' ? payload.targetId : null,
    signalKey: event.signalKey,
    createdAt: event.createdAt
  };
}

export class AaliyahFollowThroughEngineSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadSourceContextForEvaluation(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: FollowThroughSourceRef;
    generatedAt: string;
  }): Promise<FollowThroughEvaluationInputs> {
    if (!args.source.sourceId.trim()) {
      throw new FollowThroughEngineValidationError('Follow-through source id is required.');
    }

    const existingRecords = await this.repository.listFollowThroughEngineRecordsBySource({
      tenantId: args.tenantId,
      sourceType: args.source.sourceType,
      sourceId: args.source.sourceId,
      limit: 25
    });

    const diagnostics = await this.repository.listAaliyahDiagnosticsEvents({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      since: '2000-01-01T00:00:00.000Z',
      until: args.generatedAt,
      limit: 500
    });
    const rejectedIntent = diagnostics
      .filter((event) => event.eventType === 'founder_command_rejected')
      .map(mapRejectedIntent)
      .filter((event) => event.commandId === args.source.sourceId || event.requestId === args.source.sourceId || event.targetId === args.source.sourceId);

    switch (args.source.sourceType) {
      case 'founder_command': {
        const command = mapCommand(await this.repository.getFounderCommandById({ tenantId: args.tenantId, commandId: args.source.sourceId }));
        if (!command && rejectedIntent.length === 0) {
          throw new FollowThroughEngineNotFoundError('Founder command source was not found.');
        }
        const contextualRejectedIntent = command
          ? diagnostics
              .filter((event) => event.eventType === 'founder_command_rejected')
              .map(mapRejectedIntent)
              .filter((event) => event.targetType === command.targetType && event.targetId === command.targetId && event.createdAt >= command.createdAt)
          : rejectedIntent;
        return {
          source: args.source,
          founderCommand: command,
          task: null,
          linkedTask: null,
          contactId: typeof command?.metadata.contactId === 'string' ? command.metadata.contactId : null,
          accountId: typeof command?.metadata.accountId === 'string' ? command.metadata.accountId : null,
          relatedEmailDraftId: typeof command?.metadata.draftId === 'string'
            ? command.metadata.draftId
            : typeof command?.metadata.relatedEmailDraftId === 'string'
              ? command.metadata.relatedEmailDraftId
              : null,
          relatedCalendarEventId: typeof command?.metadata.relatedCalendarEventId === 'string' ? command.metadata.relatedCalendarEventId : null,
          existingRecords,
          rejectedIntent: contextualRejectedIntent,
          sourceVersion: command
            ? `${command.commandId}:${command.executedAt ?? command.createdAt}:${contextualRejectedIntent.map((event) => event.eventId).join(',')}`
            : `rejected:${rejectedIntent.map((event) => event.eventId).join(',')}`
        };
      }
      case 'task': {
        const task = mapTask(await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: args.source.sourceId }));
        if (!task) {
          throw new FollowThroughEngineNotFoundError('Task source was not found.');
        }
        const contextualRejectedIntent = diagnostics
          .filter((event) => event.eventType === 'founder_command_rejected')
          .map(mapRejectedIntent)
          .filter((event) => event.targetType === 'task' && event.targetId === task.taskId && event.createdAt >= task.updatedAt);
        return {
          source: args.source,
          founderCommand: null,
          task,
          linkedTask: task,
          contactId: task.contactId,
          accountId: task.accountId,
          relatedEmailDraftId: task.relatedEmailDraftId,
          relatedCalendarEventId: task.relatedCalendarEventId,
          existingRecords,
          rejectedIntent: contextualRejectedIntent,
          sourceVersion: `${task.taskId}:${task.updatedAt}:${task.status}:${task.dueAt ?? ''}:${contextualRejectedIntent.map((event) => event.eventId).join(',')}`
        };
      }
      case 'calendar_event': {
        const openTasks = await this.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId });
        const linkedTask = mapTask(openTasks.find((task) => task.relatedCalendarEventId === args.source.sourceId) ?? null);
        if (!linkedTask) {
          throw new FollowThroughEngineNotFoundError('Calendar-linked task context was not found.');
        }
        return {
          source: args.source,
          founderCommand: null,
          task: linkedTask,
          linkedTask,
          contactId: linkedTask.contactId,
          accountId: linkedTask.accountId,
          relatedEmailDraftId: linkedTask.relatedEmailDraftId,
          relatedCalendarEventId: linkedTask.relatedCalendarEventId,
          existingRecords,
          rejectedIntent: [],
          sourceVersion: `${linkedTask.relatedCalendarEventId}:${linkedTask.updatedAt}:${linkedTask.status}:${linkedTask.dueAt ?? ''}`
        };
      }
      case 'gmail_draft': {
        const commands = await this.repository.listFounderCommands({ tenantId: args.tenantId, limit: 200 });
        const latestDraftCommand = mapCommand(commands.find((command) => command.targetType === 'gmail_draft' && command.targetId === args.source.sourceId) ?? null);
        const openTasks = await this.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId });
        const linkedTask = mapTask(openTasks.find((task) => task.relatedEmailDraftId === args.source.sourceId) ?? null);
        if (!latestDraftCommand && !linkedTask) {
          throw new FollowThroughEngineNotFoundError('Draft source was not found.');
        }
        return {
          source: args.source,
          founderCommand: latestDraftCommand,
          task: linkedTask,
          linkedTask,
          contactId: linkedTask?.contactId ?? null,
          accountId: linkedTask?.accountId ?? null,
          relatedEmailDraftId: args.source.sourceId,
          relatedCalendarEventId: linkedTask?.relatedCalendarEventId ?? null,
          existingRecords,
          rejectedIntent,
          sourceVersion: `${args.source.sourceId}:${latestDraftCommand?.executedAt ?? ''}:${linkedTask?.updatedAt ?? ''}:${rejectedIntent.map((event) => event.eventId).join(',')}`
        };
      }
      case 'contact': {
        const contact = await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: args.source.sourceId });
        if (!contact) {
          throw new FollowThroughEngineNotFoundError('CRM contact source was not found.');
        }
        return {
          source: args.source,
          founderCommand: null,
          task: null,
          linkedTask: null,
          contactId: contact.id,
          accountId: contact.accountId,
          relatedEmailDraftId: null,
          relatedCalendarEventId: null,
          existingRecords,
          rejectedIntent,
          sourceVersion: `${contact.id}:${contact.updatedAt}:${contact.relationshipStage}`
        };
      }
      case 'account': {
        const account = await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId: args.source.sourceId });
        if (!account) {
          throw new FollowThroughEngineNotFoundError('CRM account source was not found.');
        }
        return {
          source: args.source,
          founderCommand: null,
          task: null,
          linkedTask: null,
          contactId: null,
          accountId: account.id,
          relatedEmailDraftId: null,
          relatedCalendarEventId: null,
          existingRecords,
          rejectedIntent,
          sourceVersion: `${account.id}:${account.updatedAt}:${account.status}`
        };
      }
    }
  }

  async getRecordById(args: { tenantId: string; recordId: string }): Promise<FollowThroughEngineRecord | null> {
    return this.repository.getFollowThroughEngineRecordById(args);
  }

  async listRecords(args: { tenantId: string; limit?: number }): Promise<FollowThroughEngineRecord[]> {
    return this.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: args.limit });
  }
}
