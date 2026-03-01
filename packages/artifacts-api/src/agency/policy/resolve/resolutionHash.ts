import crypto from "node:crypto";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function sortKeysDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, Json>;
    const sorted: Record<string, Json> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value as Json));
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function resolutionHash(resolvedPolicy: unknown): { stableJson: string; hash: string } {
  const stableJson = stableStringify(resolvedPolicy);
  const hash = sha256Hex(stableJson);
  return { stableJson, hash };
}
