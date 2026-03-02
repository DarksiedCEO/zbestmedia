import { readJson } from "../../../tools/fs/read-json.mjs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function fail(msg) {
  console.error(`[policy:check] ${msg}`);
  process.exit(1);
}

function listJsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listJsonFiles(p));
    else if (st.isFile() && name.endsWith(".json")) out.push(p);
  }
  return out;
}

const policyFiles = [
  "intelligence/policies/core.v1.json",
  "intelligence/policies/verticals/general.v1.json",
  "intelligence/policies/verticals/legal-attorney.v1.json"
];

const policies = new Map();
for (const f of policyFiles) {
  const p = readJson(f);
  if (!p?.id) fail(`policy missing id: ${f}`);
  policies.set(p.id, p);
}

for (const [id, p] of policies.entries()) {
  if (p.inherits !== undefined) {
    if (!Array.isArray(p.inherits)) fail(`policy inherits must be array: ${id}`);
    for (const parent of p.inherits) {
      if (!policies.has(parent)) fail(`policy ${id} inherits unknown ${parent}`);
    }
  }

  if (p.bannedPatterns !== undefined && !Array.isArray(p.bannedPatterns)) {
    fail(`policy bannedPatterns must be array: ${id}`);
  }
}

const fixtures = listJsonFiles("intelligence/evaluations/fixtures");
for (const fx of fixtures) {
  const data = readJson(fx);
  const policyPackId = data.policyPackId ?? data._meta?.policyPackId ?? null;
  if (policyPackId && !policies.has(policyPackId)) {
    fail(`fixture references unknown policyPackId '${policyPackId}': ${fx}`);
  }
}

console.log(`[policy:check] OK (${policies.size} policies, ${fixtures.length} fixtures)`);
