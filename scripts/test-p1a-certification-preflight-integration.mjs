import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CANONICAL_REPOSITORY, CLEAN_BASE_SHA, sha256 } from "./p1a-certification-core.mjs";
import { runPreflight } from "./validate-p1a-certification-preflight.mjs";

const source = path.resolve(new URL("..", import.meta.url).pathname);
const temporary = mkdtempSync(path.join(os.tmpdir(), "p1a-certification-preflight-"));
const trusted = path.join(temporary, "trusted"), candidate = path.join(temporary, "candidate");
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }

try {
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, trusted]);
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, candidate]);
  git(trusted, ["checkout", "-q", "--detach", CLEAN_BASE_SHA]);
  git(candidate, ["checkout", "-q", "--detach", CLEAN_BASE_SHA]);
  git(candidate, ["config", "user.name", "P1A Test"]);
  git(candidate, ["config", "user.email", "p1a-test.invalid"]);
  git(candidate, ["remote", "set-url", "origin", "https://github.com/DarksiedCEO/zbestmedia.git"]);
  writeFileSync(path.join(candidate, "candidate-owned.txt"), "candidate data\n");
  git(candidate, ["add", "candidate-owned.txt"]);
  git(candidate, ["commit", "-q", "-m", "fixture candidate"]);
  const candidateSha = git(candidate, ["rev-parse", "HEAD"]);
  const scope = "candidate-owned.txt\n", scopeFile = path.join(temporary, "scope.txt");
  writeFileSync(scopeFile, scope);
  const valid = { "trusted-root": trusted, "candidate-root": candidate, "scope-file": scopeFile, "scope-digest": sha256(scope), candidate: candidateSha, workflow: CLEAN_BASE_SHA, runtime: "3".repeat(40), repository: CANONICAL_REPOSITORY };
  const cases = [
    ["real_git_preflight", valid, false],
    ["wrong_repository", { ...valid, repository: "attacker/fork" }, true],
    ["wrong_candidate_head", { ...valid, candidate: CLEAN_BASE_SHA }, true],
    ["wrong_scope_digest", { ...valid, "scope-digest": "0".repeat(64) }, true],
    ["overlapping_roots", { ...valid, "candidate-root": trusted }, true],
  ];
  let passed = 0;
  for (const [name, args, shouldReject] of cases) {
    let rejected = false;
    try { runPreflight(args); } catch { rejected = true; }
    assert.equal(rejected, shouldReject, name);
    passed += 1;
    console.log(`PASS ${name}`);
  }
  mkdirSync(path.join(temporary, "hostile-home"));
  writeFileSync(path.join(temporary, "hostile-home", ".gitconfig"), "[alias]\n  rev-parse = !false\n[credential]\n  helper = !echo leaked\n");
  const originalHome = process.env.HOME;
  process.env.HOME = path.join(temporary, "hostile-home");
  assert.equal(runPreflight(valid).hermeticGit, "ENFORCED");
  process.env.HOME = originalHome;
  passed += 1;
  console.log("PASS ambient_git_config_ignored");
  const wrapperDirectory = path.join(temporary, "lying-wrapper");
  const wrapperMarker = path.join(temporary, "lying-wrapper-invoked");
  mkdirSync(wrapperDirectory);
  writeFileSync(path.join(wrapperDirectory, "git"), `#!/bin/sh\necho invoked >> '${wrapperMarker}'\nexec /usr/bin/git "$@"\n`);
  chmodSync(path.join(wrapperDirectory, "git"), 0o700);
  const originalPath = process.env.PATH;
  process.env.PATH = `${wrapperDirectory}:${originalPath}`;
  assert.equal(runPreflight(valid).hermeticGit, "ENFORCED");
  process.env.PATH = originalPath;
  assert.equal(existsSync(wrapperMarker), false, "ambient Git wrapper received trusted calls");
  passed += 1;
  console.log("PASS lying_git_wrapper_not_invoked");
  console.log(JSON.stringify({ suite: "p1-a-certification-real-git-preflight", required: 7, executed: 7, passed, failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0 }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
