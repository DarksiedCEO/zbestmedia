import { readJson } from "../../../tools/fs/read-json.mjs";

function fail(msg) {
  console.error(`[prompts:compat] ${msg}`);
  process.exit(1);
}

const manifest = readJson("intelligence/registry/manifest.json");

for (const p of manifest.prompts) {
  const inSchema = readJson(p.inputSchema);
  const outSchema = readJson(p.outputSchema);

  if (!inSchema.$id) fail(`input schema missing $id: ${p.inputSchema}`);
  if (!outSchema.$id) fail(`output schema missing $id: ${p.outputSchema}`);

  const expectedSuffix = `.v${p.promptVersion}`;
  if (!String(inSchema.$id).endsWith(expectedSuffix)) {
    fail(`input schema $id must end with ${expectedSuffix} for ${p.id} (got ${inSchema.$id})`);
  }
  if (!String(outSchema.$id).endsWith(expectedSuffix)) {
    fail(`output schema $id must end with ${expectedSuffix} for ${p.id} (got ${outSchema.$id})`);
  }
}

console.log(`[prompts:compat] OK (${manifest.prompts.length} prompts compatible)`);
