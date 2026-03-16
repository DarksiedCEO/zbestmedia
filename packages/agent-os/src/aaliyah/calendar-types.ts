export type AaliyahCalendarProvider = "google_calendar";

export type AaliyahCalendarDenialCode =
  | "ACCESS_DENIED"
  | "INVALID_MODE"
  | "PROVIDER_DISABLED";

export type AaliyahCalendarErrorCode =
  | "INVALID_INPUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "INTERNAL_ERROR";

export type AaliyahCalendarAvailabilityInput = {
  startIso: string;
  endIso: string;
  timezone: string;
  durationMinutes?: number;
  dryRun?: boolean;
};

export type AaliyahCalendarSlot = {
  startIso: string;
  endIso: string;
};

export type AaliyahCalendarAvailabilitySuccessResult = {
  ok: true;
  provider: AaliyahCalendarProvider;
  dryRun: boolean;
  slots: AaliyahCalendarSlot[];
  message: string;
};

export type AaliyahCalendarAvailabilityFailureResult = {
  ok: false;
  provider: AaliyahCalendarProvider;
  dryRun: boolean;
  denialCode: AaliyahCalendarDenialCode | null;
  errorCode: AaliyahCalendarErrorCode | null;
  retryable: boolean;
  message: string;
};

export type AaliyahCalendarAvailabilityResult =
  | AaliyahCalendarAvailabilitySuccessResult
  | AaliyahCalendarAvailabilityFailureResult;

export type AaliyahCalendarCreateEventInput = {
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  timezone: string;
  attendees?: string[];
  dryRun?: boolean;
};

export type AaliyahCalendarCreateEventSuccessResult = {
  ok: true;
  provider: AaliyahCalendarProvider;
  dryRun: boolean;
  eventId: string;
  externalId: string | null;
  message: string;
};

export type AaliyahCalendarCreateEventFailureResult = {
  ok: false;
  provider: AaliyahCalendarProvider;
  dryRun: boolean;
  denialCode: AaliyahCalendarDenialCode | null;
  errorCode: AaliyahCalendarErrorCode | null;
  retryable: boolean;
  message: string;
};

export type AaliyahCalendarCreateEventResult =
  | AaliyahCalendarCreateEventSuccessResult
  | AaliyahCalendarCreateEventFailureResult;

export type AaliyahCalendarAuditEventType =
  | "aaliyah.calendar.availability.requested"
  | "aaliyah.calendar.availability.failed"
  | "aaliyah.calendar.availability.denied"
  | "aaliyah.calendar.availability.resolved"
  | "aaliyah.calendar.event.requested"
  | "aaliyah.calendar.event.denied"
  | "aaliyah.calendar.event.created"
  | "aaliyah.calendar.event.failed";

export type AaliyahCalendarAuditEvent = {
  eventType: AaliyahCalendarAuditEventType;
  principalId: string;
  tenantId: string;
  mode: "founder" | "zbestmedia";
  provider: AaliyahCalendarProvider;
  timestamp: string;
  metadata?: Record<string, unknown>;
};
