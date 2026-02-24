import canonicalize from "canonicalize";

export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out == null) {
    throw new Error("canonicalize_failed");
  }
  return out;
}
