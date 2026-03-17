import type { FounderCommandType, FounderCommandTargetType } from './founder-command-types.js';
import type { OperatorQueueRecord } from './operator-queue-types.js';

export type OperatorActionExecutionStatus =
  | 'success'
  | 'failure'
  | 'invalidated'
  | 'already_executed'
  | 'superseded'
  | 'not_actionable';

export type OperatorActionFailureCode =
  | 'QUEUE_ITEM_NOT_FOUND'
  | 'QUEUE_ITEM_STALE'
  | 'QUEUE_ITEM_INVALIDATED'
  | 'QUEUE_ITEM_SUPERSEDED'
  | 'QUEUE_ITEM_ALREADY_EXECUTED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_NOT_ACTIONABLE'
  | 'ACTION_PATH_UNRESOLVABLE'
  | 'FOUNDER_PERMISSION_DENIED';

export interface ExecuteOperatorQueueItemInput {
  tenantId: string;
  founderActorId: string;
  queueItemId: string;
  idempotencyKey: string;
  requestedAtIso: string;
}

export interface OperatorActionValidationResult {
  isExecutable: boolean;
  failureCode?: OperatorActionFailureCode;
  resolvedActionPath?: string;
  canonicalIssueKey?: string | null;
  queueItem?: OperatorQueueRecord;
}

export interface ExecuteOperatorQueueItemResult {
  executionStatus: OperatorActionExecutionStatus;
  queueItemId: string;
  commandId?: string;
  canonicalIssueKey?: string | null;
  executedAtIso: string;
  auditId: string;
}

export type OperatorActionLogRecord = {
  id: string;
  tenantId: string;
  queueItemId: string;
  queueItemVersion: number;
  canonicalIssueKey: string | null;
  actionPath: string;
  commandId: string | null;
  founderActorId: string;
  idempotencyKey: string;
  executionStatus: OperatorActionExecutionStatus;
  failureCode: OperatorActionFailureCode | null;
  failureReason: string | null;
  executedAtIso: string;
  createdAtIso: string;
};

export type OperatorActionFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type OperatorActionResult =
  | ({ ok: true; result: ExecuteOperatorQueueItemResult; log: OperatorActionLogRecord } )
  | OperatorActionFailureResult;

export type OperatorActionAuditEventType =
  | 'aaliyah.operator_action.executed'
  | 'aaliyah.operator_action.failed'
  | 'aaliyah.operator_action.replayed';

export type OperatorActionAuditEvent = {
  eventType: OperatorActionAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type ResolvedOperatorAction = {
  commandType: FounderCommandType;
  targetType: FounderCommandTargetType;
  targetId: string;
  payload: Record<string, unknown>;
  actionPath: string;
};
