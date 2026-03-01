import { describe, expect, it } from "vitest";

import { computeReceiptSig, verifyReceiptOrThrow } from "../src/receiptVerify";

function makeReceiptB64Url(expiresAt: string | null): string {
  const payload: Record<string, unknown> = {
    contract_version: "policy-resolve@1.0.0",
    resolution_hash: "h1",
    issued_at: "2026-02-28T00:00:00.000Z",
    ttl_sec: 300
  };
  if (expiresAt !== null) payload.expires_at = expiresAt;
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("receipt ttl verification", () => {
  it("passes when expires_at is in the future", () => {
    const receipt = makeReceiptB64Url("2026-02-28T00:10:00.000Z");
    const sig = computeReceiptSig({ receiptB64Url: receipt, key: "k1-secret" });
    const out = verifyReceiptOrThrow({
      receiptB64Url: receipt,
      sigB64Url: sig,
      kid: "k1",
      cfg: {
        verifyEnabled: true,
        enforce: true,
        now: new Date("2026-02-28T00:00:01.000Z"),
        keysByKid: { k1: "k1-secret" }
      }
    });
    expect(out.verified).toBe(true);
    expect(out.expired).toBe(false);
    expect(out.expiresAt).toBe("2026-02-28T00:10:00.000Z");
  });

  it("fails when receipt is expired and enforce=true", () => {
    const receipt = makeReceiptB64Url("2026-02-28T00:00:01.000Z");
    const sig = computeReceiptSig({ receiptB64Url: receipt, key: "k1-secret" });
    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: receipt,
        sigB64Url: sig,
        kid: "k1",
        cfg: {
          verifyEnabled: true,
          enforce: true,
          now: new Date("2026-02-28T00:10:00.000Z"),
          keysByKid: { k1: "k1-secret" }
        }
      })
    ).toThrow("receipt_expired");
  });

  it("fails when expires_at is missing/invalid and enforce=true", () => {
    const missing = makeReceiptB64Url(null);
    const invalid = makeReceiptB64Url("not-a-date");
    const missingSig = computeReceiptSig({ receiptB64Url: missing, key: "k1-secret" });
    const invalidSig = computeReceiptSig({ receiptB64Url: invalid, key: "k1-secret" });
    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: missing,
        sigB64Url: missingSig,
        kid: "k1",
        cfg: {
          verifyEnabled: true,
          enforce: true,
          keysByKid: { k1: "k1-secret" }
        }
      })
    ).toThrow("expires_at_invalid");
    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: invalid,
        sigB64Url: invalidSig,
        kid: "k1",
        cfg: {
          verifyEnabled: true,
          enforce: true,
          keysByKid: { k1: "k1-secret" }
        }
      })
    ).toThrow("expires_at_invalid");
  });

  it("warn-only mode marks expired without throwing", () => {
    const receipt = makeReceiptB64Url("2026-02-28T00:00:01.000Z");
    const sig = computeReceiptSig({ receiptB64Url: receipt, key: "k1-secret" });
    const out = verifyReceiptOrThrow({
      receiptB64Url: receipt,
      sigB64Url: sig,
      kid: "k1",
      cfg: {
        verifyEnabled: true,
        enforce: false,
        now: new Date("2026-02-28T00:10:00.000Z"),
        keysByKid: { k1: "k1-secret" }
      }
    });
    expect(out.verified).toBe(false);
    expect(out.expired).toBe(true);
    expect(out.reason).toBe("receipt_expired");
  });
});
