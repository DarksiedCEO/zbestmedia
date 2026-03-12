import { describe, expect, it } from "vitest";

import { GmailConnectorNotConfiguredError, GmailConnectorScaffold } from "../src/email/gmail.js";

describe("gmail connector scaffold", () => {
  it("fails fast for unsupported connection modes", () => {
    expect(
      () =>
        new GmailConnectorScaffold({
          provider: "gmail",
          connectionMode: "live" as never,
          accountEmailAddress: "ops@zbestmedia.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "https://example.com/oauth"
        })
    ).toThrowError(GmailConnectorNotConfiguredError);
  });

  it("fails fast for unimplemented Gmail methods", async () => {
    const connector = new GmailConnectorScaffold({
      provider: "gmail",
      connectionMode: "draft_only",
      accountEmailAddress: "ops@zbestmedia.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://example.com/oauth"
    });

    await expect(connector.listThreads({})).rejects.toThrow("gmail_list_threads_not_implemented");
    await expect(connector.registerWatch()).rejects.toThrow("gmail_register_watch_not_implemented");
  });
});
