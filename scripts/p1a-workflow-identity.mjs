import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hermeticGit } from "./p1a-hermetic-git.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const PROTECTED_WORKFLOW_PATH = ".github/workflows/p1a-certify-clean.yml";

export function bindWorkflowIdentity({ trustedRoot, repository, workflowRef, workflowSha, eventName, protectedRef, environment }) {
  assert.equal(repository, "DarksiedCEO/zbestmedia", "workflow repository mismatch");
  assert.equal(workflowRef, `${repository}/${PROTECTED_WORKFLOW_PATH}@${protectedRef}`, "workflow ref/path mismatch");
  assert.equal(eventName, "workflow_dispatch", "protected certification event mismatch");
  assert.equal(environment, "p1a-certification", "protected environment mismatch");
  const head = hermeticGit(trustedRoot, ["rev-parse", "HEAD^{commit}"]);
  assert.equal(head, workflowSha, "trusted workflow SHA mismatch");
  const blob = hermeticGit(trustedRoot, ["rev-parse", `${workflowSha}:${PROTECTED_WORKFLOW_PATH}`]);
  const bytes = readFileSync(path.join(trustedRoot, PROTECTED_WORKFLOW_PATH));
  assert.equal(hermeticGit(trustedRoot, ["hash-object", "--stdin"], { input: bytes }), blob, "workflow blob/content mismatch");
  return { repository, path: PROTECTED_WORKFLOW_PATH, workflowRef, workflowSha, blob, sha256: sha256(bytes), eventName, protectedRef, environment };
}
