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
import { fileURLToPath } from "node:url";
import {
  assertAuthenticationStatus,
  assertTrustAnchor,
  assertSafeRepoPath,
  AUTHORIZED_BASE,
  AUTHORIZED_RUNTIME,
  ORIGINAL_CANDIDATE,
  parseLineRange,
  runPackage,
  TRUSTED_RECONCILIATION_BASE,
  validateData,
  validateEvidenceBinding,
  validateGit,
} from "./validate-p1a-threat-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(
  path.join(root, ".github/workflows/p1a-certify.yml"),
  "utf8",
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

const exactOriginal = (file) =>
  execFileSync("git", ["show", `${ORIGINAL_CANDIDATE}:${file}`], {
    cwd: root,
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

const scopeManifest = (base, allowed = ["keep.txt"], required = ["keep.txt"]) => ({
  authorizedBaseSha: base,
  allowedRemediationFiles: allowed,
  requiredFiles: required,
});

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
      assert.ok(verifier.includes('assert.match(value ?? "", /^[0-9a-f]{40}$/'));
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
  runControls(compatibilityCases, "p1-a-legacy-api-compatibility-controls");
  ({ passed, failed } = runControls(cases, "p1-a-trusted-verifier-controls"));
} finally {
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
