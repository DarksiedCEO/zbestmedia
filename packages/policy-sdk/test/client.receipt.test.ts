import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyClient } from "../src/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("PolicyClient receipt capture", () => {
  it("captures x-policy-receipt into response meta", async () => {
    const receiptObj = {
      contract_version: "policy-resolve@1.0.0",
      resolution_hash: "abc123",
      policy_id: "pv_1",
      active_version: "7",
      issued_at: "2026-02-28T00:00:00.000Z"
    };
    const receiptHeader = Buffer.from(JSON.stringify(receiptObj), "utf8").toString("base64url");

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          resolved: { mode: "ok" },
          meta: { resolution_hash: "abc123", policy_id: "pv_1", active_version: "7" }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-policy-contract-version": "policy-resolve@1.0.0",
            "x-policy-receipt": receiptHeader
          }
        }
      );
    }) as typeof fetch;

    const client = new PolicyClient(
      {
        baseUrl: "http://policy.local",
        timeoutMs: 2_000,
        enforceContractVersion: true
      },
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    );

    const out = await client.resolvePolicy({
      policyKey: "performance_limits",
      client_id: "client-a",
      campaign_id: "campaign-a",
      role: "sebastian"
    });

    expect(out.meta?.policy_receipt_header).toBe(receiptHeader);
    expect(out.meta?.policy_receipt).toEqual(receiptObj);
  });
});

