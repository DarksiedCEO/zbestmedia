import { describe, expect, it, vi } from "vitest";

import { AaliyahCalendarProviderRejectedError } from "../src/aaliyah/calendar-errors.js";
import { AaliyahCalendarService } from "../src/aaliyah/calendar-service.js";

describe("Aaliyah calendar service", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const actorId = "actor-1";

  function createRepository() {
    return {
      getLatestConnectedEmailAccountByPrincipal: vi.fn(async () => ({
        tenantId,
        accountId: "email-account:1",
        provider: "gmail",
        principalId: actorId,
        accountEmailAddress: "founder@zbestmedia.com",
        connectionStatus: "connected",
        grantedScopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events"
        ],
        tokenReference: "secret:gmail",
        externalAccountId: null,
        draftOnlyMode: true,
        processingEnabled: false,
        processingMode: "poll",
        maxBatchThreads: 1,
        allowedLabelIds: [],
        oauthState: null,
        oauthStateExpiresAt: null,
        lastProcessedAt: null,
        lastError: null,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z"
      }))
    } as any;
  }

  function createDiagnostics() {
    return {
      recordEvent: vi.fn(async () => undefined)
    } as any;
  }

  it("allows founder dry-run availability lookup", async () => {
    const diagnostics = createDiagnostics();
    const dryRunProvider = {
      getAvailability: vi.fn(async () => [
        {
          startIso: "2026-03-18T17:00:00.000Z",
          endIso: "2026-03-18T17:30:00.000Z"
        }
      ]),
      createEvent: vi.fn()
    };
    const service = new AaliyahCalendarService(createRepository(), diagnostics, {
      config: { enabled: true, dryRunDefault: true },
      dryRunProvider: dryRunProvider as any
    });

    const result = await service.getAvailability({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        startIso: "2026-03-18T16:00:00.000Z",
        endIso: "2026-03-19T00:00:00.000Z",
        timezone: "America/Los_Angeles"
      }
    });

    expect(result).toEqual({
      ok: true,
      provider: "google_calendar",
      dryRun: true,
      slots: [
        {
          startIso: "2026-03-18T17:00:00.000Z",
          endIso: "2026-03-18T17:30:00.000Z"
        }
      ],
      message: "Availability simulated successfully."
    });
    expect(dryRunProvider.getAvailability).toHaveBeenCalledOnce();
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(2);
  });

  it("denies non-founder calendar access", async () => {
    const diagnostics = createDiagnostics();
    const service = new AaliyahCalendarService(createRepository(), diagnostics, {
      config: { enabled: true, dryRunDefault: true }
    });

    const result = await service.getAvailability({
      tenantId,
      actorId,
      principalContext: "operator",
      mode: "founder",
      input: {
        startIso: "2026-03-18T16:00:00.000Z",
        endIso: "2026-03-19T00:00:00.000Z",
        timezone: "America/Los_Angeles",
        dryRun: true
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "google_calendar",
      dryRun: true,
      denialCode: "ACCESS_DENIED",
      errorCode: null,
      retryable: false,
      message: "Founder access is required for Calendar actions."
    });
  });

  it("rejects invalid time ranges before provider calls", async () => {
    const dryRunProvider = {
      getAvailability: vi.fn(),
      createEvent: vi.fn()
    };
    const service = new AaliyahCalendarService(createRepository(), createDiagnostics(), {
      config: { enabled: true, dryRunDefault: true },
      dryRunProvider: dryRunProvider as any
    });

    const result = await service.getAvailability({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        startIso: "2026-03-19T00:00:00.000Z",
        endIso: "2026-03-18T16:00:00.000Z",
        timezone: "America/Los_Angeles",
        dryRun: true
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "google_calendar",
      dryRun: true,
      denialCode: null,
      errorCode: "INVALID_INPUT",
      retryable: false,
      message: "Calendar input failed validation."
    });
    expect(dryRunProvider.getAvailability).not.toHaveBeenCalled();
  });

  it("supports dry-run event creation", async () => {
    const dryRunProvider = {
      getAvailability: vi.fn(),
      createEvent: vi.fn(async () => ({
        eventId: "dryrun-event:1",
        externalId: "dryrun-link:1"
      }))
    };
    const service = new AaliyahCalendarService(createRepository(), createDiagnostics(), {
      config: { enabled: true, dryRunDefault: true },
      dryRunProvider: dryRunProvider as any
    });

    const result = await service.createEvent({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        title: "Client sync",
        startIso: "2026-03-20T17:00:00.000Z",
        endIso: "2026-03-20T17:30:00.000Z",
        timezone: "America/Los_Angeles",
        attendees: ["founder@zbestmedia.com"]
      }
    });

    expect(result).toEqual({
      ok: true,
      provider: "google_calendar",
      dryRun: true,
      eventId: "dryrun-event:1",
      externalId: "dryrun-link:1",
      message: "Calendar event simulated successfully."
    });
  });

  it("normalizes live provider failures", async () => {
    const diagnostics = createDiagnostics();
    const liveProvider = {
      getAvailability: vi.fn(),
      createEvent: vi.fn(async () => {
        throw new AaliyahCalendarProviderRejectedError("provider-detail-should-not-leak");
      })
    };
    const service = new AaliyahCalendarService(createRepository(), diagnostics, {
      config: { enabled: true, dryRunDefault: false },
      liveProvider: liveProvider as any
    });

    const result = await service.createEvent({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        title: "Client sync",
        startIso: "2026-03-20T17:00:00.000Z",
        endIso: "2026-03-20T17:30:00.000Z",
        timezone: "America/Los_Angeles",
        dryRun: false
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "google_calendar",
      dryRun: false,
      denialCode: null,
      errorCode: "PROVIDER_REJECTED",
      retryable: false,
      message: "Calendar provider rejected the request."
    });
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(2);
  });
});
