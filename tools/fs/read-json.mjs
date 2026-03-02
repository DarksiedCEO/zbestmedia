import { readFileSync } from "node:fs";

export function readJson(path) {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error(`Invalid JSON at ${path}: ${e.message}`);
    err.cause = e;
    throw err;
  }
}
