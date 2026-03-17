import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { AaliyahFounderCommandService } from './founder-command-service.js';
import {
  OperatorActionAccessDeniedError,
  OperatorActionConflictError,
  OperatorActionInternalError,
  OperatorActionInvalidModeError,
  OperatorActionNotFoundError
} from './operator-action-errors.js';
import { AaliyahOperatorActionAuditService } from './operator-action-audit.js';
import type { OperatorActionFailureResult, OperatorActionResult, ResolvedOperatorAction } from './operator-action-types.js';
import { AaliyahOperatorActionValidator } from './operator-action-validator.js';
import { canonicalIssueKeyForQueueItem } from './operator-queue-canonicalization.js';
import { AaliyahOperatorQueueRefreshService } from './operator-queue-refresh.js';

export class AaliyahOperatorActionService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahOperatorActionAuditService;
  private readonly validator: AaliyahOperatorActionValidator;
  private readonly refresh: AaliyahOperatorQueueRefreshService;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly founderCommandService: AaliyahFounderCommandService,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahOperatorActionAuditService(diagnostics);
    this.validator = new AaliyahOperatorActionValidator(repository);
    this.refresh = new AaliyahOperatorQueueRefreshService(repository);
  }

  async execute(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    queueItemId: string;
    idempotencyKey: string;
    requestedAt?: string;
  }): Promise<OperatorActionResult> {
    const requestedAt = args.requestedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const replay = await this.repository.getOperatorActionLogByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: args.idempotencyKey
      });
      if (replay) {
        return {
          ok: true,
          result: {
            executionStatus: replay.executionStatus,
            queueItemId: replay.queueItemId,
            commandId: replay.commandId ?? undefined,
            canonicalIssueKey: replay.canonicalIssueKey,
            executedAtIso: replay.executedAtIso,
            auditId: replay.id
          },
          log: replay
        };
      }

      const existing = await this.repository.getOperatorQueueRecordById({
        tenantId: args.tenantId,
        queueItemId: args.queueItemId
      });
      if (!existing) {
        throw new OperatorActionNotFoundError('Operator queue item was not found.');
      }

      const queueItem = (await this.refresh.refreshQueueItem({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        queueItem: existing,
        generatedAt: requestedAt,
        force: true
      })).queueItem;

      const validation = await this.validator.validate({
        tenantId: args.tenantId,
        queueItem
      });

      if (!validation.isExecutable) {
        const finalStatus = mapFailureToStatus(validation.failureCode);
        const queueMutation = validation.failureCode === 'QUEUE_ITEM_SUPERSEDED'
          ? await this.repository.updateOperatorQueueRecord({
              tenantId: args.tenantId,
              queueItemId: queueItem.id,
              status: 'superseded',
              lastRefreshedAt: requestedAt
            })
          : validation.failureCode === 'QUEUE_ITEM_INVALIDATED' || validation.failureCode === 'SOURCE_NOT_FOUND'
            ? await this.repository.updateOperatorQueueRecord({
                tenantId: args.tenantId,
                queueItemId: queueItem.id,
                status: 'invalidated',
                lastRefreshedAt: requestedAt
              })
            : queueItem;
        const actionPath = validation.resolvedActionPath ?? buildFallbackActionPath(queueMutation);
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.operator_action.failed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: requestedAt,
          metadata: this.audit.buildMetadata({
            queueItemId: queueMutation.id,
            actionPath,
            executionStatus: finalStatus,
            canonicalIssueKey: canonicalIssueKeyForQueueItem(queueMutation),
            failureCode: validation.failureCode ?? 'ACTION_PATH_UNRESOLVABLE',
            failureReason: validation.failureCode ?? 'not executable'
          })
        });
        const log = await this.repository.createOperatorActionLog({
          tenantId: args.tenantId,
          actionLogId: `operator-action:${randomUUID()}`,
          queueItemId: queueMutation.id,
          queueItemVersion: queueMutation.rankingVersion,
          canonicalIssueKey: canonicalIssueKeyForQueueItem(queueMutation),
          actionPath,
          commandId: null,
          founderActorId: args.actorId,
          idempotencyKey: args.idempotencyKey,
          executionStatus: finalStatus,
          failureCode: validation.failureCode ?? 'ACTION_PATH_UNRESOLVABLE',
          failureReason: validation.failureCode ?? 'not executable',
          executedAt: requestedAt
        });
        return {
          ok: true,
          result: {
            executionStatus: finalStatus,
            queueItemId: queueMutation.id,
            canonicalIssueKey: canonicalIssueKeyForQueueItem(queueMutation),
            executedAtIso: requestedAt,
            auditId: auditEventId ?? log.id
          },
          log
        };
      }

      const action = this.buildResolvedAction(queueItem, args.actorId, requestedAt, args.idempotencyKey);
      const command = await this.founderCommandService.executeCommand({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        request: {
          commandType: action.commandType,
          actor: {
            actorUserId: args.actorId,
            actorRole: 'founder',
            requestId: `operator-queue:${queueItem.id}:${requestedAt}`,
            issuedAtIso: requestedAt
          },
          target: {
            targetType: action.targetType,
            targetId: action.targetId
          },
          payload: action.payload,
          idempotencyKey: args.idempotencyKey
        },
        generatedAt: requestedAt
      });
      if (!command.ok) {
        throw new OperatorActionConflictError(command.message);
      }

      const executedQueueItem = await this.repository.updateOperatorQueueRecord({
        tenantId: args.tenantId,
        queueItemId: queueItem.id,
        status: 'executed',
        lastExecutedAt: requestedAt,
        lastRefreshedAt: requestedAt
      });
      const suppressedIds = await this.suppressSiblingQueueItems({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        queueItem: executedQueueItem,
        changedAt: requestedAt
      });

      const auditEventId = await this.audit.record({
        eventType: 'aaliyah.operator_action.executed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: requestedAt,
        metadata: this.audit.buildMetadata({
          queueItemId: executedQueueItem.id,
          actionPath: action.actionPath,
          executionStatus: 'success',
          canonicalIssueKey: canonicalIssueKeyForQueueItem(executedQueueItem),
          commandId: command.commandId,
          suppressedQueueItemIds: suppressedIds
        })
      });

      const log = await this.repository.createOperatorActionLog({
        tenantId: args.tenantId,
        actionLogId: `operator-action:${randomUUID()}`,
        queueItemId: executedQueueItem.id,
        queueItemVersion: executedQueueItem.rankingVersion,
        canonicalIssueKey: canonicalIssueKeyForQueueItem(executedQueueItem),
        actionPath: action.actionPath,
        commandId: command.commandId,
        founderActorId: args.actorId,
        idempotencyKey: args.idempotencyKey,
        executionStatus: 'success',
        failureCode: null,
        failureReason: null,
        executedAt: requestedAt
      });

      return {
        ok: true,
        result: {
          executionStatus: 'success',
          queueItemId: executedQueueItem.id,
          commandId: command.commandId,
          canonicalIssueKey: canonicalIssueKeyForQueueItem(executedQueueItem),
          executedAtIso: requestedAt,
          auditId: auditEventId ?? log.id
        },
        log
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private async suppressSiblingQueueItems(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    queueItem: { id: string; canonicalIssueKey: string | null };
    changedAt: string;
  }) {
    if (!args.queueItem.canonicalIssueKey) return [];
    const siblings = await this.repository.listOperatorQueueRecords({
      tenantId: args.tenantId,
      canonicalIssueKey: args.queueItem.canonicalIssueKey,
      statuses: ['active']
    });
    const suppressed: string[] = [];
    for (const sibling of siblings) {
      if (sibling.id === args.queueItem.id) continue;
      await this.repository.updateOperatorQueueRecord({
        tenantId: args.tenantId,
        queueItemId: sibling.id,
        status: 'suppressed',
        supersededByQueueItemId: args.queueItem.id,
        lastRefreshedAt: args.changedAt
      });
      suppressed.push(sibling.id);
    }
    return suppressed;
  }

  private buildResolvedAction(queueItem: {
    actionableCommandType: NonNullable<ResolvedOperatorAction['commandType']> | null;
    actionableTargetType: NonNullable<ResolvedOperatorAction['targetType']> | null;
    actionableTargetId: string | null;
    title: string;
    summary: string;
    reason: string;
    priorityBand: 'critical' | 'high' | 'normal';
  }, actorId: string, requestedAt: string, idempotencyKey: string): ResolvedOperatorAction {
    if (!queueItem.actionableCommandType || !queueItem.actionableTargetType || !queueItem.actionableTargetId) {
      throw new OperatorActionConflictError('Operator queue item no longer resolves to a founder command path.');
    }
    const actionPath = `${queueItem.actionableCommandType}:${queueItem.actionableTargetType}:${queueItem.actionableTargetId}`;
    switch (queueItem.actionableCommandType) {
      case 'create_follow_up':
        return {
          commandType: 'create_follow_up',
          targetType: queueItem.actionableTargetType,
          targetId: queueItem.actionableTargetId,
          payload: {
            title: queueItem.title,
            description: `${queueItem.summary}\n\n${queueItem.reason}`.trim()
          },
          actionPath
        };
      case 'escalate_task':
        return {
          commandType: 'escalate_task',
          targetType: queueItem.actionableTargetType,
          targetId: queueItem.actionableTargetId,
          payload: {
            escalationReason: 'blocked',
            priority: queueItem.priorityBand === 'critical' ? 'critical' : 'high',
            notes: queueItem.reason
          },
          actionPath
        };
      case 'override_schedule':
        return {
          commandType: 'override_schedule',
          targetType: queueItem.actionableTargetType,
          targetId: queueItem.actionableTargetId,
          payload: {
            overrideMode: 'reschedule',
            reason: queueItem.reason
          },
          actionPath
        };
      case 'trigger_workflow':
        return {
          commandType: 'trigger_workflow',
          targetType: queueItem.actionableTargetType,
          targetId: queueItem.actionableTargetId,
          payload: {
            workflowName: 'draft_follow_up',
            input: {
              requestedBy: actorId,
              requestedAtIso: requestedAt,
              idempotencyKey
            }
          },
          actionPath
        };
      case 'approve_draft':
        return {
          commandType: 'approve_draft',
          targetType: queueItem.actionableTargetType,
          targetId: queueItem.actionableTargetId,
          payload: {
            approvalMode: 'approved_for_send'
          },
          actionPath
        };
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new OperatorActionAccessDeniedError();
    }
    if (mode !== 'founder') {
      throw new OperatorActionInvalidModeError();
    }
  }

  private normalizeFailure(error: unknown): OperatorActionFailureResult {
    if (error instanceof OperatorActionAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OperatorActionInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OperatorActionNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof OperatorActionConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: error.message };
    }
    const internal = new OperatorActionInternalError();
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: internal.message };
  }
}

function mapFailureToStatus(code: string | undefined) {
  switch (code) {
    case 'QUEUE_ITEM_ALREADY_EXECUTED':
      return 'already_executed' as const;
    case 'QUEUE_ITEM_SUPERSEDED':
      return 'superseded' as const;
    case 'QUEUE_ITEM_INVALIDATED':
    case 'SOURCE_NOT_FOUND':
      return 'invalidated' as const;
    case 'ACTION_PATH_UNRESOLVABLE':
    case 'SOURCE_NOT_ACTIONABLE':
      return 'not_actionable' as const;
    default:
      return 'failure' as const;
  }
}

function buildFallbackActionPath(queueItem: {
  actionableCommandType: string | null;
  actionableTargetType: string | null;
  actionableTargetId: string | null;
}) {
  return `${queueItem.actionableCommandType ?? 'none'}:${queueItem.actionableTargetType ?? 'none'}:${queueItem.actionableTargetId ?? 'none'}`;
}
