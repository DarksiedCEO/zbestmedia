import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_REMOTE, CANONICAL_REPOSITORY, CLEAN_BASE_SHA, parseDeclaredScope, sha256, validateCandidateScope, validateIdentityTuple, validateSeparatedRoots } from "./p1a-certification-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(path.join(root, ".github/workflows/p1a-certify-clean.yml"), "utf8");
const preflight = readFileSync(path.join(root, "scripts/validate-p1a-certification-preflight.mjs"), "utf8");
const accounting = readFileSync(path.join(root, "scripts/validate-p1a-certification-accounting.mjs"), "utf8");
const hermeticGit = readFileSync(path.join(root, "scripts/p1a-hermetic-git.mjs"), "utf8");
const scope = ".github/workflows/ci.yml\nscripts/example.mjs\n";
const identity = { repository: CANONICAL_REPOSITORY, remote: CANONICAL_REMOTE, authorizedBaseSha: CLEAN_BASE_SHA, workflowSha: "1".repeat(40), verifierSha: "1".repeat(40), candidateSha: "2".repeat(40), runtimePin: "3".repeat(40), verifierDigest: "4".repeat(64), scopeDigest: "5".repeat(64), evidencePackageDigest: "6".repeat(64) };

const cases = [
  ["identity_accepts_exact_clean_tuple", () => validateIdentityTuple(identity), false],
  ["uppercase_candidate_rejected", () => validateIdentityTuple({ ...identity, candidateSha: "A".repeat(40) }), true],
  ["wrong_repository_rejected", () => validateIdentityTuple({ ...identity, repository: "attacker/fork" }), true],
  ["wrong_remote_rejected", () => validateIdentityTuple({ ...identity, remote: "https://github.com/attacker/fork.git" }), true],
  ["abandoned_base_rejected", () => validateIdentityTuple({ ...identity, authorizedBaseSha: "7".repeat(40) }), true],
  ["candidate_verifier_rejected", () => validateIdentityTuple({ ...identity, verifierSha: identity.candidateSha }), true],
  ["same_root_rejected", () => validateSeparatedRoots("/tmp/a", "/tmp/a"), true],
  ["nested_candidate_root_rejected", () => validateSeparatedRoots("/tmp/a", "/tmp/a/candidate"), true],
  ["nested_trusted_root_rejected", () => validateSeparatedRoots("/tmp/a/trusted", "/tmp/a"), true],
  ["separate_roots_accepted", () => validateSeparatedRoots("/tmp/a", "/tmp/b"), false],
  ["exact_scope_accepted", () => validateCandidateScope({ declaredScope: scope, declaredScopeDigest: sha256(scope), changedPaths: [".github/workflows/ci.yml", "scripts/example.mjs"] }), false],
  ["expanded_scope_rejected", () => validateCandidateScope({ declaredScope: scope, declaredScopeDigest: sha256(scope), changedPaths: [".github/workflows/ci.yml", "docs/extra.md", "scripts/example.mjs"] }), true],
  ["scope_digest_substitution_rejected", () => validateCandidateScope({ declaredScope: scope, declaredScopeDigest: "0".repeat(64), changedPaths: [".github/workflows/ci.yml", "scripts/example.mjs"] }), true],
  ["duplicate_scope_rejected", () => parseDeclaredScope("a\na\n"), true],
  ["unsorted_scope_rejected", () => parseDeclaredScope("b\na\n"), true],
  ["path_escape_rejected", () => parseDeclaredScope("../escape\n"), true],
  ["git_internals_rejected", () => parseDeclaredScope(".git/config\n"), true],
];

let passed = 0;
for (const [name, execute, shouldReject] of cases) {
  let rejected = false;
  try { execute(); } catch { rejected = true; }
  assert.equal(rejected, shouldReject, name);
  passed += 1;
  console.log(`PASS ${name}`);
}

const workflowControls = [
  ["read_only_permissions", /^permissions:\n  contents: read$/m],
  ["immutable_workflow_checkout", /ref: \$\{\{ github\.workflow_sha \}\}/],
  ["candidate_data_checkout", /ref: \$\{\{ inputs\.candidate_sha \}\}/],
  ["both_credentials_disabled", /persist-credentials: false[\s\S]*persist-credentials: false/],
  ["preflight_from_trusted", /node trusted\/scripts\/validate-p1a-certification-preflight\.mjs/],
  ["nested_from_trusted", /node trusted\/scripts\/validate-p1a-threat-model\.mjs/],
  ["integration_from_trusted", /node trusted\/scripts\/test-p1a-trusted-verifier\.mjs/],
  ["accounting_from_trusted", /node trusted\/scripts\/validate-p1a-certification-accounting\.mjs/],
  ["clean_base_bound", new RegExp(CLEAN_BASE_SHA)],
  ["scope_digest_bound", /candidate_scope_sha256/],
  ["immutable_action_pins", /actions\/checkout@[0-9a-f]{40}[\s\S]*actions\/checkout@[0-9a-f]{40}[\s\S]*actions\/upload-artifact@[0-9a-f]{40}/],
  ["cleanup_unconditional", /if: always\(\)/],
  ["oidc_permission", /id-token: write/],
  ["oidc_crypto_verifier", /node trusted\/scripts\/verify-p1a-oidc\.mjs/],
  ["trusted_evidence_acquisition", /node trusted\/scripts\/acquire-p1a-evidence-package\.mjs/],
  ["workflow_path_blob_binding", /node trusted\/scripts\/bind-p1a-workflow-identity\.mjs/],
  ["candidate_root_contract", /P1A_CANDIDATE_DATA_ROOT: \$\{\{ github\.workspace \}\}\/candidate/],
];
for (const [name, pattern] of workflowControls) { assert.match(workflow, pattern, name); passed += 1; console.log(`PASS ${name}`); }
assert.doesNotMatch(workflow, /365c5975|7056ea4c|5056fb0d/, "abandoned lineage must not be active authority");
assert.match(preflight, /hermeticGit/);
assert.match(hermeticGit, /HERMETIC_GIT_EXECUTABLE = "\/usr\/bin\/git"/);
assert.match(accounting, /flag: "wx"/);
passed += 4;

console.log(JSON.stringify({ suite: "p1-a-protected-certification-orchestration", required: cases.length + workflowControls.length + 4, executed: cases.length + workflowControls.length + 4, passed, failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0 }));
