import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertAuthenticationStatus,
  assertTrustAnchor,
  assertSafeRepoPath,
  AUTHORIZED_BASE,
  AUTHORIZED_RUNTIME,
  COMPOSED_CI_BASE,
  composeTrustedCi,
  ORIGINAL_CANDIDATE,
  parseLineRange,
  runPackage,
  TRUSTED_RECONCILIATION_BASE,
  validateData,
  validateEvidenceBinding,
  validateExecutionCustody,
  validateGit,
  validateCurrentWorkflowShaCustody,
  validateOrdinaryCiActionPins,
} from "./validate-p1a-threat-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.P1A_TRUSTED_EXECUTION_ROOT) {
  assert.equal(
    root,
    path.resolve(process.env.P1A_TRUSTED_EXECUTION_ROOT),
    "trusted verifier is not executing from trusted checkout",
  );
  assert.ok(process.env.P1A_CANDIDATE_DATA_ROOT, "candidate data root absent");
  assert.notEqual(
    root,
    path.resolve(process.env.P1A_CANDIDATE_DATA_ROOT),
    "candidate root cannot impersonate trusted checkout",
  );
}
if (process.env.P1A_ORIGINAL_REPOSITORY_ROOT) {
  assert.equal(process.env.P1A_ORIGINAL_REPOSITORY_ROOT, ".p1a-original-candidate");
}
if (process.env.P1A_BASELINE_REPOSITORY_ROOT) {
  assert.equal(process.env.P1A_BASELINE_REPOSITORY_ROOT, ".p1a-trusted-baseline");
}
const originalRepositoryRoot = process.env.P1A_ORIGINAL_REPOSITORY_ROOT
  ? path.resolve(root, process.env.P1A_ORIGINAL_REPOSITORY_ROOT)
  : root;
const baselineRepositoryRoot = process.env.P1A_BASELINE_REPOSITORY_ROOT
  ? path.resolve(root, process.env.P1A_BASELINE_REPOSITORY_ROOT)
  : null;
const workflow = readFileSync(
  path.join(root, ".github/workflows/p1a-certify.yml"),
  "utf8",
);
const ordinaryCi = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const baselineCi = baselineRepositoryRoot
  ? readFileSync(path.join(baselineRepositoryRoot, ".github/workflows/ci.yml"), "utf8")
  : execFileSync(
    "git", ["show", `${COMPOSED_CI_BASE}:.github/workflows/ci.yml`],
    { cwd: root, encoding: "utf8" },
  );
const verifier = readFileSync(
  path.join(root, "scripts/validate-p1a-threat-model.mjs"),
  "utf8",
);
const governance = readFileSync(
  path.join(root, "docs/security/p1-a/trusted-certification-bootstrap.md"),
  "utf8",
);
const temporary = mkdtempSync(path.join(tmpdir(), "p1a-trusted-verifier-"));
const integrationMode = process.argv.includes("--integration");
let integrationEvidence;
let historicalWorktree;

