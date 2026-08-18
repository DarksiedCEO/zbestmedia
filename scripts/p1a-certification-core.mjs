import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";

export const CLEAN_BASE_SHA = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";
export const CANONICAL_REPOSITORY = "DarksiedCEO/zbestmedia";
export const CANONICAL_REMOTE = "https://github.com/DarksiedCEO/zbestmedia.git";
export const NON_PASS_FIELDS = ["failed", "skipped", "cancelled", "neutral", "stale", "notVerified", "notRun"];

export function exactSha(value, label) {
  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} must be exactly 40 lowercase hex`);
  return value;
}
export function exactDigest(value, label) {
  assert.match(value ?? "", /^[0-9a-f]{64}$/, `${label} must be a SHA-256 digest`);
  return value;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
export function validateSeparatedRoots(trustedRoot, candidateRoot) {
  const trusted = path.resolve(trustedRoot);
  const candidate = path.resolve(candidateRoot);
  assert.notEqual(trusted, candidate, "trusted and candidate roots overlap");
  assert.ok(!within(trusted, candidate), "candidate root is nested under trusted root");
  assert.ok(!within(candidate, trusted), "trusted root is nested under candidate root");
  return { trustedRoot: trusted, candidateRoot: candidate };
}
export function parseDeclaredScope(source) {
  assert.equal(typeof source, "string", "declared scope must be text");
  assert.ok(!source.includes("\0"), "declared scope contains NUL");
  const paths = source.split(/\r?\n/u).filter(Boolean);
  assert.ok(paths.length > 0, "declared scope is empty");
  assert.deepEqual(paths, [...paths].sort(), "declared scope must be sorted");
  assert.equal(new Set(paths).size, paths.length, "declared scope contains duplicates");
  for (const entry of paths) {
    assert.equal(entry, entry.trim(), "declared path contains surrounding whitespace");
    assert.ok(!path.posix.isAbsolute(entry), "declared path must be repository-relative");
    assert.ok(!entry.split("/").includes(".."), "declared path escapes repository");
    assert.ok(!entry.startsWith(".git/"), "Git internals cannot be candidate-owned");
  }
  return paths;
}
export function validateCandidateScope({ declaredScope, declaredScopeDigest, changedPaths }) {
  const declared = parseDeclaredScope(declaredScope);
  assert.equal(sha256(declaredScope), exactDigest(declaredScopeDigest, "scope digest"), "declared scope digest mismatch");
  assert.deepEqual(changedPaths, [...changedPaths].sort(), "changed paths must be sorted");
  assert.equal(new Set(changedPaths).size, changedPaths.length, "changed paths contain duplicates");
  assert.deepEqual(changedPaths, declared, "candidate delta differs from declared exact path scope");
  return declared;
}
export function validateIdentityTuple(identity) {
  assert.equal(identity.repository, CANONICAL_REPOSITORY, "wrong repository");
  assert.equal(identity.remote, CANONICAL_REMOTE, "wrong repository remote");
  assert.equal(exactSha(identity.authorizedBaseSha, "authorized base"), CLEAN_BASE_SHA, "unauthorized clean base");
  const workflowSha = exactSha(identity.workflowSha, "workflow SHA");
  const verifierSha = exactSha(identity.verifierSha, "verifier SHA");
  const candidateSha = exactSha(identity.candidateSha, "candidate SHA");
  assert.equal(verifierSha, workflowSha, "verifier must execute from workflow checkout");
  assert.notEqual(candidateSha, CLEAN_BASE_SHA, "candidate must not equal clean base");
  exactSha(identity.runtimePin, "runtime pin");
  exactDigest(identity.verifierDigest, "verifier digest");
  exactDigest(identity.scopeDigest, "scope digest");
  exactDigest(identity.evidencePackageDigest, "evidence package digest");
  return identity;
}
export function validateSuiteSummary(summary, expected) {
  assert.ok(summary && typeof summary === "object", `${expected.label}: summary absent`);
  assert.equal(summary.suite, expected.suite, `${expected.label}: wrong suite`);
  for (const field of ["candidateSha", "workflowSha", "verifierSha", "authorizedBaseSha", "runtimePin"]) {
    assert.equal(summary[field], expected[field], `${expected.label}: wrong ${field}`);
  }
  for (const field of ["verifierDigest", "scopeDigest", "evidencePackageDigest"]) {
    assert.equal(summary[field], expected[field], `${expected.label}: wrong ${field}`);
  }
  assert.equal(summary.required, expected.required, `${expected.label}: wrong denominator`);
  assert.equal(summary.executed, expected.required, `${expected.label}: incomplete`);
  assert.equal(summary.passed, expected.required, `${expected.label}: non-pass`);
  for (const field of NON_PASS_FIELDS) assert.equal(summary[field], 0, `${expected.label}: ${field} must be zero`);
  return summary;
}
export function validateCertificationBundle(bundle, identity) {
  validateIdentityTuple(identity);
  const nested = validateSuiteSummary(bundle?.nested, { ...identity, label: "nested verifier", suite: "p1-a-trusted-certification", required: 15 });
  const integration = validateSuiteSummary(bundle?.integration, { ...identity, label: "real-object integration", suite: "p1-a-trusted-verifier-controls", required: 21 });
  assert.equal(integration.nestedEvidenceDigest, nested.evidencePackageDigest, "integration does not bind nested evidence");
  assert.equal(integration.nestedVerifierDigest, nested.verifierDigest, "integration does not bind nested verifier");
  return {
    suite: "p1-a-protected-certification", candidateSha: identity.candidateSha,
    workflowSha: identity.workflowSha, verifierSha: identity.verifierSha,
    verifierDigest: identity.verifierDigest, authorizedBaseSha: identity.authorizedBaseSha,
    runtimePin: identity.runtimePin, scopeDigest: identity.scopeDigest,
    evidencePackageDigest: identity.evidencePackageDigest,
    nestedRequired: nested.required, nestedExecuted: nested.executed, nestedPassed: nested.passed,
    integrationRequired: integration.required, integrationExecuted: integration.executed, integrationPassed: integration.passed,
    failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
  };
}
