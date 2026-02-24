export type PayloadLimitResult =
  | { ok: true; bytes: number }
  | { ok: false; bytes: number; limit: number; reason: "PAYLOAD_TOO_LARGE" };

export function measureJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value ?? null);
  return Buffer.byteLength(serialized, "utf8");
}

export function enforceJsonPayloadLimit(value: unknown, limitBytes: number): PayloadLimitResult {
  const bytes = measureJsonBytes(value);
  if (bytes <= limitBytes) {
    return { ok: true, bytes };
  }
  return { ok: false, bytes, limit: limitBytes, reason: "PAYLOAD_TOO_LARGE" };
}
