// P1A-01 — Authority Root / External Custody.
// Frozen requirements: P1AF-001..013, 017..021, 116, 117 (ledger f1010f1b…, denominator 124).
// Governing law: AEGIS cannot be the root of its own authority; local implementation
// cannot create its own authority and label it independent. Every verdict here fails
// closed: unknown, missing, or caller-supplied authority is rejected, never defaulted.

import { createHash, verify as cryptoVerify, createPublicKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, fstatSync, lstatSync, closeSync, constants } from "node:fs";
import { resolve, sep, isAbsolute, normalize } from "node:path";

export const POLICY_VERSION = "P1A_AUTHORITY_POLICY_V1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;

// ---------------------------------------------------------------------------
// V3 remediation (Codex INDEPENDENT_REVIEW_BLOCK H1–H4): signed external
// attestation boundary. Findings H1–H4 all shared one root cause — local code
// treating caller-supplied labels, source strings, digests, and plans as
// evidence. None of those are proof. The only thing that can prove an external
// event (a protected GitHub run, a human gate, a rollback execution) is a
// signature from an authenticated external principal, verified against a trust
// anchor local code does NOT get to choose.
//
// The production trust anchors are UNPROVISIONED here: no external signer key
// exists in this repository. Therefore every external-proof path fails closed
// to *_UNPROVEN / EXTERNAL_AUTHORITY_UNPROVISIONED. The verification mechanism
// is real Ed25519 (proven by tests with an ephemeral key); the honest local
// outcome is simply that nothing external can be proven from local bytes.
function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalJson(value[k])]));
  return value;
}

// Default (production) trust anchors: every external producer is UNPROVISIONED.
// Provisioning a real public key is an EXTERNAL act, never a local edit.
export const EXTERNAL_AUTHORITY_TRUST_ANCHORS = Object.freeze({
  GITHUB_ACTIONS_PROTECTED_RUN: Object.freeze({ status: "UNPROVISIONED", publicKeyPem: null }),
  FOUNDER_DARKSIEDCEO: Object.freeze({ status: "UNPROVISIONED", publicKeyPem: null }),
  CODEX: Object.freeze({ status: "UNPROVISIONED", publicKeyPem: null }),
});

// The signed message binds producer + exact subject + claim type + control/gate
// scope + a monotonic issuedAt, so a signature cannot be replayed across
// subjects, controls, or claim types. The `signature` field is excluded from
// the signed message.
export function attestationMessage(att) {
  return Buffer.from(JSON.stringify(canonicalJson({
    producer: att?.producer,
    subjectBaseSha: att?.subjectBaseSha,
    claimType: att?.claimType,
    scope: att?.scope ?? null,
    issuedAt: att?.issuedAt ?? null,
    body: att?.body ?? null,
  })), "utf8");
}

export function verifyExternalAttestation(attestation, expectedClaimType, expectedScope, trustAnchors = EXTERNAL_AUTHORITY_TRUST_ANCHORS) {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    return { verified: false, reason: "ATTESTATION_MALFORMED" };
  }
  if (attestation.claimType !== expectedClaimType) return { verified: false, reason: "ATTESTATION_WRONG_CLAIM_TYPE" };
  if (attestation.subjectBaseSha !== AUTHORIZED_REBUILD_BASE.sha) return { verified: false, reason: "ATTESTATION_WRONG_SUBJECT" };
  if (expectedScope !== undefined && attestation.scope !== expectedScope) return { verified: false, reason: "ATTESTATION_WRONG_SCOPE" };
  const anchor = trustAnchors?.[attestation.producer];
  if (!anchor || anchor.publicKeyPem == null) return { verified: false, reason: "EXTERNAL_AUTHORITY_UNPROVISIONED" };
  if (typeof attestation.signature !== "string" || attestation.signature.length === 0) return { verified: false, reason: "ATTESTATION_UNSIGNED" };
  let key;
  try { key = createPublicKey(anchor.publicKeyPem); } catch { return { verified: false, reason: "TRUST_ANCHOR_KEY_INVALID" }; }
  let ok = false;
  try { ok = cryptoVerify(null, attestationMessage(attestation), key, Buffer.from(attestation.signature, "base64")); } catch { ok = false; }
  return ok ? { verified: true, reason: null } : { verified: false, reason: "ATTESTATION_SIGNATURE_INVALID" };
}

// ---------------------------------------------------------------------------
// P1AF-116 / P1AF-117 — immutable rebuild base, prohibited bases.
// ---------------------------------------------------------------------------
export const AUTHORIZED_REBUILD_BASE = Object.freeze({
  repositoryRemote: "https://github.com/DarksiedCEO/zbestmedia.git",
  ref: "codex/bt-1",
  sha: "b0c1b2129123b941c6a350c16dae0ae3a8e076ca",
  tree: "c8fe6f31288bffcf1b8c35a825c60c6a5d31703d",
  parents: Object.freeze([
    "94941bbf6afbd0073f6619b2c63b0e6c5c6ca4e8",
    "03eeb8bd04850fc211ca61d1c591b8c6cec905b1",
  ]),
  objectType: "commit",
});

export const PROHIBITED_BASE_CLASSES = Object.freeze([
  "MAIN_BRANCH",
  "DIRTY_LOCAL_HEAD",
  "PR_8",
  "REMEDIATION_LINEAGE",
  "HISTORICAL_RED",
  "STRIKE_0",
  "MOVED_BRANCH_TIP",
]);

export function observeGitBase(repoPath) {
  const git = (...args) => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" }).trim();
  return {
    remote: git("remote", "get-url", "origin"),
    sha: git("rev-parse", `${AUTHORIZED_REBUILD_BASE.sha}^{commit}`),
    objectType: git("cat-file", "-t", AUTHORIZED_REBUILD_BASE.sha),
    tree: git("show", "-s", "--format=%T", AUTHORIZED_REBUILD_BASE.sha),
    parents: git("show", "-s", "--format=%P", AUTHORIZED_REBUILD_BASE.sha).split(/\s+/u),
    dirty: git("status", "--porcelain").length > 0,
  };
}

export function verifyRebuildBase(observed) {
  const findings = [];
  if (!observed || typeof observed !== "object") {
    return { verdict: "BASE_REJECTED", findings: ["BASE_OBSERVATION_MISSING"] };
  }
  if (observed.remote !== AUTHORIZED_REBUILD_BASE.repositoryRemote) findings.push("WRONG_REPOSITORY_REMOTE");
  if (observed.sha !== AUTHORIZED_REBUILD_BASE.sha) findings.push("WRONG_BASE_SHA");
  if (observed.objectType !== AUTHORIZED_REBUILD_BASE.objectType) findings.push("BASE_OBJECT_NOT_COMMIT");
  if (observed.tree !== AUTHORIZED_REBUILD_BASE.tree) findings.push("WRONG_BASE_TREE");
  const parents = Array.isArray(observed.parents) ? observed.parents : [];
  if (parents.length !== AUTHORIZED_REBUILD_BASE.parents.length
    || AUTHORIZED_REBUILD_BASE.parents.some((p, i) => parents[i] !== p)) findings.push("WRONG_BASE_PARENTS");
  if (observed.dirty === true) findings.push("PROHIBITED_BASE_DIRTY_LOCAL_HEAD");
  if (observed.baseClass && observed.baseClass !== "AUTHORIZED_REBUILD_ROOT") findings.push(`PROHIBITED_BASE_${observed.baseClass}`);
  return findings.length
    ? { verdict: "BASE_REJECTED", findings }
    : { verdict: "BASE_VERIFIED", findings: [], sha: AUTHORIZED_REBUILD_BASE.sha };
}

