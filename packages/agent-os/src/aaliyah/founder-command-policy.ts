import {
  FounderCommandConflictError,
  FounderCommandValidationError
} from './founder-command-errors.js';
import type {
  FounderCommandPayload,
  FounderCommandTargetType,
  FounderCommandType,
  FounderTriggerWorkflowPayload
} from './founder-command-types.js';

const allowedTargets: Record<FounderCommandType, FounderCommandTargetType[]> = {
  approve_draft: ['gmail_draft'],
  create_follow_up: ['gmail_draft', 'task', 'calendar_event', 'contact', 'account'],
  escalate_task: ['task'],
  override_schedule: ['calendar_event', 'task'],
  trigger_workflow: ['workflow', 'task', 'contact', 'account']
};

const allowlistedWorkflows = new Set<FounderTriggerWorkflowPayload['workflowName']>([
  'draft_follow_up',
  'contact_revival',
  'post_meeting_recap'
]);

export function assertFounderCommandAllowed(actorRole: string, commandType: FounderCommandType, targetType: FounderCommandTargetType): void {
  if (actorRole !== 'founder') {
    throw new FounderCommandValidationError('Founder role is required for this command.');
  }
  if (!allowedTargets[commandType].includes(targetType)) {
    throw new FounderCommandValidationError(`Command ${commandType} is not allowed for target ${targetType}.`);
  }
}

export function assertFounderCommandPayload(commandType: FounderCommandType, payload: FounderCommandPayload): void {
  switch (commandType) {
    case 'approve_draft': {
      const approvalMode = payload.approvalMode;
      if (approvalMode !== 'approved_for_send' && approvalMode !== 'approved_for_revision') {
        throw new FounderCommandValidationError('Draft approval mode is invalid.');
      }
      if (approvalMode === 'approved_for_revision') {
        const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';
        if (!notes) {
          throw new FounderCommandValidationError('Revision approvals require notes.');
        }
      }
      return;
    }
    case 'create_follow_up': {
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) {
        throw new FounderCommandValidationError('Follow-up title is required.');
      }
      return;
    }
    case 'escalate_task': {
      if (payload.priority !== 'high' && payload.priority !== 'critical') {
        throw new FounderCommandValidationError('Escalation priority must be high or critical.');
      }
      const reason = payload.escalationReason;
      if (reason !== 'blocked' && reason !== 'urgent' && reason !== 'high_value' && reason !== 'founder_override') {
        throw new FounderCommandValidationError('Escalation reason is invalid.');
      }
      return;
    }
    case 'override_schedule': {
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      if (!reason) {
        throw new FounderCommandValidationError('Schedule overrides require a reason.');
      }
      const mode = payload.overrideMode;
      if (mode !== 'force_time' && mode !== 'defer' && mode !== 'cancel' && mode !== 'reschedule') {
        throw new FounderCommandValidationError('Override mode is invalid.');
      }
      return;
    }
    case 'trigger_workflow': {
      const workflowName = payload.workflowName;
      if (typeof workflowName !== 'string' || !allowlistedWorkflows.has(workflowName as FounderTriggerWorkflowPayload['workflowName'])) {
        throw new FounderCommandValidationError('Workflow is not allowlisted.');
      }
      return;
    }
  }
}

export function assertFounderCommandIdempotency(idempotencyKey: string): void {
  if (!idempotencyKey.trim()) {
    throw new FounderCommandValidationError('Idempotency key is required.');
  }
}

export function assertNotCompletedTaskTransition(status: string | null): void {
  if (status === 'completed' || status === 'cancelled') {
    throw new FounderCommandConflictError('Founder command cannot mutate a terminal task.');
  }
}
