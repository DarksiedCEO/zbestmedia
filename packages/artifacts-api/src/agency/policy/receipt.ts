import { Buffer } from "node:buffer";

export type PolicyResolveReceipt = {
  contract_version: string;
  resolution_hash: string;
  policy_id?: string;
  active_version?: string;
  issued_at: string;
};

export function encodePolicyResolveReceipt(receipt: PolicyResolveReceipt): string {
  return Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
}

