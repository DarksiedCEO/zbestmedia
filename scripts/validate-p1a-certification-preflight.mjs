import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_REMOTE, CLEAN_BASE_SHA, exactDigest, exactSha, sha256, validateCandidateScope, validateIdentityTuple, validateSeparatedRoots } from "./p1a-certification-core.mjs";

const HERMETIC_ENV = Object.freeze({ PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
function git(root, args) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-C", root, ...args], { encoding: "utf8", env: HERMETIC_ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    assert.ok(key?.startsWith("--") && value !== undefined, "malformed CLI arguments");
    assert.ok(!(key.slice(2) in values), `duplicate argument ${key}`);
    values[key.slice(2)] = value;
  }
  return values;
}
export function runPreflight(args) {
  const trustedRoot = realpathSync(args["trusted-root"]), candidateRoot = realpathSync(args["candidate-root"]);
  validateSeparatedRoots(trustedRoot, candidateRoot);
  const scopePath = realpathSync(args["scope-file"]);
  assert.ok(!scopePath.startsWith(`${candidateRoot}${path.sep}`), "scope declaration cannot come from candidate");
  const candidateSha = exactSha(args.candidate, "candidate SHA"), workflowSha = exactSha(args.workflow, "workflow SHA"), runtimePin = exactSha(args.runtime, "runtime pin"), scopeDigest = exactDigest(args["scope-digest"], "scope digest");
  assert.equal(git(trustedRoot, ["rev-parse", "HEAD"]), workflowSha, "trusted HEAD mismatch");
  assert.equal(git(candidateRoot, ["rev-parse", "HEAD"]), candidateSha, "candidate HEAD mismatch");
  assert.equal(git(candidateRoot, ["remote", "get-url", "origin"]), CANONICAL_REMOTE, "candidate remote mismatch");
  for (const sha of [CLEAN_BASE_SHA, workflowSha, candidateSha]) assert.equal(git(candidateRoot, ["cat-file", "-t", sha]), "commit", `missing commit ${sha}`);
  git(candidateRoot, ["merge-base", "--is-ancestor", CLEAN_BASE_SHA, workflowSha]);
  git(candidateRoot, ["merge-base", "--is-ancestor", workflowSha, candidateSha]);
  const verifierDigest = sha256(readFileSync(path.join(trustedRoot, "scripts/validate-p1a-certification-accounting.mjs")));
  const declaredScope = readFileSync(scopePath, "utf8");
  const changedOutput = git(candidateRoot, ["diff", "--name-only", "--no-renames", `${workflowSha}..${candidateSha}`, "--"]);
  const changedPaths = changedOutput ? changedOutput.split("\n") : [];
  validateCandidateScope({ declaredScope, declaredScopeDigest: scopeDigest, changedPaths });
  validateIdentityTuple({ repository: args.repository, remote: CANONICAL_REMOTE, authorizedBaseSha: CLEAN_BASE_SHA, workflowSha, verifierSha: workflowSha, candidateSha, runtimePin, verifierDigest, scopeDigest, evidencePackageDigest: "0".repeat(64) });
  return { suite: "p1-a-clean-certification-preflight", authorizedBaseSha: CLEAN_BASE_SHA, workflowSha, verifierSha: workflowSha, verifierDigest, candidateSha, runtimePin, scopeDigest, declaredPathCount: changedPaths.length, hermeticGit: "ENFORCED", rootSeparation: "VERIFIED", ancestry: "VERIFIED", scope: "VERIFIED" };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runPreflight(parseArguments(process.argv.slice(2)))));
