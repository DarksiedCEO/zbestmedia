import { afterEach, describe, expect, it } from "vitest";

import { PolicyClient } from "../src/client";

describe("PolicyClient runtime kill switch", () => {
  afterEach(() => {
    delete process.env.POLICY_RUNTIME_KILL_SWITCH;
  });

  it("blocks mutate path when kill switch is active", async () => {
    process.env.POLICY_RUNTIME_KILL_SWITCH = "true";
    const client = new PolicyClient({
      baseUrl: "http://policy.local",
      timeoutMs: 1_000
    });

    await expect(
      client.resolvePolicy(
        {
          policyKey: "performance_limits",
          client_id: "client-a",
          campaign_id: "campaign-a",
          role: "sebastian"
        },
        { cacheMode: "MUTATE" }
      )
    ).rejects.toMatchObject({ code: "POLICY_RUNTIME_KILL_SWITCH_ACTIVE" });
  });
});
