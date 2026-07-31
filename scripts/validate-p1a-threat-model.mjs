import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = process.env.P1A_PACKAGE_ROOT
  ? path.resolve(process.env.P1A_PACKAGE_ROOT)
  : moduleRoot;
const load = (file) =>
  JSON.parse(readFileSync(path.join(candidateRoot, file), "utf8"));
const unique = (items, label) =>
  assert.equal(new Set(items).size, items.length, `${label}: duplicate`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const AUTHORIZED_BASE =
  "7056ea4ce24379c93549f0ac9b45ddd7a2600dd6";
export const TRUSTED_RECONCILIATION_BASE =
  "5056fb0df6e1ef739231cd2273a453fb1c644273";
export const ORIGINAL_CANDIDATE =
  "365c59757756f3f91480d3bfeb841b543010201f";
export const AUTHORIZED_RUNTIME =
  "94376718e07df2e9d44864ed0394d58219224e61";
export const AUTHORIZED_REPOSITORIES = {
  base: "DarksiedCEO/zbestmedia",
  runtime: "DarksiedCEO/zbestmedia-ui",
};
export const AUTHORIZED_CANDIDATE_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/evidence-register.json",
  "docs/security/p1-a/known-limitations.md",
  "docs/security/p1-a/model.json",
  "docs/security/p1-a/threat-model.md",
  "docs/security/p1-a/validation-manifest.json",
  "package.json",
  "scripts/test-p1a-threat-model.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const REQUIRED_CANDIDATE_FILES = [...AUTHORIZED_CANDIDATE_FILES];
export const TRUSTED_INFRASTRUCTURE_FILES = [
  ".github/CODEOWNERS",
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/detect-p1a-ordinary-ci-secrets.mjs",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-ci-secret-detector.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const CANDIDATE_OWNED_FILES = [
  ".github/workflows/ci.yml",
  "docs/security/p1-a/evidence-register.json",
  "docs/security/p1-a/known-limitations.md",
  "docs/security/p1-a/model.json",
  "docs/security/p1-a/threat-model.md",
  "docs/security/p1-a/validation-manifest.json",
  "package.json",
  "scripts/test-p1a-threat-model.mjs",
];
export const EXACT_CANDIDATE_OWNED_FILES = CANDIDATE_OWNED_FILES.filter(
  (file) => file !== ".github/workflows/ci.yml",
);
export const AMENDMENT_CONTROLLED_FILES = [
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const REQUIRED_CHECKS = [
  "manifest_identity",
  "trust_anchor",
  "file_scope",
  "evidence_integrity",
  "evidence_binding",
  "required_coverage",
  "id_uniqueness",
  "cross_references",
  "authority_completeness",
  "separation_rules",
  "tenant_operations",
  "credential_custody",
  "escalation_completeness",
  "documentation_consistency",
  "negative_controls",
];

export class NotVerifiedError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotVerifiedError";
    this.notVerified = true;
  }
}

export function assertAuthenticationStatus(declared, observed) {
  assert.ok(
    ["VERIFIED", "NOT_PROVEN"].includes(declared),
    `unsupported declared authentication status ${JSON.stringify(declared)}`,
  );
  assert.ok(
    ["VERIFIED", "NOT_VERIFIED"].includes(observed),
    `unsupported observed authentication status ${JSON.stringify(observed)}`,
  );
  const expected = observed === "VERIFIED" ? "VERIFIED" : "NOT_PROVEN";
  assert.equal(
    declared,
    expected,
    `stale authentication status: declared ${declared}, observed ${observed}`,
  );
  return observed;
}

