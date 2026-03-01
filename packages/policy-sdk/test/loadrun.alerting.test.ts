import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmailAlert } from "../src/loadrun/alerting/email";
import { sendSlackAlert } from "../src/loadrun/alerting/slack";

describe("alert adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends slack payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await sendSlackAlert({ webhookUrl: "https://example.com/slack", text: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/slack");
  });

  it("throws on failing email webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      sendEmailAlert({
        webhookUrl: "https://example.com/email",
        to: "ops@example.com",
        subject: "subj",
        body: "body"
      })
    ).rejects.toThrow("email_alert_failed");
  });
});
