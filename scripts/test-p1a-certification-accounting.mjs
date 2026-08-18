import { validateCertificationBundle } from "./validate-p1a-certification-accounting.mjs";
import { CANONICAL_REMOTE, CANONICAL_REPOSITORY, CLEAN_BASE_SHA } from "./p1a-certification-core.mjs";

const candidateSha = "1".repeat(40), workflowSha = "2".repeat(40), runtimePin = "4".repeat(40);
const identity = {
  repository: CANONICAL_REPOSITORY, remote: CANONICAL_REMOTE,
  candidateSha, workflowSha, verifierSha: workflowSha,
  verifierDigest: "a".repeat(64), authorizedBaseSha: CLEAN_BASE_SHA,
  runtimePin, scopeDigest: "b".repeat(64), evidencePackageDigest: "c".repeat(64),
};
const zeros = {
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0,
  notVerified: 0, notRun: 0,
};
const nested = { suite: "p1-a-trusted-certification", ...identity, required: 15, executed: 15, passed: 15, ...zeros };
const integration = {
  suite: "p1-a-trusted-verifier-controls", ...identity,
  required: 21, executed: 21, passed: 21, ...zeros,
  nestedEvidenceDigest: nested.evidencePackageDigest,
  nestedVerifierDigest: nested.verifierDigest,
};
const cases = [
  ["complete_bundle", { nested, integration }, identity, false],
  ["absent_integration", { nested }, identity, true],
  ["absent_nested", { integration }, identity, true],
  ["skipped_integration", { nested, integration: { ...integration, skipped: 1, passed: 20 } }, identity, true],
  ["incomplete_integration", { nested, integration: { ...integration, executed: 20, passed: 20 } }, identity, true],
  ["wrong_candidate", { nested, integration }, { ...identity, candidateSha: "5".repeat(40) }, true],
  ["wrong_workflow", { nested, integration }, { ...identity, workflowSha: "6".repeat(40) }, true],
  ["wrong_runtime", { nested, integration }, { ...identity, runtimePin: "7".repeat(40) }, true],
  ["wrong_base", { nested, integration }, { ...identity, authorizedBaseSha: "8".repeat(40) }, true],
  ["wrong_repository", { nested, integration }, { ...identity, repository: "attacker/fork" }, true],
  ["candidate_as_verifier", { nested, integration }, { ...identity, verifierSha: candidateSha }, true],
  ["wrong_scope_digest", { nested, integration }, { ...identity, scopeDigest: "d".repeat(64) }, true],
  [
    "digest_mismatch",
    {
      nested,
      integration: {
        ...integration,
        nestedEvidenceDigest: "d".repeat(64),
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
