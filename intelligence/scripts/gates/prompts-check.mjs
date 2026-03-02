import { existsSync } from "node:fs";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { sha256File } from "../../../tools/crypto/sha256.mjs";

const manifestPath = "intelligence/registry/manifest.json";
const manifest = readJson(manifestPath);

function fail(msg) {
  console.error(`[prompts:check] ${msg}`);
  process.exit(1);
}

if (!manifest || typeof manifest !== "object") fail("manifest is not an object");
if (!Array.isArray(manifest.prompts)) fail("manifest.prompts must be an array");

for (const p of manifest.prompts) {
  for (const key of ["id", "name", "promptVersion", "path", "inputSchema", "outputSchema", "sha256"]) {
    if (p[key] === undefined || p[key] === null || p[key] === "") {
      fail(`prompt missing required field '${key}': ${JSON.stringify(p)}`);
    }
  }

  if (!existsSync(p.path)) fail(`prompt file missing: ${p.path}`);
  if (!existsSync(p.inputSchema)) fail(`input schema missing: ${p.inputSchema}`);
  if (!existsSync(p.outputSchema)) fail(`output schema missing: ${p.outputSchema}`);

  const actual = sha256File(p.path);
  if (p.sha256 !== actual) {
    fail(`sha256 mismatch for ${p.id}. expected=${p.sha256} actual=${actual}. Update manifest.`);
  }
}

console.log(`[prompts:check] OK (${manifest.prompts.length} prompts validated)`);
