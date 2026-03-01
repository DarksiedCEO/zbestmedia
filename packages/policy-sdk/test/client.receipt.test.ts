import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyClient } from "../src/client";
import { computeReceiptSig } from "../src/receiptVerify";

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
      issued_at: "2099-02-28T00:00:00.000Z",
      expires_at: "2099-02-28T00:05:00.000Z",
      ttl_sec: 300
    };
    const receiptHeader = Buffer.from(JSON.stringify(receiptObj), "utf8").toString("base64url");
    const receiptSig = computeReceiptSig({ receiptB64Url: receiptHeader, key: "k1-secret" });

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
            "x-policy-receipt": receiptHeader,
            "x-policy-receipt-kid": "k1",
            "x-policy-receipt-sig": receiptSig
          }
        }
      );
    }) as typeof fetch;

    const client = new PolicyClient(
      {
        baseUrl: "http://policy.local",
        timeoutMs: 2_000,
        enforceContractVersion: true,
        receiptVerifyEnabled: true,
        receiptVerifyEnforce: true,
        receiptHmacKeys: { k1: "k1-secret" }
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
    expect(out.meta?.policy_receipt_kid).toBe("k1");
    expect(out.meta?.policy_receipt_sig).toBe(receiptSig);
    expect(out.meta?.receipt_verified).toBe(true);
    expect(out.meta?.receipt_expires_at).toBe("2099-02-28T00:05:00.000Z");
    expect(out.meta?.receipt_expired).toBe(false);
  });
});
