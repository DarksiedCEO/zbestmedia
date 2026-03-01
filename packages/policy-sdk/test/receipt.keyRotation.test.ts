import { describe, expect, it } from "vitest";

import { computeReceiptSig, verifyReceiptOrThrow } from "../src/receiptVerify";

describe("receipt key rotation window", () => {
  it("accepts signatures from both k1 and k2 during dual-key window", () => {
    const receipt = "eyJyZXNvbHZlZCI6eyJmb28iOiJiYXIifX0";
    const sigK1 = computeReceiptSig({ receiptB64Url: receipt, key: "secret-k1" });
    const sigK2 = computeReceiptSig({ receiptB64Url: receipt, key: "secret-k2" });

    const cfg = {
      verifyEnabled: true,
      enforce: true,
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
    const receipt = "eyJyZXNvbHZlZCI6eyJmb28iOiJiYXIifX0";
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
