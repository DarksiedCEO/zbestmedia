import {
  buildFollowThroughIdempotencyKey,
  isApprovedDraftCommand,
  isEventLinkedRecapMissing,
  isOverdueOpenTask,
  isRejectedIntentContext,
  isWorkflowDependencyCommand
} from './follow-through-engine-policy.js';
import { buildFollowThroughReason, buildFollowThroughSummary } from './follow-through-engine-summary.js';
import type {
  FollowThroughEvaluationDraft,
  FollowThroughEvaluationInputs,
  FollowThroughSuggestedTaskPayload
} from './follow-through-engine-types.js';

export function evaluateFollowThrough(args: {
  context: FollowThroughEvaluationInputs;
  evaluatedAtIso: string;
}): {
  result: FollowThroughEvaluationDraft;
  suggestedTaskPayload?: FollowThroughSuggestedTaskPayload;
} {
  const { context } = args;

  if (isRejectedIntentContext(context.rejectedIntent)) {
    const policyKey = 'FT-005-rejected-intent-context';
    return {
      result: {
        source: context.source,
        policyKey,
        decisionType: 'record_blocked',
        status: 'blocked',
        reason: buildFollowThroughReason({ policyKey, reason: 'Rejected founder intent exists for this source context.' }),
        summary: buildFollowThroughSummary({ policyKey, decisionType: 'record_blocked', sourceType: context.source.sourceType, sourceId: context.source.sourceId }),
        idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
        metadata: {
          includedRejectedIntentContext: true,
          rejectedIntentEventIds: context.rejectedIntent.map((event) => event.eventId),
          linkedCommandId: context.founderCommand?.commandId ?? null,
          linkedTaskId: context.task?.taskId ?? context.linkedTask?.taskId ?? null
        },
        evaluatedAtIso: args.evaluatedAtIso
      }
    };
  }

  if (isApprovedDraftCommand(context.founderCommand)) {
    const policyKey = 'FT-001-approved-draft-next-step';
    return {
      result: {
        source: context.source,
        policyKey,
        decisionType: 'create_task',
        status: 'eligible',
        reason: buildFollowThroughReason({ policyKey, reason: 'Approved draft command requires tracked follow-through.' }),
        summary: buildFollowThroughSummary({ policyKey, decisionType: 'create_task', sourceType: context.source.sourceType, sourceId: context.source.sourceId }),
        idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
        metadata: {
          includedRejectedIntentContext: false,
          linkedCommandId: context.founderCommand?.commandId ?? null,
          linkedTaskId: context.task?.taskId ?? null,
          draftId: context.relatedEmailDraftId
        },
        evaluatedAtIso: args.evaluatedAtIso
      },
      suggestedTaskPayload: {
        title: 'Follow up on approved outreach draft',
        description: 'Founder-approved draft needs a tracked follow-up step.',
        dueAtIso: plusDays(args.evaluatedAtIso, 2),
        priority: 'high',
        channel: 'email',
        attachToTaskId: context.task?.taskId ?? undefined,
        attachToContactId: context.contactId ?? undefined,
        attachToAccountId: context.accountId ?? undefined,
        attachToDraftId: context.relatedEmailDraftId ?? undefined,
        attachToCalendarEventId: context.relatedCalendarEventId ?? undefined
      }
    };
  }

  if (isWorkflowDependencyCommand(context.founderCommand)) {
    const workflowName = typeof context.founderCommand?.metadata.workflowName === 'string'
      ? context.founderCommand.metadata.workflowName
      : 'workflow';
    const policyKey = 'FT-002-workflow-dependency-next-step';
    return {
      result: {
        source: context.source,
        policyKey,
        decisionType: 'create_task',
        status: 'eligible',
        reason: buildFollowThroughReason({ policyKey, reason: 'Executed workflow requires downstream follow-through.' }),
        summary: buildFollowThroughSummary({ policyKey, decisionType: 'create_task', sourceType: context.source.sourceType, sourceId: context.source.sourceId }),
        idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
        metadata: {
          includedRejectedIntentContext: false,
          linkedCommandId: context.founderCommand?.commandId ?? null,
          linkedTaskId: context.task?.taskId ?? null,
          workflowName
        },
        evaluatedAtIso: args.evaluatedAtIso
      },
      suggestedTaskPayload: {
        title: `Complete ${workflowName.replace(/_/g, ' ')} next step`,
        description: 'Executed workflow still needs a deterministic next action.',
        dueAtIso: plusDays(args.evaluatedAtIso, 1),
        priority: 'high',
        channel: 'internal',
        attachToTaskId: context.task?.taskId ?? undefined,
        attachToContactId: context.contactId ?? undefined,
        attachToAccountId: context.accountId ?? undefined,
        attachToDraftId: context.relatedEmailDraftId ?? undefined,
        attachToCalendarEventId: context.relatedCalendarEventId ?? undefined
      }
    };
  }

  if (isEventLinkedRecapMissing(context.task ?? context.linkedTask, args.evaluatedAtIso)) {
    const task = context.task ?? context.linkedTask;
    const policyKey = 'FT-004-event-linked-recap';
    return {
      result: {
        source: context.source,
        policyKey,
        decisionType: 'create_task',
        status: 'eligible',
        reason: buildFollowThroughReason({ policyKey, reason: 'Calendar-linked work elapsed without a recap task.' }),
        summary: buildFollowThroughSummary({ policyKey, decisionType: 'create_task', sourceType: context.source.sourceType, sourceId: context.source.sourceId }),
        idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
        metadata: {
          includedRejectedIntentContext: false,
          linkedCommandId: null,
          linkedTaskId: task?.taskId ?? null,
          relatedCalendarEventId: task?.relatedCalendarEventId ?? context.relatedCalendarEventId ?? null
        },
        evaluatedAtIso: args.evaluatedAtIso
      },
      suggestedTaskPayload: {
        title: 'Send post-meeting recap follow-up',
        description: 'Calendar-linked work elapsed without a recorded recap.',
        dueAtIso: plusDays(args.evaluatedAtIso, 1),
        priority: 'high',
        channel: 'meeting',
        attachToTaskId: task?.taskId ?? undefined,
        attachToContactId: context.contactId ?? undefined,
        attachToAccountId: context.accountId ?? undefined,
        attachToDraftId: context.relatedEmailDraftId ?? undefined,
        attachToCalendarEventId: task?.relatedCalendarEventId ?? context.relatedCalendarEventId ?? undefined
      }
    };
  }

  if (isOverdueOpenTask(context.task ?? context.linkedTask, args.evaluatedAtIso)) {
    const task = context.task ?? context.linkedTask;
    const policyKey = 'FT-003-overdue-task-stale';
    return {
      result: {
        source: context.source,
        policyKey,
        decisionType: 'flag_stale',
        status: 'stale',
        reason: buildFollowThroughReason({ policyKey, reason: 'Open task is overdue without a resolving founder action.' }),
        summary: buildFollowThroughSummary({ policyKey, decisionType: 'flag_stale', sourceType: context.source.sourceType, sourceId: context.source.sourceId }),
        idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
        metadata: {
          includedRejectedIntentContext: false,
          linkedCommandId: null,
          linkedTaskId: task?.taskId ?? null
        },
        evaluatedAtIso: args.evaluatedAtIso
      }
    };
  }

  const policyKey = 'FT-005-rejected-intent-context';
  return {
    result: {
      source: context.source,
      policyKey,
      decisionType: 'noop',
      status: 'noop',
      reason: 'No follow-through policy matched for this source.',
      summary: 'No action taken because no eligible follow-through policy matched.',
      idempotencyKey: buildFollowThroughIdempotencyKey({ policyKey, source: context.source, sourceVersion: context.sourceVersion }),
      metadata: {
        includedRejectedIntentContext: false,
        linkedCommandId: context.founderCommand?.commandId ?? null,
        linkedTaskId: context.task?.taskId ?? context.linkedTask?.taskId ?? null
      },
      evaluatedAtIso: args.evaluatedAtIso
    }
  };
}

function plusDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
