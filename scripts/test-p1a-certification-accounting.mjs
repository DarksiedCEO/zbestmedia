import {
  validateCertificationBundle,
} from "./validate-p1a-certification-accounting.mjs";

const candidateSha = "1".repeat(40);
const workflowSha = "2".repeat(40);
const baseSha = "3".repeat(40);
const evidenceBaseSha = "6".repeat(40);
const reconciliationBaseSha = "7".repeat(40);
const originalCandidateSha = "8".repeat(40);
const runtimePin = "4".repeat(40);
const identity = { candidateSha, workflowSha, baseSha, evidenceBaseSha, reconciliationBaseSha, originalCandidateSha, runtimePin };
const zeros = {
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0,
  notVerified: 0, notRun: 0,
};
const nested = {
  suite: "p1-a-trusted-certification",
  ...identity,
  required: 15, executed: 15, passed: 15, ...zeros,
  evidenceDigest: "a".repeat(64),
  verifierDigest: "b".repeat(64),
};
const integration = {
  suite: "p1-a-trusted-verifier-controls",
  ...identity,
  required: 21, executed: 21, passed: 21, ...zeros,
  crossRepositoryCiAuthentication: "VERIFIED",
  nestedEvidenceDigest: nested.evidenceDigest,
  nestedVerifierDigest: nested.verifierDigest,
};
const dual = {
  suite: "p1-a-dual-base-verifier-controls", ...identity,
  required: 29, executed: 29, passed: 29, ...zeros,
};
const cases = [
  ["complete_bundle", { nested, integration, dual }, identity, false],
  ["absent_integration", { nested, dual }, identity, true],
  ["absent_dual", { nested, integration }, identity, true],
  ["skipped_integration", { nested, dual, integration: { ...integration, skipped: 1, passed: 20 } }, identity, true],
  ["incomplete_integration", { nested, dual, integration: { ...integration, executed: 20, passed: 20 } }, identity, true],
  ["wrong_candidate", { nested, integration, dual }, { ...identity, candidateSha: "5".repeat(40) }, true],
  ["wrong_workflow", { nested, integration, dual }, { ...identity, workflowSha: "6".repeat(40) }, true],
  ["wrong_runtime", { nested, integration, dual }, { ...identity, runtimePin: "7".repeat(40) }, true],
  ["wrong_base", { nested, integration, dual }, { ...identity, baseSha: "8".repeat(40) }, true],
  ["wrong_evidence_base", { nested, integration, dual }, { ...identity, evidenceBaseSha: "9".repeat(40) }, true],
  ["wrong_reconciliation_base", { nested, integration, dual }, { ...identity, reconciliationBaseSha: "a".repeat(40) }, true],
  ["wrong_original_candidate", { nested, integration, dual }, { ...identity, originalCandidateSha: "b".repeat(40) }, true],
  [
    "digest_mismatch",
    {
      nested, dual,
      integration: {
        ...integration,
        nestedEvidenceDigest: "c".repeat(64),
      },
    },
    identity,
    true,
  ],
];

let passed = 0;
let failed = 0;
for (const [name, bundle, expected, shouldThrow] of cases) {
  let rejected = false;
  try {
    validateCertificationBundle(bundle, expected);
  } catch {
    rejected = true;
  }
  if (rejected === shouldThrow) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(
      `FAIL ${name}: expected ${shouldThrow ? "rejection" : "acceptance"}`,
    );
  }
}
const summary = {
  suite: "p1-a-certification-accounting-controls",
  required: cases.length,
  executed: cases.length,
  passed,
  failed,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
};
console.log(JSON.stringify(summary));
if (failed || passed !== cases.length) process.exitCode = 1;
