import { randomUUID } from "node:crypto";

import type { EmailAccountConnectionRecord } from "../persistence/contracts.js";
import { loadEmailIntegrationConfig, type EmailIntegrationConfig } from "../email/config.js";
import {
  AaliyahCalendarProviderRejectedError,
  AaliyahCalendarProviderUnavailableError
} from "./calendar-errors.js";
import type {
  AaliyahCalendarAvailabilityInput,
  AaliyahCalendarCreateEventInput,
  AaliyahCalendarSlot
} from "./calendar-types.js";

const GOOGLE_CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MAX_SLOT_COUNT = 20;

export interface GoogleCalendarProvider {
  getAvailability(args: {
    input: AaliyahCalendarAvailabilityInput;
    account: EmailAccountConnectionRecord;
  }): Promise<AaliyahCalendarSlot[]>;

  createEvent(args: {
    input: AaliyahCalendarCreateEventInput;
    account: EmailAccountConnectionRecord;
  }): Promise<{
    eventId: string;
    externalId?: string | null;
  }>;
}

export class DryRunGoogleCalendarProvider implements GoogleCalendarProvider {
  async getAvailability(args: { input: AaliyahCalendarAvailabilityInput; account: EmailAccountConnectionRecord }): Promise<AaliyahCalendarSlot[]> {
    const durationMinutes = args.input.durationMinutes ?? 30;
    const start = Date.parse(args.input.startIso);
    const slots: AaliyahCalendarSlot[] = [];

    for (let index = 0; index < 3; index += 1) {
      const slotStart = new Date(start + (index + 1) * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      slots.push({
        startIso: slotStart.toISOString(),
        endIso: slotEnd.toISOString()
      });
    }

    return slots;
  }

  async createEvent(): Promise<{ eventId: string; externalId?: string | null }> {
    const suffix = randomUUID();
    return {
      eventId: `dryrun-event:${suffix}`,
      externalId: `dryrun-external:${suffix}`
    };
  }
}

export class GoogleWorkspaceCalendarProvider implements GoogleCalendarProvider {
  constructor(private readonly config: EmailIntegrationConfig = loadEmailIntegrationConfig()) {}

  async getAvailability(args: {
    input: AaliyahCalendarAvailabilityInput;
    account: EmailAccountConnectionRecord;
  }): Promise<AaliyahCalendarSlot[]> {
    this.assertCalendarAvailable(args.account, GOOGLE_CALENDAR_READ_SCOPE);
    const accessToken = await refreshAccessToken({
      clientId: this.config.oauth!.clientId,
      clientSecret: this.config.oauth!.clientSecretReference,
      refreshToken: args.account.tokenReference
    });

    const busyRanges = await fetchBusyRanges({
      accessToken,
      startIso: args.input.startIso,
      endIso: args.input.endIso,
      timezone: args.input.timezone
    });

    return deriveFreeSlots({
      startIso: args.input.startIso,
      endIso: args.input.endIso,
      busyRanges,
      durationMinutes: args.input.durationMinutes ?? 30
    });
  }

  async createEvent(args: {
    input: AaliyahCalendarCreateEventInput;
    account: EmailAccountConnectionRecord;
  }): Promise<{ eventId: string; externalId?: string | null }> {
    this.assertCalendarAvailable(args.account, GOOGLE_CALENDAR_WRITE_SCOPE);
    const accessToken = await refreshAccessToken({
      clientId: this.config.oauth!.clientId,
      clientSecret: this.config.oauth!.clientSecretReference,
      refreshToken: args.account.tokenReference
    });

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        summary: args.input.title,
        description: args.input.description ?? undefined,
        location: args.input.location ?? undefined,
        start: {
          dateTime: args.input.startIso,
          timeZone: args.input.timezone
        },
        end: {
          dateTime: args.input.endIso,
          timeZone: args.input.timezone
        },
        attendees: args.input.attendees?.map((email) => ({ email })) ?? []
      })
    });

    const payload = (await safeReadJson(res)) as { id?: string; htmlLink?: string; error?: { message?: string } };
    if (!res.ok || !payload.id) {
      throw new AaliyahCalendarProviderRejectedError(payload.error?.message ?? `calendar_create_event_failed:${res.status}`);
    }

    return {
      eventId: payload.id,
      externalId: payload.htmlLink ?? null
    };
  }

  private assertCalendarAvailable(account: EmailAccountConnectionRecord, requiredScope: string) {
    if (!this.config.enabled || !this.config.oauth) {
      throw new AaliyahCalendarProviderUnavailableError("Calendar provider is unavailable.");
    }
    if (account.connectionStatus !== "connected" || !account.tokenReference) {
      throw new AaliyahCalendarProviderUnavailableError("No connected Google account is available for Calendar.");
    }
    if (!account.grantedScopes.includes(requiredScope)) {
      throw new AaliyahCalendarProviderUnavailableError("Connected Google account is missing required Calendar scopes.");
    }
  }
}

