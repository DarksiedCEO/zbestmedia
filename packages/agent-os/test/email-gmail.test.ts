import { describe, expect, it } from "vitest";

import { loadEmailIntegrationConfig } from "../src/email/config.js";
import {
  GmailConnectorNotConfiguredError,
  GmailConnectorScaffold,
  GmailOauthConfigurationError,
  GmailRuntimeScaffold
} from "../src/email/gmail.js";

describe("gmail connector scaffold", () => {
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
          grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          tokenReference: "secret:gmail:ops"
        })
    ).toThrowError(GmailConnectorNotConfiguredError);
  });

  it("fails fast for unimplemented Gmail methods", async () => {
    const connector = new GmailConnectorScaffold({
      provider: "gmail",
      connectionMode: "draft_only",
      accountEmailAddress: "ops@zbestmedia.com",
      clientId: "client-id",
      clientSecretReference: "secret:gmail-client",
      redirectUri: "https://example.com/oauth",
      grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      tokenReference: "secret:gmail:ops"
    });

    await expect(connector.listThreads({})).rejects.toThrow("gmail_list_threads_not_implemented");
    await expect(connector.registerWatch()).rejects.toThrow("gmail_register_watch_not_implemented");
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