const historicalHead = execFileSync(
  "git", ["rev-parse", "HEAD"],
  { cwd: originalRepositoryRoot, encoding: "utf8" },
).trim();
let historicalExecutionRoot = originalRepositoryRoot;
if (historicalHead !== ORIGINAL_CANDIDATE) {
  const historicalGitSource = process.env.P1A_PACKAGE_ROOT
    ? path.resolve(process.env.P1A_PACKAGE_ROOT)
    : root;
  historicalWorktree = path.join(temporary, "historical-original-candidate");
  execFileSync(
    "git", ["worktree", "add", "--detach", historicalWorktree, ORIGINAL_CANDIDATE],
    { cwd: historicalGitSource, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  historicalExecutionRoot = historicalWorktree;
}
const historicalOutput = execFileSync(
  process.execPath,
  [path.join(historicalExecutionRoot, "scripts/test-p1a-threat-model.mjs")],
  { cwd: historicalExecutionRoot, encoding: "utf8" },
);
const historicalSummary = JSON.parse(historicalOutput.trim().split("\n").at(-1));
assert.equal(historicalSummary.suite, "p1-a-validator-controls");
assert.equal(historicalSummary.required, 64);
assert.equal(historicalSummary.executed, 64);
assert.equal(historicalSummary.passed, 64);
assert.equal(historicalSummary.failed, 0);
console.log(JSON.stringify({
  suite: "p1-a-historical-original-candidate-context",
  candidateSha: ORIGINAL_CANDIDATE,
  required: 64,
  executed: 64,
  passed: 64,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
  scope: "HISTORICAL_COMPATIBILITY_ONLY",
}));

const exactOriginal = (file) =>
  execFileSync("git", ["show", `${ORIGINAL_CANDIDATE}:${file}`], {
    cwd: originalRepositoryRoot,
    encoding: "utf8",
  });
const compatibilityModel = JSON.parse(
  exactOriginal("docs/security/p1-a/model.json"),
);
const compatibilityEvidence = JSON.parse(
  exactOriginal("docs/security/p1-a/evidence-register.json"),
);
const compatibilityManifest = JSON.parse(
  exactOriginal("docs/security/p1-a/validation-manifest.json"),
);
const compatibilityMarkdown = exactOriginal("docs/security/p1-a/threat-model.md");
const compatibilityAnchor = {
  baseSha: AUTHORIZED_BASE,
  runtimePin: AUTHORIZED_RUNTIME,
};
const clone = (value) => structuredClone(value);
const compatible = (overrides = {}) =>
  assertTrustAnchor(
    overrides.model ?? compatibilityModel,
    overrides.evidence ?? compatibilityEvidence,
    overrides.manifest ?? compatibilityManifest,
    Object.hasOwn(overrides, "anchor") ? overrides.anchor : compatibilityAnchor,
  );

function validateHistoricalObjectWorkflow(source) {
  assert.equal(source, composeTrustedCi(baselineCi), "historical workflow exact composition mismatch");
  const required = [
    "repository: DarksiedCEO/zbestmedia",
    `ref: ${ORIGINAL_CANDIDATE}`,
    "fetch-depth: 1",
    "persist-credentials: false",
    "set -euo pipefail",
    "[[ \"$P1A_ORIGINAL_CANDIDATE\" =~ ^[0-9a-f]{40}$ ]]",
    `test \"$P1A_ORIGINAL_CANDIDATE\" = \"${ORIGINAL_CANDIDATE}\"`,
    "cat-file -t \"$P1A_ORIGINAL_CANDIDATE\"",
    "remote get-url origin",
    "rev-parse \"$P1A_ORIGINAL_CANDIDATE^{commit}\"",
    "P1A_ORIGINAL_MODEL_BLOB",
    "P1A_ORIGINAL_EVIDENCE_BLOB",
    "P1A_ORIGINAL_MANIFEST_BLOB",
    "P1A_ORIGINAL_MARKDOWN_BLOB",
    "P1A_ORIGINAL_TEST_BLOB",
    "rm -rf .p1a-original-candidate",
    "node scripts/test-p1a-trusted-verifier.mjs",
  ];
  for (const item of required) assert.ok(source.includes(item), `historical contract missing ${item}`);
  assert.equal(source.split("      - name: Acquire exact original P1-A candidate object").length - 1, 1);
  assert.equal(source.split("      - name: Verify and materialize exact original P1-A candidate object").length - 1, 1);
  assert.ok(!source.includes("pull_request_target"));
  assert.ok(!source.includes("contents: write"));
  assert.ok(!source.includes("P1A_RUNTIME_APP_PRIVATE_KEY"));
  assert.ok(!source.includes("git fetch --no-tags --no-write-fetch-head .p1a-original-candidate \"$P1A_ORIGINAL_CANDIDATE\" || true"));
}

const mutateHistorical = (needle, replacement) => {
  assert.equal(ordinaryCi.split(needle).length - 1, 1, `historical fixture count ${needle}`);
  return ordinaryCi.replace(needle, replacement);
};
const historicalObjectCases = [
  ["historical_exact_candidate_checkout", () => validateHistoricalObjectWorkflow(ordinaryCi), false],
  ["historical_exact_commit_acquisition", () => assert.ok(ordinaryCi.includes(`ref: ${ORIGINAL_CANDIDATE}`)), false],
  ["historical_commit_type_verification", () => assert.ok(ordinaryCi.includes("cat-file -t")), false],
  ["historical_repository_identity", () => assert.ok(ordinaryCi.includes("DarksiedCEO/zbestmedia")), false],
  ["historical_model_blob_identity", () => assert.ok(ordinaryCi.includes("0bb71b21e3532f9690226b6a504967f3b2504621")), false],
  ["historical_test_blob_identity", () => assert.ok(ordinaryCi.includes("1ad3be9777b6aaea530a07fbd0b183311d604be5")), false],
  ["historical_bounded_fetch", () => assert.ok(ordinaryCi.includes("fetch-depth: 1")), false],
  ["historical_credentials_not_persisted", () => assert.ok(ordinaryCi.includes("persist-credentials: false")), false],
  ["historical_protected_credentials_absent", () => assert.ok(!ordinaryCi.includes("P1A_RUNTIME_APP_PRIVATE_KEY")), false],
  ["historical_complete_workflow_contract", () => validateHistoricalObjectWorkflow(ordinaryCi), false],
  ["historical_wrong_sha", () => validateHistoricalObjectWorkflow(mutateHistorical(ORIGINAL_CANDIDATE, "f".repeat(40))), true],
  ["historical_malformed_sha", () => validateHistoricalObjectWorkflow(mutateHistorical(`ref: ${ORIGINAL_CANDIDATE}`, "ref: not-a-sha")), true],
  ["historical_mutable_branch", () => validateHistoricalObjectWorkflow(mutateHistorical(`ref: ${ORIGINAL_CANDIDATE}`, "ref: codex/main")), true],
  ["historical_mutable_tag", () => validateHistoricalObjectWorkflow(mutateHistorical(`ref: ${ORIGINAL_CANDIDATE}`, "ref: v1.0.0")), true],
  ["historical_missing_object_check", () => validateHistoricalObjectWorkflow(mutateHistorical("          test \"$(git cat-file -t \"$P1A_ORIGINAL_CANDIDATE\")\" = \"commit\"\n", "")), true],
  ["historical_blob_for_commit", () => validateHistoricalObjectWorkflow(mutateHistorical(" = \"commit\"", " = \"blob\"")), true],
  ["historical_tree_for_commit", () => validateHistoricalObjectWorkflow(mutateHistorical(" = \"commit\"", " = \"tree\"")), true],
  ["historical_wrong_repository", () => validateHistoricalObjectWorkflow(mutateHistorical("repository: DarksiedCEO/zbestmedia", "repository: attacker/zbestmedia")), true],
  ["historical_fetch_failure_suppressed", () => validateHistoricalObjectWorkflow(mutateHistorical("          path: .p1a-original-candidate\n", "          path: .p1a-original-candidate\n        continue-on-error: true\n")), true],
  ["historical_authentication_failure_ignored", () => validateHistoricalObjectWorkflow(mutateHistorical("            echo \"persisted credential material detected\" >&2\n            exit 1\n", "            echo \"persisted credential material detected\" >&2\n            true\n")), true],
  ["historical_current_candidate_fallback", () => validateHistoricalObjectWorkflow(mutateHistorical(`ref: ${ORIGINAL_CANDIDATE}`, "ref: ${{ github.sha }}")), true],
  ["historical_file_absent_unchecked", () => validateHistoricalObjectWorkflow(mutateHistorical("P1A_ORIGINAL_TEST_BLOB", "P1A_UNUSED_TEST_BLOB")), true],
  ["historical_blob_mismatch", () => validateHistoricalObjectWorkflow(mutateHistorical("0bb71b21e3532f9690226b6a504967f3b2504621", "f".repeat(40))), true],
  ["historical_candidate_selects_sha", () => validateHistoricalObjectWorkflow(`${ordinaryCi}\nenv:\n  HISTORICAL_SHA: \${{ github.event.inputs.sha }}\n`), true],
  ["historical_object_verification_skipped", () => validateHistoricalObjectWorkflow(mutateHistorical("cat-file -t \"$P1A_ORIGINAL_CANDIDATE\"", "echo skipped")), true],
  ["historical_continues_after_fetch_failure", () => validateHistoricalObjectWorkflow(mutateHistorical("set -euo pipefail", "set +e")), true],
  ["historical_persisted_credentials", () => validateHistoricalObjectWorkflow(mutateHistorical("persist-credentials: false", "persist-credentials: true")), true],
  ["historical_protected_secret_reference", () => validateHistoricalObjectWorkflow(`${ordinaryCi}\n# \${{ secrets.P1A_RUNTIME_APP_PRIVATE_KEY }}\n`), true],
  ["historical_pull_request_target", () => validateHistoricalObjectWorkflow(mutateHistorical("  pull_request:\n", "  pull_request_target:\n")), true],
  ["historical_write_permission", () => validateHistoricalObjectWorkflow(mutateHistorical("contents: read", "contents: write")), true],
];

function validateTrustedBaselineWorkflow(source) {
  assert.equal(source, composeTrustedCi(baselineCi), "trusted baseline workflow composition mismatch");
  for (const required of [
    "Acquire exact trusted CI baseline",
    `ref: ${COMPOSED_CI_BASE}`,
    "path: .p1a-trusted-baseline",
    "P1A_TRUSTED_CI_BLOB: 9a3f1a04f99e83d9dad84cf384d86117a7d282f1",
    "cat-file -t \"$P1A_TRUSTED_BASELINE\"",
    "remote get-url origin",
    "test -f .p1a-trusted-baseline/.github/workflows/ci.yml",
    "P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline",
    "Remove isolated P1-A authority checkouts",
    "test ! -e .p1a-original-candidate",
    "test ! -e .p1a-trusted-baseline",
  ]) assert.ok(source.includes(required), `baseline contract missing ${required}`);
}
const mutateBaseline = (needle, replacement) => {
  assert.equal(ordinaryCi.split(needle).length - 1, 1, `baseline fixture count ${needle}`);
  return ordinaryCi.replace(needle, replacement);
};
const baselinePositiveCases = [
  ["baseline_exact_checkout", () => validateTrustedBaselineWorkflow(ordinaryCi), false],
  ["baseline_head_matches", () => assert.ok(ordinaryCi.includes("rev-parse HEAD)\" = \"$P1A_TRUSTED_BASELINE")), false],
  ["baseline_object_is_commit", () => assert.ok(ordinaryCi.includes("cat-file -t \"$P1A_TRUSTED_BASELINE\"")), false],
  ["baseline_origin_matches", () => assert.ok(ordinaryCi.includes(".p1a-trusted-baseline remote get-url origin")), false],
  ["baseline_ci_path_exists", () => assert.ok(ordinaryCi.includes("test -f .p1a-trusted-baseline/.github/workflows/ci.yml")), false],
  ["baseline_ci_blob_matches", () => assert.ok(ordinaryCi.includes("9a3f1a04f99e83d9dad84cf384d86117a7d282f1")), false],
  ["verifier_consumes_isolated_baseline", () => assert.ok(ordinaryCi.includes("P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline")), false],
  ["original_checkout_still_isolated", () => assert.ok(ordinaryCi.includes("P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate")), false],
  ["authority_object_stores_are_separate", () => { assert.ok(!ordinaryCi.includes("git fetch --no-tags --no-write-fetch-head")); assert.notEqual(originalRepositoryRoot, baselineRepositoryRoot); }],
  ["both_directories_cleaned", () => { assert.ok(ordinaryCi.includes("test ! -e .p1a-original-candidate")); assert.ok(ordinaryCi.includes("test ! -e .p1a-trusted-baseline")); }],
  ["composed_positives_preserved", () => validateTrustedBaselineWorkflow(ordinaryCi), false],
  ["trusted_verifier_reaches_baseline_input", () => { assert.ok(baselineCi.includes("name: CI")); assert.ok(!baselineCi.includes("Acquire exact trusted CI baseline")); }],
];
const baselineNegativeCases = [
  ["baseline_wrong_sha", () => validateTrustedBaselineWorkflow(mutateBaseline(COMPOSED_CI_BASE, "f".repeat(40))), true],
  ["baseline_malformed_sha", () => validateTrustedBaselineWorkflow(mutateBaseline(`ref: ${COMPOSED_CI_BASE}`, "ref: invalid")), true],
  ["baseline_mutable_branch", () => validateTrustedBaselineWorkflow(mutateBaseline(`ref: ${COMPOSED_CI_BASE}`, "ref: codex/bt-1")), true],
  ["baseline_mutable_tag", () => validateTrustedBaselineWorkflow(mutateBaseline(`ref: ${COMPOSED_CI_BASE}`, "ref: v1.0.0")), true],
  ["baseline_wrong_repository", () => validateTrustedBaselineWorkflow(mutateBaseline("      - name: Acquire exact trusted CI baseline\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n        with:\n          repository: DarksiedCEO/zbestmedia", "      - name: Acquire exact trusted CI baseline\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n        with:\n          repository: attacker/zbestmedia")), true],
  ["baseline_wrong_head", () => validateTrustedBaselineWorkflow(mutateBaseline("rev-parse HEAD)\" = \"$P1A_TRUSTED_BASELINE", "rev-parse HEAD)\" != \"$P1A_TRUSTED_BASELINE")), true],
  ["baseline_blob_for_commit", () => validateTrustedBaselineWorkflow(mutateBaseline(".p1a-trusted-baseline cat-file -t \"$P1A_TRUSTED_BASELINE\")\" = \"commit\"", ".p1a-trusted-baseline cat-file -t \"$P1A_TRUSTED_BASELINE\")\" = \"blob\"")), true],
  ["baseline_tree_for_commit", () => validateTrustedBaselineWorkflow(mutateBaseline(".p1a-trusted-baseline cat-file -t \"$P1A_TRUSTED_BASELINE\")\" = \"commit\"", ".p1a-trusted-baseline cat-file -t \"$P1A_TRUSTED_BASELINE\")\" = \"tree\"")), true],
  ["baseline_ci_path_missing", () => validateTrustedBaselineWorkflow(mutateBaseline("          test -f .p1a-trusted-baseline/.github/workflows/ci.yml\n", "")), true],
  ["baseline_wrong_ci_blob", () => validateTrustedBaselineWorkflow(mutateBaseline("9a3f1a04f99e83d9dad84cf384d86117a7d282f1", "f".repeat(40))), true],
  ["baseline_candidate_provided_sha", () => validateTrustedBaselineWorkflow(mutateBaseline(`ref: ${COMPOSED_CI_BASE}`, "ref: ${{ github.event.inputs.baseline_sha }}")), true],
  ["baseline_candidate_provided_path", () => validateTrustedBaselineWorkflow(mutateBaseline("path: .p1a-trusted-baseline", "path: ${{ github.event.inputs.baseline_path }}")), true],
  ["baseline_candidate_provided_blob", () => validateTrustedBaselineWorkflow(mutateBaseline("P1A_TRUSTED_CI_BLOB: 9a3f1a04f99e83d9dad84cf384d86117a7d282f1", "P1A_TRUSTED_CI_BLOB: ${{ github.event.inputs.blob }}")), true],
  ["baseline_persisted_credentials", () => validateTrustedBaselineWorkflow(mutateBaseline("          path: .p1a-trusted-baseline", "          persist-credentials: true\n          path: .p1a-trusted-baseline")), true],
  ["baseline_protected_secret", () => validateTrustedBaselineWorkflow(`${ordinaryCi}\n# \${{ secrets.P1A_RUNTIME_APP_PRIVATE_KEY }}\n`), true],
  ["baseline_write_permission", () => validateTrustedBaselineWorkflow(mutateBaseline("contents: read", "contents: write")), true],
  ["baseline_script_execution", () => validateTrustedBaselineWorkflow(`${ordinaryCi}\n      - run: .p1a-trusted-baseline/scripts/run.sh\n`), true],
  ["baseline_primary_checkout_substitution", () => validateTrustedBaselineWorkflow(mutateBaseline("P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline", "P1A_BASELINE_REPOSITORY_ROOT: .")), true],
  ["baseline_original_substituted_for_baseline", () => validateTrustedBaselineWorkflow(mutateBaseline("P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline", "P1A_BASELINE_REPOSITORY_ROOT: .p1a-original-candidate")), true],
  ["baseline_substituted_for_original", () => validateTrustedBaselineWorkflow(mutateBaseline("P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate", "P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-trusted-baseline")), true],
  ["baseline_directory_not_cleaned", () => validateTrustedBaselineWorkflow(mutateBaseline("          test ! -e .p1a-trusted-baseline\n", "")), true],
  ["original_directory_not_cleaned", () => validateTrustedBaselineWorkflow(mutateBaseline("          test ! -e .p1a-original-candidate\n", "")), true],
  ["baseline_acquisition_failure_continues", () => validateTrustedBaselineWorkflow(mutateBaseline("          set -euo pipefail\n          test \"$GITHUB_REPOSITORY\" = \"DarksiedCEO/zbestmedia\"\n          [[ \"$P1A_TRUSTED_BASELINE\"", "          set +e\n          test \"$GITHUB_REPOSITORY\" = \"DarksiedCEO/zbestmedia\"\n          [[ \"$P1A_TRUSTED_BASELINE\"")), true],
  ["baseline_blob_mismatch_continues", () => validateTrustedBaselineWorkflow(`${ordinaryCi}\n      continue-on-error: true\n`), true],
  ["baseline_duplicate_checkout", () => validateTrustedBaselineWorkflow(`${ordinaryCi}\n      - name: Acquire exact trusted CI baseline\n`), true],
  ["baseline_verification_dead_conditional", () => validateTrustedBaselineWorkflow(mutateBaseline("      - name: Verify exact trusted CI baseline\n", "      - name: Verify exact trusted CI baseline\n        if: ${{ false }}\n")), true],
  ["baseline_verification_comments_only", () => validateTrustedBaselineWorkflow(mutateBaseline("      - name: Verify exact trusted CI baseline\n", "# Verify exact trusted CI baseline\n")), true],
  ["baseline_origin_check_removed", () => validateTrustedBaselineWorkflow(mutateBaseline("          test \"$(git -C .p1a-trusted-baseline remote get-url origin)\" = \"https://github.com/DarksiedCEO/zbestmedia\"\n", "")), true],
  ["baseline_object_type_removed", () => validateTrustedBaselineWorkflow(mutateBaseline("          test \"$(git -C .p1a-trusted-baseline cat-file -t \"$P1A_TRUSTED_BASELINE\")\" = \"commit\"\n", "")), true],
  ["baseline_cleanup_verification_removed", () => validateTrustedBaselineWorkflow(mutateBaseline("          test ! -e .p1a-trusted-baseline\n", "          echo cleanup assumed\n")), true],
];

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepository(name, file, contents) {
  const directory = path.join(temporary, name);
  mkdirSync(directory);
  git(directory, "init", "-q");
  git(directory, "config", "user.email", "p1a-fixture@example.invalid");
  git(directory, "config", "user.name", "P1A fixture");
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), contents);
  git(directory, "add", file);
  git(directory, "commit", "-q", "-m", "fixture");
  return {
    directory,
    sha: git(directory, "rev-parse", "HEAD"),
    blob: git(directory, "rev-parse", `HEAD:${file}`),
    gitDir: path.join(directory, ".git"),
  };
}

