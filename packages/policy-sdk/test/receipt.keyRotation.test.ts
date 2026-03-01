import { describe, expect, it } from "vitest";

import { computeReceiptSig, verifyReceiptOrThrow } from "../src/receiptVerify";

describe("receipt key rotation window", () => {
  it("accepts signatures from both k1 and k2 during dual-key window", () => {
    const receipt = Buffer.from(
      JSON.stringify({
        contract_version: "policy-resolve@1.0.0",
        resolution_hash: "h1",
        issued_at: "2026-02-28T00:00:00.000Z",
        expires_at: "2026-02-28T00:10:00.000Z",
        ttl_sec: 300
      }),
      "utf8"
    ).toString("base64url");
    const sigK1 = computeReceiptSig({ receiptB64Url: receipt, key: "secret-k1" });
    const sigK2 = computeReceiptSig({ receiptB64Url: receipt, key: "secret-k2" });

    const cfg = {
      verifyEnabled: true,
      enforce: true,
      now: new Date("2026-02-28T00:00:01.000Z"),
      keysByKid: { k1: "secret-k1", k2: "secret-k2" }
    };

    expect(
      verifyReceiptOrThrow({ receiptB64Url: receipt, sigB64Url: sigK1, kid: "k1", cfg }).verified
    ).toBe(true);
    expect(
      verifyReceiptOrThrow({ receiptB64Url: receipt, sigB64Url: sigK2, kid: "k2", cfg }).verified
    ).toBe(true);
  });

  it("rejects old k1 receipts after k1 removal when enforce=true", () => {
    const receipt = Buffer.from(
      JSON.stringify({
        contract_version: "policy-resolve@1.0.0",
        resolution_hash: "h1",
        issued_at: "2026-02-28T00:00:00.000Z",
        expires_at: "2026-02-28T00:10:00.000Z",
        ttl_sec: 300
      }),
      "utf8"
    ).toString("base64url");
    const sigK1 = computeReceiptSig({ receiptB64Url: receipt, key: "secret-k1" });

    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: receipt,
        sigB64Url: sigK1,
        kid: "k1",
        cfg: {
          verifyEnabled: true,
          enforce: true,
          keysByKid: { k2: "secret-k2" }
        }
      })
    ).toThrow("unknown_kid:k1");
  });
});
