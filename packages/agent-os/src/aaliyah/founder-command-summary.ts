import type { FounderCommandExecutionStatus, FounderCommandTargetRef, FounderCommandType } from './founder-command-types.js';

export function buildFounderCommandSummary(args: {
  commandType: FounderCommandType;
  target: FounderCommandTargetRef;
  status: FounderCommandExecutionStatus;
  details?: Record<string, unknown>;
}): string {
  const detail = args.details ?? {};
  const suffix = args.status === 'noop' ? ' No mutation was applied.' : '';
  switch (args.commandType) {
    case 'approve_draft':
      return detail.approvalMode === 'approved_for_revision'
        ? `Draft approved for revision and audit logged.${suffix}`
        : `Draft approved for send readiness and audit logged.${suffix}`;
    case 'create_follow_up':
      return `Follow-up task created from ${args.target.targetType} and linked for execution.${suffix}`;
    case 'escalate_task':
      return `Task escalated to ${String(detail.priority ?? 'high')} priority.${suffix}`;
    case 'override_schedule':
      return `Schedule override ${String(detail.overrideMode ?? 'recorded')} recorded with founder rationale.${suffix}`;
    case 'trigger_workflow':
      return `Workflow ${String(detail.workflowName ?? 'unknown')} executed through governed founder command flow.${suffix}`;
  }
}