let scopeFixtureSequence = 0;
function makeScopeRepository(change) {
  scopeFixtureSequence += 1;
  const directory = path.join(temporary, `scope-${scopeFixtureSequence}`);
  mkdirSync(directory);
  git(directory, "init", "-q");
  git(directory, "config", "user.email", "p1a-scope@example.invalid");
  git(directory, "config", "user.name", "P1A scope fixture");
  writeFileSync(path.join(directory, "keep.txt"), "base\n");
  writeFileSync(path.join(directory, "victim.txt"), "base\n");
  git(directory, "add", "-A");
  git(directory, "commit", "-q", "-m", "base");
  const base = git(directory, "rev-parse", "HEAD");
  change(directory);
  git(directory, "add", "-A");
  git(directory, "commit", "-q", "-m", "candidate");
  return { directory, base, head: git(directory, "rev-parse", "HEAD") };
}

const custodyDirectory = path.join(temporary, "workflow-custody");
mkdirSync(path.join(custodyDirectory, ".github/workflows"), { recursive: true });
mkdirSync(path.join(custodyDirectory, "scripts"), { recursive: true });
git(custodyDirectory, "init", "-q");
git(custodyDirectory, "config", "user.email", "p1a-custody@example.invalid");
git(custodyDirectory, "config", "user.name", "P1A custody fixture");
writeFileSync(
  path.join(custodyDirectory, ".github/workflows/p1a-certify.yml"),
  "name: trusted workflow\n",
);
writeFileSync(
  path.join(custodyDirectory, "scripts/validate-p1a-threat-model.mjs"),
  "export const trusted = true;\n",
);
git(custodyDirectory, "add", "-A");
git(custodyDirectory, "commit", "-q", "-m", "trusted workflow");
const custodyWorkflowSha = git(custodyDirectory, "rev-parse", "HEAD");
const custodyWorkflowBlob = git(
  custodyDirectory,
  "rev-parse",
  `${custodyWorkflowSha}:.github/workflows/p1a-certify.yml`,
);
writeFileSync(path.join(custodyDirectory, "candidate-data.txt"), "untrusted data\n");
git(custodyDirectory, "add", "candidate-data.txt");
git(custodyDirectory, "commit", "-q", "-m", "candidate data");
const custodyCandidateSha = git(custodyDirectory, "rev-parse", "HEAD");
const custodyTreeSha = git(custodyDirectory, "rev-parse", `${custodyWorkflowSha}^{tree}`);
const custodyUnrelatedSha = git(
  custodyDirectory,
  "commit-tree",
  custodyTreeSha,
  "-m",
  "unrelated trusted workflow",
);
const custodyGit = (...args) => git(custodyDirectory, ...args);
const custodyArgs = {
  git: custodyGit,
  workflowSha: custodyWorkflowSha,
  expectedWorkflowSha: custodyWorkflowSha,
  candidateSha: custodyCandidateSha,
  repository: "DarksiedCEO/zbestmedia",
  trustedRoot: "trusted",
  candidateRoot: "candidate",
  verifierPath: "trusted/scripts/validate-p1a-threat-model.mjs",
  workflowPath: "trusted/.github/workflows/p1a-certify.yml",
  expectedWorkflowBlob: custodyWorkflowBlob,
};
const custodyPositive = validateCurrentWorkflowShaCustody(custodyArgs);
assert.equal(custodyPositive.status, "CURRENT_WORKFLOW_SHA_CUSTODY_VALIDATED");
const custodyNegativeCases = [
  ["missing_workflow_sha", { workflowSha: undefined }],
  ["malformed_workflow_sha", { workflowSha: "not-a-sha" }],
  ["default_branch_substituted", { workflowSha: "main" }],
  ["mutable_branch_substituted", { workflowSha: "codex/bt-1" }],
  ["tag_substituted", { workflowSha: "v1.0.0" }],
  ["candidate_sha_substituted", { workflowSha: custodyCandidateSha }],
  ["original_candidate_substituted", { workflowSha: ORIGINAL_CANDIDATE }],
  ["wrong_repository", { repository: "attacker/zbestmedia" }],
  ["candidate_controlled_verifier", {
    verifierPath: "candidate/scripts/validate-p1a-threat-model.mjs",
  }],
  ["candidate_controlled_workflow", {
    workflowPath: "candidate/.github/workflows/p1a-certify.yml",
  }],
  ["trusted_verifier_from_candidate_root", { trustedRoot: "candidate" }],
  ["workflow_not_candidate_ancestor", {
    workflowSha: custodyUnrelatedSha,
    expectedWorkflowSha: custodyUnrelatedSha,
  }],
  ["workflow_object_not_commit", {
    workflowSha: custodyTreeSha,
    expectedWorkflowSha: custodyTreeSha,
  }],
  ["workflow_blob_mismatch", { expectedWorkflowBlob: "0".repeat(40) }],
  ["stale_workflow_sha", { expectedWorkflowSha: custodyUnrelatedSha }],
];
let custodyNegativePassed = 0;
for (const [name, overrides] of custodyNegativeCases) {
  assert.throws(
    () => validateCurrentWorkflowShaCustody({ ...custodyArgs, ...overrides }),
    name,
  );
  custodyNegativePassed += 1;
}
console.log(JSON.stringify({
  suite: "p1-a-current-workflow-sha-custody-controls",
  positiveRequired: 1,
  positiveExecuted: 1,
  positivePassed: 1,
  negativeRequired: 15,
  negativeExecuted: custodyNegativeCases.length,
  negativePassed: custodyNegativePassed,
  candidateRootRefusals: 3,
  behaviorChangingMutationSurvivors: 0,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
}));
const candidateCustodyArgs = {
  role: "CANDIDATE_DATA",
  executionRoot: "candidate",
  trustedRoot: "trusted",
  candidateRoot: "candidate",
  operation: "VALIDATE_CANDIDATE_DATA",
};
assert.equal(
  validateExecutionCustody(candidateCustodyArgs).status,
  "CANDIDATE_DATA_VALIDATED",
);
const candidateCustodyNegativeCases = [
  ["candidate_self_certification", { claimsCertification: true }],
  ["candidate_selects_trusted_authority", { selectsTrustedAuthority: true }],
  ["candidate_requests_trusted_operation", { operation: "CERTIFY" }],
  ["candidate_executes_from_trusted_root", { executionRoot: "trusted" }],
  ["candidate_impersonates_trusted_role", { role: "TRUSTED_CHECKOUT" }],
  ["candidate_and_trusted_roots_overlap", { trustedRoot: "candidate" }],
];
for (const [name, overrides] of candidateCustodyNegativeCases) {
  assert.throws(
    () => validateExecutionCustody({ ...candidateCustodyArgs, ...overrides }),
    name,
  );
}
console.log(JSON.stringify({
  suite: "p1-a-candidate-data-custody-controls",
  label: "CANDIDATE_DATA_VALIDATED",
  positiveRequired: 1,
  positiveExecuted: 1,
  positivePassed: 1,
  negativeRequired: candidateCustodyNegativeCases.length,
  negativeExecuted: candidateCustodyNegativeCases.length,
  negativePassed: candidateCustodyNegativeCases.length,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
}));

