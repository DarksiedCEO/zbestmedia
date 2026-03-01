import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyClient } from "../src/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("PolicyClient retry amplification guard", () => {
  it("forces breaker open when retry amplification exceeds cap", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error("timeout") as Error & { code?: string };
        err.code = "ETIMEDOUT";
        throw err;
      }
      return new Response(
        JSON.stringify({
          resolved: { ok: true },
          meta: { resolution_hash: `h-${calls}` }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new PolicyClient({
      baseUrl: "http://policy.local",
      retryAmpGuardMax: 0
    });

    await client.resolvePolicy(
      {
        policyKey: "performance_limits",
        client_id: "client-a",
        campaign_id: "campaign-a",
        role: "sebastian"
      },
      { cacheMode: "READ" }
    );

    await expect(
      client.resolvePolicy(
        {
          policyKey: "performance_limits",
          client_id: "client-b",
          campaign_id: "campaign-b",
          role: "sebastian"
        },
        { cacheMode: "MUTATE" }
      )
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
  });
});
