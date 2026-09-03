// P1A-08 owned. Unit + hostile battery and mutation harness for the
// P1A_TRUSTED_VERIFIER_SUMMARY_V2 schema module and the clean-lineage
// authority acquisition module. Negative controls cover the contract-required
// families: stale schema, wrong producer, wrong version, missing authority,
// wrong subject, and cross-lane substitution. Mutation pass: 0 unexplained
// survivors required. Fixtures are synthetic and labeled as such — this suite
// proves the validators reject, not that any real candidate passes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as summaryModule from "./p1a-trusted-verifier-summary-v2.mjs";
import {
  acquireCleanAuthority,
  CLEAN_AUTHORITY_REQUIRED_ENV,
  CLEAN_BASE_SHA,
  LEGACY_FORBIDDEN_ROOTS,
} from "./p1a-clean-authority.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// --- synthetic fixtures (labeled synthetic; not evidence of any real run) ---
const CANDIDATE = "1".repeat(40);
const WORKFLOW = "2".repeat(40);
const RUNTIME = "3".repeat(40);
const VERIFIER_DIGEST = "4".repeat(64);
const SCOPE_DIGEST = "5".repeat(64);
const PACKAGE_DIGEST = "6".repeat(64);
const NESTED_EVIDENCE_DIGEST = "7".repeat(64);
const NESTED_PRODUCER_DIGEST = "8".repeat(64);

const authority = () => ({
  candidateSha: CANDIDATE,
  workflowSha: WORKFLOW,
  verifierSha: WORKFLOW,
  authorizedBaseSha: CLEAN_BASE_SHA,
  runtimePin: RUNTIME,
  verifierDigest: VERIFIER_DIGEST,
  scopeDigest: SCOPE_DIGEST,
  evidencePackageDigest: PACKAGE_DIGEST,
});

const nestedFixture = (mod) => ({
  suite: mod.NESTED_SUITE,
  schemaVersion: mod.NESTED_SCHEMA_VERSION,
  candidateSha: CANDIDATE,
  workflowSha: WORKFLOW,
  verifierSha: WORKFLOW,
  authorizedBaseSha: CLEAN_BASE_SHA,
  runtimePin: RUNTIME,
  verifierDigest: VERIFIER_DIGEST,
  producerDigest: NESTED_PRODUCER_DIGEST,
  scopeDigest: SCOPE_DIGEST,
  evidencePackageDigest: PACKAGE_DIGEST,
  evidenceDigest: NESTED_EVIDENCE_DIGEST,
  required: 15,
  executed: 15,
  passed: 15,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
});

const goodSummary = (mod) =>
  mod.buildIntegrationSummaryV2({
    authority: authority(),
    counts: { required: 21, executed: 21, passed: 21, failed: 0 },
    nested: nestedFixture(mod),
  });

const expectedFor = (auth, requiredCount = 21) => ({
  ...auth,
  required: requiredCount,
  nested: {
    evidenceDigest: NESTED_EVIDENCE_DIGEST,
    producerDigest: NESTED_PRODUCER_DIGEST,
  },
});