export function rejectProhibitedBase(candidateBase) {
  // Any base descriptor that is not byte-exactly the authorized root is rejected;
  // the class label only names WHICH prohibition applies, it never authorizes.
  if (!candidateBase || typeof candidateBase !== "object") {
    return { verdict: "BASE_REJECTED", findings: ["BASE_DESCRIPTOR_MISSING"] };
  }
  if (candidateBase.sha === AUTHORIZED_REBUILD_BASE.sha
    && candidateBase.ref === AUTHORIZED_REBUILD_BASE.ref
    && candidateBase.dirty !== true) {
    return { verdict: "BASE_ACCEPTED", findings: [] };
  }
  const cls = PROHIBITED_BASE_CLASSES.includes(candidateBase.baseClass)
    ? candidateBase.baseClass
    : "UNRECOGNIZED_BASE";
  return { verdict: "BASE_REJECTED", findings: [`PROHIBITED_BASE_${cls}`] };
}

// ---------------------------------------------------------------------------
// §VIII — canonical authority denominator. Bound independently; never learned
// from the manifest under validation.
// ---------------------------------------------------------------------------
export const CANONICAL_REVIEW_STAGES = Object.freeze([
  "OMEGA",
  "META",
  "CONTINUITY",
  "HALLUCINATION",
  "DRIFT",
]);

export const CANONICAL_AUTHORITY_ANCHORS = Object.freeze({
  frozenLedgerSha256: "f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf",
  requirementDenominator: 124,
  founderFreezeSha256: "f684817a9f01875a04967c93410c265f033b774bdfd98e192616ffa1303f247a",
  releaseAuthoritySha256: "bf7cfcddcd5e78f07658461f5a32cc3e641049dbf5b06b54f34d99f91ff7e50e",
  activeStateSha256: "ccfa4a460800612c9d7347b327e52edbc83f8190850ce8e4509f902404c294d9",
  founderIdentity: "DarksiedCEO",
});

export function validateAuthorityManifest(manifest) {
  const findings = [];
  if (!manifest || typeof manifest !== "object") {
    return { verdict: "MANIFEST_REJECTED", findings: ["MANIFEST_MISSING"] };
  }
  const stages = Array.isArray(manifest.reviewStages) ? manifest.reviewStages : [];
  for (const stage of CANONICAL_REVIEW_STAGES) {
    if (!stages.includes(stage)) findings.push(`MANIFEST_ROLE_REDUCTION_${stage}`);
  }
  if (manifest.reviewers !== undefined) findings.push("CALLER_DEFINED_REVIEWERS_REJECTED");
  if (manifest.reviewerRegistry !== undefined) findings.push("REVIEWER_REGISTRY_REPLACEMENT");
  if (manifest.requirementDenominator !== CANONICAL_AUTHORITY_ANCHORS.requirementDenominator) {
    findings.push("DENOMINATOR_SUBSTITUTION");
  }
  if (stages.length === 1) findings.push("SELF_CONSISTENT_ONE_ROLE_MANIFEST");
  return findings.length
    ? { verdict: "MANIFEST_REJECTED", findings }
    : { verdict: "MANIFEST_ACCEPTED", findings: [] };
}

// ---------------------------------------------------------------------------
// §IX / P1AF-012 — canonical reviewer identity. Caller strings are not reviewers.
// ---------------------------------------------------------------------------
export const CANONICAL_REVIEWER_REGISTRY = Object.freeze({
  policyVersion: POLICY_VERSION,
  reviewers: Object.freeze([
    Object.freeze({ REVIEWER_ID: "CLAUDE_CODE", DOMAIN: "BUILDER_EVIDENCE", EXECUTION_ORIGIN: "CLAUDE_CODE_SESSION", INDEPENDENCE_CLASS: "BUILDER" }),
    Object.freeze({ REVIEWER_ID: "CODEX", DOMAIN: "CROSS_MODEL_ATTACK", EXECUTION_ORIGIN: "CODEX_SESSION", INDEPENDENCE_CLASS: "INDEPENDENT_MODEL" }),
    Object.freeze({ REVIEWER_ID: "AEGIS_OMEGA", DOMAIN: "FINAL_CERTIFICATION", EXECUTION_ORIGIN: "AEGIS_READ_ONLY", INDEPENDENCE_CLASS: "JUDGE" }),
    Object.freeze({ REVIEWER_ID: "FOUNDER_DARKSIEDCEO", DOMAIN: "RELEASE_DECISION", EXECUTION_ORIGIN: "HUMAN_FOUNDER", INDEPENDENCE_CLASS: "HUMAN_AUTHORITY" }),
  ]),
});

const REVIEWER_REQUIRED_FIELDS = Object.freeze([
  "REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID",
  "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY",
]);

export function loadReviewerRegistry(candidateSupplied) {
  if (candidateSupplied !== undefined) {
    return { verdict: "REVIEWER_REGISTRY_REPLACEMENT", registry: null };
  }
  return { verdict: "CANONICAL", registry: CANONICAL_REVIEWER_REGISTRY };
}

export function validateReviewClaim(claim) {
  const findings = [];
  if (!claim || typeof claim !== "object") {
    return { verdict: "REVIEW_REJECTED", findings: ["REVIEW_CLAIM_MISSING"] };
  }
  for (const field of REVIEWER_REQUIRED_FIELDS) {
    if (typeof claim[field] !== "string" || claim[field].length === 0) findings.push(`REVIEWER_FIELD_MISSING_${field}`);
  }
  if (findings.length) return { verdict: "REVIEW_REJECTED", findings };
  const canonical = CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === claim.REVIEWER_ID);
  if (!canonical) findings.push("UNKNOWN_REVIEWER");
  if (claim.POLICY_VERSION !== CANONICAL_REVIEWER_REGISTRY.policyVersion) findings.push("STALE_REVIEWER_CONTRACT");
  if (canonical) {
    if (claim.DOMAIN !== canonical.DOMAIN) findings.push("WRONG_DOMAIN_REVIEWER");
    if (claim.EXECUTION_ORIGIN !== canonical.EXECUTION_ORIGIN) findings.push("EXECUTION_ORIGIN_MISMATCH");
    // Independence is registry-derived, never caller-declared.
    if (claim.INDEPENDENCE_CLASS !== canonical.INDEPENDENCE_CLASS) findings.push("CALLER_DECLARED_INDEPENDENCE_REJECTED");
  }
  if (!HEX64.test(claim.SUBJECT_IDENTITY)) findings.push("SUBJECT_IDENTITY_NOT_DIGEST_BOUND");
  return findings.length
    ? { verdict: "REVIEW_REJECTED", findings }
    : { verdict: "REVIEW_ACCEPTED", findings: [], independenceClass: canonical.INDEPENDENCE_CLASS };
}

