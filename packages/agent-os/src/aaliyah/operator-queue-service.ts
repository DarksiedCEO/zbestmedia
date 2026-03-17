import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { OperatorQueueAccessDeniedError, OperatorQueueInternalError, OperatorQueueInvalidModeError, OperatorQueueNotFoundError } from './operator-queue-errors.js';
import { AaliyahOperatorQueueAuditService } from './operator-queue-audit.js';
import { evaluateOperatorQueue } from './operator-queue-evaluator.js';
import { buildOperatorQueueListMessage, buildOperatorQueueTopMessage, sortOperatorQueueRecords } from './operator-queue-policy.js';
import { AaliyahOperatorQueueSources } from './operator-queue-sources.js';
import { buildOperatorQueueMessage } from './operator-queue-summary.js';
import type {
  OperatorQueueDetailResult,
  OperatorQueueFailureResult,
  OperatorQueueListResult,
  OperatorQueueResult,
  OperatorQueueTopResult
} from './operator-queue-types.js';

export class AaliyahOperatorQueueService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahOperatorQueueAuditService;
  private readonly sources: AaliyahOperatorQueueSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahOperatorQueueAuditService(diagnostics);
    this.sources = new AaliyahOperatorQueueSources(repository);
  }

  async evaluate(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<OperatorQueueResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadBundle({ ...args, generatedAt });
      const { drafts, suppressedIds } = evaluateOperatorQueue({ bundle, evaluatedAtIso: generatedAt });
      if (drafts.length === 0) {
        await this.audit.record({
          eventType: 'aaliyah.operator_queue.noop',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { sourceVersion: bundle.sourceVersion, suppressedCount: suppressedIds.length }
        });
        return {
          ok: true,
          queueItems: [],
          replayedCount: 0,
          suppressedCount: suppressedIds.length,
          message: 'Operator queue did not find any founder-ranked items.'
        };
      }

      const queueItems = [] as Awaited<ReturnType<AgentOsRepository['createOperatorQueueRecord']>>[];
      let replayedCount = 0;
      for (const draft of drafts) {
        const existing = await this.repository.getOperatorQueueRecordByIdempotencyKey({
          tenantId: args.tenantId,
          idempotencyKey: draft.idempotencyKey
        });
        if (existing) {
          replayedCount += 1;
          queueItems.push(existing);
          await this.audit.record({
            eventType: 'aaliyah.operator_queue.replayed',
            principalId: args.actorId,
            tenantId: args.tenantId,
            mode: args.mode,
            timestamp: generatedAt,
            metadata: this.audit.buildMetadata({
              queueItemId: existing.id,
              sourceType: existing.sourceType,
              sourceId: existing.sourceId,
              queueItemType: existing.queueItemType,
              priorityScore: existing.priorityScore,
              priorityBand: existing.priorityBand,
              relatedRecordIds: existing.relatedRecordIds,
              relatedRecordTypes: existing.relatedRecordTypes,
              actionableCommandType: existing.actionableCommandType,
              actionableTargetType: existing.actionableTargetType,
              actionableTargetId: existing.actionableTargetId,
              reason: existing.reason,
              summary: existing.summary,
              replayed: true
            })
          });
          continue;
        }

        const queueItemId = `operator-queue:${randomUUID()}`;
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.operator_queue.created',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            queueItemId,
            sourceType: draft.sourceType,
            sourceId: draft.sourceId,
            queueItemType: draft.queueItemType,
            priorityScore: draft.priorityScore,
            priorityBand: draft.priorityBand,
            relatedRecordIds: draft.relatedRecordIds,
            relatedRecordTypes: draft.relatedRecordTypes,
            actionableCommandType: draft.actionableCommandType,
            actionableTargetType: draft.actionableTargetType,
            actionableTargetId: draft.actionableTargetId,
            reason: draft.reason,
            summary: draft.summary,
            replayed: false
          })
        });

        const created = await this.repository.createOperatorQueueRecord({
          tenantId: args.tenantId,
          queueItemId,
          sourceType: draft.sourceType,
          sourceId: draft.sourceId,
          queueItemType: draft.queueItemType,
          priorityScore: draft.priorityScore,
          priorityBand: draft.priorityBand,
          title: draft.title,
          summary: draft.summary,
          reason: draft.reason,
          idempotencyKey: draft.idempotencyKey,
          relatedRecordIds: draft.relatedRecordIds,
          relatedRecordTypes: draft.relatedRecordTypes,
          actionableCommandType: draft.actionableCommandType,
          actionableTargetType: draft.actionableTargetType,
          actionableTargetId: draft.actionableTargetId,
          auditEventId,
          metadata: draft.metadata,
          createdAt: generatedAt,
          evaluatedAt: draft.evaluatedAtIso
        });
        queueItems.push(created);
      }

      return {
        ok: true,
        queueItems: sortOperatorQueueRecords(queueItems),
        replayedCount,
        suppressedCount: suppressedIds.length,
        message: buildOperatorQueueMessage(queueItems.length, replayedCount, suppressedIds.length)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    queueItemId: string;
  }): Promise<OperatorQueueDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const queueItem = await this.repository.getOperatorQueueRecordById({
        tenantId: args.tenantId,
        queueItemId: args.queueItemId
      });
      if (!queueItem) {
        throw new OperatorQueueNotFoundError('Operator queue item was not found.');
      }
      return { ok: true, queueItem, message: queueItem.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async list(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    priorityBand?: 'critical' | 'high' | 'normal';
  }): Promise<OperatorQueueListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const queueItems = await this.repository.listOperatorQueueRecords({
        tenantId: args.tenantId,
        limit: args.limit,
        priorityBand: args.priorityBand
      });
      return { ok: true, queueItems, message: buildOperatorQueueListMessage(queueItems.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async top(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    immediateLimit?: number;
    overallLimit?: number;
  }): Promise<OperatorQueueTopResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const queueItems = await this.repository.listOperatorQueueRecords({
        tenantId: args.tenantId,
        limit: Math.max(args.overallLimit ?? 5, args.immediateLimit ?? 3, 10)
      });
      const immediateActions = queueItems
        .filter((item) => item.queueItemType === 'immediate_action')
        .slice(0, args.immediateLimit ?? 3);
      const topQueueItems = queueItems.slice(0, args.overallLimit ?? 5);
      return {
        ok: true,
        immediateActions,
        topQueueItems,
        message: buildOperatorQueueTopMessage(immediateActions.length, topQueueItems.length)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new OperatorQueueAccessDeniedError();
    }
    if (mode !== 'founder') {
      throw new OperatorQueueInvalidModeError();
    }
  }

  private normalizeFailure(error: unknown): OperatorQueueFailureResult {
    if (error instanceof OperatorQueueAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OperatorQueueInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OperatorQueueNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: error.message };
    }
    const internal = new OperatorQueueInternalError();
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: internal.message };
  }
}