// --- battery over the (possibly mutated) summary module ---
function summaryBattery(mod) {
  const nestedExpected = { ...authority(), required: 15 };
  return [
    // authentic paths
    ["authentic_build_and_validate", () => {
      const summary = goodSummary(mod);
      assert.equal(Object.keys(summary).length, 22);
      mod.validateSummaryV2(summary, expectedFor(authority()));
    }, null],
    ["authentic_nested_validate", () =>
      mod.validateNestedSummaryV2(nestedFixture(mod), nestedExpected), null],
    ["field_order_is_contract_order", () => {
      assert.deepEqual(Object.keys(goodSummary(mod)), [...mod.SUMMARY_FIELDS]);
    }, null],
    // stale schema / wrong version (legacy unversioned + wrong version string)
    ["legacy_unversioned_summary_rejects", () => {
      const s = goodSummary(mod);
      delete s.schemaVersion;
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "MISSING_FIELD"],
    ["legacy_v1_schema_version_rejects", () => {
      const s = { ...goodSummary(mod), schemaVersion: "P1A_TRUSTED_VERIFIER_SUMMARY_V1" };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "WRONG_SCHEMA_VERSION"],
    // missing each consequential field
    ...[...summaryModule.SUMMARY_FIELDS].map((field) => [
      `missing_field_${field}_rejects`,
      () => {
        const s = goodSummary(mod);
        delete s[field];
        mod.validateSummaryV2(s, expectedFor(authority()));
      },
      "MISSING_FIELD",
    ]),
    // unknown consequential field
    ["unknown_field_rejects", () => {
      const s = { ...goodSummary(mod), crossRepositoryCiAuthentication: "VERIFIED" };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "UNKNOWN_FIELD"],
    // wrong producer / cross-lane substitution
    ["wrong_producer_suite_rejects", () => {
      const s = { ...goodSummary(mod), suite: "p1-a-dual-base-verifier-controls" };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "WRONG_SUITE"],
    ["cross_lane_p1a03_summary_rejects", () => {
      mod.validateSummaryV2(
        { suite: "test-p1a-evidence", executed: 21, passed: 21, failed: 0 },
        expectedFor(authority()),
      );
    }, "MISSING_FIELD"],
    ["cross_lane_nested_for_integration_rejects", () => {
      mod.validateSummaryV2(nestedFixture(mod), expectedFor(authority()));
    }, "MISSING_FIELD"],
    // wrong subject / stale replay
    ["stale_replayed_candidate_rejects", () => {
      const other = { ...authority(), candidateSha: "9".repeat(40) };
      mod.validateSummaryV2(goodSummary(mod), expectedFor(other));
    }, "IDENTITY_MISMATCH"],
    ["stale_replayed_evidence_package_rejects", () => {
      const other = { ...authority(), evidencePackageDigest: "a".repeat(64) };
      mod.validateSummaryV2(goodSummary(mod), expectedFor(other));
    }, "IDENTITY_MISMATCH"],
    ["wrong_base_rejects", () => {
      const wrongBase = "b".repeat(40);
      const auth = { ...authority(), authorizedBaseSha: wrongBase };
      const s = { ...goodSummary(mod), authorizedBaseSha: wrongBase };
      mod.validateSummaryV2(s, expectedFor(auth));
    }, "UNAUTHORIZED_BASE"],
    ["candidate_equals_base_rejects", () => {
      const auth = { ...authority(), candidateSha: CLEAN_BASE_SHA };
      const s = {
        ...goodSummary(mod),
        candidateSha: CLEAN_BASE_SHA,
      };
      mod.validateSummaryV2(s, expectedFor(auth));
    }, "CANDIDATE_EQUALS_BASE"],
    ["verifier_not_workflow_rejects", () => {
      const other = "c".repeat(40);
      const auth = { ...authority(), verifierSha: other };
      const s = { ...goodSummary(mod), verifierSha: other };
      mod.validateSummaryV2(s, expectedFor(auth));
    }, "VERIFIER_NOT_WORKFLOW"],
    ["malformed_candidate_sha_rejects", () => {
      const bad = "Z".repeat(40);
      const auth = { ...authority(), candidateSha: bad };
      const s = { ...goodSummary(mod), candidateSha: bad };
      mod.validateSummaryV2(s, expectedFor(auth));
    }, "BAD_SHA40"],
    ["malformed_scope_digest_rejects", () => {
      const bad = "Z".repeat(64);
      const auth = { ...authority(), scopeDigest: bad };
      const s = { ...goodSummary(mod), scopeDigest: bad };
      mod.validateSummaryV2(s, expectedFor(auth));
    }, "BAD_SHA64"],
    // accounting honesty
    ["wrong_required_rejects", () => {
      const s = { ...goodSummary(mod), required: 20, executed: 20, passed: 20 };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "WRONG_REQUIRED"],
    ["incomplete_execution_rejects", () => {
      const s = { ...goodSummary(mod), executed: 20 };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "INCOMPLETE_EXECUTION"],
    ["non_pass_not_zero_rejects", () => {
      const s = { ...goodSummary(mod), failed: 1 };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "NON_PASS_NOT_ZERO"],
    ["string_count_rejects", () => {
      const s = { ...goodSummary(mod), passed: "21" };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "BAD_COUNT"],
    ["non_integer_count_rejects", () => {
      const s = { ...goodSummary(mod), required: 21.5, executed: 21.5, passed: 21.5 };
      mod.validateSummaryV2(s, expectedFor(authority(), 21.5));
    }, "BAD_COUNT"],
    // nested bindings must be real values, not echoes
    ["nested_evidence_unbound_rejects", () => {
      const s = { ...goodSummary(mod), nestedEvidenceDigest: "d".repeat(64) };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "NESTED_EVIDENCE_UNBOUND"],
    ["nested_verifier_unbound_rejects", () => {
      const s = { ...goodSummary(mod), nestedVerifierDigest: "e".repeat(64) };
      mod.validateSummaryV2(s, expectedFor(authority()));
    }, "NESTED_VERIFIER_UNBOUND"],
    // nested summary contract
    ["nested_wrong_suite_rejects", () => {
      mod.validateNestedSummaryV2(
        { ...nestedFixture(mod), suite: "p1-a-trusted-verifier-controls" },
        nestedExpected,
      );
    }, "WRONG_SUITE"],
    ["nested_legacy_schema_rejects", () => {
      const n = nestedFixture(mod);
      delete n.schemaVersion;
      mod.validateNestedSummaryV2(n, nestedExpected);
    }, "MISSING_FIELD"],
    ["nested_wrong_schema_version_rejects", () => {
      mod.validateNestedSummaryV2(
        { ...nestedFixture(mod), schemaVersion: "P1A_NESTED_CERTIFICATION_SUMMARY_V1" },
        nestedExpected,
      );
    }, "WRONG_SCHEMA_VERSION"],
    ["nested_unknown_field_rejects", () => {
      mod.validateNestedSummaryV2(
        { ...nestedFixture(mod), crossRepositoryCiAuthentication: "VERIFIED" },
        nestedExpected,
      );
    }, "UNKNOWN_FIELD"],
    ["nested_tautological_evidence_rejects", () => {
      mod.validateNestedSummaryV2(
        { ...nestedFixture(mod), evidenceDigest: PACKAGE_DIGEST },
        nestedExpected,
      );
    }, "TAUTOLOGICAL_EVIDENCE_BINDING"],
    ["nested_tautological_verifier_rejects", () => {
      mod.validateNestedSummaryV2(
        { ...nestedFixture(mod), producerDigest: VERIFIER_DIGEST },
        nestedExpected,
      );
    }, "TAUTOLOGICAL_VERIFIER_BINDING"],
    // builder refuses to fabricate green
    ["builder_rejects_failed_controls", () => {
      mod.buildIntegrationSummaryV2({
        authority: authority(),
        counts: { required: 21, executed: 21, passed: 20, failed: 1 },
        nested: nestedFixture(mod),
      });
    }, "INCOMPLETE_EXECUTION"],
    ["builder_rejects_contradictory_green", () => {
      mod.buildIntegrationSummaryV2({
        authority: authority(),
        counts: { required: 21, executed: 21, passed: 21, failed: 1 },
        nested: nestedFixture(mod),
      });
    }, "NON_PASS_NOT_ZERO"],
    ["builder_rejects_missing_authority", () => {
      mod.buildIntegrationSummaryV2({
        counts: { required: 21, executed: 21, passed: 21, failed: 0 },
        nested: nestedFixture(mod),
      });
    }, "MISSING_AUTHORITY"],
    ["builder_rejects_missing_nested", () => {
      mod.buildIntegrationSummaryV2({
        authority: authority(),
        counts: { required: 21, executed: 21, passed: 21, failed: 0 },
      });
    }, "MISSING_NESTED_SUMMARY"],
  ];
}

// --- battery over the authority module (not part of the mutation subject) ---
function authorityBattery() {
  const goodEnv = () => ({
    P1A_CANDIDATE_SHA: CANDIDATE,
    P1A_WORKFLOW_SHA: WORKFLOW,
    P1A_VERIFIER_SHA: WORKFLOW,
    P1A_AUTHORIZED_BASE_SHA: CLEAN_BASE_SHA,
    P1A_TRUST_RUNTIME_PIN: RUNTIME,
    P1A_SCOPE_DIGEST: SCOPE_DIGEST,
    P1A_EVIDENCE_PACKAGE_DIGEST: PACKAGE_DIGEST,
    P1A_RUNTIME_GIT_DIR: "/synthetic/runtime.git",
  });
  const deps = {
    readFile: () => Buffer.from("synthetic consumer bytes"),
    gitObjectType: () => "commit",
  };
  return [
    ["authority_authentic_acquisition", () => {
      const auth = acquireCleanAuthority(goodEnv(), "/synthetic/root", deps);
      assert.equal(auth.authorizedBaseSha, CLEAN_BASE_SHA);
      assert.match(auth.verifierDigest, /^[0-9a-f]{64}$/);
      assert.ok(Object.isFrozen(auth));
    }, null],
    ["authority_derives_not_echoes_verifier_digest", () => {
      const a = acquireCleanAuthority(goodEnv(), "/synthetic/root", deps);
      const b = acquireCleanAuthority(goodEnv(), "/synthetic/root", {
        ...deps,
        readFile: () => Buffer.from("different consumer bytes"),
      });
      assert.notEqual(a.verifierDigest, b.verifierDigest);
    }, null],
    ...CLEAN_AUTHORITY_REQUIRED_ENV.map((name) => [
      `authority_missing_${name}_fails_closed`,
      () => {
        const env = goodEnv();
        delete env[name];
        acquireCleanAuthority(env, "/synthetic/root", deps);
      },
      "MISSING_AUTHORITY",
    ]),
    ["authority_no_legacy_env_fallback", () => {
      const env = goodEnv();
      delete env.P1A_AUTHORIZED_BASE_SHA;
      env.P1A_TRUST_BASE_SHA = "7056ea4ce24379c93549f0ac9b45ddd7a2600dd6";
      acquireCleanAuthority(env, "/synthetic/root", deps);
    }, "MISSING_AUTHORITY"],
    ["authority_wrong_base_rejects", () => {
      acquireCleanAuthority(
        { ...goodEnv(), P1A_AUTHORIZED_BASE_SHA: "b".repeat(40) },
        "/synthetic/root",
        deps,
      );
    }, "UNAUTHORIZED_BASE"],
    ["authority_candidate_equals_base_rejects", () => {
      acquireCleanAuthority(
        { ...goodEnv(), P1A_CANDIDATE_SHA: CLEAN_BASE_SHA },
        "/synthetic/root",
        deps,
      );
    }, "CANDIDATE_EQUALS_BASE"],
    ["authority_verifier_not_workflow_rejects", () => {
      acquireCleanAuthority(
        { ...goodEnv(), P1A_VERIFIER_SHA: "c".repeat(40) },
        "/synthetic/root",
        deps,
      );
    }, "VERIFIER_NOT_WORKFLOW"],
    ...LEGACY_FORBIDDEN_ROOTS.map((root) => [
      `authority_legacy_candidate_${root.slice(0, 7)}_rejects`,
      () => {
        acquireCleanAuthority(
          { ...goodEnv(), P1A_CANDIDATE_SHA: root },
          "/synthetic/root",
          deps,
        );
      },
      "LEGACY_ROOT_REJECTED",
    ]),
    ["authority_legacy_runtime_rejects", () => {
      acquireCleanAuthority(
        { ...goodEnv(), P1A_TRUST_RUNTIME_PIN: "94376718e07df2e9d44864ed0394d58219224e61" },
        "/synthetic/root",
        deps,
      );
    }, "LEGACY_ROOT_REJECTED"],
    ["authority_runtime_object_absent_rejects", () => {
      acquireCleanAuthority(goodEnv(), "/synthetic/root", {
        ...deps,
        gitObjectType: () => null,
      });
    }, "RUNTIME_AUTHORITY_UNPROVEN"],
    ["authority_runtime_object_wrong_type_rejects", () => {
      acquireCleanAuthority(goodEnv(), "/synthetic/root", {
        ...deps,
        gitObjectType: () => "blob",
      });
    }, "RUNTIME_AUTHORITY_UNPROVEN"],
    ["authority_verifier_source_unavailable_rejects", () => {
      acquireCleanAuthority(goodEnv(), "/synthetic/root", {
        ...deps,
        readFile: () => {
          throw new Error("ENOENT");
        },
      });
    }, "VERIFIER_SOURCE_UNAVAILABLE"],
    ["authority_malformed_scope_digest_rejects", () => {
      acquireCleanAuthority(
        { ...goodEnv(), P1A_SCOPE_DIGEST: "not-a-digest" },
        "/synthetic/root",
        deps,
      );
    }, "BAD_SHA64"],
    ["authority_env_surface_carries_no_credentials", () => {
      for (const name of CLEAN_AUTHORITY_REQUIRED_ENV) {
        assert.ok(
          !/TOKEN|SECRET|PRIVATE|PASSWORD/i.test(name),
          `credential-shaped env name in ordinary/protected parity surface: ${name}`,
        );
      }
    }, null],
  ];
}

// --- runner ---
function errorCode(error) {
  const message = String(error?.message ?? error);
  const match = message.match(
    /^(P1A_SUMMARY_V2_REJECT|P1A_CLEAN_AUTHORITY_BLOCK):([A-Z0-9_]+)/,
  );
  return match ? match[2] : `UNCLASSIFIED:${message.slice(0, 80)}`;
}

function runCase(fn) {
  try {
    fn();
    return "OK";
  } catch (error) {
    return errorCode(error);
  }
}

function runBattery(cases, { quiet = false } = {}) {
  let passed = 0;
  let failed = 0;
  const fingerprint = [];
  for (const [name, fn, expectedCode] of cases) {
    const outcome = runCase(fn);
    fingerprint.push(`${name}=${outcome}`);
    const ok = expectedCode === null ? outcome === "OK" : outcome === expectedCode;
    if (ok) {
      passed += 1;
      if (!quiet) console.log(`PASS ${name}`);
    } else {
      failed += 1;
      if (!quiet) {
        console.error(
          `FAIL ${name}: expected ${expectedCode ?? "OK"}, got ${outcome}`,
        );
      }
    }
  }
  return { passed, failed, fingerprint: fingerprint.join("\n") };
}

const allCases = [...summaryBattery(summaryModule), ...authorityBattery()];
const main = runBattery(allCases);
console.log(
  JSON.stringify({
    suite: "p1a-summary-v2-controls",
    required: allCases.length,
    executed: allCases.length,
    passed: main.passed,
    failed: main.failed,
  }),
);
if (main.failed > 0) process.exitCode = 1;

// --- mutation pass over the pure schema module ---
const MUTANTS = [
  ["suite_check_disabled", "summary.suite !== INTEGRATION_SUITE", "false"],
  ["schema_version_check_disabled", "summary.schemaVersion !== SUMMARY_SCHEMA_VERSION", "false"],
  ["unknown_field_check_disabled", "!expected.includes(key)", "false"],
  ["missing_field_check_disabled", "!actual.includes(key)", "false"],
  ["identity_equality_disabled", "summary[field] !== expected[field]", "false"],
  ["non_pass_zero_disabled", "summary[field] !== 0", "false"],
  ["required_equality_disabled", "summary.required !== requiredCount", "false"],
  ["execution_completeness_disabled", "summary[field] !== requiredCount", "false"],
  ["integer_check_disabled", "!Number.isInteger(value)", "false"],
  ["clean_base_check_disabled", "summary.authorizedBaseSha !== CLEAN_BASE_SHA", "false"],
  ["candidate_base_distinction_disabled", "summary.candidateSha === summary.authorizedBaseSha", "false"],
  ["verifier_workflow_binding_disabled", "summary.verifierSha !== summary.workflowSha", "false"],
  ["nested_evidence_binding_disabled", "summary.nestedEvidenceDigest !== expected.nested?.evidenceDigest", "false"],
  ["nested_verifier_binding_disabled", "summary.nestedVerifierDigest !== expected.nested?.producerDigest", "false"],
  ["sha40_shape_disabled", "!SHA40.test(value)", "false"],
  ["sha64_shape_disabled", "!SHA64.test(value)", "false"],
  ["nested_suite_check_disabled", "nested.suite !== NESTED_SUITE", "false"],
  ["nested_schema_version_disabled", "nested.schemaVersion !== NESTED_SCHEMA_VERSION", "false"],
  ["tautological_evidence_allowed", "nested.evidenceDigest === nested.evidencePackageDigest", "false"],
  ["tautological_verifier_allowed", "nested.producerDigest === nested.verifierDigest", "false"],
];

const sourcePath = path.join(here, "p1a-trusted-verifier-summary-v2.mjs");
const source = readFileSync(sourcePath, "utf8");
const importModule = async (code) =>
  import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const baseline = runBattery(summaryBattery(summaryModule), { quiet: true });
assert.equal(baseline.failed, 0, "baseline summary battery must be green before mutation");

const survivors = [];
let killed = 0;
for (const [name, needle, replacement] of MUTANTS) {
  assert.ok(source.includes(needle), `mutation needle absent: ${name}`);
  const mutatedSource = source.split(needle).join(replacement);
  assert.notEqual(mutatedSource, source, `mutation is a no-op: ${name}`);
  let mutated;
  try {
    mutated = await importModule(mutatedSource);
  } catch {
    killed += 1; // mutant does not even load — counted as killed
    console.log(`KILLED ${name} (load failure)`);
    continue;
  }
  const outcome = runBattery(summaryBattery(mutated), { quiet: true });
  if (outcome.fingerprint === baseline.fingerprint) {
    survivors.push(name);
    console.error(`SURVIVOR ${name}`);
  } else {
    killed += 1;
    console.log(`KILLED ${name}`);
  }
}

console.log(
  JSON.stringify({
    suite: "p1a-summary-v2-mutation",
    mutants: MUTANTS.length,
    killed,
    survivors,
  }),
);
if (survivors.length > 0) process.exitCode = 1;
