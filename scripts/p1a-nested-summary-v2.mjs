import assert from "node:assert/strict";

export const NESTED_SCHEMA_VERSION = "P1A_NESTED_CERTIFICATION_SUMMARY_V2";
export const NESTED_FIELDS = Object.freeze([
  "suite", "schemaVersion", "candidateSha", "workflowSha", "verifierSha",
  "authorizedBaseSha", "runtimePin", "verifierDigest", "producerDigest",
  "scopeDigest", "evidencePackageDigest", "evidenceDigest", "required",
  "executed", "passed", "failed", "skipped", "cancelled", "neutral",
  "stale", "notVerified", "notRun",
]);
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;

export function buildNestedSummaryV2(input) {
  assert.ok(input && typeof input === "object" && !Array.isArray(input), "nested V2 input absent");
  const summary = { suite: "p1-a-trusted-certification", schemaVersion: NESTED_SCHEMA_VERSION, ...input };
  assert.deepEqual(Object.keys(summary).sort(), [...NESTED_FIELDS].sort(), "nested V2 field set mismatch");
  for (const field of ["candidateSha", "workflowSha", "verifierSha", "authorizedBaseSha", "runtimePin"]) assert.match(summary[field] ?? "", SHA40, `nested V2 invalid ${field}`);
  for (const field of ["verifierDigest", "producerDigest", "scopeDigest", "evidencePackageDigest", "evidenceDigest"]) assert.match(summary[field] ?? "", SHA64, `nested V2 invalid ${field}`);
  assert.equal(summary.authorizedBaseSha, "b0c1b2129123b941c6a350c16dae0ae3a8e076ca", "nested V2 unauthorized base");
  assert.notEqual(summary.candidateSha, summary.authorizedBaseSha, "nested V2 candidate equals base");
  assert.equal(summary.verifierSha, summary.workflowSha, "nested V2 verifier/workflow mismatch");
  assert.notEqual(summary.producerDigest, summary.verifierDigest, "nested V2 vacuous producer binding");
  assert.notEqual(summary.evidenceDigest, summary.evidencePackageDigest, "nested V2 vacuous evidence binding");
  for (const field of ["required", "executed", "passed", "failed", "skipped", "cancelled", "neutral", "stale", "notVerified", "notRun"]) assert.ok(Number.isInteger(summary[field]) && summary[field] >= 0, `nested V2 invalid ${field}`);
  assert.equal(summary.required, 15, "nested V2 wrong denominator");
  assert.equal(summary.executed, 15, "nested V2 incomplete");
  assert.equal(summary.passed, 15, "nested V2 non-pass");
  for (const field of ["failed", "skipped", "cancelled", "neutral", "stale", "notVerified", "notRun"]) assert.equal(summary[field], 0, `nested V2 ${field} must be zero`);
  return summary;
}
