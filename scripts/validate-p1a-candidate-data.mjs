import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_REMOTE, CLEAN_BASE_SHA, exactSha } from "./p1a-certification-core.mjs";
import { classifyOrdinaryCi } from "./detect-p1a-ordinary-ci-secrets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(args) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-C", root, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

export function validateCandidateDataOnly(candidateSha) {
  const exactCandidate = exactSha(candidateSha, "candidate SHA");
  assert.equal(git(["rev-parse", "HEAD"]), exactCandidate, "candidate environment does not match Git HEAD");
  assert.equal(git(["remote", "get-url", "origin"]), CANONICAL_REMOTE, "candidate repository mismatch");
  assert.equal(git(["cat-file", "-t", CLEAN_BASE_SHA]), "commit", "clean base unavailable");
  git(["merge-base", "--is-ancestor", CLEAN_BASE_SHA, exactCandidate]);
  const packageSource = readFileSync(path.join(root, "package.json"), "utf8");
  assert.ok(!packageSource.includes('"test:p1a-threat-model"'), "historical reconciled-root command is prohibited");
  const ciSource = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.deepEqual(classifyOrdinaryCi(ciSource), { status: "PASS", findings: [] }, "ordinary CI exposes protected authority");
  return { suite: "p1-a-candidate-data-only", candidateSha: exactCandidate, authorizedBaseSha: CLEAN_BASE_SHA, required: 5, executed: 5, passed: 5, failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.includes("--candidate-data-only"), "candidate-data-only mode required");
  console.log(JSON.stringify(validateCandidateDataOnly(process.env.P1A_CANDIDATE_SHA)));
}
