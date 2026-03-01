import crypto from "node:crypto";

function b64urlNoPad(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// HMAC input is the raw x-policy-receipt base64url payload bytes.
export function signReceiptBase64UrlPayload(opts: { receiptB64Url: string; key: string }): string {
  const hmac = crypto.createHmac("sha256", opts.key);
  hmac.update(Buffer.from(opts.receiptB64Url, "utf8"));
  return b64urlNoPad(hmac.digest());
}

export function shouldSignReceipts(env: NodeJS.ProcessEnv): boolean {
  const raw = env.POLICY_RECEIPT_SIGNING_ENABLED;
  if (raw == null) return (env.NODE_ENV ?? "development") === "production";
  return String(raw).toLowerCase() === "true";
}

export function receiptKid(env: NodeJS.ProcessEnv): string {
  const kid = env.POLICY_RECEIPT_HMAC_KID?.trim();
  return kid && kid.length > 0 ? kid : "k1";
}

export function receiptKeyOrThrow(env: NodeJS.ProcessEnv): string {
  const key = env.POLICY_RECEIPT_HMAC_KEY?.trim();
  if (!key) {
    throw new Error("Missing POLICY_RECEIPT_HMAC_KEY (required when receipt signing is enabled)");
  }
  return key;
}
