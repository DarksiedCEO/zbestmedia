import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_BASE, ORIGINAL_CANDIDATE, TRUSTED_RECONCILIATION_BASE,
  AMENDMENT_CONTROLLED_FILES, CANDIDATE_OWNED_FILES, validateDualBaseScope,
} from "./validate-p1a-threat-model.mjs";
import { validateCertificationBundle } from "./validate-p1a-certification-accounting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function candidate({ omit, add, mutate, ciAppend = "", omitOriginalParent = false } = {}) {
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
    const trustedCi = git("show", `${TRUSTED_RECONCILIATION_BASE}:.github/workflows/ci.yml`);
    const marker = "      - name: P1-A trusted-bootstrap exact-SHA identity";
    const addition = "      - name: P1-A validator control suite (hermetic)\n        run: pnpm test:p1a-threat-model\n\n";
    const resolvedCi = `${trustedCi.replace(marker, `${addition}${marker}`)}${ciAppend}`;
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

let passed = 0;
let failed = 0;
try {
  for (const [name, operation, shouldReject] of cases) {
    let rejected = false;
    let detail = "";
    try { operation(); } catch (error) { rejected = true; detail = error.message; }
    if (rejected === shouldReject) { passed += 1; console.log(`PASS ${name}`); }
    else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
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
if (failed || passed !== cases.length) process.exitCode = 1;
