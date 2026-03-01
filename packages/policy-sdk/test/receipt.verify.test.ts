import { describe, expect, it } from "vitest";

import {
  computeReceiptSig,
  defaultEnforce,
  defaultVerifyEnabled,
  parseKeysJson,
  verifyReceiptOrThrow
} from "../src/receiptVerify";

describe("receipt verification", () => {
  it("verifies valid signature with known key", () => {
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
    const key = "secret-k1";
    const sig = computeReceiptSig({ receiptB64Url: receipt, key });

    const out = verifyReceiptOrThrow({
      receiptB64Url: receipt,
      sigB64Url: sig,
      kid: "k1",
      cfg: {
        verifyEnabled: true,
        enforce: true,
        now: new Date("2026-02-28T00:00:01.000Z"),
        keysByKid: { k1: key }
      }
    });

    expect(out).toEqual({ verified: true, expired: false, expiresAt: "2026-02-28T00:10:00.000Z" });
  });

  it("returns unverified in warn mode for mismatched signature", () => {
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
    const out = verifyReceiptOrThrow({
      receiptB64Url: receipt,
      sigB64Url: "bad",
      kid: "k1",
      cfg: {
        verifyEnabled: true,
        enforce: false,
        keysByKid: { k1: "secret" }
      }
    });
    expect(out.verified).toBe(false);
    expect(out.reason).toBe("sig_mismatch");
  });

  it("throws in enforce mode for missing signature/kid", () => {
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
    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: receipt,
        sigB64Url: undefined,
        kid: "k1",
        cfg: {
          verifyEnabled: true,
          enforce: true,
          keysByKid: { k1: "secret" }
        }
      })
    ).toThrow("missing_sig_or_kid");
  });

  it("parses key map and env defaults", () => {
    expect(parseKeysJson('{"k1":"a","k2":"b"}')).toEqual({ k1: "a", k2: "b" });
    expect(parseKeysJson("bad-json")).toEqual({});
    expect(defaultVerifyEnabled("production")).toBe(true);
    expect(defaultVerifyEnabled("development")).toBe(false);
    expect(defaultEnforce("production")).toBe(true);
    expect(defaultEnforce("development")).toBe(false);
  });
});
