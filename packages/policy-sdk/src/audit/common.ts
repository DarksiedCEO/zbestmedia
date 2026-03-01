import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input !== "object") {
      return input;
    }
    if (seen.has(input as object)) {
      throw new Error("Cyclic JSON not supported");
    }
    seen.add(input as object);

    if (Array.isArray(input)) {
      return input.map(normalize);
    }

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      out[key] = normalize((input as Record<string, unknown>)[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function stableObjectHash(input: unknown): string {
  return sha256Hex(canonicalJson(input));
}
