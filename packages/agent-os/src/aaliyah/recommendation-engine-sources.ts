import type { FounderBriefingMode } from './briefing-types.js';
import {
  RecommendationEngineNotFoundError,
  RecommendationEngineValidationError
} from './recommendation-engine-errors.js';
import type { RecommendationSourceBundle, RecommendationSourceRef } from './recommendation-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export class AaliyahRecommendationEngineSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadSourceBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: RecommendationSourceRef;
    generatedAt: string;
  }): Promise<RecommendationSourceBundle> {
    if (!args.source.sourceId.trim()) {
      throw new RecommendationEngineValidationError('Recommendation source id is required.');
    }

    const diagnostics = await this.repository.listAaliyahDiagnosticsEvents({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      since: '2000-01-01T00:00:00.000Z',
      until: args.generatedAt,
      limit: 500
    });

    switch (args.source.sourceType) {
      case 'follow_through_record': {
        const record = await this.repository.getFollowThroughEngineRecordById({ tenantId: args.tenantId, recordId: args.source.sourceId });
        if (!record) {
          throw new RecommendationEngineNotFoundError('Follow-through record source was not found.');
        }
        const metadata = asRecord(record.metadata);
        const relatedTaskId = typeof metadata.linkedTaskId === 'string' ? metadata.linkedTaskId : record.createdArtifactIds[0] ?? null;
        const relatedCommandId = typeof metadata.linkedCommandId === 'string' ? metadata.linkedCommandId : null;
        const task = relatedTaskId ? await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: relatedTaskId }) : null;
        const command = relatedCommandId ? await this.repository.getFounderCommandById({ tenantId: args.tenantId, commandId: relatedCommandId }) : null;
        const contact = task?.contactId ? await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: task.contactId }) : null;
        const accountId = task?.accountId ?? contact?.accountId ?? null;
        const account = accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId }) : null;
        const contactTasks = contact?.id ? await this.repository.listAaliyahTasksByContactId({ tenantId: args.tenantId, contactId: contact.id }) : [];
        const diagnosticsHints = diagnostics
          .filter((event) => ['founder_command_rejected', 'follow_through_engine_blocked'].includes(event.eventType))
          .filter((event) => {
            const payload = asRecord(event.payload);
            return payload.linkedCommandId === relatedCommandId || payload.linkedTaskId === relatedTaskId || payload.targetId === command?.targetId;
          })
          .map((event) => ({ eventId: event.eventId, eventType: event.eventType, signalKey: event.signalKey, createdAt: event.createdAt }));
        return {
          source: args.source,
          followThroughRecord: {
            id: record.id,
            policyKey: record.policyKey,
            decisionType: record.decisionType,
            status: record.status,
            summary: record.summary,
            reason: record.reason,
            metadata: record.metadata,
            createdArtifactIds: record.createdArtifactIds,
            evaluatedAtIso: record.evaluatedAtIso
          },
          founderCommand: command ? {
            id: command.id,
            commandType: command.commandType,
            targetType: command.targetType,
            targetId: command.targetId,
            executionStatus: command.executionStatus,
            metadata: command.metadata,
            executedAt: command.executedAt,
            createdAt: command.createdAt
          } : null,
          task: task ? {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            source: task.source,
            contactId: task.contactId,
            accountId: task.accountId,
            relatedEmailDraftId: task.relatedEmailDraftId,
            relatedCalendarEventId: task.relatedCalendarEventId,
            dueAt: task.dueAt,
            updatedAt: task.updatedAt
          } : null,
          contact: contact ? {
            id: contact.id,
            relationshipStage: contact.relationshipStage,
            lastTouchedAt: contact.lastTouchedAt,
            accountId: contact.accountId,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName
          } : null,
          account: account ? {
            id: account.id,
            name: account.name,
            status: account.status,
            updatedAt: account.updatedAt
          } : null,
          openTasksForContact: contactTasks.filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status)).map((item) => ({ id: item.id, status: item.status })),
          diagnosticsHints,
          sourceVersion: `${record.id}:${record.evaluatedAtIso}:${task?.updatedAt ?? ''}:${diagnosticsHints.map((item) => item.eventId).join(',')}`
        };
      }
      case 'founder_command': {
        const command = await this.repository.getFounderCommandById({ tenantId: args.tenantId, commandId: args.source.sourceId });
        if (!command) {
          throw new RecommendationEngineNotFoundError('Founder command source was not found.');
        }
        return {
          source: args.source,
          followThroughRecord: null,
          founderCommand: {
            id: command.id,
            commandType: command.commandType,
            targetType: command.targetType,
            targetId: command.targetId,
            executionStatus: command.executionStatus,
            metadata: command.metadata,
            executedAt: command.executedAt,
            createdAt: command.createdAt
          },
          task: null,
          contact: null,
          account: null,
          openTasksForContact: [],
          diagnosticsHints: diagnostics
            .filter((event) => event.eventType === 'founder_command_rejected')
            .filter((event) => asRecord(event.payload).targetId === command.targetId)
            .map((event) => ({ eventId: event.eventId, eventType: event.eventType, signalKey: event.signalKey, createdAt: event.createdAt })),
          sourceVersion: `${command.id}:${command.executedAt ?? command.createdAt}`
        };
      }
      case 'task': {
        const task = await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: args.source.sourceId });
        if (!task) {
          throw new RecommendationEngineNotFoundError('Task source was not found.');
        }
        const contact = task.contactId ? await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: task.contactId }) : null;
        const accountId = task.accountId ?? contact?.accountId ?? null;
        const account = accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId }) : null;
        return {
          source: args.source,
          followThroughRecord: null,
          founderCommand: null,
          task: {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            source: task.source,
            contactId: task.contactId,
            accountId: task.accountId,
            relatedEmailDraftId: task.relatedEmailDraftId,
            relatedCalendarEventId: task.relatedCalendarEventId,
            dueAt: task.dueAt,
            updatedAt: task.updatedAt
          },
          contact: contact ? {
            id: contact.id,
            relationshipStage: contact.relationshipStage,
            lastTouchedAt: contact.lastTouchedAt,
            accountId: contact.accountId,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName
          } : null,
          account: account ? {
            id: account.id,
            name: account.name,
            status: account.status,
            updatedAt: account.updatedAt
          } : null,
          openTasksForContact: [],
          diagnosticsHints: [],
          sourceVersion: `${task.id}:${task.updatedAt}:${task.status}`
        };
      }
      case 'contact': {
        const contact = await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: args.source.sourceId });
        if (!contact) {
          throw new RecommendationEngineNotFoundError('Contact source was not found.');
        }
        const account = contact.accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId: contact.accountId }) : null;
        const openTasks = await this.repository.listAaliyahTasksByContactId({ tenantId: args.tenantId, contactId: contact.id });
        return {
          source: args.source,
          followThroughRecord: null,
          founderCommand: null,
          task: null,
          contact: {
            id: contact.id,
            relationshipStage: contact.relationshipStage,
            lastTouchedAt: contact.lastTouchedAt,
            accountId: contact.accountId,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName
          },
          account: account ? {
            id: account.id,
            name: account.name,
            status: account.status,
            updatedAt: account.updatedAt
          } : null,
          openTasksForContact: openTasks.filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status)).map((item) => ({ id: item.id, status: item.status })),
          diagnosticsHints: [],
          sourceVersion: `${contact.id}:${contact.updatedAt}:${contact.relationshipStage}:${contact.lastTouchedAt ?? ''}`
        };
      }
      case 'account': {
        const account = await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId: args.source.sourceId });
        if (!account) {
          throw new RecommendationEngineNotFoundError('Account source was not found.');
        }
        return {
          source: args.source,
          followThroughRecord: null,
          founderCommand: null,
          task: null,
          contact: null,
          account: {
            id: account.id,
            name: account.name,
            status: account.status,
            updatedAt: account.updatedAt
          },
          openTasksForContact: [],
          diagnosticsHints: [],
          sourceVersion: `${account.id}:${account.updatedAt}:${account.status}`
        };
      }
      case 'gmail_draft':
      case 'calendar_event':
        throw new RecommendationEngineNotFoundError('Recommendation source is not yet supported for direct evaluation.');
    }
  }
}
