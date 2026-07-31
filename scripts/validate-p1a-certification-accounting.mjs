import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

export const NON_PASS_FIELDS = [
  "failed", "skipped", "cancelled", "neutral", "stale", "notVerified", "notRun",
];

function exactSha(value, label) {
  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} must be an exact SHA`);
  return value;
}

export function validateSuiteSummary(summary, expected) {
  assert.equal(summary.suite, expected.suite, `${expected.label}: wrong suite`);
  for (const [field, label] of [
    ["candidateSha", "candidate SHA"],
    ["workflowSha", "workflow SHA"],
    ["baseSha", "base SHA"],
    ["evidenceBaseSha", "evidence base SHA"],
    ["reconciliationBaseSha", "reconciliation base SHA"],
    ["originalCandidateSha", "original candidate SHA"],
    ["runtimePin", "runtime pin"],
  ]) {
    assert.equal(
      summary[field],
      exactSha(expected[field], label),
      `${expected.label}: wrong ${label}`,
    );
  }
  assert.equal(summary.required, expected.required, `${expected.label}: required`);
  assert.equal(summary.executed, expected.required, `${expected.label}: incomplete`);
  assert.equal(summary.passed, expected.required, `${expected.label}: non-pass`);
  for (const field of NON_PASS_FIELDS) {
    assert.equal(summary[field], 0, `${expected.label}: ${field} must be zero`);
  }
  return summary;
}

export function validateCertificationBundle(bundle, expected) {
  assert.ok(bundle && typeof bundle === "object", "bundle absent");
  const dual = validateSuiteSummary(bundle.dual, {
    ...expected,
    label: "dual-base verifier",
    suite: "p1-a-dual-base-verifier-controls",
    required: 29,
  });
  const nested = validateSuiteSummary(bundle.nested, {
    ...expected,
    label: "nested verifier",
    suite: "p1-a-trusted-certification",
    required: 15,
  });
  const integration = validateSuiteSummary(bundle.integration, {
    ...expected,
    label: "real-object integration",
    suite: "p1-a-trusted-verifier-controls",
    required: 21,
  });
  assert.equal(
    integration.nestedEvidenceDigest,
    nested.evidenceDigest,
    "integration/nested evidence digest mismatch",
  );
  assert.equal(
    integration.nestedVerifierDigest,
    nested.verifierDigest,
    "integration/nested verifier digest mismatch",
  );
  assert.equal(
    integration.crossRepositoryCiAuthentication,
    "VERIFIED",
    "integration authentication not verified",
  );
  return {
    suite: "p1-a-protected-certification",
    candidateSha: expected.candidateSha,
    workflowSha: expected.workflowSha,
    baseSha: expected.baseSha,
    evidenceBaseSha: expected.evidenceBaseSha,
    reconciliationBaseSha: expected.reconciliationBaseSha,
    originalCandidateSha: expected.originalCandidateSha,
    runtimePin: expected.runtimePin,
    dualRequired: dual.required,
    dualExecuted: dual.executed,
    dualPassed: dual.passed,
    nestedRequired: nested.required,
    nestedExecuted: nested.executed,
    nestedPassed: nested.passed,
    integrationRequired: integration.required,
    integrationExecuted: integration.executed,
    integrationPassed: integration.passed,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    neutral: 0,
    stale: 0,
    notVerified: 0,
    notRun: 0,
    crossRepositoryCiAuthentication: "VERIFIED",
    evidenceDigest: nested.evidenceDigest,
    verifierDigest: nested.verifierDigest,
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert.ok(key?.startsWith("--") && value, "malformed CLI arguments");
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = parseArguments(process.argv.slice(2));
  const nested = JSON.parse(readFileSync(args.nested, "utf8"));
  const integration = JSON.parse(readFileSync(args.integration, "utf8"));
  const dual = JSON.parse(readFileSync(args.dual, "utf8"));
  const summary = validateCertificationBundle(
    { nested, integration, dual },
    {
      candidateSha: args.candidate,
      workflowSha: args.workflow,
      baseSha: args.base,
      evidenceBaseSha: args["evidence-base"],
      reconciliationBaseSha: args["reconciliation-base"],
      originalCandidateSha: args["original-candidate"],
      runtimePin: args.runtime,
    },
  );
  writeFileSync(args.output, `${JSON.stringify(summary)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(summary));
}
