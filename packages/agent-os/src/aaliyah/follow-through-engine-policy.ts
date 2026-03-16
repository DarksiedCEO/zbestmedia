import { createHash } from 'node:crypto';

import type {
  FollowThroughEngineRecord,
  FollowThroughPolicyKey,
  FollowThroughSourceRef,
  NormalizedFounderCommandContext,
  NormalizedRejectedIntentContext,
  NormalizedTaskContext
} from './follow-through-engine-types.js';

export const FOLLOW_THROUGH_POLICY_ORDER: FollowThroughPolicyKey[] = [
  'FT-005-rejected-intent-context',
  'FT-001-approved-draft-next-step',
  'FT-002-workflow-dependency-next-step',
  'FT-004-event-linked-recap',
  'FT-003-overdue-task-stale'
];

function hash(parts: Array<string | null | undefined>): string {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

export function buildFollowThroughIdempotencyKey(args: {
  policyKey: FollowThroughPolicyKey;
  source: FollowThroughSourceRef;
  sourceVersion: string;
}): string {
  return `ft:${args.policyKey}:${args.source.sourceType}:${args.source.sourceId}:${hash([args.sourceVersion])}`;
}

export function hasMatchingRecord(args: {
  existingRecords: FollowThroughEngineRecord[];
  policyKey: FollowThroughPolicyKey;
  idempotencyKey: string;
}): FollowThroughEngineRecord | null {
  return args.existingRecords.find((record) => record.policyKey === args.policyKey && record.idempotencyKey === args.idempotencyKey) ?? null;
}

export function isApprovedDraftCommand(command: NormalizedFounderCommandContext | null): boolean {
  return Boolean(
    command
      && command.executionStatus === 'executed'
      && command.commandType === 'approve_draft'
      && command.targetType === 'gmail_draft'
      && String(command.metadata.reviewStatus ?? '') === 'approved'
  );
}

export function isWorkflowDependencyCommand(command: NormalizedFounderCommandContext | null): boolean {
  return Boolean(command && command.executionStatus === 'executed' && command.commandType === 'trigger_workflow');
}

export function isRejectedIntentContext(rejectedIntent: NormalizedRejectedIntentContext[]): boolean {
  return rejectedIntent.length > 0;
}

export function isOverdueOpenTask(task: NormalizedTaskContext | null, evaluatedAtIso: string): boolean {
  if (!task || !task.dueAt) {
    return false;
  }
  if (!['open', 'in_progress', 'blocked'].includes(task.status)) {
    return false;
  }
  return new Date(task.dueAt).getTime() < new Date(evaluatedAtIso).getTime();
}

export function isEventLinkedRecapMissing(task: NormalizedTaskContext | null, evaluatedAtIso: string): boolean {
  if (!task?.relatedCalendarEventId || !task.dueAt) {
    return false;
  }
  if (task.completedAt) {
    return false;
  }
  return new Date(task.dueAt).getTime() < new Date(evaluatedAtIso).getTime();
}
