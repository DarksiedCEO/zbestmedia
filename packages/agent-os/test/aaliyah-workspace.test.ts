import { describe, expect, it, vi } from "vitest";

import { AaliyahWorkspaceProviderRejectedError } from "../src/aaliyah/workspace-errors.js";
import { AaliyahWorkspaceService } from "../src/aaliyah/workspace-service.js";

describe("Aaliyah workspace service", () => {
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
        grantedScopes: [],
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

  it("allows founder dry-run draft creation and records request/success audit events", async () => {
    const repository = createRepository();
    const diagnostics = createDiagnostics();
    const dryRunProvider = {
      createDraft: vi.fn(async () => ({
        draftId: "dryrun-draft:1",
        externalId: "dryrun-thread:1"
      }))
    };
    const service = new AaliyahWorkspaceService(repository, diagnostics, {
      config: { gmailDraftsEnabled: true, gmailDryRunDefault: true },
      dryRunProvider: dryRunProvider as any
    });

    const result = await service.createGmailDraft({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        to: ["founder@zbestmedia.com"],
        subject: "Follow-up",
        bodyText: "Draft body"
      },
      generatedAt: "2026-03-15T00:00:00.000Z"
    });

    expect(result).toEqual({
      ok: true,
      provider: "gmail",
      draftId: "dryrun-draft:1",
      externalId: "dryrun-thread:1",
      dryRun: true,
      message: "Draft simulated successfully."
    });
    expect(dryRunProvider.createDraft).toHaveBeenCalledOnce();
    expect(repository.getLatestConnectedEmailAccountByPrincipal).not.toHaveBeenCalled();
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(2);
    expect(diagnostics.recordEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "workspace_draft_requested",
        eventSource: "aaliyah_workspace"
      })
    );
    expect(diagnostics.recordEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "workspace_draft_created",
        eventSource: "aaliyah_workspace"
      })
    );
  });

  it("denies non-founder workspace drafting and records a denial event", async () => {
    const diagnostics = createDiagnostics();
    const service = new AaliyahWorkspaceService(createRepository(), diagnostics, {
      config: { gmailDraftsEnabled: true, gmailDryRunDefault: true }
    });

    const result = await service.createGmailDraft({
      tenantId,
      actorId,
      principalContext: "operator",
      mode: "founder",
      input: {
        to: ["founder@zbestmedia.com"],
        subject: "Follow-up",
        bodyText: "Draft body",
        dryRun: true
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "gmail",
      dryRun: true,
      denialCode: "ACCESS_DENIED",
      errorCode: null,
      retryable: false,
      message: "Founder access is required for Gmail drafting."
    });
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(2);
    expect(diagnostics.recordEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "workspace_draft_denied",
        eventSource: "aaliyah_workspace"
      })
    );
  });

  it("rejects invalid input before touching the provider", async () => {
    const repository = createRepository();
    const diagnostics = createDiagnostics();
    const dryRunProvider = { createDraft: vi.fn() };
    const service = new AaliyahWorkspaceService(repository, diagnostics, {
      config: { gmailDraftsEnabled: true, gmailDryRunDefault: true },
      dryRunProvider: dryRunProvider as any
    });

    const result = await service.createGmailDraft({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        to: [],
        subject: "",
        bodyText: "",
        dryRun: true
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "gmail",
      dryRun: true,
      denialCode: null,
      errorCode: "INVALID_INPUT",
      retryable: false,
      message: "Draft input failed validation."
    });
    expect(dryRunProvider.createDraft).not.toHaveBeenCalled();
    expect(repository.getLatestConnectedEmailAccountByPrincipal).not.toHaveBeenCalled();
  });

  it("denies when gmail drafting is disabled", async () => {
    const diagnostics = createDiagnostics();
    const service = new AaliyahWorkspaceService(createRepository(), diagnostics, {
      config: { gmailDraftsEnabled: false, gmailDryRunDefault: true }
    });

    const result = await service.createGmailDraft({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        to: ["founder@zbestmedia.com"],
        subject: "Follow-up",
        bodyText: "Draft body",
        dryRun: true
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "gmail",
      dryRun: true,
      denialCode: "PROVIDER_DISABLED",
      errorCode: null,
      retryable: false,
      message: "Gmail drafting is disabled."
    });
  });

  it("normalizes provider failures and records a failed audit event", async () => {
    const diagnostics = createDiagnostics();
    const gmailProvider = {
      createDraft: vi.fn(async () => {
        throw new AaliyahWorkspaceProviderRejectedError("provider-detail-should-not-leak");
      })
    };
    const service = new AaliyahWorkspaceService(createRepository(), diagnostics, {
      config: { gmailDraftsEnabled: true, gmailDryRunDefault: false },
      gmailProvider: gmailProvider as any
    });

    const result = await service.createGmailDraft({
      tenantId,
      actorId,
      principalContext: "founder",
      mode: "founder",
      input: {
        to: ["founder@zbestmedia.com"],
        subject: "Follow-up",
        bodyText: "Draft body",
        dryRun: false
      }
    });

    expect(result).toEqual({
      ok: false,
      provider: "gmail",
      dryRun: false,
      denialCode: null,
      errorCode: "PROVIDER_REJECTED",
      retryable: false,
      message: "Gmail drafting provider rejected the request."
    });
    expect(diagnostics.recordEvent).toHaveBeenCalledTimes(2);
    expect(diagnostics.recordEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "workspace_draft_failed",
        eventSource: "aaliyah_workspace"
      })
    );
  });
});
