import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, constants } from "node:fs";
import path from "node:path";
import { hermeticGit, verifyHermeticRepository } from "./p1a-hermetic-git.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function bindCandidateDataRoot(root, expectedSha, expectedRemote) {
  assert.ok(root, "candidate data root absent");
  const lexical = path.resolve(root);
  assert.ok(!lstatSync(lexical).isSymbolicLink(), "candidate data root cannot be a symlink");
  const canonical = realpathSync(lexical);
  assert.equal(canonical, lexical, "candidate data root path aliases are forbidden");
  const repository = verifyHermeticRepository(canonical, { head: expectedSha });
  const actualRemote = hermeticGit(canonical, ["remote", "get-url", "origin"]);
  const normalizeRemote = (value) => {
    const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(value ?? "");
    assert.ok(match, "candidate repository remote malformed");
    return match[1];
  };
  assert.equal(normalizeRemote(actualRemote), normalizeRemote(expectedRemote), "candidate repository identity mismatch");
  return Object.freeze({ root: canonical, head: repository.head, tree: repository.tree });
}

export function readCandidateArtifact(binding, relativePath, expectedDigest) {
  assert.ok(binding?.root, "candidate root binding absent");
  assert.equal(typeof relativePath, "string", "candidate artifact path must be text");
  assert.ok(relativePath.length > 0 && !path.isAbsolute(relativePath) && !relativePath.includes("\0"), "candidate artifact path malformed");
  const parts = relativePath.split(/[\\/]/u);
  assert.ok(parts.every((part) => part && part !== "." && part !== ".."), "candidate artifact path traversal");
  let cursor = binding.root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    assert.ok(!lstatSync(cursor).isSymbolicLink(), "candidate artifact symlink forbidden");
  }
  const canonical = realpathSync(cursor);
  assert.ok(canonical.startsWith(`${binding.root}${path.sep}`), "candidate artifact escapes root");
  const fd = openSync(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    assert.ok(before.isFile(), "candidate artifact must be a regular file");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    assert.equal(after.dev, before.dev, "candidate artifact device changed");
    assert.equal(after.ino, before.ino, "candidate artifact inode changed");
    assert.equal(after.size, before.size, "candidate artifact size changed");
    assert.equal(after.mtimeMs, before.mtimeMs, "candidate artifact changed while reading");
    const digest = sha256(bytes);
    if (expectedDigest !== undefined) assert.equal(digest, expectedDigest, "candidate artifact digest mismatch");
    return Object.freeze({ path: relativePath, digest, bytes });
  } finally { closeSync(fd); }
}

export function candidateBlobIdentity(binding, relativePath) {
  return hermeticGit(binding.root, ["rev-parse", `${binding.head}:${relativePath}`]);
}