export function parseLineRange(spec, label) {
  const match = /^(\d+)-(\d+)$/.exec(spec);
  assert.ok(match, `${label}: malformed line range ${JSON.stringify(spec)}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  assert.ok(start >= 1, `${label}: line range start must be >= 1`);
  assert.ok(end >= start, `${label}: inverted line range ${start}-${end}`);
  return { start, end };
}

export function assertSafeRepoPath(value, label) {
  assert.ok(typeof value === "string" && value, `${label}: empty path`);
  assert.ok(!value.includes("\0"), `${label}: NUL byte in path`);
  assert.ok(
    /^[\x20-\x7e]+$/.test(value),
    `${label}: non-ASCII or control character in path`,
  );
  assert.ok(
    !/%[0-9a-fA-F]{2}/.test(value),
    `${label}: percent-encoded sequence in path`,
  );
  assert.ok(!value.includes("\\"), `${label}: backslash in path`);
  assert.ok(!value.startsWith("/"), `${label}: absolute path`);
  assert.ok(!/^[A-Za-z]:/.test(value), `${label}: drive-absolute path`);
  const segments = value.split("/");
  assert.ok(
    !segments.includes(".") && !segments.includes(".."),
    `${label}: traversal segment`,
  );
  assert.ok(!segments.some((segment) => !segment), `${label}: empty segment`);
  assert.equal(path.posix.normalize(value), value, `${label}: non-normal path`);
  return value;
}

function gitObject(gitDir, args) {
  try {
    return execFileSync("git", ["--git-dir", gitDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    throw new NotVerifiedError(
      `object query failed: ${String(error.message).split("\n")[0]}`,
    );
  }
}

export function validateEvidenceBinding(evidence, manifest, options = {}) {
  const { specGitDir, runtimeGitDir } = options;
  if (!specGitDir || !runtimeGitDir) {
    throw new NotVerifiedError(
      "specification/runtime object sources absent (fail-closed)",
    );
  }
  for (const [gitDir, sha, label] of [
    [specGitDir, manifest.authorizedBaseSha, "base"],
    [runtimeGitDir, manifest.runtimeEvidenceSha, "runtime"],
  ]) {
    const type = gitObject(gitDir, ["cat-file", "-t", sha]).trim();
    assert.equal(type, "commit", `${label} pin is not a commit`);
  }
  for (const reference of evidence.references) {
    const runtime =
      reference.repository === AUTHORIZED_REPOSITORIES.runtime;
    const gitDir = runtime ? runtimeGitDir : specGitDir;
    const safePath = assertSafeRepoPath(reference.path, reference.id);
    const { start, end } = parseLineRange(reference.lines, reference.id);
    const tree = gitObject(gitDir, [
      "ls-tree",
      reference.sha,
      "--",
      safePath,
    ]).trim();
    assert.ok(tree, `${reference.id}: cited path absent`);
    const [mode, type, objectId] = tree.split(/\s+/);
    assert.equal(type, "blob", `${reference.id}: cited object is not a blob`);
    assert.ok(
      mode === "100644" || mode === "100755",
      `${reference.id}: unsafe object mode ${mode}`,
    );
    assert.equal(
      objectId,
      reference.blobSha,
      `${reference.id}: blob identity mismatch`,
    );
    const blob = gitObject(gitDir, ["cat-file", "blob", objectId]);
    const newlines = (blob.match(/\n/g) || []).length;
    const lineCount =
      blob.length === 0 ? 0 : blob.endsWith("\n") ? newlines : newlines + 1;
    assert.ok(
      end <= lineCount,
      `${reference.id}: range ${start}-${end} exceeds ${lineCount} lines`,
    );
  }
}

function validateTrustedIdentity() {
  const workflowSha = process.env.P1A_WORKFLOW_SHA;
  const verifierSha = process.env.P1A_VERIFIER_SHA;
  assert.match(workflowSha ?? "", /^[0-9a-f]{40}$/, "workflow SHA absent");
  assert.match(verifierSha ?? "", /^[0-9a-f]{40}$/, "verifier SHA absent");
  assert.equal(verifierSha, workflowSha, "workflow/verifier SHA mismatch");
  const trustedHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: moduleRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(trustedHead, verifierSha, "trusted checkout SHA mismatch");
  const verifierPath = "scripts/validate-p1a-threat-model.mjs";
  const verifierBlobSha = execFileSync(
    "git",
    ["rev-parse", `${verifierSha}:${verifierPath}`],
    { cwd: moduleRoot, encoding: "utf8" },
  ).trim();
  const workingBlobSha = execFileSync("git", ["hash-object", verifierPath], {
    cwd: moduleRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(workingBlobSha, verifierBlobSha, "verifier blob/commit mismatch");
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: moduleRoot,
      encoding: "utf8",
    }).trim(),
    "",
    "trusted verifier checkout dirty",
  );
  return { workflowSha, verifierSha, verifierBlobSha };
}

function validateManifest(model, evidence, manifest) {
  assert.equal(manifest.authorizedBaseSha, AUTHORIZED_BASE);
  assert.equal(manifest.runtimeEvidenceSha, AUTHORIZED_RUNTIME);
  assert.equal(model.sources.specification.revision, AUTHORIZED_BASE);
  assert.equal(model.sources.runtime.revision, AUTHORIZED_RUNTIME);
  assert.deepEqual(manifest.requiredTests, REQUIRED_CHECKS);
  assert.deepEqual(
    [...manifest.allowedRemediationFiles].sort(),
    [...AUTHORIZED_CANDIDATE_FILES].sort(),
    "candidate-controlled allowed file scope changed",
  );
  assert.deepEqual(
    [...manifest.requiredFiles].sort(),
    [...REQUIRED_CANDIDATE_FILES].sort(),
    "candidate-controlled required file inventory changed",
  );
  assert.equal(manifest.crossRepositoryCiAuthentication, "VERIFIED");
  assert.deepEqual(model.gate, {
    runtimeChanged: false,
    productionClaimed: false,
    p1bAuthorized: false,
    selfCertified: false,
  });
  unique(evidence.references.map((item) => item.id), "evidence IDs");
  for (const reference of evidence.references) {
    assert.match(reference.sha, /^[0-9a-f]{40}$/);
    assert.match(reference.blobSha ?? "", /^[0-9a-f]{40}$/);
    assertSafeRepoPath(reference.path, reference.id);
    parseLineRange(reference.lines, reference.id);
    const expectedRepository =
      reference.sha === AUTHORIZED_BASE
        ? AUTHORIZED_REPOSITORIES.base
        : reference.sha === AUTHORIZED_RUNTIME
          ? AUTHORIZED_REPOSITORIES.runtime
          : null;
    assert.ok(expectedRepository, `${reference.id}: unauthorized evidence SHA`);
    assert.equal(reference.repository, expectedRepository);
  }
}

function gitLines(git, ...args) {
  return git(...args).split("\n").filter(Boolean).sort();
}

function blobAt(git, commit, file) {
  try {
    return git("rev-parse", `${commit}:${file}`);
  } catch {
    return null;
  }
}

const REQUIRED_CI_ADDITION = [
  "      - name: P1-A validator control suite (hermetic)",
  "        run: pnpm test:p1a-threat-model",
  "",
  "",
].join("\n");

function validateCandidateCi(git, candidateSha, reconciliationBaseSha) {
  const path = ".github/workflows/ci.yml";
  const entry = git("ls-tree", candidateSha, "--", path);
  assert.match(entry, /^100644\s+blob\s+[0-9a-f]{40}\t/, `${path}: unsafe entry`);
  const candidate = git("show", `${candidateSha}:${path}`);
  const trusted = `${git("show", `${reconciliationBaseSha}:${path}`)}\n`;
  assert.equal(candidate.split(REQUIRED_CI_ADDITION).length - 1, 1,
    `${path}: required hermetic step missing or duplicated`);
  assert.equal(`${candidate.replace(REQUIRED_CI_ADDITION, "")}\n`, trusted,
    `${path}: changes exceed the exact hermetic step`);
  for (const forbidden of [
    "P1A_RUNTIME_APP_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----", "pull_request_target", "node candidate/",
  ]) assert.ok(!candidate.includes(forbidden), `${path}: forbidden ${forbidden}`);
  assert.ok(!/\$\{\{\s*secrets\s*\./.test(candidate), `${path}: protected secret reference`);
  for (const required of [
    "pnpm test:p1a-threat-model", "node scripts/test-p1a-trusted-verifier.mjs",
    "node scripts/test-p1a-ci-secret-detector.mjs",
    "node scripts/detect-p1a-ordinary-ci-secrets.mjs",
    "P1-A private cross-repository suites are intentionally unavailable",
  ]) assert.ok(candidate.includes(required), `${path}: missing ${required}`);
}

export function validateDualBaseScope({
  git,
  candidateSha,
  evidenceBaseSha,
  reconciliationBaseSha,
  originalCandidateSha,
  workflowSha,
}) {
  for (const [label, value, expected] of [
    ["evidence/model base", evidenceBaseSha, AUTHORIZED_BASE],
    ["trusted reconciliation base", reconciliationBaseSha, TRUSTED_RECONCILIATION_BASE],
    ["original candidate", originalCandidateSha, ORIGINAL_CANDIDATE],
  ]) {
    assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} SHA absent`);
    assert.equal(value, expected, `${label} identity mismatch`);
    assert.equal(git("cat-file", "-t", value), "commit", `${label} is not a commit`);
  }
  assert.match(candidateSha ?? "", /^[0-9a-f]{40}$/, "candidate SHA absent");
  assert.match(workflowSha ?? "", /^[0-9a-f]{40}$/, "workflow SHA absent");
  assert.equal(git("cat-file", "-t", candidateSha), "commit", "candidate is not a commit");
  assert.equal(git("cat-file", "-t", workflowSha), "commit", "workflow is not a commit");
  git("merge-base", "--is-ancestor", evidenceBaseSha, originalCandidateSha);
  git("merge-base", "--is-ancestor", evidenceBaseSha, reconciliationBaseSha);
  git("merge-base", "--is-ancestor", reconciliationBaseSha, workflowSha);
  git("merge-base", "--is-ancestor", workflowSha, candidateSha);
  git("merge-base", "--is-ancestor", originalCandidateSha, candidateSha);

  const historical = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${evidenceBaseSha}..${originalCandidateSha}`,
  );
  assert.deepEqual(historical, [...AUTHORIZED_CANDIDATE_FILES].sort(),
    "historical evidence/model scope mismatch");
  const trusted = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${evidenceBaseSha}..${reconciliationBaseSha}`,
  );
  assert.deepEqual(trusted, [...TRUSTED_INFRASTRUCTURE_FILES].sort(),
    "trusted infrastructure scope mismatch");
  const amendment = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${reconciliationBaseSha}..${workflowSha}`,
  );
  assert.deepEqual(amendment, [...AMENDMENT_CONTROLLED_FILES].sort(),
    "trusted amendment scope mismatch");
  const reconciled = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${reconciliationBaseSha}..${candidateSha}`,
  );
  assert.deepEqual(reconciled, [...new Set([...AMENDMENT_CONTROLLED_FILES, ...CANDIDATE_OWNED_FILES])].sort(),
    "reconciled candidate scope mismatch");

  for (const file of TRUSTED_INFRASTRUCTURE_FILES) {
    if (file === ".github/workflows/ci.yml") continue;
    const authority = AMENDMENT_CONTROLLED_FILES.includes(file) ? workflowSha : reconciliationBaseSha;
    assert.equal(blobAt(git, candidateSha, file), blobAt(git, authority, file),
      `${file}: trusted blob identity mismatch`);
  }
  for (const file of AMENDMENT_CONTROLLED_FILES) {
    assert.equal(blobAt(git, candidateSha, file), blobAt(git, workflowSha, file),
      `${file}: amended trusted blob identity mismatch`);
  }
  for (const file of EXACT_CANDIDATE_OWNED_FILES) {
    const expected = blobAt(git, originalCandidateSha, file);
    assert.ok(expected, `${file}: original candidate blob absent`);
    assert.equal(blobAt(git, candidateSha, file), expected,
      `${file}: candidate evidence blob identity mismatch`);
  }
  validateCandidateCi(git, candidateSha, reconciliationBaseSha);
  return { historical, trusted, amendment, reconciled };
}

