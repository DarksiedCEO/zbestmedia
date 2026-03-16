export type AaliyahTaskStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

export type AaliyahTaskPriority = 'low' | 'normal' | 'high' | 'critical';

export type AaliyahTaskSource = 'manual' | 'crm_follow_up' | 'calendar_follow_up' | 'email_follow_up' | 'system';

export type AaliyahTask = {
  id: string;
  tenantId: string;
  principalId: string;
  title: string;
  description: string | null;
  status: AaliyahTaskStatus;
  priority: AaliyahTaskPriority;
  source: AaliyahTaskSource;
  contactId: string | null;
  accountId: string | null;
  relatedEmailDraftId: string | null;
  relatedCalendarEventId: string | null;
  dueAt: string | null;
  remindAt: string | null;
  blockedReason: string | null;
  completionNote: string | null;
  nextStepSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AaliyahCreateTaskInput = {
  title: string;
  description?: string;
  priority?: AaliyahTaskPriority;
  source?: AaliyahTaskSource;
  contactId?: string;
  accountId?: string;
  relatedEmailDraftId?: string;
  relatedCalendarEventId?: string;
  dueAt?: string;
  remindAt?: string;
};

export type AaliyahUpdateTaskInput = {
  title?: string;
  description?: string;
  status?: AaliyahTaskStatus;
  priority?: AaliyahTaskPriority;
  dueAt?: string;
  remindAt?: string;
  blockedReason?: string;
  completionNote?: string;
};

export type AaliyahTaskSuccessResult = {
  ok: true;
  task: AaliyahTask;
  message: string;
};

export type AaliyahTaskListSuccessResult = {
  ok: true;
  tasks: AaliyahTask[];
  message: string;
};

export type AaliyahTaskDenialCode = 'ACCESS_DENIED' | 'INVALID_MODE';

export type AaliyahTaskErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export type AaliyahTaskFailureResult = {
  ok: false;
  denialCode: AaliyahTaskDenialCode | null;
  errorCode: AaliyahTaskErrorCode | null;
  retryable: boolean;
  message: string;
};

export type AaliyahTaskResult = AaliyahTaskSuccessResult | AaliyahTaskFailureResult;
export type AaliyahTaskListResult = AaliyahTaskListSuccessResult | AaliyahTaskFailureResult;

export type AaliyahTasksAuditEventType =
  | 'aaliyah.tasks.created'
  | 'aaliyah.tasks.updated'
  | 'aaliyah.tasks.completed'
  | 'aaliyah.tasks.blocked'
  | 'aaliyah.tasks.requested'
  | 'aaliyah.tasks.list.requested'
  | 'aaliyah.tasks.denied'
  | 'aaliyah.tasks.failed';

export type AaliyahTasksAuditEvent = {
  eventType: AaliyahTasksAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};
