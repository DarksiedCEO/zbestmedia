import crypto from "node:crypto";

import { PolicySdkError } from "./errors";

function b64urlNoPad(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// HMAC input is the raw x-policy-receipt base64url payload bytes.
export function computeReceiptSig(opts: { receiptB64Url: string; key: string }): string {
  const hmac = crypto.createHmac("sha256", opts.key);
  hmac.update(Buffer.from(opts.receiptB64Url, "utf8"));
  return b64urlNoPad(hmac.digest());
}

export type ReceiptVerifyConfig = {
  verifyEnabled: boolean;
  enforce: boolean;
  keysByKid: Record<string, string>;
};

export function defaultVerifyEnabled(nodeEnv?: string, explicit?: string): boolean {
  if (explicit != null) return explicit.toLowerCase() === "true";
  return (nodeEnv ?? "development") === "production";
}

export function defaultEnforce(nodeEnv?: string, explicit?: string): boolean {
  if (explicit != null) return explicit.toLowerCase() === "true";
  return (nodeEnv ?? "development") === "production";
}

export function parseKeysJson(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function verifyReceiptOrThrow(opts: {
  receiptB64Url: string;
  sigB64Url: string | undefined;
  kid: string | undefined;
  cfg: ReceiptVerifyConfig;
}): { verified: boolean; reason?: string } {
  if (!opts.cfg.verifyEnabled) return { verified: false, reason: "verify_disabled" };

  if (!opts.sigB64Url || !opts.kid) {
    const reason = "missing_sig_or_kid";
    if (opts.cfg.enforce) throw new PolicySdkError("RECEIPT_SIGNATURE_MISSING", reason);
    return { verified: false, reason };
  }

  const key = opts.cfg.keysByKid[opts.kid];
  if (!key) {
    const reason = `unknown_kid:${opts.kid}`;
    if (opts.cfg.enforce) throw new PolicySdkError("RECEIPT_SIGNATURE_UNKNOWN_KID", reason);
    return { verified: false, reason };
  }

  const expected = computeReceiptSig({ receiptB64Url: opts.receiptB64Url, key });
  const ok = timingSafeEqualStr(expected, opts.sigB64Url);
  if (!ok) {
    const reason = "sig_mismatch";
    if (opts.cfg.enforce) throw new PolicySdkError("RECEIPT_SIGNATURE_INVALID", reason);
    return { verified: false, reason };
  }

  return { verified: true };
}
