// P1A-08 owned. Canonical P1A_TRUSTED_VERIFIER_SUMMARY_V2 schema for the
// P1A-02 <-> P1A-08 integration contract (docs/security/p1-a/
// P1A_02_TO_P1A_08_INTEGRATION_CONTRACT_V2.json). Pure module: no imports, no
// process/environment access, so the mutation harness can re-import mutated
// source directly. Every rejection throws; there is no advisory mode.

export const SUMMARY_SCHEMA_VERSION = "P1A_TRUSTED_VERIFIER_SUMMARY_V2";
export const NESTED_SCHEMA_VERSION = "P1A_NESTED_CERTIFICATION_SUMMARY_V2";
export const INTEGRATION_SUITE = "p1-a-trusted-verifier-controls";
export const NESTED_SUITE = "p1-a-trusted-certification";
export const CLEAN_BASE_SHA = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";

export const NON_PASS_FIELDS = Object.freeze([
  "failed",
  "skipped",
  "cancelled",
  "neutral",
  "stale",
  "notVerified",
  "notRun",
]);

// Exactly the 22 contract fields; order is the canonical serialization order.
export const SUMMARY_FIELDS = Object.freeze([
  "suite",
  "schemaVersion",
  "candidateSha",
  "workflowSha",
  "verifierSha",
  "authorizedBaseSha",
  "runtimePin",
  "verifierDigest",
  "scopeDigest",
  "evidencePackageDigest",
  "required",
  "executed",
  "passed",
  ...NON_PASS_FIELDS,
  "nestedEvidenceDigest",
  "nestedVerifierDigest",
]);

// Nested (validate-p1a-threat-model.mjs) summary contract, V2. `evidenceDigest`
// is the digest over the nested run's produced evidence; `producerDigest` is
// the digest of the nested producer's own bytes; `evidencePackageDigest` is the
// acquired package identity shared with the whole certification run. The three
// are distinct so no binding is tautological.
export const NESTED_SUMMARY_FIELDS = Object.freeze([
  "suite",
  "schemaVersion",
  "candidateSha",
  "workflowSha",
  "verifierSha",
  "authorizedBaseSha",
  "runtimePin",
  "verifierDigest",
  "producerDigest",
  "scopeDigest",
  "evidencePackageDigest",
  "evidenceDigest",
  "required",
  "executed",
  "passed",
  ...NON_PASS_FIELDS,
]);

const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;

function fail(code, detail) {
  throw new Error(`P1A_SUMMARY_V2_REJECT:${code}${detail ? `:${detail}` : ""}`);
}

function requireExactKeys(summary, fields, label) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    fail("NOT_AN_OBJECT", label);
  }
  const actual = Object.keys(summary).sort();
  const expected = [...fields].sort();
  for (const key of expected) {
    if (!actual.includes(key)) fail("MISSING_FIELD", `${label}.${key}`);
  }
  for (const key of actual) {
    if (!expected.includes(key)) fail("UNKNOWN_FIELD", `${label}.${key}`);
  }
}

function requireSha40(value, label) {
  if (typeof value !== "string" || !SHA40.test(value)) fail("BAD_SHA40", label);
  return value;
}

function requireSha64(value, label) {
  if (typeof value !== "string" || !SHA64.test(value)) fail("BAD_SHA64", label);
  return value;
}

function requireCount(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("BAD_COUNT", label);
  }
  return value;
}

function requireIdentity(summary, expected, label) {
  for (const field of [
    "candidateSha",
    "workflowSha",
    "verifierSha",
    "authorizedBaseSha",
    "runtimePin",
  ]) {
    requireSha40(summary[field], `${label}.${field}`);
    if (summary[field] !== expected[field]) {
      fail("IDENTITY_MISMATCH", `${label}.${field}`);
    }
  }
  for (const field of ["verifierDigest", "scopeDigest", "evidencePackageDigest"]) {
    requireSha64(summary[field], `${label}.${field}`);
    if (summary[field] !== expected[field]) {
      fail("IDENTITY_MISMATCH", `${label}.${field}`);
    }
  }
  if (summary.authorizedBaseSha !== CLEAN_BASE_SHA) {
    fail("UNAUTHORIZED_BASE", label);
  }
  if (summary.candidateSha === summary.authorizedBaseSha) {
    fail("CANDIDATE_EQUALS_BASE", label);
  }
  if (summary.verifierSha !== summary.workflowSha) {
    fail("VERIFIER_NOT_WORKFLOW", label);
  }
}

