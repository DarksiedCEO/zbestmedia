import { readJson } from "../../../tools/fs/read-json.mjs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function fail(msg) {
  console.error(`[license:gate] ${msg}`);
  process.exit(1);
}

const ALLOW = new Set([
  "public-domain",
  "cc0-1.0",
  "cc-by-4.0",
  "cc-by-sa-4.0"
]);
const ALLOWED_POLICY_PACKS = new Set([
  "core.v1",
  "vertical.general.v1",
  "vertical.legal-attorney.v1"
]);

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

const fixturesDir = "intelligence/evaluations/fixtures";
const files = listJsonFiles(fixturesDir);
if (files.length === 0) fail(`no fixtures found in ${fixturesDir}`);

for (const path of files) {
  const data = readJson(path);
  const meta = data._meta ?? {};
  const license = meta.license;

  if (!license || typeof license !== "string") {
    fail(`fixture missing _meta.license: ${path}`);
  }
  if (!ALLOW.has(license)) {
    fail(`fixture license not allowed (${license}): ${path}`);
  }

  const policyPackId = data._meta?.policyPackId;
  if (policyPackId !== undefined && !ALLOWED_POLICY_PACKS.has(policyPackId)) {
    fail(`fixture _meta.policyPackId not allowed (${policyPackId}): ${path}`);
  }
}

console.log(`[license:gate] OK (${files.length} fixtures)`);