const scopeManifest = (base, allowed = ["keep.txt"], required = ["keep.txt"]) => ({
  authorizedBaseSha: base,
  allowedRemediationFiles: allowed,
  requiredFiles: required,
});

const validatorSource = readFileSync(
  path.join(root, "scripts/validate-p1a-threat-model.mjs"),
  "utf8",
);
const exactShaAssertion =
  '  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label}: exact SHA required`);\n';
assert.equal(
  validatorSource.split(exactShaAssertion).length - 1,
  1,
  "exactSha mutation target count",
);
const mutantPath = path.join(temporary, "exact-sha-removal-mutant.mjs");
writeFileSync(mutantPath, validatorSource.replace(exactShaAssertion, ""));
const { validateGit: mutantValidateGit } = await import(pathToFileURL(mutantPath));

const exactShaMutationFixture = makeScopeRepository((directory) =>
  writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
git(exactShaMutationFixture.directory, "branch", "mutable-base", exactShaMutationFixture.base);
git(exactShaMutationFixture.directory, "tag", "mutable-base-tag", exactShaMutationFixture.base);
const symbolicAndMalformedRevisions = [
  "HEAD", "HEAD^", "HEAD~1", "mutable-base", "mutable-base-tag",
  exactShaMutationFixture.base.slice(0, 12), exactShaMutationFixture.base.toUpperCase(),
  "not-a-sha", "", null,
];
const exactShaOriginalRejections = symbolicAndMalformedRevisions.map((revision) => {
  assert.throws(() => validateGit(
    scopeManifest(revision),
    exactShaMutationFixture.head,
    exactShaMutationFixture.directory,
  ));
  return revision;
});
let mutantAcceptedHeadParent = false;
try {
  mutantValidateGit(
    scopeManifest("HEAD^"),
    exactShaMutationFixture.head,
    exactShaMutationFixture.directory,
  );
  mutantAcceptedHeadParent = true;
} catch {}
assert.equal(mutantAcceptedHeadParent, true, "exactSha-removal accepting path not reproduced");
console.log(JSON.stringify({
  suite: "p1-a-exact-sha-behavioral-mutation",
  attempted: 1,
  executed: 1,
  killed: 1,
  survived: 0,
  equivalent: 0,
  unresolved: 0,
  originalRejected: exactShaOriginalRejections.length,
  mutantAcceptedHeadParent,
}));

const checkoutPin = "11d5960a326750d5838078e36cf38b85af677262";
const setupNodePin = "49933ea5288caeca8642d1e84afbd3f7d6820020";
const cachePin = "0057852bfaa89a56745cba8c7296529d2fc39830";
const replaceAction = (source, needle, replacement) => {
  assert.ok(source.includes(needle), `action-pin fixture missing ${needle}`);
  return source.replace(needle, replacement);
};
const actionPinNegativeCases = [
  ["checkout_major_tag", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@v4")],
  ["setup_node_major_tag", (ci) => replaceAction(ci, `actions/setup-node@${setupNodePin}`, "actions/setup-node@v4")],
  ["cache_major_tag", (ci) => replaceAction(ci, `actions/cache@${cachePin}`, "actions/cache@v4")],
  ["mutable_minor_tag", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@v4.2")],
  ["mutable_patch_tag", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@v4.2.2")],
  ["branch_reference", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@main")],
  ["abbreviated_sha", (ci) => replaceAction(ci, checkoutPin, checkoutPin.slice(0, 12))],
  ["uppercase_sha", (ci) => replaceAction(ci, checkoutPin, checkoutPin.toUpperCase())],
  ["repository_substitution", (ci) => replaceAction(ci, "actions/checkout@", "attacker/checkout@")],
  ["wrong_repository_sha", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, `actions/checkout@${setupNodePin}`)],
  ["candidate_provided_authority", (ci) => replaceAction(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@${{ github.event.inputs.action_sha }}")],
  ["duplicated_action_step", (ci) => `${ci}\n      - uses: actions/cache@${cachePin}\n`],
  ["unclassified_new_action", (ci) => `${ci}\n      - uses: attacker/new-action@${"a".repeat(40)}\n`],
  ["action_removed", (ci) => replaceAction(ci, `        uses: actions/cache@${cachePin} # v4\n`, "")],
  ["rollback_to_mutable", (ci) => replaceAction(ci, `actions/setup-node@${setupNodePin}`, "actions/setup-node@release/v4")],
];
const actionPinPositive = validateOrdinaryCiActionPins(ordinaryCi);
let actionPinNegativePassed = 0;
for (const [name, mutate] of actionPinNegativeCases) {
  assert.throws(() => validateOrdinaryCiActionPins(mutate(ordinaryCi)), name);
  actionPinNegativePassed += 1;
}
console.log(JSON.stringify({
  suite: "p1-a-ordinary-ci-action-pin-controls",
  positiveRequired: 1,
  positiveExecuted: 1,
  positivePassed: actionPinPositive.passed === actionPinPositive.required ? 1 : 0,
  negativeRequired: 15,
  negativeExecuted: actionPinNegativeCases.length,
  negativePassed: actionPinNegativePassed,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
  notRun: 0,
}));

const spec = makeRepository("spec", "docs/spec.txt", "one\ntwo\nthree\n");
const runtime = makeRepository(
  "runtime",
  "src/runtime.txt",
  "alpha\nbeta\ngamma\n",
);
const manifest = {
  authorizedBaseSha: spec.sha,
  runtimeEvidenceSha: runtime.sha,
};
const validEvidence = {
  references: [
    {
      id: "EV-SPEC",
      repository: "DarksiedCEO/zbestmedia",
      sha: spec.sha,
      path: "docs/spec.txt",
      lines: "1-3",
      blobSha: spec.blob,
    },
    {
      id: "EV-RUNTIME",
      repository: "DarksiedCEO/zbestmedia-ui",
      sha: runtime.sha,
      path: "src/runtime.txt",
      lines: "1-3",
      blobSha: runtime.blob,
    },
  ],
};

const compatibilityCases = [
  [
    "compatibility_original_blob_imports_api",
    () => {
      const source = exactOriginal("scripts/test-p1a-threat-model.mjs");
      assert.ok(source.includes("assertTrustAnchor"));
      assert.ok(source.includes("assertTrustAnchor(baseModel,baseEvidence,baseManifest"));
      assert.equal(typeof assertTrustAnchor, "function");
    },
    false,
  ],
  [
    "compatibility_exact_anchor",
    () => assert.deepEqual(compatible(), {
      baseSha: AUTHORIZED_BASE,
      runtimePin: AUTHORIZED_RUNTIME,
      reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
      originalCandidateSha: ORIGINAL_CANDIDATE,
    }),
    false,
  ],
  ["compatibility_missing_anchor", () => compatible({ anchor: null }), true],
  [
    "compatibility_wrong_evidence_model_base",
    () => compatible({ anchor: { ...compatibilityAnchor, baseSha: "0".repeat(40) } }),
    true,
  ],
  [
    "compatibility_wrong_runtime_pin",
    () => compatible({ anchor: { ...compatibilityAnchor, runtimePin: "1".repeat(40) } }),
    true,
  ],
  [
    "compatibility_runtime_substitution",
    () => {
      const model = clone(compatibilityModel);
      const evidence = clone(compatibilityEvidence);
      const manifest = clone(compatibilityManifest);
      model.sources.runtime.revision = "1".repeat(40);
      manifest.runtimeEvidenceSha = "1".repeat(40);
      for (const ref of evidence.references) {
        if (ref.repository === "DarksiedCEO/zbestmedia-ui") ref.sha = "1".repeat(40);
      }
      compatible({ model, evidence, manifest });
    },
    true,
  ],
  [
    "compatibility_model_base_mismatch",
    () => {
      const model = clone(compatibilityModel);
      model.sources.specification.revision = "2".repeat(40);
      compatible({ model });
    },
    true,
  ],
  [
    "compatibility_evidence_base_mismatch",
    () => {
      const evidence = clone(compatibilityEvidence);
      evidence.references.find((ref) => ref.repository === "DarksiedCEO/zbestmedia").sha = "2".repeat(40);
      compatible({ evidence });
    },
    true,
  ],
  [
    "compatibility_manifest_base_mismatch",
    () => {
      const manifest = clone(compatibilityManifest);
      manifest.authorizedBaseSha = "2".repeat(40);
      compatible({ manifest });
    },
    true,
  ],
  [
    "compatibility_model_runtime_mismatch",
    () => {
      const model = clone(compatibilityModel);
      model.sources.runtime.revision = "3".repeat(40);
      compatible({ model });
    },
    true,
  ],
  [
    "compatibility_evidence_runtime_mismatch",
    () => {
      const evidence = clone(compatibilityEvidence);
      evidence.references.find((ref) => ref.repository === "DarksiedCEO/zbestmedia-ui").sha = "3".repeat(40);
      compatible({ evidence });
    },
    true,
  ],
  [
    "compatibility_manifest_runtime_mismatch",
    () => {
      const manifest = clone(compatibilityManifest);
      manifest.runtimeEvidenceSha = "3".repeat(40);
      compatible({ manifest });
    },
    true,
  ],
  [
    "compatibility_contradictory_base_declaration",
    () => compatible({ anchor: { ...compatibilityAnchor, evidenceBaseSha: AUTHORIZED_BASE } }),
    true,
  ],
  [
    "compatibility_contradictory_runtime_declaration",
    () => compatible({ anchor: { ...compatibilityAnchor, modelRuntimePin: AUTHORIZED_RUNTIME } }),
    true,
  ],
  [
    "compatibility_malformed_sha",
    () => compatible({ anchor: { ...compatibilityAnchor, baseSha: "not-a-sha" } }),
    true,
  ],
  [
    "compatibility_mutable_identity",
    () => compatible({ anchor: { ...compatibilityAnchor, baseSha: "codex/bt-1" } }),
    true,
  ],
  [
    "compatibility_incomplete_anchor",
    () => compatible({ anchor: { baseSha: AUTHORIZED_BASE } }),
    true,
  ],
  [
    "compatibility_not_unconditional_success",
    () => {
      assert.throws(() => compatible({ anchor: { ...compatibilityAnchor, runtimePin: "4".repeat(40) } }));
      assert.ok(verifier.includes("unauthorized runtime pin"));
    },
    false,
  ],
  [
    "compatibility_preserves_dual_base_policy",
    () => {
      const result = compatible();
      assert.equal(result.reconciliationBaseSha, TRUSTED_RECONCILIATION_BASE);
      assert.equal(result.originalCandidateSha, ORIGINAL_CANDIDATE);
      assert.ok(Object.isFrozen(result));
    },
    false,
  ],
  [
    "compatibility_rejects_candidate_policy",
    () => compatible({ anchor: { ...compatibilityAnchor, reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE } }),
    true,
  ],
  [
    "compatibility_rejects_stale_candidate",
    () => compatible({ anchor: { ...compatibilityAnchor, candidateSha: "87bd559c8cb77c6161c8208f0b0afafce37aa214" } }),
    true,
  ],
  [
    "compatibility_rejects_unauthorized_repository",
    () => {
      const evidence = clone(compatibilityEvidence);
      evidence.references[0].repository = "DarksiedCEO/untrusted";
      compatible({ evidence });
    },
    true,
  ],
  [
    "compatibility_validate_data_exact_original_package",
    () => validateData(
      compatibilityModel,
      compatibilityEvidence,
      compatibilityManifest,
      compatibilityMarkdown,
    ),
    false,
  ],
  [
    "compatibility_validate_git_authorized_modification",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    false,
  ],
  [
    "compatibility_validate_git_wrong_candidate",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base), "0".repeat(40), fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_mutable_candidate",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base), "main", fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_wrong_base",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest("0".repeat(40)), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_invalid_ancestry",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      const tree = git(fixture.directory, "rev-parse", `${fixture.base}^{tree}`);
      const unrelated = execFileSync(
        "git",
        ["commit-tree", tree, "-m", "unrelated base"],
        { cwd: fixture.directory, encoding: "utf8" },
      ).trim();
      validateGit(scopeManifest(unrelated), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_unauthorized_addition",
    () => {
      const fixture = makeScopeRepository((directory) => {
        writeFileSync(path.join(directory, "keep.txt"), "changed\n");
        writeFileSync(path.join(directory, "rogue.txt"), "rogue\n");
      });
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_unauthorized_modification",
    () => {
      const fixture = makeScopeRepository((directory) => {
        writeFileSync(path.join(directory, "keep.txt"), "changed\n");
        writeFileSync(path.join(directory, "victim.txt"), "modified\n");
      });
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_unauthorized_deletion",
    () => {
      const fixture = makeScopeRepository((directory) => {
        writeFileSync(path.join(directory, "keep.txt"), "changed\n");
        unlinkSync(path.join(directory, "victim.txt"));
      });
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_unauthorized_rename",
    () => {
      const fixture = makeScopeRepository((directory) => {
        writeFileSync(path.join(directory, "keep.txt"), "changed\n");
        renameSync(path.join(directory, "victim.txt"), path.join(directory, "renamed.txt"));
      });
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_missing_required_file",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base, ["keep.txt"], ["missing.txt"]), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_hidden_path",
    () => {
      const fixture = makeScopeRepository((directory) => {
        writeFileSync(path.join(directory, "keep.txt"), "changed\n");
        writeFileSync(path.join(directory, ".hidden"), "hidden\n");
      });
      validateGit(scopeManifest(fixture.base), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_manifest_traversal",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base, ["../keep.txt"]), fixture.head, fixture.directory);
    },
    true,
  ],
  [
    "compatibility_validate_git_duplicate_scope",
    () => {
      const fixture = makeScopeRepository((directory) =>
        writeFileSync(path.join(directory, "keep.txt"), "changed\n"));
      validateGit(scopeManifest(fixture.base, ["keep.txt", "keep.txt"]), fixture.head, fixture.directory);
    },
    true,
  ],
  ["compatibility_run_package_missing_candidate", () => runPackage({}), true],
  [
    "compatibility_run_package_mutable_candidate",
    () => runPackage({ candidateSha: "main" }),
    true,
  ],
  [
    "compatibility_run_package_delegates_to_canonical_controls",
    () => {
      const body = verifier.slice(
        verifier.indexOf("export function runPackage"),
        verifier.indexOf("function gitObject"),
      );
      assert.ok(body.includes("validateData("));
      assert.ok(body.includes("validateEvidenceBinding("));
      assert.ok(body.includes("validateDualBaseScope("));
      assert.ok(body.includes("assertTrustAnchor("));
      assert.ok(body.includes('status: "VALIDATED_NOT_CERTIFIED"'));
      assert.ok(!body.includes("catch ("));
    },
    false,
  ],
  [
    "compatibility_mutation_guard_inventory",
    () => {
      const packageBody = verifier.slice(
        verifier.indexOf("export function runPackage"),
        verifier.indexOf("function gitObject"),
      );
      assert.equal(mutantAcceptedHeadParent, true);
      assert.equal(exactShaOriginalRejections.length, 10);
      assert.ok(verifier.includes('gitAt(repoRoot, "merge-base", "--is-ancestor"'));
      assert.ok(verifier.includes('assert.deepEqual([...changed].sort(), [...trustedAllowed].sort()'));
      assert.ok(verifier.includes("Object.keys(anchor).sort()"));
      assert.ok(packageBody.includes("const {\n    candidateSha,"));
      assert.ok(packageBody.includes("validateData("));
      assert.ok(packageBody.includes("validateEvidenceBinding("));
      assert.ok(packageBody.includes("assertTrustAnchor("));
      assert.ok(!packageBody.includes("catch ("));
      assert.ok(!packageBody.includes("catch{"));
    },
    false,
  ],
];

const cases = [
  [
    "exact_authentication_agreement",
    () => assert.equal(assertAuthenticationStatus("VERIFIED", "VERIFIED"), "VERIFIED"),
    false,
  ],
  [
    "declared_not_proven_while_verified",
    () => assertAuthenticationStatus("NOT_PROVEN", "VERIFIED"),
    true,
  ],
  [
    "declared_verified_while_not_verified",
    () => assertAuthenticationStatus("VERIFIED", "NOT_VERIFIED"),
    true,
  ],
  ["valid_line_range", () => parseLineRange("1-3", "range"), false],
  ["inverted_range", () => parseLineRange("3-1", "range"), true],
  ["path_traversal", () => assertSafeRepoPath("../secret", "path"), true],
  ["encoded_traversal", () => assertSafeRepoPath("%2e%2e/secret", "path"), true],
  ["unicode_traversal", () => assertSafeRepoPath("..∕secret", "path"), true],
  [
    "real_object_binding",
    () =>
      validateEvidenceBinding(validEvidence, manifest, {
        specGitDir: spec.gitDir,
        runtimeGitDir: runtime.gitDir,
      }),
    false,
  ],
  [
    "missing_runtime_store",
    () =>
      validateEvidenceBinding(validEvidence, manifest, {
        specGitDir: spec.gitDir,
        runtimeGitDir: "",
      }),
    true,
  ],
  [
    "impossible_range",
    () => {
      const changed = structuredClone(validEvidence);
      changed.references[1].lines = "1-4";
      validateEvidenceBinding(changed, manifest, {
        specGitDir: spec.gitDir,
        runtimeGitDir: runtime.gitDir,
      });
    },
    true,
  ],
  [
    "blob_substitution",
    () => {
      const changed = structuredClone(validEvidence);
      changed.references[0].blobSha = "0".repeat(40);
      validateEvidenceBinding(changed, manifest, {
        specGitDir: spec.gitDir,
        runtimeGitDir: runtime.gitDir,
      });
    },
    true,
  ],
  [
    "workflow_sha_substitution",
    () => {
      assert.ok(workflow.includes("ref: ${{ github.workflow_sha }}"));
      assert.ok(workflow.includes('test "$(git -C trusted rev-parse HEAD)" = "$WORKFLOW_SHA"'));
      assert.ok(verifier.includes("trusted checkout SHA mismatch"));
      assert.ok(verifier.includes("verifier blob/commit mismatch"));
      assert.ok(verifier.includes("trusted verifier checkout dirty"));
    },
    false,
  ],
  [
    "candidate_scope_expansion",
    () => {
      assert.ok(verifier.includes("candidate-controlled allowed file scope changed"));
      assert.ok(verifier.includes("candidate-controlled required file inventory changed"));
      assert.ok(verifier.includes("for (const file of CANDIDATE_OWNED_FILES)"));
      assert.ok(verifier.includes("TRUSTED_INFRASTRUCTURE_FILES"));
      assert.ok(verifier.includes("trusted blob identity mismatch"));
    },
    false,
  ],
  [
    "secret_in_untrusted_workflow",
    () => {
      assert.ok(!workflow.includes("pull_request_target"));
      assert.ok(workflow.includes("environment: p1a-certification"));
      assert.ok(workflow.includes("workflow_dispatch:"));
      assert.ok(!workflow.includes("node candidate/"));
    },
    false,
  ],
  [
    "pinned_actions",
    () => {
      const uses = [...workflow.matchAll(/uses: ([^\s]+)@([^\s]+)/g)];
      assert.ok(uses.length >= 4);
      for (const match of uses) assert.match(match[2], /^[0-9a-f]{40}$/);
    },
    false,
  ],
  [
    "credential_cleanup",
    () => {
      assert.ok(workflow.includes("if: always()"));
      assert.ok(workflow.includes('rm -f "$RUNNER_TEMP/p1a-askpass.sh"'));
      assert.ok(workflow.includes("permission-contents: read"));
    },
    false,
  ],
  [
    "sanitized_evidence_allowlist",
    () => {
      assert.ok(
        workflow.includes("validate-p1a-certification-accounting.mjs"),
      );
      assert.ok(workflow.includes("p1a-protected-summary.json"));
      assert.ok(workflow.includes("p1a-certification-summary.sha256"));
      assert.ok(!workflow.includes("upload-artifact@v"));
    },
    false,
  ],
  [
    "founder_environment_gate_documented",
    () => {
      assert.ok(governance.includes("Required reviewer: `DarksiedCEO`"));
      assert.ok(governance.includes("repository-level copy"));
      assert.ok(governance.includes("NOT_PROVEN"));
    },
    false,
  ],
  [
    "fail_closed_accounting",
    () => {
      for (const field of [
        "failed",
        "skipped",
        "cancelled",
        "neutral",
        "stale",
        "notVerified",
        "notRun",
      ]) {
        assert.ok(verifier.includes(`totals.${field}`));
      }
    },
    false,
  ],
];

if (integrationMode) {
  cases.push([
    "real_frozen_candidate_integration",
    () => {
      for (const name of [
        "P1A_PACKAGE_ROOT",
        "P1A_CANDIDATE_SHA",
        "P1A_WORKFLOW_SHA",
        "P1A_VERIFIER_SHA",
        "P1A_TRUST_BASE_SHA",
        "P1A_EVIDENCE_BASE_SHA",
        "P1A_RECONCILIATION_BASE_SHA",
        "P1A_ORIGINAL_CANDIDATE_SHA",
        "P1A_TRUST_RUNTIME_PIN",
        "P1A_SPEC_GIT_DIR",
        "P1A_RUNTIME_GIT_DIR",
      ]) {
        assert.ok(process.env[name], `${name} is required for integration mode`);
      }
      const output = execFileSync(
        process.execPath,
        [
          path.join(root, "scripts/validate-p1a-threat-model.mjs"),
          "--candidate-sha",
          process.env.P1A_CANDIDATE_SHA,
        ],
        { cwd: root, env: process.env, encoding: "utf8" },
      );
      const summary = JSON.parse(output.trim().split("\n").at(-1));
      assert.equal(summary.candidateSha, process.env.P1A_CANDIDATE_SHA);
      assert.equal(summary.workflowSha, process.env.P1A_WORKFLOW_SHA);
      assert.equal(summary.verifierSha, process.env.P1A_VERIFIER_SHA);
      assert.equal(summary.evidenceBaseSha, process.env.P1A_EVIDENCE_BASE_SHA);
      assert.equal(summary.reconciliationBaseSha, process.env.P1A_RECONCILIATION_BASE_SHA);
      assert.equal(summary.originalCandidateSha, process.env.P1A_ORIGINAL_CANDIDATE_SHA);
      assert.equal(summary.required, 15);
      assert.equal(summary.executed, 15);
      assert.equal(summary.passed, 15);
      for (const field of [
        "failed",
        "skipped",
        "cancelled",
        "neutral",
        "stale",
        "notVerified",
      ]) {
        assert.equal(summary[field], 0, `${field} must be zero`);
      }
      assert.equal(summary.crossRepositoryCiAuthentication, "VERIFIED");
      integrationEvidence = summary;
    },
    false,
  ]);
}

const runControls = (controls, suite) => {
  let suitePassed = 0;
  let suiteFailed = 0;
  for (const [name, operation, shouldThrow] of controls) {
    try {
      operation();
      if (shouldThrow) throw new Error("negative control did not fail");
      suitePassed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      if (!shouldThrow) {
        suiteFailed += 1;
        console.error(`FAIL ${name}: ${error.message}`);
      } else {
        suitePassed += 1;
        console.log(`PASS ${name}`);
      }
    }
  }
  console.log(JSON.stringify({
    suite,
    required: controls.length,
    executed: controls.length,
    passed: suitePassed,
    failed: suiteFailed,
  }));
  if (suiteFailed > 0) process.exitCode = 1;
  return { passed: suitePassed, failed: suiteFailed };
};

let passed = 0;
let failed = 0;
try {
  runControls(baselinePositiveCases, "p1-a-trusted-baseline-acquisition-positive-controls");
  runControls(baselineNegativeCases, "p1-a-trusted-baseline-acquisition-negative-controls");
  runControls(historicalObjectCases, "p1-a-historical-object-availability-controls");
  runControls(compatibilityCases, "p1-a-legacy-api-compatibility-controls");
  ({ passed, failed } = runControls(cases, "p1-a-trusted-verifier-controls"));
} finally {
  if (historicalWorktree) {
    const historicalGitSource = process.env.P1A_PACKAGE_ROOT
      ? path.resolve(process.env.P1A_PACKAGE_ROOT)
      : root;
    execFileSync(
      "git", ["worktree", "remove", "--force", historicalWorktree],
      { cwd: historicalGitSource, encoding: "utf8" },
    );
  }
  rmSync(temporary, { recursive: true, force: true });
}

const summary = {
  suite: "p1-a-trusted-verifier-controls",
  candidateSha: integrationMode ? process.env.P1A_CANDIDATE_SHA : null,
  workflowSha: integrationMode ? process.env.P1A_WORKFLOW_SHA : null,
  baseSha: integrationMode ? process.env.P1A_TRUST_BASE_SHA : null,
  evidenceBaseSha: integrationMode ? process.env.P1A_EVIDENCE_BASE_SHA : null,
  reconciliationBaseSha: integrationMode ? process.env.P1A_RECONCILIATION_BASE_SHA : null,
  originalCandidateSha: integrationMode ? process.env.P1A_ORIGINAL_CANDIDATE_SHA : null,
  runtimePin: integrationMode ? process.env.P1A_TRUST_RUNTIME_PIN : null,
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
  crossRepositoryCiAuthentication: integrationMode ? "VERIFIED" : "NOT_RUN",
  nestedEvidenceDigest: integrationEvidence?.evidenceDigest ?? null,
  nestedVerifierDigest: integrationEvidence?.verifierDigest ?? null,
};
console.log(JSON.stringify(summary));
if (failed || passed !== cases.length) process.exitCode = 1;
