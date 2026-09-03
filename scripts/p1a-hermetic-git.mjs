import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export const HERMETIC_GIT_EXECUTABLE = "/usr/bin/git";
const SAFE_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "/usr/bin/false",
  GIT_SSH_COMMAND: "/usr/bin/false",
});
const FORBIDDEN_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
  "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG", "GIT_CONFIG_COUNT",
  "GIT_REPLACE_REF_BASE", "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_EXTERNAL_DIFF", "GIT_DIFF_OPTS", "GIT_ATTR_NOSYSTEM",
];

export function assertCanonicalGitExecutable() {
  const stat = lstatSync(HERMETIC_GIT_EXECUTABLE);
  assert.ok(stat.isFile(), "canonical Git executable is not a regular file");
  assert.equal(realpathSync(HERMETIC_GIT_EXECUTABLE), HERMETIC_GIT_EXECUTABLE, "canonical Git executable is a symlink");
  assert.ok((stat.mode & 0o111) !== 0, "canonical Git executable is not executable");
  return HERMETIC_GIT_EXECUTABLE;
}

export function hermeticGit(root, args, options = {}) {
  assertCanonicalGitExecutable();
  assert.ok(Array.isArray(args) && args.every((item) => typeof item === "string"), "Git arguments must be strings");
  const canonicalRoot = realpathSync(root);
  const env = { ...SAFE_ENV, ...(options.env ?? {}) };
  for (const key of FORBIDDEN_ENV) assert.ok(!(key in env), `forbidden Git environment: ${key}`);
  return execFileSync(HERMETIC_GIT_EXECUTABLE, [
    "-c", "alias.co=", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=",
    "-c", "diff.external=", "-c", "core.attributesFile=/dev/null", "-c", "protocol.file.allow=never",
    "-C", canonicalRoot, ...args,
  ], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options, env }).trim();
}

export function verifyHermeticRepository(root, expected = {}) {
  const canonicalRoot = realpathSync(root);
  const commonDir = hermeticGit(canonicalRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const gitDir = hermeticGit(canonicalRoot, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  assert.equal(hermeticGit(canonicalRoot, ["for-each-ref", "--format=%(refname)", "refs/replace"]), "", "replace refs are forbidden");
  for (const directory of new Set([commonDir, gitDir])) {
    for (const relative of ["objects/info/alternates", "info/grafts"]) {
      const target = path.join(directory, relative);
      try { assert.equal(lstatSync(target).size, 0, `${relative} is forbidden`); } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  if (expected.remote) assert.equal(hermeticGit(canonicalRoot, ["remote", "get-url", "origin"]), expected.remote, "repository remote mismatch");
  if (expected.head) assert.equal(hermeticGit(canonicalRoot, ["rev-parse", "HEAD^{commit}"]), expected.head, "repository HEAD mismatch");
  return { root: canonicalRoot, gitDir, commonDir, head: hermeticGit(canonicalRoot, ["rev-parse", "HEAD^{commit}"]), tree: hermeticGit(canonicalRoot, ["rev-parse", "HEAD^{tree}"]) };
}
