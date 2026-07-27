import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../docs/security/p1-a/model.json", import.meta.url);
const model = JSON.parse(await readFile(path, "utf8"));
assert.equal(model.scope, "P1-A_THREAT_MODEL_ONLY");
for (const side of ["specification", "runtime"]) assert.match(model.sources[side].revision, /^[0-9a-f]{40}$/);
for (const key of ["authority","assets","attackers","boundaries","tenantPropagation","credentialCustody","flows","threats","abuseCases","assumptions","knownUnknowns","founderDecisions","traceability"]) {
  assert.ok(Array.isArray(model[key]) && model[key].length > 0, `${key} required`);
}
assert.equal(new Set(model.threats.map((x) => x.id)).size, model.threats.length);
for (const severity of ["CRITICAL", "HIGH"]) assert.ok(model.threats.some((x) => x.severity === severity));
for (const phrase of ["SSRF","DNS rebinding","cloud metadata","Tenant spoofing","Privilege escalation","Credential leakage","Prompt injection","Artifact substitution","Approval or evidence forgery","Job forgery","SHA or CI bypass","Sentinel suppression"]) {
  assert.ok(model.threats.some((x) => x.title.includes(phrase)), `missing threat: ${phrase}`);
}
assert.ok(model.founderDecisions.every((x) => x.status === "UNRESOLVED_BLOCKS_P1B"));
assert.deepEqual(model.gate, {runtimeChanged:false, productionClaimed:false, p1bAuthorized:false, selfCertified:false});
assert.equal(model.traceability.length, model.threats.length);
console.log(`P1-A validation PASS: ${model.threats.length} threats; ${model.boundaries.length} boundaries; ${model.founderDecisions.length} blocking founder decisions`);
