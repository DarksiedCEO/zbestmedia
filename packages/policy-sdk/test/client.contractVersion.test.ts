import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyClient } from "../src/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function successResponse(headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify({
      resolved: { ok: true },
      meta: { resolution_hash: "abc123" }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...headers
      }
    }
  );
}

describe("PolicyClient contract version enforcement", () => {
  it("throws CONTRACT_VERSION_MISSING when enforcement is enabled and header is absent", async () => {
    globalThis.fetch = vi.fn(async () => successResponse()) as typeof fetch;

    const client = new PolicyClient({
      baseUrl: "http://policy.local",
      timeoutMs: 2_000,
      enforceContractVersion: true
    });

    await expect(
      client.resolvePolicy({
        policyKey: "performance_limits",
        client_id: "client-a",
        campaign_id: "campaign-a",
        role: "sebastian"
      })
    ).rejects.toMatchObject({ code: "CONTRACT_VERSION_MISSING" });
  });

  it("throws CONTRACT_VERSION_TOO_OLD when header is lower than minimum", async () => {
    globalThis.fetch = vi.fn(async () =>
      successResponse({
        "x-policy-contract-version": "policy-resolve@0.9.0"
      })
    ) as typeof fetch;

    const client = new PolicyClient({
      baseUrl: "http://policy.local",
      timeoutMs: 2_000,
      minContractVersion: "policy-resolve@1.0.0",
      enforceContractVersion: true
    });

    await expect(
      client.resolvePolicy({
        policyKey: "performance_limits",
        client_id: "client-a",
        campaign_id: "campaign-a",
        role: "sebastian"
      })
    ).rejects.toMatchObject({ code: "CONTRACT_VERSION_TOO_OLD" });
  });
});
