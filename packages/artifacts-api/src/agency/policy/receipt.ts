import { Buffer } from "node:buffer";

export type PolicyResolveReceipt = {
  contract_version: string;
  resolution_hash: string;
  policy_id?: string;
  active_version?: string;
  issued_at: string;
  expires_at: string;
  ttl_sec: number;
};

export function encodePolicyResolveReceipt(receipt: PolicyResolveReceipt): string {
  return Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
}

export function defaultPolicyReceiptTtlSec(env: NodeJS.ProcessEnv): number {
  const raw = env.POLICY_RECEIPT_TTL_SEC;
  const fallback = (env.NODE_ENV ?? "development") === "production" ? 300 : 600;
  if (raw == null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
