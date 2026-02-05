import { createHash } from "node:crypto";

export function makeEventId(parts: {
  schemaVersion: number;
  eventName: string;
  artifactId: string;
  requestId: string;
  attempt?: number;
}) {
  const canonical = JSON.stringify({
    v: parts.schemaVersion,
    e: parts.eventName,
    a: parts.artifactId,
    r: parts.requestId,
    t: parts.attempt ?? null
  });

  return createHash("sha256").update(canonical).digest("hex");
}
