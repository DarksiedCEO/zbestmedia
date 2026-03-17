import type { FounderBriefingMode } from './briefing-types.js';
import {
  OpportunityEngineNotFoundError,
  OpportunityEngineValidationError
} from './opportunity-engine-errors.js';
import type { OpportunitySourceBundle, OpportunitySourceRef } from './opportunity-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

export class AaliyahOpportunityEngineSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadSourceBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: OpportunitySourceRef;
    generatedAt: string;
  }): Promise<OpportunitySourceBundle> {
    if (!args.source.sourceId.trim()) {
      throw new OpportunityEngineValidationError('Opportunity source id is required.');
    }

    const diagnostics = await this.repository.listAaliyahDiagnosticsEvents({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      since: '2000-01-01T00:00:00.000Z',
      until: args.generatedAt,
      limit: 500
    });
    const allFollowThrough = await this.repository.listFollowThroughEngineRecords({
      tenantId: args.tenantId,
      limit: 200
    });
    const allRecommendations = await this.repository.listRecommendations({
      tenantId: args.tenantId,
      limit: 200
    });

    const finalize = (bundle: Omit<OpportunitySourceBundle, 'activeFollowThrough' | 'activeRecommendations' | 'diagnosticsHints' | 'sourceVersion'> & {
      sourceVersionParts: Array<string | null | undefined>;
      sourceIds: string[];
      taskIds: string[];
      contactIds: string[];
      accountIds: string[];
      commandIds: string[];
    }): OpportunitySourceBundle => {
      const diagnosticsHints = diagnostics
        .filter((event) => {
          const payload = asRecord(event.payload);
          const targetId = typeof payload.targetId === 'string' ? payload.targetId : null;
          const linkedTaskId = typeof payload.linkedTaskId === 'string' ? payload.linkedTaskId : null;
          const linkedCommandId = typeof payload.linkedCommandId === 'string' ? payload.linkedCommandId : null;
          const linkedContactId = typeof payload.contactId === 'string' ? payload.contactId : null;
          const linkedAccountId = typeof payload.accountId === 'string' ? payload.accountId : null;
          return bundle.sourceIds.includes(targetId ?? '')
            || bundle.taskIds.includes(linkedTaskId ?? '')
            || bundle.commandIds.includes(linkedCommandId ?? '')
            || bundle.contactIds.includes(linkedContactId ?? '')
            || bundle.accountIds.includes(linkedAccountId ?? '');
        })
        .map((event) => ({
          eventId: event.eventId,
          eventType: event.eventType,
          signalKey: event.signalKey,
          createdAt: event.createdAt,
          payload: asRecord(event.payload)
        }));

      const activeFollowThrough = uniqueById(
        allFollowThrough
          .filter((record) => {
            const metadata = asRecord(record.metadata);
            const linkedTaskId = typeof metadata.linkedTaskId === 'string' ? metadata.linkedTaskId : null;
            const linkedCommandId = typeof metadata.linkedCommandId === 'string' ? metadata.linkedCommandId : null;
            return record.source.sourceId === args.source.sourceId
              || bundle.taskIds.includes(record.source.sourceId)
              || bundle.taskIds.includes(linkedTaskId ?? '')
              || bundle.commandIds.includes(record.source.sourceId)
              || bundle.commandIds.includes(linkedCommandId ?? '');
          })
          .map((record) => ({
            id: record.id,
            status: record.status,
            policyKey: record.policyKey,
            sourceType: record.source.sourceType,
            sourceId: record.source.sourceId,
            metadata: record.metadata
          }))
      );

      const activeRecommendations = uniqueById(
        allRecommendations
          .filter((record) => {
            const metadata = asRecord(record.metadata);
            const targetId = typeof metadata.targetId === 'string' ? metadata.targetId : null;
            return record.source.sourceId === args.source.sourceId
              || bundle.taskIds.includes(record.relatedTaskId ?? '')
              || bundle.taskIds.includes(targetId ?? '')
              || bundle.contactIds.includes(record.source.sourceId)
              || bundle.contactIds.includes(targetId ?? '')
              || bundle.accountIds.includes(record.source.sourceId)
              || bundle.accountIds.includes(targetId ?? '');
          })
          .map((record) => ({
            id: record.id,
            type: record.recommendationType,
            status: record.status,
            relatedTaskId: record.relatedTaskId,
            metadata: record.metadata
          }))
      );

      return {
        ...bundle,
        activeFollowThrough,
        activeRecommendations,
        diagnosticsHints,
        sourceVersion: [...bundle.sourceVersionParts, ...diagnosticsHints.map((item) => item.eventId)].join(':')
      };
    };

    switch (args.source.sourceType) {
      case 'contact': {
        const contact = await this.repository.getAaliyahCrmContactById({
          tenantId: args.tenantId,
          contactId: args.source.sourceId
        });
        if (!contact) {
          throw new OpportunityEngineNotFoundError('Contact source was not found.');
        }
        const account = contact.accountId
          ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId: contact.accountId })
          : null;
        const openTasksForContact = (await this.repository.listAaliyahTasksByContactId({
          tenantId: args.tenantId,
          contactId: contact.id
        }))
          .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
          .map((item) => ({
            id: item.id,
            status: item.status,
            priority: item.priority,
            dueAt: item.dueAt,
            updatedAt: item.updatedAt
          }));
        const openTasksForAccount = contact.accountId
          ? (await this.repository.listAaliyahTasksByAccountId({
              tenantId: args.tenantId,
              accountId: contact.accountId
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        return finalize({
          source: args.source,
          contact: {
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
            relationshipStage: contact.relationshipStage,
            status: contact.status,
            accountId: contact.accountId,
            lastTouchedAt: contact.lastTouchedAt,
            nextActionAt: contact.nextActionAt,
            updatedAt: contact.updatedAt
          },
          account: account ? { id: account.id, name: account.name, status: account.status, updatedAt: account.updatedAt } : null,
          task: null,
          followThroughRecord: null,
          recommendation: null,
          founderCommand: null,
          openTasksForContact,
          openTasksForAccount,
          sourceVersionParts: [contact.id, contact.updatedAt, contact.lastTouchedAt ?? '', contact.relationshipStage],
          sourceIds: [contact.id],
          taskIds: openTasksForContact.map((item) => item.id),
          contactIds: [contact.id],
          accountIds: contact.accountId ? [contact.accountId] : [],
          commandIds: []
        });
      }
      case 'account': {
        const account = await this.repository.getAaliyahCrmAccountById({
          tenantId: args.tenantId,
          accountId: args.source.sourceId
        });
        if (!account) {
          throw new OpportunityEngineNotFoundError('Account source was not found.');
        }
        const openTasksForAccount = (await this.repository.listAaliyahTasksByAccountId({
          tenantId: args.tenantId,
          accountId: account.id
        }))
          .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
          .map((item) => ({
            id: item.id,
            status: item.status,
            priority: item.priority,
            dueAt: item.dueAt,
            updatedAt: item.updatedAt
          }));
        return finalize({
          source: args.source,
          contact: null,
          account: { id: account.id, name: account.name, status: account.status, updatedAt: account.updatedAt },
          task: null,
          followThroughRecord: null,
          recommendation: null,
          founderCommand: null,
          openTasksForContact: [],
          openTasksForAccount,
          sourceVersionParts: [account.id, account.updatedAt, account.status],
          sourceIds: [account.id],
          taskIds: openTasksForAccount.map((item) => item.id),
          contactIds: [],
          accountIds: [account.id],
          commandIds: []
        });
      }
      case 'task': {
        const task = await this.repository.getAaliyahTaskById({
          tenantId: args.tenantId,
          taskId: args.source.sourceId
        });
        if (!task) {
          throw new OpportunityEngineNotFoundError('Task source was not found.');
        }
        const contact = task.contactId
          ? await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: task.contactId })
          : null;
        const accountId = task.accountId ?? contact?.accountId ?? null;
        const account = accountId
          ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId })
          : null;
        const openTasksForContact = contact?.id
          ? (await this.repository.listAaliyahTasksByContactId({
              tenantId: args.tenantId,
              contactId: contact.id
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        const openTasksForAccount = accountId
          ? (await this.repository.listAaliyahTasksByAccountId({
              tenantId: args.tenantId,
              accountId
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        return finalize({
          source: args.source,
          contact: contact ? {
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
            relationshipStage: contact.relationshipStage,
            status: contact.status,
            accountId: contact.accountId,
            lastTouchedAt: contact.lastTouchedAt,
            nextActionAt: contact.nextActionAt,
            updatedAt: contact.updatedAt
          } : null,
          account: account ? { id: account.id, name: account.name, status: account.status, updatedAt: account.updatedAt } : null,
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
          followThroughRecord: null,
          recommendation: null,
          founderCommand: null,
          openTasksForContact,
          openTasksForAccount,
          sourceVersionParts: [task.id, task.updatedAt, task.status, task.dueAt ?? '', task.relatedCalendarEventId ?? '', task.relatedEmailDraftId ?? ''],
          sourceIds: [task.id],
          taskIds: [task.id],
          contactIds: contact?.id ? [contact.id] : [],
          accountIds: accountId ? [accountId] : [],
          commandIds: []
        });
      }
      case 'follow_through_record': {
        const record = await this.repository.getFollowThroughEngineRecordById({
          tenantId: args.tenantId,
          recordId: args.source.sourceId
        });
        if (!record) {
          throw new OpportunityEngineNotFoundError('Follow-through source was not found.');
        }
        const metadata = asRecord(record.metadata);
        const linkedTaskId = typeof metadata.linkedTaskId === 'string'
          ? metadata.linkedTaskId
          : record.createdArtifactIds[0] ?? null;
        const linkedCommandId = typeof metadata.linkedCommandId === 'string' ? metadata.linkedCommandId : null;
        const task = linkedTaskId
          ? await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: linkedTaskId })
          : null;
        const founderCommand = linkedCommandId
          ? await this.repository.getFounderCommandById({ tenantId: args.tenantId, commandId: linkedCommandId })
          : null;
        const contact = task?.contactId
          ? await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId: task.contactId })
          : null;
        const accountId = task?.accountId ?? contact?.accountId ?? null;
        const account = accountId
          ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId })
          : null;
        const openTasksForContact = contact?.id
          ? (await this.repository.listAaliyahTasksByContactId({
              tenantId: args.tenantId,
              contactId: contact.id
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        const openTasksForAccount = accountId
          ? (await this.repository.listAaliyahTasksByAccountId({
              tenantId: args.tenantId,
              accountId
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        return finalize({
          source: args.source,
          contact: contact ? {
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
            relationshipStage: contact.relationshipStage,
            status: contact.status,
            accountId: contact.accountId,
            lastTouchedAt: contact.lastTouchedAt,
            nextActionAt: contact.nextActionAt,
            updatedAt: contact.updatedAt
          } : null,
          account: account ? { id: account.id, name: account.name, status: account.status, updatedAt: account.updatedAt } : null,
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
          followThroughRecord: {
            id: record.id,
            policyKey: record.policyKey,
            decisionType: record.decisionType,
            status: record.status,
            reason: record.reason,
            summary: record.summary,
            metadata: record.metadata,
            createdArtifactIds: record.createdArtifactIds,
            evaluatedAtIso: record.evaluatedAtIso
          },
          recommendation: null,
          founderCommand: founderCommand ? {
            id: founderCommand.id,
            commandType: founderCommand.commandType,
            targetType: founderCommand.targetType,
            targetId: founderCommand.targetId,
            executionStatus: founderCommand.executionStatus,
            metadata: founderCommand.metadata,
            executedAt: founderCommand.executedAt,
            createdAt: founderCommand.createdAt
          } : null,
          openTasksForContact,
          openTasksForAccount,
          sourceVersionParts: [record.id, record.evaluatedAtIso, task?.updatedAt ?? '', founderCommand?.executedAt ?? founderCommand?.createdAt ?? ''],
          sourceIds: [record.id],
          taskIds: task?.id ? [task.id] : [],
          contactIds: contact?.id ? [contact.id] : [],
          accountIds: accountId ? [accountId] : [],
          commandIds: founderCommand?.id ? [founderCommand.id] : []
        });
      }
      case 'recommendation': {
        const recommendation = await this.repository.getRecommendationById({
          tenantId: args.tenantId,
          recommendationId: args.source.sourceId
        });
        if (!recommendation) {
          throw new OpportunityEngineNotFoundError('Recommendation source was not found.');
        }
        const metadata = asRecord(recommendation.metadata);
        const taskId = recommendation.relatedTaskId
          ?? (metadata.targetType === 'task' && typeof metadata.targetId === 'string' ? metadata.targetId : null);
        const task = taskId
          ? await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId })
          : null;
        const contactId = task?.contactId
          ?? (metadata.targetType === 'contact' && typeof metadata.targetId === 'string' ? metadata.targetId : null);
        const contact = contactId
          ? await this.repository.getAaliyahCrmContactById({ tenantId: args.tenantId, contactId })
          : null;
        const accountId = task?.accountId
          ?? contact?.accountId
          ?? (metadata.targetType === 'account' && typeof metadata.targetId === 'string' ? metadata.targetId : null);
        const account = accountId
          ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId })
          : null;
        const openTasksForContact = contact?.id
          ? (await this.repository.listAaliyahTasksByContactId({
              tenantId: args.tenantId,
              contactId: contact.id
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        const openTasksForAccount = accountId
          ? (await this.repository.listAaliyahTasksByAccountId({
              tenantId: args.tenantId,
              accountId
            }))
              .filter((item) => ['open', 'in_progress', 'blocked'].includes(item.status))
              .map((item) => ({
                id: item.id,
                status: item.status,
                priority: item.priority,
                dueAt: item.dueAt,
                updatedAt: item.updatedAt
              }))
          : [];
        return finalize({
          source: args.source,
          contact: contact ? {
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
            relationshipStage: contact.relationshipStage,
            status: contact.status,
            accountId: contact.accountId,
            lastTouchedAt: contact.lastTouchedAt,
            nextActionAt: contact.nextActionAt,
            updatedAt: contact.updatedAt
          } : null,
          account: account ? { id: account.id, name: account.name, status: account.status, updatedAt: account.updatedAt } : null,
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
          followThroughRecord: null,
          recommendation: {
            id: recommendation.id,
            recommendationType: recommendation.recommendationType,
            status: recommendation.status,
            reason: recommendation.reason,
            summary: recommendation.summary,
            relatedTaskId: recommendation.relatedTaskId,
            metadata: recommendation.metadata,
            evaluatedAtIso: recommendation.evaluatedAtIso
          },
          founderCommand: null,
          openTasksForContact,
          openTasksForAccount,
          sourceVersionParts: [recommendation.id, recommendation.evaluatedAtIso, recommendation.status, task?.updatedAt ?? ''],
          sourceIds: [recommendation.id],
          taskIds: task?.id ? [task.id] : [],
          contactIds: contact?.id ? [contact.id] : [],
          accountIds: accountId ? [accountId] : [],
          commandIds: []
        });
      }
      case 'founder_command': {
        const command = await this.repository.getFounderCommandById({
          tenantId: args.tenantId,
          commandId: args.source.sourceId
        });
        if (!command) {
          throw new OpportunityEngineNotFoundError('Founder command source was not found.');
        }
        return finalize({
          source: args.source,
          contact: null,
          account: null,
          task: null,
          followThroughRecord: null,
          recommendation: null,
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
          openTasksForContact: [],
          openTasksForAccount: [],
          sourceVersionParts: [command.id, command.executedAt ?? command.createdAt, command.executionStatus],
          sourceIds: [command.id, command.targetId],
          taskIds: [],
          contactIds: [],
          accountIds: [],
          commandIds: [command.id]
        });
      }
      case 'calendar_event':
        throw new OpportunityEngineNotFoundError('Opportunity source is not yet supported for direct evaluation.');
    }
  }
}