async function refreshAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
}): Promise<string> {
  if (!args.refreshToken) {
    throw new AaliyahCalendarProviderUnavailableError("Google refresh token is unavailable.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = (await safeReadJson(res)) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !payload.access_token) {
    throw new AaliyahCalendarProviderUnavailableError(
      payload.error_description ?? payload.error ?? "Calendar access token refresh failed."
    );
  }
  return payload.access_token;
}

async function fetchBusyRanges(args: {
  accessToken: string;
  startIso: string;
  endIso: string;
  timezone: string;
}): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      timeMin: args.startIso,
      timeMax: args.endIso,
      timeZone: args.timezone,
      items: [{ id: "primary" }]
    })
  });
  const payload = (await safeReadJson(res)) as {
    calendars?: {
      primary?: {
        busy?: Array<{ start?: string; end?: string }>;
      };
    };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new AaliyahCalendarProviderRejectedError(payload.error?.message ?? `calendar_freebusy_failed:${res.status}`);
  }
  return (payload.calendars?.primary?.busy ?? [])
    .filter((range): range is { start: string; end: string } => Boolean(range.start && range.end))
    .map((range) => ({ start: range.start, end: range.end }));
}

function deriveFreeSlots(args: {
  startIso: string;
  endIso: string;
  busyRanges: Array<{ start: string; end: string }>;
  durationMinutes: number;
}): AaliyahCalendarSlot[] {
  const startMs = Date.parse(args.startIso);
  const endMs = Date.parse(args.endIso);
  const durationMs = args.durationMinutes * 60 * 1000;
  const mergedBusy = args.busyRanges
    .map((range) => ({ start: Date.parse(range.start), end: Date.parse(range.end) }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((acc, range) => {
      const last = acc.length > 0 ? acc[acc.length - 1] : null;
      if (!last || range.start > last.end) {
        acc.push(range);
        return acc;
      }
      last.end = Math.max(last.end, range.end);
      return acc;
    }, []);

  const slots: AaliyahCalendarSlot[] = [];
  let cursor = startMs;
  for (const busy of mergedBusy) {
    if (busy.start - cursor >= durationMs) {
      pushWindowSlots(slots, cursor, Math.min(busy.start, endMs), durationMs);
    }
    cursor = Math.max(cursor, busy.end);
    if (slots.length >= MAX_SLOT_COUNT) {
      return slots.slice(0, MAX_SLOT_COUNT);
    }
  }

  if (endMs - cursor >= durationMs && slots.length < MAX_SLOT_COUNT) {
    pushWindowSlots(slots, cursor, endMs, durationMs);
  }

  return slots.slice(0, MAX_SLOT_COUNT);
}

function pushWindowSlots(slots: AaliyahCalendarSlot[], startMs: number, endMs: number, durationMs: number) {
  let cursor = startMs;
  while (cursor + durationMs <= endMs && slots.length < MAX_SLOT_COUNT) {
    slots.push({
      startIso: new Date(cursor).toISOString(),
      endIso: new Date(cursor + durationMs).toISOString()
    });
    cursor += durationMs;
  }
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export const GOOGLE_CALENDAR_REQUIRED_SCOPES = {
  availability: GOOGLE_CALENDAR_READ_SCOPE,
  events: GOOGLE_CALENDAR_WRITE_SCOPE
} as const;
