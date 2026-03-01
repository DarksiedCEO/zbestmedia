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
    const receipt = "eyJmb28iOiJiYXIifQ";
    const key = "secret-k1";
    const sig = computeReceiptSig({ receiptB64Url: receipt, key });

    const out = verifyReceiptOrThrow({
      receiptB64Url: receipt,
      sigB64Url: sig,
      kid: "k1",
      cfg: {
        verifyEnabled: true,
        enforce: true,
        keysByKid: { k1: key }
      }
    });

    expect(out).toEqual({ verified: true });
  });

  it("returns unverified in warn mode for mismatched signature", () => {
    const out = verifyReceiptOrThrow({
      receiptB64Url: "abc",
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
    expect(() =>
      verifyReceiptOrThrow({
        receiptB64Url: "abc",
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
