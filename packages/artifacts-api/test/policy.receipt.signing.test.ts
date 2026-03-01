import { describe, expect, it } from "vitest";

import {
  receiptKid,
  receiptKeyOrThrow,
  shouldSignReceipts,
  signReceiptBase64UrlPayload
} from "../src/agency/policy/receiptSign";

describe("policy receipt signing", () => {
  it("produces deterministic signature for fixed payload and key", () => {
    const sigA = signReceiptBase64UrlPayload({
      receiptB64Url: "eyJmb28iOiJiYXIifQ",
      key: "test-secret"
    });
    const sigB = signReceiptBase64UrlPayload({
      receiptB64Url: "eyJmb28iOiJiYXIifQ",
      key: "test-secret"
    });

    expect(sigA).toBe(sigB);
    expect(sigA).toBe("DqLo4uT7ygwpW3kZtW3Kyv2iQ3GVyNBAdRnQtokMk-c");
  });

  it("uses environment defaults for signing controls", () => {
    expect(shouldSignReceipts({ NODE_ENV: "production" })).toBe(true);
    expect(shouldSignReceipts({ NODE_ENV: "development" })).toBe(false);
    expect(shouldSignReceipts({ POLICY_RECEIPT_SIGNING_ENABLED: "true", NODE_ENV: "development" })).toBe(true);
    expect(receiptKid({})).toBe("k1");
    expect(receiptKid({ POLICY_RECEIPT_HMAC_KID: "k9" })).toBe("k9");
  });

  it("requires key when signing enabled", () => {
    expect(() => receiptKeyOrThrow({})).toThrow("Missing POLICY_RECEIPT_HMAC_KEY");
    expect(receiptKeyOrThrow({ POLICY_RECEIPT_HMAC_KEY: "abc" })).toBe("abc");
  });
});
