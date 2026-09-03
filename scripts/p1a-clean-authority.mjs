// P1A-08 owned. Current-lineage authority acquisition for the shared
// integration producer (scripts/test-p1a-trusted-verifier.mjs --integration)
// running inside the protected clean workflow. Closes the P1A-02 delegated
// dependency "current-lineage authority acquisition": every identity value is
// acquired and verified here — never echoed from caller defaults — and absence
// of any authority fails closed with no fallback. Abandoned-lineage roots are
// rejected explicitly.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const CLEAN_BASE_SHA = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";

// Abandoned-lineage roots (inadmissible as any active authority; historical
// evidence only). Includes the frozen original candidate, which must never
// become an active authority again.
export const LEGACY_FORBIDDEN_ROOTS = Object.freeze([
  "7056ea4ce24379c93549f0ac9b45ddd7a2600dd6", // abandoned AUTHORIZED_BASE
  "5056fb0df6e1ef739231cd2273a453fb1c644273", // abandoned TRUSTED_RECONCILIATION_BASE
  "365c59757756f3f91480d3bfeb841b543010201f", // frozen ORIGINAL_CANDIDATE
  "94376718e07df2e9d44864ed0394d58219224e61", // abandoned AUTHORIZED_RUNTIME
  "94941bbf6afbd0073f6619b2c63b0e6c5c6ca4e8", // abandoned CURRENT_TRUSTED_WORKFLOW_SHA
]);

// The complete environment surface this module reads. Contains no token,
// secret, or key material by construction (ordinary/protected parity: the
// producer needs no privileged credential to build its summary).
export const CLEAN_AUTHORITY_REQUIRED_ENV = Object.freeze([
  "P1A_CANDIDATE_SHA",
  "P1A_WORKFLOW_SHA",
  "P1A_VERIFIER_SHA",
  "P1A_AUTHORIZED_BASE_SHA",
  "P1A_TRUST_RUNTIME_PIN",
  "P1A_SCOPE_DIGEST",
  "P1A_EVIDENCE_PACKAGE_DIGEST",
  "P1A_RUNTIME_GIT_DIR",
]);

const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;

function fail(code, detail) {
  throw new Error(`P1A_CLEAN_AUTHORITY_BLOCK:${code}${detail ? `:${detail}` : ""}`);
}

function requireEnv(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    fail("MISSING_AUTHORITY", name);
  }
  return value;
}

function requireSha40(value, label) {
  if (!SHA40.test(value)) fail("BAD_SHA40", label);
  return value;
}

function requireSha64(value, label) {
  if (!SHA64.test(value)) fail("BAD_SHA64", label);
  return value;
}

function rejectLegacyRoot(value, label) {
  if (LEGACY_FORBIDDEN_ROOTS.includes(value)) fail("LEGACY_ROOT_REJECTED", label);
  return value;
}

function defaultGitObjectType(gitDir, objectSha) {
  // Hermetic query: explicit --git-dir, minimal environment, no ambient
  // repository discovery and no network.
  try {
    return execFileSync(
      "git",
      ["--git-dir", gitDir, "cat-file", "-t", objectSha],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    ).trim();
  } catch {
    return null;
  }
}

// rootDir: the trusted execution root the producer is running from. The
// verifier digest is DERIVED from the accounting consumer's bytes in that
// checkout — the one value the consumer later recomputes independently.
export function acquireCleanAuthority(env, rootDir, deps = {}) {
  if (!rootDir || typeof rootDir !== "string") fail("MISSING_EXECUTION_ROOT");
  const readFile = deps.readFile ?? readFileSync;
  const gitObjectType = deps.gitObjectType ?? defaultGitObjectType;

  for (const name of CLEAN_AUTHORITY_REQUIRED_ENV) requireEnv(env, name);

  const candidateSha = rejectLegacyRoot(
    requireSha40(env.P1A_CANDIDATE_SHA, "P1A_CANDIDATE_SHA"),
    "P1A_CANDIDATE_SHA",
  );
  const workflowSha = rejectLegacyRoot(
    requireSha40(env.P1A_WORKFLOW_SHA, "P1A_WORKFLOW_SHA"),
    "P1A_WORKFLOW_SHA",
  );
  const verifierSha = requireSha40(env.P1A_VERIFIER_SHA, "P1A_VERIFIER_SHA");
  const authorizedBaseSha = requireSha40(
    env.P1A_AUTHORIZED_BASE_SHA,
    "P1A_AUTHORIZED_BASE_SHA",
  );
  const runtimePin = rejectLegacyRoot(
    requireSha40(env.P1A_TRUST_RUNTIME_PIN, "P1A_TRUST_RUNTIME_PIN"),
    "P1A_TRUST_RUNTIME_PIN",
  );
  const scopeDigest = requireSha64(env.P1A_SCOPE_DIGEST, "P1A_SCOPE_DIGEST");
  const evidencePackageDigest = requireSha64(
    env.P1A_EVIDENCE_PACKAGE_DIGEST,
    "P1A_EVIDENCE_PACKAGE_DIGEST",
  );

  if (authorizedBaseSha !== CLEAN_BASE_SHA) {
    fail("UNAUTHORIZED_BASE", authorizedBaseSha);
  }
  if (candidateSha === authorizedBaseSha) fail("CANDIDATE_EQUALS_BASE");
  if (verifierSha !== workflowSha) fail("VERIFIER_NOT_WORKFLOW");

  const runtimeObjectType = gitObjectType(env.P1A_RUNTIME_GIT_DIR, runtimePin);
  if (runtimeObjectType !== "commit") {
    fail("RUNTIME_AUTHORITY_UNPROVEN", `${runtimePin}=${runtimeObjectType ?? "ABSENT"}`);
  }

  let consumerBytes;
  try {
    consumerBytes = readFile(
      path.join(rootDir, "scripts", "validate-p1a-certification-accounting.mjs"),
    );
  } catch {
    fail("VERIFIER_SOURCE_UNAVAILABLE");
  }
  const verifierDigest = createHash("sha256").update(consumerBytes).digest("hex");

  return Object.freeze({
    candidateSha,
    workflowSha,
    verifierSha,
    authorizedBaseSha,
    runtimePin,
    verifierDigest,
    scopeDigest,
    evidencePackageDigest,
  });
}