function requireAccounting(summary, requiredCount, label) {
  requireCount(summary.required, `${label}.required`);
  if (summary.required !== requiredCount) fail("WRONG_REQUIRED", label);
  for (const field of ["executed", "passed"]) {
    requireCount(summary[field], `${label}.${field}`);
    if (summary[field] !== requiredCount) fail("INCOMPLETE_EXECUTION", `${label}.${field}`);
  }
  for (const field of NON_PASS_FIELDS) {
    requireCount(summary[field], `${label}.${field}`);
    if (summary[field] !== 0) fail("NON_PASS_NOT_ZERO", `${label}.${field}`);
  }
}

// expected: { candidateSha, workflowSha, verifierSha, authorizedBaseSha,
//   runtimePin, verifierDigest, scopeDigest, evidencePackageDigest, required,
//   nested: { evidenceDigest, producerDigest } }
export function validateSummaryV2(summary, expected) {
  requireExactKeys(summary, SUMMARY_FIELDS, "integration");
  if (summary.suite !== INTEGRATION_SUITE) fail("WRONG_SUITE", "integration");
  if (summary.schemaVersion !== SUMMARY_SCHEMA_VERSION) {
    fail("WRONG_SCHEMA_VERSION", "integration");
  }
  requireIdentity(summary, expected, "integration");
  requireAccounting(summary, expected.required, "integration");
  requireSha64(summary.nestedEvidenceDigest, "integration.nestedEvidenceDigest");
  requireSha64(summary.nestedVerifierDigest, "integration.nestedVerifierDigest");
  if (summary.nestedEvidenceDigest !== expected.nested?.evidenceDigest) {
    fail("NESTED_EVIDENCE_UNBOUND", "integration.nestedEvidenceDigest");
  }
  if (summary.nestedVerifierDigest !== expected.nested?.producerDigest) {
    fail("NESTED_VERIFIER_UNBOUND", "integration.nestedVerifierDigest");
  }
  return summary;
}

export function validateNestedSummaryV2(nested, expected) {
  requireExactKeys(nested, NESTED_SUMMARY_FIELDS, "nested");
  if (nested.suite !== NESTED_SUITE) fail("WRONG_SUITE", "nested");
  if (nested.schemaVersion !== NESTED_SCHEMA_VERSION) {
    fail("WRONG_SCHEMA_VERSION", "nested");
  }
  requireIdentity(nested, expected, "nested");
  requireAccounting(nested, expected.required, "nested");
  requireSha64(nested.evidenceDigest, "nested.evidenceDigest");
  requireSha64(nested.producerDigest, "nested.producerDigest");
  if (nested.evidenceDigest === nested.evidencePackageDigest) {
    fail("TAUTOLOGICAL_EVIDENCE_BINDING", "nested.evidenceDigest");
  }
  if (nested.producerDigest === nested.verifierDigest) {
    fail("TAUTOLOGICAL_VERIFIER_BINDING", "nested.producerDigest");
  }
  return nested;
}

// authority: the verified object returned by acquireCleanAuthority().
// counts: { required, executed, passed, failed } from the actually-executed
// control suite. nested: a summary already accepted by validateNestedSummaryV2.
export function buildIntegrationSummaryV2({ authority, counts, nested }) {
  if (!authority) fail("MISSING_AUTHORITY");
  if (!nested) fail("MISSING_NESTED_SUMMARY");
  if (!counts) fail("MISSING_COUNTS");
  const summary = {
    suite: INTEGRATION_SUITE,
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    candidateSha: authority.candidateSha,
    workflowSha: authority.workflowSha,
    verifierSha: authority.verifierSha,
    authorizedBaseSha: authority.authorizedBaseSha,
    runtimePin: authority.runtimePin,
    verifierDigest: authority.verifierDigest,
    scopeDigest: authority.scopeDigest,
    evidencePackageDigest: authority.evidencePackageDigest,
    required: counts.required,
    executed: counts.executed,
    passed: counts.passed,
    failed: counts.failed,
    skipped: 0,
    cancelled: 0,
    neutral: 0,
    stale: 0,
    notVerified: 0,
    notRun: 0,
    nestedEvidenceDigest: nested.evidenceDigest,
    nestedVerifierDigest: nested.producerDigest,
  };
  return validateSummaryV2(summary, {
    ...authority,
    required: counts.required,
    nested: {
      evidenceDigest: nested.evidenceDigest,
      producerDigest: nested.producerDigest,
    },
  });
}