function validateGitScope(manifest, candidateSha) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: candidateRoot,
      encoding: "utf8",
    }).trim();
  assert.equal(git("rev-parse", "HEAD"), candidateSha);
  validateDualBaseScope({
    git,
    candidateSha,
    evidenceBaseSha: process.env.P1A_EVIDENCE_BASE_SHA,
    reconciliationBaseSha: process.env.P1A_RECONCILIATION_BASE_SHA,
    originalCandidateSha: process.env.P1A_ORIGINAL_CANDIDATE_SHA,
    workflowSha: process.env.P1A_WORKFLOW_SHA,
  });
  for (const file of CANDIDATE_OWNED_FILES) {
    const stat = lstatSync(path.join(candidateRoot, file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `${file}: unsafe`);
  }
  assert.equal(git("status", "--porcelain"), "", "candidate worktree dirty");
}

function evidenceDigest() {
  const files = [
    "docs/security/p1-a/model.json",
    "docs/security/p1-a/evidence-register.json",
    "docs/security/p1-a/validation-manifest.json",
    "docs/security/p1-a/threat-model.md",
  ];
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(path.join(candidateRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function runCheck(name, context) {
  const { model, evidence, manifest, markdown, candidateSha } = context;
  switch (name) {
    case "manifest_identity":
      validateManifest(model, evidence, manifest);
      return;
    case "trust_anchor":
      assert.equal(process.env.P1A_TRUST_BASE_SHA, AUTHORIZED_BASE);
      assert.equal(process.env.P1A_EVIDENCE_BASE_SHA, AUTHORIZED_BASE);
      assert.equal(process.env.P1A_RECONCILIATION_BASE_SHA, TRUSTED_RECONCILIATION_BASE);
      assert.equal(process.env.P1A_ORIGINAL_CANDIDATE_SHA, ORIGINAL_CANDIDATE);
      assert.equal(process.env.P1A_TRUST_RUNTIME_PIN, AUTHORIZED_RUNTIME);
      return;
    case "file_scope":
      validateGitScope(manifest, candidateSha);
      return;
    case "evidence_integrity":
      validateManifest(model, evidence, manifest);
      return;
    case "evidence_binding":
      validateEvidenceBinding(evidence, manifest, {
        specGitDir: process.env.P1A_SPEC_GIT_DIR,
        runtimeGitDir: process.env.P1A_RUNTIME_GIT_DIR,
      });
      context.authenticationState = assertAuthenticationStatus(
        manifest.crossRepositoryCiAuthentication,
        "VERIFIED",
      );
      return;
    case "required_coverage":
      assert.equal(model.actors.length, 22);
      assert.equal(model.actions.length, 28);
      assert.equal(model.threats.length, 31);
      assert.equal(model.controls.length, 13);
      return;
    case "id_uniqueness":
      for (const rows of [
        model.actors,
        model.actions,
        model.assets,
        model.boundaries,
        model.flows,
        model.controls,
        model.threats,
        model.escalationChains,
      ]) {
        unique(rows.map((item) => item.id), "model IDs");
      }
      return;
    case "cross_references": {
      const evidenceIds = new Set(evidence.references.map((item) => item.id));
      for (const threat of model.threats) {
        assert.ok(threat.evidenceRefs.length && threat.controlIds.length);
        for (const id of threat.evidenceRefs) assert.ok(evidenceIds.has(id));
      }
      return;
    }
    case "authority_completeness":
      assert.equal(model.authorityPolicy.rules.length, 616);
      unique(
        model.authorityPolicy.rules.map(
          (rule) => `${rule.actorId}:${rule.actionId}`,
        ),
        "authority pairs",
      );
      return;
    case "separation_rules":
      assert.equal(model.authorityPolicy.separationRules.length, 9);
      assert.equal(model.gate.selfCertified, false);
      return;
    case "tenant_operations":
      assert.equal(model.tenantOperations.length, 18);
      assert.equal(model.tenantPropagation.length, 7);
      assert.equal(model.tenantOperationPolicy.denialBehavior, "DENY_AND_LOG");
      return;
    case "credential_custody":
      assert.equal(model.credentialClasses.length, 10);
      assert.equal(model.credentialPolicy.readerActorIds.length, 0);
      return;
    case "escalation_completeness":
      assert.equal(model.escalationChains.length, model.threats.length);
      unique(
        model.escalationChains.map((item) => item.detectionSignal),
        "detection signals",
      );
      return;
    case "documentation_consistency": {
      const match = markdown.match(/```json p1a-summary\n([^\n]+)\n```/);
      assert.ok(match, "documentation summary absent");
      const summary = JSON.parse(match[1]);
      assert.equal(summary.authorityRules, 616);
      assert.equal(summary.threats, 31);
      assert.equal(summary.controls, 13);
      return;
    }
    case "negative_controls": {
      const controls = readFileSync(
        path.join(moduleRoot, "scripts/test-p1a-trusted-verifier.mjs"),
        "utf8",
      );
      for (const id of [
        "declared_not_proven_while_verified",
        "declared_verified_while_not_verified",
        "missing_runtime_store",
        "path_traversal",
        "encoded_traversal",
        "impossible_range",
        "blob_substitution",
        "workflow_sha_substitution",
        "candidate_scope_expansion",
        "secret_in_untrusted_workflow",
        "dual_base_valid_reconciliation",
        "wrong_evidence_model_base",
        "candidate_modifies_trusted_verifier",
      ]) {
        assert.ok(controls.includes(id), `missing protected control ${id}`);
      }
      return;
    }
    default:
      throw new Error(`unknown required check ${name}`);
  }
}

function main() {
  const candidateIndex = process.argv.indexOf("--candidate-sha");
  const candidateSha =
    candidateIndex >= 0
      ? process.argv[candidateIndex + 1]
      : process.env.P1A_CANDIDATE_SHA;
  const { workflowSha, verifierSha, verifierBlobSha } =
    validateTrustedIdentity();
  const model = load("docs/security/p1-a/model.json");
  const evidence = load("docs/security/p1-a/evidence-register.json");
  const manifest = load("docs/security/p1-a/validation-manifest.json");
  const markdown = readFileSync(
    path.join(candidateRoot, "docs/security/p1-a/threat-model.md"),
    "utf8",
  );
  const context = {
    model,
    evidence,
    manifest,
    markdown,
    candidateSha,
    authenticationState: "NOT_VERIFIED",
  };
  const totals = {
    required: REQUIRED_CHECKS.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    neutral: 0,
    stale: 0,
    notVerified: 0,
    notRun: 0,
  };
  for (const name of REQUIRED_CHECKS) {
    totals.executed += 1;
    try {
      runCheck(name, context);
      totals.passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      if (error?.notVerified) {
        totals.notVerified += 1;
        console.error(`NOT_VERIFIED ${name}: ${error.message}`);
      } else {
        totals.failed += 1;
        console.error(`FAIL ${name}: ${error.message}`);
      }
    }
  }
  const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
  console.log(
    JSON.stringify({
      suite: "p1-a-trusted-certification",
      workflowSha,
      verifierSha,
      verifierBlobSha,
      verifierDigest: sha256(verifierBytes),
      candidateSha,
      baseSha: AUTHORIZED_BASE,
      evidenceBaseSha: AUTHORIZED_BASE,
      reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
      originalCandidateSha: ORIGINAL_CANDIDATE,
      runtimePin: AUTHORIZED_RUNTIME,
      evidenceDigest: evidenceDigest(),
      crossRepositoryCiAuthentication: context.authenticationState,
      ...totals,
      authorityRules: model.authorityPolicy.rules.length,
      threats: model.threats.length,
      controls: model.controls.length,
    }),
  );
  if (
    totals.executed !== totals.required ||
    totals.passed !== totals.required ||
    totals.failed ||
    totals.skipped ||
    totals.cancelled ||
    totals.neutral ||
    totals.stale ||
    totals.notVerified ||
    totals.notRun
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
