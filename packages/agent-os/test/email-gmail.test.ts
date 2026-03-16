import { afterEach, describe, expect, it, vi } from "vitest";

import { loadEmailIntegrationConfig } from "../src/email/config.js";
import {
  GmailConnectorNotConfiguredError,
  GmailConnectorScaffold,
  GmailOauthConfigurationError,
  GmailRuntimeScaffold
} from "../src/email/gmail.js";

describe("gmail connector scaffold", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails fast for unsupported connection modes", () => {
    expect(
      () =>
        new GmailConnectorScaffold({
          provider: "gmail",
          connectionMode: "live" as never,
          accountEmailAddress: "ops@zbestmedia.com",
          clientId: "client-id",
          clientSecretReference: "secret:gmail-client",
          redirectUri: "https://example.com/oauth",
          grantedScopes: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events"
          ],
          tokenReference: "secret:gmail:ops"
        })
    ).toThrowError(GmailConnectorNotConfiguredError);
  });

  it("exchanges the authorization code and creates a live Gmail draft", async () => {
    const connector = new GmailConnectorScaffold({
      provider: "gmail",
      connectionMode: "draft_only",
      accountEmailAddress: "ops@zbestmedia.com",
      clientId: "client-id",
      clientSecretReference: "secret:gmail-client",
      redirectUri: "https://example.com/oauth",
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ],
      tokenReference: "refresh-token"
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "oauth-access-token",
            refresh_token: "oauth-refresh-token",
            scope:
              "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
            expires_in: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: "ops@zbestmedia.com"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "draft-access-token",
            expires_in: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-123",
            message: { threadId: "thread-123" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const runtime = new GmailRuntimeScaffold(
      loadEmailIntegrationConfig({
        GMAIL_INTEGRATION_ENABLED: "true",
        GMAIL_OAUTH_CLIENT_ID: "client-id",
        GMAIL_OAUTH_CLIENT_SECRET_REF: "secret:gmail-client",
        GMAIL_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback"
      })
    );

    const exchanged = await runtime.exchangeAuthorizationCode({
      code: "auth-code",
      state: "gmail-oauth:state-1"
    });
    expect(exchanged.accountEmailAddress).toBe("ops@zbestmedia.com");
    expect(exchanged.tokenReference).toBe("oauth-refresh-token");
    expect(exchanged.grantedScopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events"
    ]);

    const draft = await connector.createDraft({
      to: ["founder@zbestmedia.com"],
      subject: "Follow-up",
      bodyText: "reply"
    });
    expect(draft.providerDraftId).toBe("draft-123");
    expect(draft.providerThreadId).toBe("thread-123");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await expect(connector.listThreads({})).rejects.toThrow("gmail_list_threads_not_implemented");
    await expect(connector.registerWatch()).rejects.toThrow("gmail_register_watch_not_implemented");
    await expect(
      connector.sendApprovedDraft({
        threadId: "thread-1",
        subject: "Re: hello",
        body: "reply"
      })
    ).rejects.toThrow("gmail_send_approved_draft_not_implemented");
  });

  it("builds a real oauth authorization URL when config is present", async () => {
    const runtime = new GmailRuntimeScaffold(
      loadEmailIntegrationConfig({
        GMAIL_INTEGRATION_ENABLED: "true",
        GMAIL_OAUTH_CLIENT_ID: "client-id",
        GMAIL_OAUTH_CLIENT_SECRET_REF: "secret:gmail-client",
        GMAIL_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback"
      })
    );

    const start = await runtime.beginAuthorization({
      state: "gmail-oauth:1",
      loginHint: "ops@zbestmedia.com"
    });

    expect(start.authorizationUrl).toContain("accounts.google.com");
    expect(start.scopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events"
    ]);
    expect(start.redirectUri).toBe("https://example.com/oauth/callback");
  });

  it("fails fast when oauth config is incomplete", () => {
    expect(
      () =>
        loadEmailIntegrationConfig({
          GMAIL_INTEGRATION_ENABLED: "true",
          GMAIL_OAUTH_CLIENT_ID: "client-id"
        })
    ).toThrow("incomplete_gmail_oauth_config");
  });

  it("fails fast when granted scopes are insufficient", () => {
    const runtime = new GmailRuntimeScaffold(
      loadEmailIntegrationConfig({
        GMAIL_INTEGRATION_ENABLED: "true",
        GMAIL_OAUTH_CLIENT_ID: "client-id",
        GMAIL_OAUTH_CLIENT_SECRET_REF: "secret:gmail-client",
        GMAIL_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback"
      })
    );

    expect(() => runtime.validateGrantedScopes(["https://www.googleapis.com/auth/userinfo.email"])).toThrow(
      GmailOauthConfigurationError
    );
  });
});
