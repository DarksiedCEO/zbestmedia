import {
  validateCertificationBundle,
} from "./validate-p1a-certification-accounting.mjs";

const candidateSha = "1".repeat(40);
const workflowSha = "2".repeat(40);
const baseSha = "3".repeat(40);
const runtimePin = "4".repeat(40);
const identity = { candidateSha, workflowSha, baseSha, runtimePin };
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
const cases = [
  ["complete_bundle", { nested, integration }, identity, false],
  ["absent_integration", { nested }, identity, true],
  ["skipped_integration", { nested, integration: { ...integration, skipped: 1, passed: 20 } }, identity, true],
  ["incomplete_integration", { nested, integration: { ...integration, executed: 20, passed: 20 } }, identity, true],
  ["wrong_candidate", { nested, integration }, { ...identity, candidateSha: "5".repeat(40) }, true],
  ["wrong_runtime", { nested, integration }, { ...identity, runtimePin: "6".repeat(40) }, true],
  ["wrong_base", { nested, integration }, { ...identity, baseSha: "7".repeat(40) }, true],
];

let passed = 0;
let failed = 0;
for (const [name, bundle, expected, shouldThrow] of cases) {
  try {
    validateCertificationBundle(bundle, expected);
    if (shouldThrow) throw new Error("negative control did not fail");
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    if (shouldThrow) {
      passed += 1;
      console.log(`PASS ${name}`);
    } else {
      failed += 1;
      console.error(`FAIL ${name}: ${error.message}`);
    }
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
