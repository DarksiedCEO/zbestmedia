import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, constants } from "node:fs";
import path from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function hashTrustedEvidencePackage(packagePath, declaredDigest) {
  assert.ok(packagePath, "evidence package path absent");
  const lexical = path.resolve(packagePath);
  assert.ok(!lstatSync(lexical).isSymbolicLink(), "evidence package symlink forbidden");
  assert.equal(realpathSync(lexical), lexical, "evidence package path alias forbidden");
  const fd = openSync(lexical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    assert.ok(before.isFile() && before.size > 0, "evidence package must be a nonempty regular file");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    assert.equal(after.dev, before.dev, "evidence package device changed");
    assert.equal(after.ino, before.ino, "evidence package inode changed");
    assert.equal(after.size, before.size, "evidence package size changed");
    assert.equal(after.mtimeMs, before.mtimeMs, "evidence package changed while hashing");
    const digest = sha256(bytes);
    if (declaredDigest) assert.equal(digest, declaredDigest, "declared evidence package digest mismatch");
    return { digest, size: before.size };
  } finally { closeSync(fd); }
}

export async function acquireGitHubEvidencePackage({ repository, runId, artifactName, token, outputPath, declaredDigest, fetchImpl = fetch }) {
  assert.equal(repository, "DarksiedCEO/zbestmedia", "wrong evidence repository");
  assert.match(String(runId), /^[1-9][0-9]*$/u, "invalid evidence run id");
  assert.match(artifactName ?? "", /^[A-Za-z0-9_.-]{1,128}$/u, "invalid evidence artifact name");
  assert.ok(token, "GitHub evidence acquisition token absent");
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  const listing = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`, { headers, redirect: "error" });
  assert.equal(listing.status, 200, "evidence artifact inventory acquisition failed");
  const inventory = await listing.json();
  const matches = inventory.artifacts?.filter((artifact) => artifact.name === artifactName && artifact.expired === false) ?? [];
  assert.equal(matches.length, 1, "evidence artifact identity is missing or ambiguous");
  const artifact = matches[0];
  assert.match(String(artifact.id), /^[1-9][0-9]*$/u, "evidence artifact id invalid");
  const archive = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`, { headers, redirect: "follow" });
  assert.equal(archive.status, 200, "evidence package download failed");
  const bytes = Buffer.from(await archive.arrayBuffer());
  assert.ok(bytes.length > 0, "evidence package is empty");
  const digest = sha256(bytes);
  if (declaredDigest) assert.equal(digest, declaredDigest, "declared evidence package digest mismatch");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outputPath, bytes, { flag: "wx", mode: 0o600 });
  const verified = hashTrustedEvidencePackage(outputPath, digest);
  return { artifactId: String(artifact.id), artifactName, runId: String(runId), digest: verified.digest, size: verified.size };
}
