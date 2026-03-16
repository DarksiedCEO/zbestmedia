export type FounderCommandType =
  | 'approve_draft'
  | 'create_follow_up'
  | 'escalate_task'
  | 'override_schedule'
  | 'trigger_workflow';

export type FounderCommandTargetType =
  | 'gmail_draft'
  | 'task'
  | 'calendar_event'
  | 'contact'
  | 'account'
  | 'workflow';

export type FounderCommandActor = {
  actorUserId: string;
  actorRole: 'founder';
  requestId: string;
  issuedAtIso: string;
};

export type FounderCommandTargetRef = {
  targetType: FounderCommandTargetType;
  targetId: string;
};

export type FounderDraftApprovalMode = 'approved_for_send' | 'approved_for_revision';
export type FounderFollowUpChannel = 'email' | 'call' | 'meeting' | 'internal';
export type FounderTaskEscalationReason = 'blocked' | 'urgent' | 'high_value' | 'founder_override';
export type FounderScheduleOverrideMode = 'force_time' | 'defer' | 'cancel' | 'reschedule';
export type FounderWorkflowName = 'draft_follow_up' | 'contact_revival' | 'post_meeting_recap';

export type FounderCommandPayload = Record<string, unknown>;

export type FounderApproveDraftPayload = {
  approvalMode: FounderDraftApprovalMode;
  notes?: string;
};

export type FounderCreateFollowUpPayload = {
  title: string;
  dueAtIso?: string;
  channel?: FounderFollowUpChannel;
  attachToTaskId?: string;
  attachToContactId?: string;
  attachToAccountId?: string;
  description?: string;
  remindAtIso?: string;
};

export type FounderEscalateTaskPayload = {
  escalationReason: FounderTaskEscalationReason;
  priority: 'high' | 'critical';
  notes?: string;
};

export type FounderOverrideSchedulePayload = {
  overrideMode: FounderScheduleOverrideMode;
  startAtIso?: string;
  endAtIso?: string;
  reason: string;
  title?: string;
  description?: string;
  attendees?: string[];
};

export type FounderTriggerWorkflowPayload = {
  workflowName: FounderWorkflowName;
  input?: Record<string, unknown>;
};

export type FounderCommandRequest = {
  commandType: FounderCommandType;
  actor: FounderCommandActor;
  target: FounderCommandTargetRef;
  payload: FounderCommandPayload;
  idempotencyKey: string;
};

export type FounderCommandExecutionStatus = 'executed' | 'noop';

export type FounderCommandRecord = {
  id: string;
  tenantId: string;
  requestId: string;
  actorUserId: string;
  actorRole: 'founder';
  commandType: FounderCommandType;
  targetType: FounderCommandTargetType;
  targetId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  executionStatus: FounderCommandExecutionStatus;
  summary: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  executedAt: string | null;
};

export type FounderCommandSuccessResult = {
  ok: true;
  commandId: string;
  commandType: FounderCommandType;
  target: FounderCommandTargetRef;
  status: FounderCommandExecutionStatus;
  summary: string;
  auditEventId: string | null;
  executedAtIso: string;
};

export type FounderCommandDenialCode = 'ACCESS_DENIED' | 'INVALID_MODE';
export type FounderCommandErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export type FounderCommandFailureResult = {
  ok: false;
  denialCode: FounderCommandDenialCode | null;
  errorCode: FounderCommandErrorCode | null;
  retryable: boolean;
  message: string;
};

export type FounderCommandResult = FounderCommandSuccessResult | FounderCommandFailureResult;

export type FounderCommandListSuccessResult = {
  ok: true;
  commands: FounderCommandRecord[];
  message: string;
};

export type FounderCommandListResult = FounderCommandListSuccessResult | FounderCommandFailureResult;

export type FounderCommandAuditEventType =
  | 'aaliyah.founder_command.executed'
  | 'aaliyah.founder_command.rejected'
  | 'aaliyah.founder_command.noop';

export type FounderCommandAuditEvent = {
  eventType: FounderCommandAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};