export function validateStageAssignments(assignments) {
  // One fabricated reviewer reused across all stages must fail closed: builder,
  // independent model, and judge stages require distinct independence classes.
  const findings = [];
  if (!assignments || typeof assignments !== "object") {
    return { verdict: "STAGES_REJECTED", findings: ["STAGE_ASSIGNMENTS_MISSING"] };
  }
  const seen = new Map();
  for (const stage of CANONICAL_REVIEW_STAGES) {
    const claim = assignments[stage];
    if (!claim) { findings.push(`STAGE_UNASSIGNED_${stage}`); continue; }
    const result = validateReviewClaim(claim);
    if (result.verdict !== "REVIEW_ACCEPTED") { findings.push(`STAGE_REVIEWER_REJECTED_${stage}`); continue; }
    seen.set(stage, claim.REVIEWER_ID);
  }
  const distinct = new Set(seen.values());
  if (seen.size === CANONICAL_REVIEW_STAGES.length && distinct.size === 1) {
    findings.push("SINGLE_REVIEWER_ALL_STAGES");
  }
  return findings.length
    ? { verdict: "STAGES_REJECTED", findings }
    : { verdict: "STAGES_ACCEPTED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-013 — policy root. Digest-bound; substitution fails closed.
// ---------------------------------------------------------------------------
export function verifyPolicyRoot(claimed) {
  const findings = [];
  if (!claimed || typeof claimed !== "object") {
    return { verdict: "POLICY_ROOT_REJECTED", findings: ["POLICY_ROOT_MISSING"] };
  }
  const anchors = CANONICAL_AUTHORITY_ANCHORS;
  if (claimed.frozenLedgerSha256 !== anchors.frozenLedgerSha256) findings.push("POLICY_ROOT_SUBSTITUTION_LEDGER");
  if (claimed.founderFreezeSha256 !== anchors.founderFreezeSha256) findings.push("POLICY_ROOT_SUBSTITUTION_FREEZE");
  if (claimed.releaseAuthoritySha256 !== anchors.releaseAuthoritySha256) findings.push("POLICY_ROOT_SUBSTITUTION_RELEASE");
  if (claimed.requirementDenominator !== anchors.requirementDenominator) findings.push("POLICY_ROOT_SUBSTITUTION_DENOMINATOR");
  return findings.length
    ? { verdict: "POLICY_ROOT_REJECTED", findings }
    : { verdict: "POLICY_ROOT_VERIFIED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-010 / P1AF-011 — trusted surface and coordinated-rewrite resistance.
// ---------------------------------------------------------------------------
// The frozen base trusted surface was 11 files (P1AF-010 accounting). After the
// independent Codex review (finding 3), the ENFORCEMENT surface also includes the
// authority-root validator and its two test harnesses: local authority code that
// guards the surface must itself be on the surface it guards.
export const FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR = 11;
// H5 fix: the enforcement workflow is itself a trusted surface — it is what
// invokes the authority validator. It must be code-owner protected too.
export const AUTHORITY_ENFORCEMENT_WORKFLOW = ".github/workflows/p1a-authority-enforcement.yml";
export const TRUSTED_SURFACE_FILES = Object.freeze([
  ".github/CODEOWNERS",
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-authority-enforcement.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/detect-p1a-ordinary-ci-secrets.mjs",
  "scripts/test-p1a-authority-root-mutation.mjs",
  "scripts/test-p1a-authority-root.mjs",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-ci-secret-detector.mjs",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-authority-root.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
export const TRUSTED_SURFACE_DENOMINATOR = 15;

// The set of changed enforcement/hostile-test files whose CODEOWNERS coverage
// must be verified on every change (H6). Any file here that a change touches
// must be covered by the PRIOR CODEOWNERS, or the change fails closed.
export const ENFORCEMENT_TEST_SURFACE = Object.freeze([
  "scripts/validate-p1a-authority-root.mjs",
  "scripts/test-p1a-authority-root.mjs",
  "scripts/test-p1a-authority-root-mutation.mjs",
  ".github/workflows/p1a-authority-enforcement.yml",
]);

// --- GitHub-faithful CODEOWNERS evaluation (finding 4) ----------------------
// Semantics modeled: gitignore-style patterns, LAST match wins, an empty owner
// list on the winning rule leaves the file unowned. Unsupported CODEOWNERS
// constructs (negation "!", character classes "[...]", escaped "#") fail
// CLOSED as parse findings rather than being silently mis-modeled.
export function parseCodeownersRules(content) {
  const rules = [];
  const findings = [];
  const lines = String(content).split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [pattern, ...owners] = trimmed.split(/\s+/u);
    if (pattern.startsWith("!") || pattern.startsWith("\\#") || /[[\]]/u.test(pattern)) {
      findings.push(`CODEOWNERS_UNSUPPORTED_PATTERN_LINE_${i + 1}`);
      continue;
    }
    if (owners.some((o) => !o.startsWith("@"))) {
      findings.push(`CODEOWNERS_MALFORMED_OWNER_LINE_${i + 1}`);
      continue;
    }
    rules.push({ pattern, owners, line: i + 1 });
  }
  return { rules, findings };
}

function codeownersPatternToRegex(pattern) {
  let p = pattern;
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  // A pattern containing a slash (after trailing-slash strip) is anchored to the
  // repository root; a bare name matches at any depth.
  const anchored = p.includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  let out = "";
  for (let i = 0; i < p.length; i += 1) {
    if (p.startsWith("**/", i)) { out += "(?:[^/]+/)*"; i += 2; continue; }
    if (p.startsWith("**", i) && i + 2 === p.length) { out += ".*"; i += 1; continue; }
    const ch = p[i];
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.*+?^${}()|\\]/gu, "\\$&");
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  // A non-dir pattern matches the file itself or, when it names a directory,
  // everything beneath it; a dir-only pattern matches only contents beneath it.
  const suffix = dirOnly ? "/.*$" : "(?:/.*)?$";
  return new RegExp(`${prefix}${out}${suffix}`, "u");
}

export function codeownersOwnersFor(codeownersContent, filePath) {
  const { rules, findings } = parseCodeownersRules(codeownersContent);
  if (findings.length) return { owners: null, findings };
  let winner = null;
  for (const rule of rules) {
    if (codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;
  }
  return { owners: winner ? winner.owners : [], findings: [] };
}

export function verifyTrustedSurfaceCoverage(codeownersContent) {
  const findings = [];
  const parsed = parseCodeownersRules(codeownersContent);
  findings.push(...parsed.findings);
  if (TRUSTED_SURFACE_FILES.length !== TRUSTED_SURFACE_DENOMINATOR) findings.push("TRUSTED_SURFACE_DENOMINATOR_DRIFT");
  for (const file of TRUSTED_SURFACE_FILES) {
    const resolution = codeownersOwnersFor(codeownersContent, file);
    if (resolution.owners === null) continue; // parse findings already recorded
    if (resolution.owners.length === 0) findings.push(`TRUSTED_FILE_UNCOVERED_${file}`);
    else if (!resolution.owners.includes(`@${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}`)) findings.push(`TRUSTED_FILE_WRONG_OWNER_${file}`);
  }
  return findings.length
    ? { verdict: "SURFACE_OPEN", findings: [...new Set(findings)], denominator: TRUSTED_SURFACE_DENOMINATOR }
    : { verdict: "SURFACE_CLOSED", findings: [], denominator: TRUSTED_SURFACE_DENOMINATOR, covered: TRUSTED_SURFACE_FILES.length };
}

export function assessTrustedSurfaceChange(change) {
  // The reviewing owner set is computed from CODEOWNERS BEFORE the change, so a
  // change that rewrites CODEOWNERS (or every trusted file at once) can never
  // mint its own approval authority. P1AF-011.
  const findings = [];
  if (!change || typeof change !== "object" || !Array.isArray(change.files)) {
    return { verdict: "CHANGE_REJECTED", findings: ["CHANGE_DESCRIPTOR_MISSING"] };
  }
  const touched = change.files.filter((f) => TRUSTED_SURFACE_FILES.includes(f));
  if (touched.length === 0) return { verdict: "CHANGE_OUT_OF_AUTHORITY_SCOPE", findings: [] };
  const approvers = Array.isArray(change.approvals) ? change.approvals : [];
  const author = typeof change.author === "string" ? change.author : null;
  if (!author) findings.push("CHANGE_AUTHOR_MISSING");
  for (const file of touched) {
    const resolution = codeownersOwnersFor(change.priorCodeowners ?? "", file);
    if (resolution.owners === null) { findings.push(`PRIOR_OWNERSHIP_UNPARSEABLE_${file}`); continue; }
    const owners = resolution.owners.map((o) => o.replace(/^@/u, ""));
    if (owners.length === 0) { findings.push(`PRIOR_OWNERSHIP_ABSENT_${file}`); continue; }
    const independent = approvers.filter((a) => owners.includes(a) && a !== author);
    if (independent.length === 0) findings.push(`INDEPENDENT_CODE_OWNER_APPROVAL_MISSING_${file}`);
  }
  // H6 fix: a changed enforcement/hostile-test file that the PARENT CODEOWNERS
  // did not cover is a bootstrap gap that must fail closed — that is exactly how
  // the mutation harness slipped through at 8dee4dd. Coverage is checked against
  // the PRIOR CODEOWNERS so the change cannot self-grant its own protection.
  for (const file of change.files) {
    if (!ENFORCEMENT_TEST_SURFACE.includes(file)) continue;
    const prior = codeownersOwnersFor(change.priorCodeowners ?? "", file);
    if (prior.owners === null || prior.owners.length === 0) findings.push(`PARENT_CODEOWNERS_GAP_${file}`);
  }
  if (touched.length === TRUSTED_SURFACE_FILES.length) findings.push("COORDINATED_FULL_SURFACE_REWRITE");
  if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");
  const blocking = findings.some((f) => f.startsWith("INDEPENDENT_CODE_OWNER_APPROVAL_MISSING_")
    || f.startsWith("PRIOR_OWNERSHIP_ABSENT_")
    || f.startsWith("PRIOR_OWNERSHIP_UNPARSEABLE_")
    || f.startsWith("PARENT_CODEOWNERS_GAP_")
    || f === "SELF_APPROVAL_REJECTED"
    || f === "CHANGE_AUTHOR_MISSING");
  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };
  if (findings.length) return { verdict: "CHANGE_FLAGGED", findings };
  return { verdict: "CHANGE_AUTHORIZED", findings: [] };
}

// H5 fix: the authority validator must be invoked by an enforced execution
// surface, not merely defined. This checks the enforcement WORKFLOW exists in
// the repo and actually invokes the validator + test harnesses. It bounds the
// claim honestly: local code can confirm the workflow is WIRED, but cannot
// confirm GitHub REQUIRES it as a status check — that is external and reported
// as NOT_OBSERVED, never asserted.
export function verifyEnforcementSurface(repoRoot, workflowSha256) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    return { verdict: "ENFORCEMENT_SURFACE_ABSENT", findings: ["REPO_ROOT_MISSING"], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };
  }
  if (!HEX64.test(workflowSha256 ?? "")) {
    return { verdict: "ENFORCEMENT_SURFACE_ABSENT", findings: ["WORKFLOW_DIGEST_MISSING"], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };
  }
  const read = readAuthorityArtifact(repoRoot, AUTHORITY_ENFORCEMENT_WORKFLOW, workflowSha256);
  if (read.verdict !== "ARTIFACT_VERIFIED") {
    return { verdict: "ENFORCEMENT_SURFACE_ABSENT", findings: ["WORKFLOW_UNREADABLE_OR_DIGEST_MISMATCH"], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };
  }
  const text = read.bytes.toString("utf8");
  const findings = [];
  if (!text.includes("scripts/validate-p1a-authority-root.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_VALIDATOR");
  if (!text.includes("scripts/test-p1a-authority-root.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_BATTERY");
  if (!text.includes("scripts/test-p1a-authority-root-mutation.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_MUTATION");
  return findings.length
    ? { verdict: "ENFORCEMENT_SURFACE_INCOMPLETE", findings, requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" }
    : { verdict: "ENFORCEMENT_SURFACE_DEFINED", findings: [], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };
}

// ---------------------------------------------------------------------------
// §X — declared vs observed execution.
// ---------------------------------------------------------------------------
// Canonical producers whose identity may appear on observation/execution
// receipts. Independence class is derived HERE, never from the receipt.
export const CANONICAL_OBSERVATION_PRODUCERS = Object.freeze({
  GITHUB_ACTIONS_PROTECTED_RUN: Object.freeze({ independenceClass: "EXTERNAL_PLATFORM" }),
  FOUNDER_DARKSIEDCEO: Object.freeze({ independenceClass: "HUMAN_AUTHORITY" }),
  CODEX: Object.freeze({ independenceClass: "INDEPENDENT_MODEL" }),
});

// Post-review contract (finding 2): there is NO caller-suppliable reader. All
// evidence bytes come through readAuthorityArtifact — the fixed trusted reader
// that binds path containment, symlink-free identity, single-fd bytes, and
// digest. Each artifact must additionally bind the execution SUBJECT and a
// canonical PRODUCER; a receipt for another subject or from an unknown
// principal is not evidence.
export function classifyExecutionEvidence(evidenceRoot, claim, trustAnchors = EXTERNAL_AUTHORITY_TRUST_ANCHORS) {
  if (typeof evidenceRoot !== "string" || evidenceRoot.length === 0 || !claim || typeof claim !== "object" || Array.isArray(claim)) {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_CLAIM_MISSING"] };
  }
  if (!HEX40.test(claim.subjectSha ?? "") && !HEX64.test(claim.subjectSha ?? "")) {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_SUBJECT_UNBOUND"] };
  }
  const artifacts = Array.isArray(claim.artifacts) ? claim.artifacts : [];
  if (artifacts.length === 0) {
    // session_id / context_id / timestamp / fresh / independent are declarations,
    // not proof. Their presence changes nothing.
    return { verdict: "EXECUTION_UNPROVEN", findings: ["DECLARED_EXECUTION_ONLY"] };
  }
  const findings = [];
  for (const artifact of artifacts) {
    if (!artifact?.path || !HEX64.test(artifact?.sha256 ?? "")) { findings.push("ARTIFACT_NOT_DIGEST_BOUND"); continue; }
    // H1 fix: a producer LABEL is not identity. The producer must be a canonical
    // one AND the artifact must be a signed attestation verified against that
    // producer's external trust anchor. Absent a provisioned anchor this is
    // unreachable — a caller-written file with a caller-chosen label can never
    // become OBSERVED_EXECUTION.
    if (!(artifact.producer in CANONICAL_OBSERVATION_PRODUCERS)) { findings.push("ARTIFACT_PRODUCER_UNKNOWN"); continue; }
    if (artifact.subjectSha !== claim.subjectSha) { findings.push("ARTIFACT_WRONG_SUBJECT"); continue; }
    const read = readAuthorityArtifact(evidenceRoot, artifact.path, artifact.sha256);
    if (read.verdict !== "ARTIFACT_VERIFIED") {
      findings.push(read.findings.includes("ARTIFACT_DIGEST_MISMATCH") ? "FABRICATED_EXECUTION_ARTIFACT" : "EXECUTION_ARTIFACT_UNREADABLE");
      continue;
    }
    let attestation;
    try { attestation = JSON.parse(read.bytes.toString("utf8")); } catch { findings.push("EXECUTION_ATTESTATION_NOT_JSON"); continue; }
    if (attestation?.producer !== artifact.producer) { findings.push("EXECUTION_ATTESTATION_PRODUCER_MISMATCH"); continue; }
    const v = verifyExternalAttestation(attestation, "OBSERVED_EXECUTION", claim.subjectSha, trustAnchors);
    if (!v.verified) { findings.push(`EXECUTION_ATTESTATION_UNVERIFIED_${v.reason}`); continue; }
  }
  return findings.length
    ? { verdict: "EXECUTION_UNPROVEN", findings }
    : { verdict: "OBSERVED_EXECUTION", findings: [] };
}

export function validateReceiptBinding(receipt) {
  // Receipts bind subjects by content digest, never by filename. §VI RECEIPT_UNDER_BINDING.
  const findings = [];
  if (!receipt || typeof receipt !== "object") {
    return { verdict: "RECEIPT_REJECTED", findings: ["RECEIPT_MISSING"] };
  }
  if (!HEX64.test(receipt.subjectSha256 ?? "")) findings.push("RECEIPT_UNDER_BINDING_NO_SUBJECT_DIGEST");
  if (receipt.subjectPath && !receipt.subjectSha256) findings.push("RECEIPT_FILENAME_ONLY_BINDING");
  return findings.length
    ? { verdict: "RECEIPT_REJECTED", findings }
    : { verdict: "RECEIPT_BOUND", findings: [] };
}

export function acceptSupersession(next, prior) {
  // §VI SUPERSESSION_WEAKNESS: a successor must digest-bind its predecessor, the
  // predecessor must remain readable, and a founder decision must authorize it.
  const findings = [];
  if (!next || typeof next !== "object") return { verdict: "SUPERSESSION_REJECTED", findings: ["SUCCESSOR_MISSING"] };
  if (!HEX64.test(next.supersedesSha256 ?? "")) findings.push("SUPERSESSION_NOT_DIGEST_BOUND");
  if (!prior || prior.preserved !== true) findings.push("PREDECESSOR_NOT_PRESERVED");
  if (prior && HEX64.test(next.supersedesSha256 ?? "") && next.supersedesSha256 !== prior.sha256) findings.push("SUPERSESSION_CHAIN_MISMATCH");
  if (!HEX64.test(next.founderDecisionSha256 ?? "")) findings.push("SUPERSESSION_WITHOUT_FOUNDER_DECISION");
  return findings.length
    ? { verdict: "SUPERSESSION_REJECTED", findings }
    : { verdict: "SUPERSESSION_ACCEPTED", findings: [] };
}

// ---------------------------------------------------------------------------
// §VII / P1AF-003..009, 017, 018, 019 — external custody.
// ---------------------------------------------------------------------------
export const CUSTODY_CONTRACT_REQUIRED_FIELDS = Object.freeze([
  "CUSTODY_MECHANISM", "AUTHORITY_PROVIDER", "PROTECTED_PRINCIPAL",
  "PUBLISH_AUTHORITY", "ROTATE_AUTHORITY", "REVOKE_AUTHORITY",
  "FOUNDER_AUTHENTICATION", "REVIEWER_AUTHENTICATION", "AUTHORITY_ROOT_IDENTITY",
  "OBSERVED_EXECUTION_RECEIPT_AUTHORITY", "LOCAL_VERIFICATION_CONTRACT",
]);

export const EXTERNAL_CUSTODY_CONTRACT = Object.freeze({
  CUSTODY_MECHANISM: "PROTECTED_GITHUB_ENVIRONMENT_WITH_REQUIRED_REVIEWER",
  AUTHORITY_PROVIDER: "GITHUB:DarksiedCEO/zbestmedia",
  PROTECTED_PRINCIPAL: "GITHUB_APP_LEAST_PRIVILEGE:DarksiedCEO/zbestmedia-ui:contents-read,metadata-read",
  PUBLISH_AUTHORITY: "FOUNDER_DARKSIEDCEO_VIA_PROTECTED_ENVIRONMENT_p1a-certification",
  ROTATE_AUTHORITY: "FOUNDER_DARKSIEDCEO",
  REVOKE_AUTHORITY: "FOUNDER_DARKSIEDCEO_APP_KEY_REVOCATION",
  FOUNDER_AUTHENTICATION: "GITHUB_ACCOUNT_DarksiedCEO_ENVIRONMENT_REVIEWER",
  REVIEWER_AUTHENTICATION: "GITHUB_CODE_OWNER_REVIEW_ON_PROTECTED_BRANCH",
  AUTHORITY_ROOT_IDENTITY: "codex/bt-1@b0c1b2129123b941c6a350c16dae0ae3a8e076ca",
  OBSERVED_EXECUTION_RECEIPT_AUTHORITY: "GITHUB_ACTIONS_RUN_ON_PROTECTED_ENVIRONMENT",
  LOCAL_VERIFICATION_CONTRACT: "scripts/validate-p1a-authority-root.mjs",
  status: "CONTRACT_DEFINED_PROVISIONING_NOT_PROVEN",
});

export const CUSTODY_CONTROLS = Object.freeze([
  Object.freeze({ id: "CUSTODY_BOOTSTRAP_MERGE_REVIEWED", requirement: "P1AF-001", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_BRANCH_PROTECTION_CODEOWNER_REVIEW", requirement: "P1AF-002", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_ENVIRONMENT_EXISTS_REQUIRED_REVIEWER", requirement: "P1AF-003", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_ENVIRONMENT_BRANCH_RESTRICTION", requirement: "P1AF-004", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_SECRET_ENVIRONMENT_SCOPED", requirement: "P1AF-005", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_SECRET_NAME_ONLY_CONFIRMATION", requirement: "P1AF-006", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_ORDERED_PROOF_BEFORE_REMOVAL", requirement: "P1AF-007", observation: "GITHUB_OBSERVATION" }),
  Object.freeze({ id: "CUSTODY_APP_LEAST_PRIVILEGE", requirement: "P1AF-009", observation: "GITHUB_OBSERVATION" }),
]);

export const NAMED_HUMAN_GATES = Object.freeze([
  "BOOTSTRAP_REVIEW",
  "FOUNDER_PUSH_AUTHORIZATION",
  "MERGE_AUTHORIZATION",
  "ENVIRONMENT_CUSTODY_VERIFICATION",
  "DISPATCH_APPROVAL",
  "INDEPENDENT_SECURITY_REVIEW",
  "INDEPENDENT_RELIABILITY_REVIEW",
  "INDEPENDENT_TEST_VERIFICATION_REVIEW",
  "INDEPENDENT_RELEASE_GUARDIAN_REVIEW",
  "INDEPENDENT_AEGIS_REVIEW",
  "FOUNDER_DECISION",
]);

// Post-review contract (finding 1): custody evidence is never an in-memory
// object. Each receipt is an on-disk artifact loaded through the fixed trusted
// reader and must bind: a known control, source GITHUB_OBSERVATION, a canonical
// non-builder producer, the exact authorized base as subject, and a canonical
// authority digest. Even a fully valid local receipt set can NEVER authorize
// trusted certification from local code: the strongest locally reachable
// verdict is CUSTODY_EVIDENCE_RECORDED_LOCALLY, and trustedCertificationAuthorized
// is structurally false here. EXTERNAL_CUSTODY_OBSERVED may only be rendered by
// the external evaluation named in EXTERNAL_CUSTODY_CONTRACT — never by this
// module. AEGIS cannot be the root of its own authority; neither can we.
export const LOCAL_CUSTODY_AUTHORIZATION_CEILING = Object.freeze({
  trustedCertificationAuthorized: false,
  // H2 fix: local code cannot even "record" a GitHub observation from a caller
  // label. The strongest locally reachable verdict requires a SIGNATURE verified
  // against an external trust anchor; absent provisioning, the only honest
  // verdict is NOT_PROVEN. Even a signature-verified set stays below trusted
  // certification, which only the external evaluation renders.
  strongestLocalVerdict: "CUSTODY_SIGNATURE_VERIFIED",
  externalVerdictAuthority: "EXTERNAL_EVALUATION_PER_EXTERNAL_CUSTODY_CONTRACT_ONLY",
});

const CUSTODY_AUTHORITY_DIGESTS = Object.freeze([
  CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256,
  CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256,
]);

export function assessExternalCustody(evidenceRoot, receiptRefs, trustAnchors = EXTERNAL_AUTHORITY_TRUST_ANCHORS) {
  const findings = [];
  const byControl = new Map();
  if (typeof evidenceRoot !== "string" || evidenceRoot.length === 0) {
    findings.push("CUSTODY_EVIDENCE_ROOT_MISSING");
  } else {
    const refs = Array.isArray(receiptRefs) ? receiptRefs : [];
    for (const ref of refs) {
      if (!ref || typeof ref !== "object" || !ref.path || !HEX64.test(ref.sha256 ?? "")) { findings.push("CUSTODY_RECEIPT_REF_MALFORMED"); continue; }
      const read = readAuthorityArtifact(evidenceRoot, ref.path, ref.sha256);
      if (read.verdict !== "ARTIFACT_VERIFIED") { findings.push(`CUSTODY_RECEIPT_UNREADABLE_${ref.controlId ?? "UNKNOWN"}`); continue; }
      let receipt;
      try { receipt = JSON.parse(read.bytes.toString("utf8")); } catch { findings.push("CUSTODY_RECEIPT_NOT_JSON"); continue; }
      if (!receipt || typeof receipt !== "object" || receipt.controlId !== ref.controlId) { findings.push("CUSTODY_RECEIPT_CONTROL_MISMATCH"); continue; }
      if (!CUSTODY_CONTROLS.some((c) => c.id === receipt.controlId)) { findings.push("CUSTODY_RECEIPT_UNKNOWN_CONTROL"); continue; }
      if (!(receipt.producer in CANONICAL_OBSERVATION_PRODUCERS)) { findings.push(`CUSTODY_PRODUCER_UNKNOWN_${receipt.controlId}`); continue; }
      if (receipt.subjectBaseSha !== AUTHORIZED_REBUILD_BASE.sha) { findings.push(`CUSTODY_WRONG_SUBJECT_${receipt.controlId}`); continue; }
      if (!CUSTODY_AUTHORITY_DIGESTS.includes(receipt.authoritySha256)) { findings.push(`CUSTODY_AUTHORITY_UNBOUND_${receipt.controlId}`); continue; }
      // H2 fix: source:"GITHUB_OBSERVATION" as a caller STRING is meaningless.
      // Require a signature over (producer, subject, claimType, control) verified
      // against the producer's external trust anchor. Scope is bound to the
      // control id so a receipt cannot be replayed across controls.
      const v = verifyExternalAttestation(receipt, "GITHUB_CUSTODY_OBSERVATION", receipt.controlId, trustAnchors);
      if (!v.verified) { findings.push(`CUSTODY_ATTESTATION_UNVERIFIED_${receipt.controlId}_${v.reason}`); continue; }
      byControl.set(receipt.controlId, receipt);
    }
  }
  const unproven = CUSTODY_CONTROLS.filter((control) => !byControl.has(control.id));
  for (const control of unproven) findings.push(`CUSTODY_NOT_PROVEN_${control.id}`);
  const allVerified = unproven.length === 0 && !findings.length;
  return {
    verdict: allVerified ? "CUSTODY_SIGNATURE_VERIFIED" : "NOT_PROVEN",
    trustedCertificationAuthorized: false,
    findings,
    controlDenominator: CUSTODY_CONTROLS.length,
    controlsVerified: CUSTODY_CONTROLS.length - unproven.length,
    ceiling: LOCAL_CUSTODY_AUTHORIZATION_CEILING,
  };
}

export function assessGateCompleteness(gateEvidenceRoot, gateRefs, trustAnchors = EXTERNAL_AUTHORITY_TRUST_ANCHORS) {
  // H3 fix: a gate "digest" that the caller authored proves nothing. Each gate
  // must present a signed HUMAN_GATE attestation (scope = gate name) read from
  // disk through the trusted reader and verified against the gate authority's
  // external trust anchor. Fabricated 64-hex strings can no longer complete a gate.
  const findings = [];
  const verified = new Set();
  if (typeof gateEvidenceRoot !== "string" || gateEvidenceRoot.length === 0) {
    findings.push("GATE_EVIDENCE_ROOT_MISSING");
  } else {
    const refs = gateRefs && typeof gateRefs === "object" && !Array.isArray(gateRefs) ? gateRefs : {};
    for (const gate of NAMED_HUMAN_GATES) {
      const ref = refs[gate];
      if (ref === undefined) continue; // absence handled by the GATE_MISSING sweep below
      if (!ref || typeof ref !== "object" || !ref.path || !HEX64.test(ref.sha256 ?? "")) { findings.push(`GATE_REF_MALFORMED_${gate}`); continue; }
      const read = readAuthorityArtifact(gateEvidenceRoot, ref.path, ref.sha256);
      if (read.verdict !== "ARTIFACT_VERIFIED") { findings.push(`GATE_UNREADABLE_${gate}`); continue; }
      let att;
      try { att = JSON.parse(read.bytes.toString("utf8")); } catch { findings.push(`GATE_NOT_JSON_${gate}`); continue; }
      const v = verifyExternalAttestation(att, "HUMAN_GATE", gate, trustAnchors);
      if (!v.verified) { findings.push(`GATE_UNVERIFIED_${gate}_${v.reason}`); continue; }
      verified.add(gate);
    }
  }
  for (const gate of NAMED_HUMAN_GATES) if (!verified.has(gate)) findings.push(`GATE_MISSING_${gate}`);
  return findings.length
    ? { verdict: "GATES_INCOMPLETE", findings: [...new Set(findings)], gateDenominator: NAMED_HUMAN_GATES.length }
    : { verdict: "GATES_COMPLETE", findings: [], gateDenominator: NAMED_HUMAN_GATES.length };
}

export const ROLLBACK_CONTRACT = Object.freeze({
  disableDispatch: Object.freeze(["REMOVE_ENVIRONMENT_APPROVAL", "REMOVE_ENVIRONMENT_SECRET"]),
  compromiseResponse: "REVOKE_APP_KEY",
  bootstrapRollback: "SEPARATELY_REVIEWED_REVERT_COMMIT",
  historyRewrite: "PROHIBITED",
  historicalEvidence: "RETAINED",
});

const AUTHORIZED_ROLLBACK_KINDS = Object.freeze(["DISABLE_DISPATCH", "REVOKE_APP_KEY", "BOOTSTRAP_ROLLBACK"]);

// H4 fix: split plan-validity from authorization. A well-formed descriptor is a
// PLAN, never an authorization. assessRollbackAction now returns at most
// ROLLBACK_PLAN_VALIDATED and can NEVER return ROLLBACK_AUTHORIZED.
export function assessRollbackAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { verdict: "ROLLBACK_REJECTED", findings: ["ROLLBACK_ACTION_MISSING"] };
  }
  const findings = [];
  if (!AUTHORIZED_ROLLBACK_KINDS.includes(action.kind)) findings.push("UNKNOWN_ROLLBACK_ACTION");
  if (action.kind === "HISTORY_REWRITE" || action.forcePush === true || action.deletesHistory === true) {
    findings.push("HISTORY_REWRITE_PROHIBITED");
  }
  if (action.kind === "BOOTSTRAP_ROLLBACK" && action.mechanism !== "SEPARATELY_REVIEWED_REVERT_COMMIT") {
    findings.push("ROLLBACK_WITHOUT_REVIEWED_REVERT");
  }
  return findings.length
    ? { verdict: "ROLLBACK_REJECTED", findings }
    : { verdict: "ROLLBACK_PLAN_VALIDATED", findings: [] };
}

// Authorization requires the plan to be valid AND a signed ROLLBACK_EXECUTION
// attestation (scope = rollback kind) verified against the executor's external
// trust anchor. Absent provisioning this is unreachable: an unexecuted
// descriptor yields ROLLBACK_EXECUTION_UNPROVEN, never AUTHORIZED.
export function authorizeRollback(action, evidenceRoot, executionRef, trustAnchors = EXTERNAL_AUTHORITY_TRUST_ANCHORS) {
  const plan = assessRollbackAction(action);
  if (plan.verdict !== "ROLLBACK_PLAN_VALIDATED") {
    return { verdict: "ROLLBACK_REJECTED", findings: plan.findings };
  }
  if (typeof evidenceRoot !== "string" || evidenceRoot.length === 0 || !executionRef || typeof executionRef !== "object" || !executionRef.path || !HEX64.test(executionRef.sha256 ?? "")) {
    return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: ["ROLLBACK_EXECUTION_EVIDENCE_MISSING"] };
  }
  const read = readAuthorityArtifact(evidenceRoot, executionRef.path, executionRef.sha256);
  if (read.verdict !== "ARTIFACT_VERIFIED") return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: ["ROLLBACK_EXECUTION_ARTIFACT_UNREADABLE"] };
  let att;
  try { att = JSON.parse(read.bytes.toString("utf8")); } catch { return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: ["ROLLBACK_EXECUTION_NOT_JSON"] }; }
  const v = verifyExternalAttestation(att, "ROLLBACK_EXECUTION", action.kind, trustAnchors);
  if (!v.verified) return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: [`ROLLBACK_EXECUTION_UNVERIFIED_${v.reason}`] };
  return { verdict: "ROLLBACK_AUTHORIZED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-019 / P1AF-008 — honest claim ceiling.
// ---------------------------------------------------------------------------
export function computeClaimCeiling(custodyAssessment, localImplementationGreen) {
  // Post-review contract (finding 1): local code can NEVER return
  // trustedCertificationAuthorized=true, no matter what verdict string a caller
  // places in custodyAssessment. The maximum honest local claim is bounded.
  // External custody may only be declared by the external evaluation named in
  // EXTERNAL_CUSTODY_CONTRACT; this function is total and fail-closed. P1AF-008/019.
  const custodySignatureVerified = custodyAssessment?.verdict === "CUSTODY_SIGNATURE_VERIFIED";
  return {
    claim: localImplementationGreen === true
      ? "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING"
      : "EXTERNAL_ASSURANCE_AUTHORITY_PENDING",
    custodySignatureVerified: custodySignatureVerified === true,
    trustedCertificationAuthorized: false,
  };
}

export function rejectSimulatedIndependence(assertion) {
  if (!assertion || typeof assertion !== "object" || Array.isArray(assertion) || typeof assertion.claim !== "string") {
    return { verdict: "ASSERTION_REJECTED", findings: ["ASSERTION_MISSING"] };
  }
  const claimsExternal = assertion.claim === "EXTERNAL_ASSURED" || assertion.externallyGoverned === true || assertion.independent === true;
  const evidenceSources = new Set((assertion.evidence ?? []).map((e) => e?.source));
  const hasExternalEvidence = evidenceSources.has("GITHUB_OBSERVATION");
  if (claimsExternal && !hasExternalEvidence) {
    return { verdict: "ASSERTION_REJECTED", findings: ["SIMULATED_INDEPENDENCE_REJECTED"] };
  }
  return { verdict: "ASSERTION_ACCEPTED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-020 / P1AF-021 — trust-boundary placement and authority separation.
// ---------------------------------------------------------------------------
export const OUT_OF_BOUNDARY_CAPABILITIES = Object.freeze(["SEARCH_INTELLIGENCE", "MASTER_SENTINEL"]);
export const REPOSITORY_AUTHORITY_ROLES = Object.freeze({
  "DarksiedCEO/zbestmedia": "SPECIFICATION_CONSTRUCTION_AUTHORITY",
  "DarksiedCEO/zbestmedia-ui": "RUNTIME_AUTHORITY",
});

export function assertCapabilityPlacement(capability, repository) {
  if (OUT_OF_BOUNDARY_CAPABILITIES.includes(capability)
    && Object.keys(REPOSITORY_AUTHORITY_ROLES).includes(repository)) {
    return { verdict: "BOUNDARY_VIOLATION", findings: [`CAPABILITY_INSIDE_TRUST_BOUNDARY_${capability}`] };
  }
  if (!capability || !repository) {
    return { verdict: "PLACEMENT_REJECTED", findings: ["PLACEMENT_DESCRIPTOR_MISSING"] };
  }
  return { verdict: "PLACEMENT_ALLOWED", findings: [] };
}

export function assertAuthoritySeparation(claim) {
  if (!claim || typeof claim !== "object") {
    return { verdict: "CLAIM_REJECTED", findings: ["AUTHORITY_CLAIM_MISSING"] };
  }
  const role = REPOSITORY_AUTHORITY_ROLES[claim.repository];
  if (!role) return { verdict: "CLAIM_REJECTED", findings: ["UNKNOWN_REPOSITORY_AUTHORITY"] };
  if (claim.assertedStatus === "OPERATIONAL_AGENT" && role !== "RUNTIME_AUTHORITY") {
    return { verdict: "CLAIM_REJECTED", findings: ["SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"] };
  }
  return { verdict: "CLAIM_ACCEPTED", findings: [], role };
}

// ---------------------------------------------------------------------------
// §XI — filesystem hardening: open once, bind identity, verify digest.
// ---------------------------------------------------------------------------
export function readAuthorityArtifact(rootDir, relPath, expectedSha256) {
  if (!HEX64.test(expectedSha256 ?? "")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["EXPECTED_DIGEST_MISSING"] };
  }
  if (typeof relPath !== "string" || isAbsolute(relPath) || relPath.split(/[\\/]/u).includes("..")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["PATH_ESCAPE_REJECTED"] };
  }
  const root = resolve(rootDir);
  const full = resolve(root, normalize(relPath));
  if (full !== root && !full.startsWith(root + sep)) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["PATH_ESCAPE_REJECTED"] };
  }
  // Reject symlinks on every path segment below the root before opening.
  let cursor = root;
  for (const segment of full.slice(root.length + 1).split(sep)) {
    cursor = resolve(cursor, segment);
    let st;
    try { st = lstatSync(cursor); } catch { return { verdict: "ARTIFACT_REJECTED", findings: ["ARTIFACT_UNREADABLE"] }; }
    if (st.isSymbolicLink()) return { verdict: "ARTIFACT_REJECTED", findings: ["SYMLINK_SUBSTITUTION_REJECTED"] };
  }
  let fd;
  try {
    fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { verdict: "ARTIFACT_REJECTED", findings: ["SYMLINK_OR_OPEN_REJECTED"] };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { verdict: "ARTIFACT_REJECTED", findings: ["NOT_A_REGULAR_FILE"] };
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const read = readSync(fd, bytes, offset, stat.size - offset, offset);
      if (read <= 0) break;
      offset += read;
    }
    if (offset !== stat.size) return { verdict: "ARTIFACT_REJECTED", findings: ["SHORT_READ"] };
    // Same-fd identity: digest and identity come from the one open; no reopen.
    if (sha256(bytes) !== expectedSha256) return { verdict: "ARTIFACT_REJECTED", findings: ["ARTIFACT_DIGEST_MISMATCH"] };
    return { verdict: "ARTIFACT_VERIFIED", findings: [], bytes, identity: { dev: stat.dev, ino: stat.ino, size: stat.size } };
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Composite lane authority status. The composition is fail-closed: every input
// verdict must be the exact accepting value; anything else pins the ceiling.
// ---------------------------------------------------------------------------
export function laneAuthorityStatus(inputs) {
  const findings = [];
  const base = inputs?.baseVerification;
  const custody = inputs?.custodyAssessment;
  const policy = inputs?.policyRootVerification;
  if (base?.verdict !== "BASE_VERIFIED") findings.push("BASE_NOT_VERIFIED");
  if (policy?.verdict !== "POLICY_ROOT_VERIFIED") findings.push("POLICY_ROOT_NOT_VERIFIED");
  const ceiling = computeClaimCeiling(custody, findings.length === 0 && inputs?.localImplementationGreen === true);
  return {
    verdict: findings.length === 0 ? "LANE_AUTHORITY_MODEL_VERIFIED" : "LANE_AUTHORITY_BLOCKED",
    claim: ceiling.claim,
    trustedCertificationAuthorized: ceiling.trustedCertificationAuthorized,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Property register — the mutation denominator derives from this list (§XIII).
// Each property names the enforced invariant its guards implement.
// ---------------------------------------------------------------------------
export const PROPERTY_REGISTER = Object.freeze([
  "BASE_EXACT_IDENTITY_REQUIRED",            // P1AF-116: sha/tree/parents/type/remote all exact
  "PROHIBITED_BASE_REJECTED",                // P1AF-117: every prohibited class + unrecognized rejected
  "DIRTY_HEAD_REJECTED",                     // P1AF-117: dirty local HEAD is not a base
  "MANIFEST_ROLE_REDUCTION_REJECTED",        // §VIII: caller cannot shrink review stages
  "CALLER_REVIEWERS_REJECTED",               // §VIII: caller-defined reviewers rejected
  "DENOMINATOR_SUBSTITUTION_REJECTED",       // §VIII: 124 bound independently
  "REVIEWER_REGISTRY_NON_REPLACEABLE",       // P1AF-012
  "REVIEWER_FIELDS_REQUIRED",                // §IX: all 7 identity fields required
  "UNKNOWN_REVIEWER_REJECTED",               // §IX
  "WRONG_DOMAIN_REVIEWER_REJECTED",          // §IX
  "STALE_REVIEWER_CONTRACT_REJECTED",        // §IX
  "CALLER_INDEPENDENCE_REJECTED",            // §IX: independence is registry-derived
  "SINGLE_REVIEWER_ALL_STAGES_REJECTED",     // §IX
  "SUBJECT_DIGEST_BINDING_REQUIRED",         // §IX: SUBJECT_IDENTITY must be a digest
  "POLICY_ROOT_SUBSTITUTION_REJECTED",       // P1AF-013: all four anchors exact
  "TRUSTED_SURFACE_FULL_COVERAGE",           // P1AF-010: 11/11 CODEOWNERS parity
  "COORDINATED_REWRITE_BLOCKED",             // P1AF-011: prior-CODEOWNERS approval authority
  "SELF_APPROVAL_REJECTED",                  // P1AF-011
  "DECLARED_EXECUTION_UNPROVEN",             // §X: declarations are not proof
  "FABRICATED_EXECUTION_DETECTED",           // §X: artifact digests must verify
  "RECEIPT_DIGEST_BINDING_REQUIRED",         // §VI: no filename-only receipts
  "SUPERSESSION_CHAIN_ENFORCED",             // §VI: digest chain + preservation + founder decision
  "CUSTODY_NOT_PROVEN_DEFAULT",              // P1AF-008: absence of observation = NOT_PROVEN
  "SIMULATED_INDEPENDENCE_REJECTED",         // P1AF-019: local evidence cannot claim external
  "CLAIM_CEILING_ENFORCED",                  // P1AF-019: bounded honest maximum
  "GATE_COMPLETENESS_REQUIRED",              // P1AF-018: all 11 named human gates
  "HISTORY_REWRITE_PROHIBITED",              // P1AF-017
  "ROLLBACK_REQUIRES_REVIEWED_REVERT",       // P1AF-017
  "BOUNDARY_CAPABILITY_EXCLUSION",           // P1AF-020
  "SPEC_IS_NOT_RUNTIME",                     // P1AF-021
  "PATH_ESCAPE_REJECTED",                    // §XI
  "SYMLINK_SUBSTITUTION_REJECTED",           // §XI
  "SAME_FD_DIGEST_BINDING",                  // §XI: no stat-then-reopen trust
  // Post-Codex-review properties (INDEPENDENT_REVIEW_BLOCK remediation):
  "CUSTODY_RECEIPTS_ARE_ARTIFACTS_NOT_OBJECTS",   // F1: no in-memory custody input
  "LOCAL_CUSTODY_CANNOT_AUTHORIZE_CERTIFICATION", // F1: structural false ceiling
  "CUSTODY_PRODUCER_IDENTITY_REQUIRED",           // F1: canonical producer table
  "CUSTODY_SUBJECT_BINDING_REQUIRED",             // F1: receipt binds authorized base
  "CUSTODY_AUTHORITY_BINDING_REQUIRED",           // F1: receipt binds canonical authority
  "EXECUTION_READER_FIXED_TRUSTED",               // F2: no caller-suppliable reader
  "EXECUTION_SUBJECT_BINDING_REQUIRED",           // F2: receipts bind execution subject
  "EXECUTION_PRODUCER_IDENTITY_REQUIRED",         // F2: canonical producer table
  "AUTHORITY_MODULE_IN_TRUSTED_SURFACE",          // F3: validator+tests on the surface (14)
  "CODEOWNERS_LAST_MATCH_WINS_MODELED",           // F4: GitHub precedence semantics
  "CODEOWNERS_GLOB_SEMANTICS_MODELED",            // F4: * / ** / ? / dir patterns
  "CODEOWNERS_UNSUPPORTED_SYNTAX_FAIL_CLOSED",    // F4: ! [ ] \# rejected, not mis-modeled
  // V3 remediation (INDEPENDENT_REVIEW_BLOCK H1–H6):
  "EXECUTION_REQUIRES_SIGNED_ATTESTATION",        // H1: producer label alone is not OBSERVED_EXECUTION
  "PRODUCER_LABEL_IS_NOT_IDENTITY",               // H1: unauthenticated label fails closed
  "EXTERNAL_AUTHORITY_UNPROVISIONED_FAILS_CLOSED",// H1/H2: no anchor => nothing external provable
  "CUSTODY_REQUIRES_SIGNED_ATTESTATION",          // H2: caller source string cannot record observation
  "CUSTODY_SIGNATURE_SCOPE_BOUND_TO_CONTROL",     // H2: signature bound per control, no cross-control replay
  "GATE_COMPLETION_REQUIRES_SIGNED_ARTIFACT",     // H3: fabricated digests cannot complete a gate
  "GATE_ATTESTATION_SCOPE_BOUND_TO_GATE",         // H3: signature bound to the named gate
  "ROLLBACK_PLAN_IS_NOT_AUTHORIZATION",           // H4: assessRollbackAction never returns AUTHORIZED
  "ROLLBACK_AUTHORIZATION_REQUIRES_EXECUTION",    // H4: authorizeRollback needs signed execution attestation
  "ATTESTATION_SIGNATURE_VERIFIED_ED25519",       // H1-H4: real crypto positive control
  "ATTESTATION_CROSS_SUBJECT_REPLAY_REJECTED",    // H1-H4: subject bound in signed message
  "ATTESTATION_WRONG_CLAIM_TYPE_REJECTED",        // H1-H4: claim type bound in signed message
  "ENFORCEMENT_SURFACE_WORKFLOW_WIRED",           // H5: validator invoked by enforcement workflow
  "ENFORCEMENT_REQUIRED_CHECK_NOT_ASSERTED",      // H5: GitHub required-check enforcement bounded NOT_OBSERVED
  "PARENT_CODEOWNERS_GAP_FAILS_CLOSED",           // H6: uncovered-at-parent enforcement file blocks
]);

// ---------------------------------------------------------------------------
// H5 — CLI self-check. The enforcement workflow invokes this entrypoint; it
// re-verifies the live base identity and that the repository CODEOWNERS closes
// the trusted surface, exiting nonzero on any finding. "Defined" is not
// "enforced": required-status-check enforcement is external and NOT asserted.
// ---------------------------------------------------------------------------
export function selfCheck(repoRoot) {
  const findings = [];
  let observed;
  try { observed = observeGitBase(repoRoot); } catch { return { verdict: "SELF_CHECK_FAILED", findings: ["BASE_OBSERVATION_FAILED"] }; }
  const base = verifyRebuildBase(observed);
  if (base.verdict !== "BASE_VERIFIED") findings.push(...base.findings.map((f) => `BASE_${f}`));
  let codeowners = null;
  // The self-check reads CODEOWNERS through a containment-checked, symlink-free
  // reader (no external digest to bind against at self-check time).
  try { codeowners = readRepoTextFile(repoRoot, ".github/CODEOWNERS"); } catch { findings.push("CODEOWNERS_UNREADABLE"); }
  if (codeowners !== null) {
    const surface = verifyTrustedSurfaceCoverage(codeowners);
    if (surface.verdict !== "SURFACE_CLOSED") findings.push(...surface.findings.map((f) => `SURFACE_${f}`));
  }
  return findings.length
    ? { verdict: "SELF_CHECK_FAILED", findings }
    : { verdict: "SELF_CHECK_PASSED", findings: [], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };
}

function readRepoTextFile(rootDir, relPath) {
  if (typeof relPath !== "string" || isAbsolute(relPath) || relPath.split(/[\\/]/u).includes("..")) throw new Error("PATH_ESCAPE");
  const root = resolve(rootDir);
  const full = resolve(root, normalize(relPath));
  if (full !== root && !full.startsWith(root + sep)) throw new Error("PATH_ESCAPE");
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) { const r = readSync(fd, bytes, offset, stat.size - offset, offset); if (r <= 0) break; offset += r; }
    return bytes.toString("utf8");
  } finally { closeSync(fd); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.argv[2] ?? resolve(new URL("..", import.meta.url).pathname);
  const result = selfCheck(repoRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.verdict === "SELF_CHECK_PASSED" ? 0 : 1;
}
