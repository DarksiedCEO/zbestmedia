import { readJson } from "../../../tools/fs/read-json.mjs";

function fail(msg) {
  console.error(`[taxonomy:check] ${msg}`);
  process.exit(1);
}

const taxonomySchema = readJson("intelligence/prompts/schemas/governance.riskTaxonomy.v1.json");
const snap = readJson("intelligence/policies/snapshots/taxonomy.v1.snapshot.json");

const enumCodes = taxonomySchema.properties?.riskCode?.enum;
const enumSev = taxonomySchema.properties?.severity?.enum;

if (!Array.isArray(enumCodes) || enumCodes.length === 0) fail("taxonomy schema missing riskCode enum");
if (!Array.isArray(enumSev) || enumSev.length === 0) fail("taxonomy schema missing severity enum");

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

if (!same(enumCodes, snap.riskCodes ?? [])) {
  fail(
    `riskCodes changed vs snapshot. bump taxonomy version and update snapshot.\n` +
      `schema=${JSON.stringify(enumCodes)}\n` +
      `snap=${JSON.stringify(snap.riskCodes)}`
  );
}

if (!same(enumSev, snap.severities ?? [])) {
  fail(
    `severities changed vs snapshot. bump taxonomy version and update snapshot.\n` +
      `schema=${JSON.stringify(enumSev)}\n` +
      `snap=${JSON.stringify(snap.severities)}`
  );
}

console.log("[taxonomy:check] OK (taxonomy stable)");
