import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_AUTHORITY_CLASSES, validateAuthorityInventory } from "./p1a-authority-inventory.mjs";
import { bindCandidateDataRoot, readCandidateArtifact } from "./p1a-candidate-data-root.mjs";
import { hashTrustedEvidencePackage } from "./p1a-evidence-package.mjs";
import { hermeticGit } from "./p1a-hermetic-git.mjs";
import { verifyGitHubOidcToken } from "./p1a-oidc-verifier.mjs";
import { bindWorkflowIdentity, PROTECTED_WORKFLOW_PATH } from "./p1a-workflow-identity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = realpathSync(mkdtempSync(path.join(tmpdir(), "p1a02-remediation-")));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cases = [];
const check = (name, fn, shouldReject = false) => cases.push([name, fn, shouldReject]);

const wrapperDir = path.join(temp, "wrapper");
mkdirSync(wrapperDir);
const wrapperMarker = path.join(temp, "wrapper-invoked");
writeFileSync(path.join(wrapperDir, "git"), `#!/bin/sh\necho invoked >> '${wrapperMarker}'\nexit 99\n`, { mode: 0o700 });
check("lying_git_wrapper_not_invoked", () => {
  const oldPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}:${oldPath}`;
  assert.match(hermeticGit(root, ["rev-parse", "HEAD^{commit}"]), /^[0-9a-f]{40}$/u);
  process.env.PATH = oldPath;
  assert.throws(() => readFileSync(wrapperMarker), /ENOENT/u);
});

const candidate = path.join(temp, "candidate");
execFileSync("/usr/bin/git", ["clone", "-q", "--no-hardlinks", root, candidate]);
execFileSync("/usr/bin/git", ["-C", candidate, "remote", "set-url", "origin", "https://github.com/DarksiedCEO/zbestmedia"]);
const candidateHead = execFileSync("/usr/bin/git", ["-C", candidate, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const binding = bindCandidateDataRoot(candidate, candidateHead, "https://github.com/DarksiedCEO/zbestmedia");
check("candidate_artifact_bound", () => assert.match(readCandidateArtifact(binding, "package.json").digest, /^[0-9a-f]{64}$/u));
check("candidate_path_traversal_rejected", () => readCandidateArtifact(binding, "../package.json"), true);
const outside = path.join(temp, "outside.json"); writeFileSync(outside, "{}\n");
symlinkSync(outside, path.join(candidate, "candidate-link.json"));
check("candidate_symlink_escape_rejected", () => readCandidateArtifact(binding, "candidate-link.json"), true);
const intermediate = path.join(candidate, "candidate-link-dir"); symlinkSync(temp, intermediate);
check("candidate_intermediate_symlink_rejected", () => readCandidateArtifact(binding, "candidate-link-dir/outside.json"), true);
check("candidate_wrong_root_identity_rejected", () => bindCandidateDataRoot(candidate, "0".repeat(40), "https://github.com/DarksiedCEO/zbestmedia"), true);

const evidence = path.join(temp, "evidence.zip"); writeFileSync(evidence, Buffer.from("immutable-evidence"));
const evidenceDigest = sha256(Buffer.from("immutable-evidence"));
check("evidence_trusted_hash_accepts", () => assert.equal(hashTrustedEvidencePackage(evidence, evidenceDigest).digest, evidenceDigest));
check("evidence_digest_substitution_rejected", () => hashTrustedEvidencePackage(evidence, "0".repeat(64)), true);
check("evidence_absent_rejected", () => hashTrustedEvidencePackage(path.join(temp, "absent.zip")), true);
const evidenceLink = path.join(temp, "evidence-link.zip"); symlinkSync(evidence, evidenceLink);
check("evidence_path_alias_rejected", () => hashTrustedEvidencePackage(evidenceLink), true);

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }); jwk.kid = "test-key"; jwk.use = "sig";
const now = 2_000_000_000;
const expected = { audience: "zbestmedia-p1a-certification", subject: "repo:DarksiedCEO/zbestmedia:environment:p1a-certification", repository: "DarksiedCEO/zbestmedia", repositoryOwnerId: "123", ref: "refs/heads/codex/bt-1", workflowRef: `DarksiedCEO/zbestmedia/${PROTECTED_WORKFLOW_PATH}@refs/heads/codex/bt-1`, workflowSha: candidateHead, environment: "p1a-certification" };
const claims = { iss: "https://token.actions.githubusercontent.com", aud: expected.audience, sub: expected.subject, repository: expected.repository, repository_owner_id: expected.repositoryOwnerId, ref: expected.ref, workflow_ref: expected.workflowRef, workflow_sha: expected.workflowSha, environment: expected.environment, iat: now - 10, nbf: now - 10, exp: now + 300 };
function jwt(overrides = {}, signingKey = privateKey, header = { alg: "RS256", kid: "test-key" }) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedClaims = Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedClaims}`), signingKey).toString("base64url");
  return `${encodedHeader}.${encodedClaims}.${signature}`;
}
check("oidc_valid_signature_and_claims_accept", () => assert.equal(verifyGitHubOidcToken(jwt(), { keys: [jwk] }, expected, now).signature, "VERIFIED"));
for (const [name, override] of [["issuer", { iss: "https://attacker.invalid" }], ["audience", { aud: "wrong" }], ["repository", { repository: "attacker/fork" }], ["workflow", { workflow_ref: "DarksiedCEO/zbestmedia/.github/workflows/other.yml@refs/heads/codex/bt-1" }], ["ref", { ref: "refs/heads/main" }], ["subject", { sub: "repo:attacker/fork" }], ["expired", { exp: now - 1 }], ["not_yet_valid", { nbf: now + 1 }]]) check(`oidc_wrong_${name}_rejected`, () => verifyGitHubOidcToken(jwt(override), { keys: [jwk] }, expected, now), true);
const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
check("oidc_tampered_signature_rejected", () => verifyGitHubOidcToken(jwt({}, other), { keys: [jwk] }, expected, now), true);
check("oidc_unsigned_claims_rejected", () => verifyGitHubOidcToken(`${jwt().split(".").slice(0, 2).join(".")}.`, { keys: [jwk] }, expected, now), true);

