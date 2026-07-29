import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertAuthenticationStatus,
  assertSafeRepoPath,
  parseLineRange,
  validateEvidenceBinding,
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
      assert.ok(verifier.includes("for (const file of REQUIRED_CANDIDATE_FILES)"));
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
      assert.ok(workflow.includes("Object.keys(x).sort()"));
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
      ]) {
        assert.ok(verifier.includes(`totals.${field}`));
      }
    },
    false,
  ],
];

let passed = 0;
let failed = 0;
try {
  for (const [name, operation, shouldThrow] of cases) {
    try {
      operation();
      if (shouldThrow) throw new Error("negative control did not fail");
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      if (!shouldThrow) {
        failed += 1;
        console.error(`FAIL ${name}: ${error.message}`);
      } else {
        passed += 1;
        console.log(`PASS ${name}`);
      }
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const summary = {
  suite: "p1-a-trusted-verifier-controls",
  required: cases.length,
  executed: cases.length,
  passed,
  failed,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  notVerified: 0,
};
console.log(JSON.stringify(summary));
if (failed || passed !== cases.length) process.exitCode = 1;
