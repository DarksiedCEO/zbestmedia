import type { FollowThroughDecisionType, FollowThroughEngineRecord, FollowThroughPolicyKey } from './follow-through-engine-types.js';

export function buildFollowThroughReason(args: { policyKey: FollowThroughPolicyKey; reason: string }): string {
  return args.reason.trim();
}

export function buildFollowThroughSummary(args: {
  policyKey: FollowThroughPolicyKey;
  decisionType: FollowThroughDecisionType;
  sourceType: string;
  sourceId: string;
  createdArtifactIds?: string[];
}): string {
  switch (args.policyKey) {
    case 'FT-001-approved-draft-next-step':
      return 'Created follow-up task after approved draft command.';
    case 'FT-002-workflow-dependency-next-step':
      return 'Created downstream follow-up task after workflow execution.';
    case 'FT-003-overdue-task-stale':
      return 'Flagged task as stale because its due date passed without a resolving action.';
    case 'FT-004-event-linked-recap':
      return 'Created recap follow-up task for elapsed calendar-linked work.';
    case 'FT-005-rejected-intent-context':
      return 'Recorded blocked follow-through context because founder intent was rejected or blocked.';
  }
}

export function buildFollowThroughListMessage(count: number): string {
  return count === 1 ? 'Follow-through record loaded successfully.' : 'Follow-through records loaded successfully.';
}

export function summarizeExistingReplay(record: FollowThroughEngineRecord): string {
  return record.summary;
}