const repositoryFor = {}, verificationMethodFor = {}, identityFor = {};
for (const authorityClass of REQUIRED_AUTHORITY_CLASSES) { repositoryFor[authorityClass] = authorityClass === "RUNTIME_AUTHORITY" ? "DarksiedCEO/zbestmedia-ui" : "DarksiedCEO/zbestmedia"; verificationMethodFor[authorityClass] = "CONTENT_ADDRESSED"; identityFor[authorityClass] = `${authorityClass}:identity`; }
const inventory = { schemaVersion: "P1A_PROTECTED_AUTHORITY_INVENTORY_V1", authorities: REQUIRED_AUTHORITY_CLASSES.map((authorityClass) => ({ acquisitionId: `ACQ_${authorityClass}`, authorityClass, repository: repositoryFor[authorityClass], verificationMethod: verificationMethodFor[authorityClass], identity: identityFor[authorityClass], consumer: "P1A_PROTECTED_CERTIFICATION" })) };
const authorityExpected = { repositoryFor, verificationMethodFor, identityFor };
check("exact_authority_inventory_accepts", () => assert.equal(validateAuthorityInventory(inventory, authorityExpected).authorityDenominator, 9));
check("reduced_authority_inventory_rejected", () => validateAuthorityInventory({ ...inventory, authorities: inventory.authorities.slice(1) }, authorityExpected), true);
check("duplicate_authority_rejected", () => validateAuthorityInventory({ ...inventory, authorities: [...inventory.authorities.slice(0, -1), inventory.authorities[0]] }, authorityExpected), true);
check("caller_replacement_authority_rejected", () => validateAuthorityInventory({ ...inventory, authorities: inventory.authorities.map((item, index) => index ? item : { ...item, identity: "caller:replacement" }) }, authorityExpected), true);

const workflowRepository = path.join(temp, "workflow-repository");
mkdirSync(path.join(workflowRepository, ".github", "workflows"), { recursive: true });
writeFileSync(path.join(workflowRepository, PROTECTED_WORKFLOW_PATH), "name: trusted\n");
execFileSync("/usr/bin/git", ["init", "-q", workflowRepository]);
execFileSync("/usr/bin/git", ["-C", workflowRepository, "config", "user.name", "P1A Test"]);
execFileSync("/usr/bin/git", ["-C", workflowRepository, "config", "user.email", "p1a@example.invalid"]);
execFileSync("/usr/bin/git", ["-C", workflowRepository, "add", PROTECTED_WORKFLOW_PATH]);
execFileSync("/usr/bin/git", ["-C", workflowRepository, "commit", "-q", "-m", "trusted workflow"]);
const workflowSha = execFileSync("/usr/bin/git", ["-C", workflowRepository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const protectedRef = "refs/heads/codex/p1a-02-certification";
check("workflow_path_blob_identity_bound", () => assert.match(bindWorkflowIdentity({ trustedRoot: workflowRepository, repository: "DarksiedCEO/zbestmedia", workflowRef: `DarksiedCEO/zbestmedia/${PROTECTED_WORKFLOW_PATH}@${protectedRef}`, workflowSha, eventName: "workflow_dispatch", protectedRef, environment: "p1a-certification" }).sha256, /^[0-9a-f]{64}$/u));
check("wrong_workflow_path_rejected", () => bindWorkflowIdentity({ trustedRoot: workflowRepository, repository: "DarksiedCEO/zbestmedia", workflowRef: `DarksiedCEO/zbestmedia/.github/workflows/other.yml@${protectedRef}`, workflowSha, eventName: "workflow_dispatch", protectedRef, environment: "p1a-certification" }), true);

let passed = 0;
for (const [name, fn, shouldReject] of cases) {
  let rejected = false;
  try { fn(); } catch (error) { rejected = true; if (!shouldReject) console.error(`UNEXPECTED ${name}: ${error.message}`); }
  assert.equal(rejected, shouldReject, name);
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(JSON.stringify({ suite: "p1a-02-remediation-security-properties", required: cases.length, executed: cases.length, passed, failed: 0, skipped: 0, survivors: 0 }));
