import { createHash } from "node:crypto";

import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import type {
  AaliyahCalendarAuditEvent,
  AaliyahCalendarAvailabilityInput,
  AaliyahCalendarCreateEventInput
} from "./calendar-types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class AaliyahCalendarAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: AaliyahCalendarAuditEvent): Promise<void> {
    if (!this.diagnostics) {
      return;
    }

    await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: "founder",
      activeMode: event.mode,
      eventType: this.mapEventType(event.eventType),
      eventSource: "aaliyah_workspace",
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
  }

  buildAvailabilityMetadata(args: {
    input: AaliyahCalendarAvailabilityInput;
    resultCode?: string | null;
    accountId?: string | null;
    slotCount?: number | null;
  }) {
    return {
      startIso: args.input.startIso,
      endIso: args.input.endIso,
      timezone: args.input.timezone,
      durationMinutes: args.input.durationMinutes ?? null,
      dryRun: Boolean(args.input.dryRun),
      accountId: args.accountId ?? null,
      slotCount: args.slotCount ?? null,
      resultCode: args.resultCode ?? null
    };
  }

  buildEventMetadata(args: {
    input: AaliyahCalendarCreateEventInput;
    resultCode?: string | null;
    accountId?: string | null;
  }) {
    return {
      titleHash: sha256(args.input.title),
      startIso: args.input.startIso,
      endIso: args.input.endIso,
      timezone: args.input.timezone,
      attendeeCount: args.input.attendees?.length ?? 0,
      dryRun: Boolean(args.input.dryRun),
      accountId: args.accountId ?? null,
      resultCode: args.resultCode ?? null
    };
  }

  private mapEventType(eventType: AaliyahCalendarAuditEvent["eventType"]) {
    switch (eventType) {
      case "aaliyah.calendar.availability.requested":
        return "workspace_calendar_availability_requested" as const;
      case "aaliyah.calendar.availability.denied":
        return "workspace_calendar_availability_denied" as const;
      case "aaliyah.calendar.availability.failed":
        return "workspace_calendar_availability_failed" as const;
      case "aaliyah.calendar.availability.resolved":
        return "workspace_calendar_availability_resolved" as const;
      case "aaliyah.calendar.event.requested":
        return "workspace_calendar_event_requested" as const;
      case "aaliyah.calendar.event.denied":
        return "workspace_calendar_event_denied" as const;
      case "aaliyah.calendar.event.created":
        return "workspace_calendar_event_created" as const;
      case "aaliyah.calendar.event.failed":
        return "workspace_calendar_event_failed" as const;
    }
  }
}
