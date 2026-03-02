import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256File(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256String(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
