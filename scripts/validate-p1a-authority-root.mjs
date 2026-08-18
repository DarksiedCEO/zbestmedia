// P1A-01 — Authority Root / External Custody.
// Frozen requirements: P1AF-001..013, 017..021, 116, 117 (ledger f1010f1b…, denominator 124).
// Governing law: AEGIS cannot be the root of its own authority; local implementation
// cannot create its own authority and label it independent. Every verdict here fails
// closed: unknown, missing, or caller-supplied authority is rejected, never defaulted.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, fstatSync, lstatSync, closeSync, constants } from "node:fs";
import { resolve, sep, isAbsolute, normalize } from "node:path";

export const POLICY_VERSION = "P1A_AUTHORITY_POLICY_V1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;

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
export const TRUSTED_SURFACE_FILES = Object.freeze([
  ".github/CODEOWNERS",
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/detect-p1a-ordinary-ci-secrets.mjs",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-ci-secret-detector.mjs",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
export const TRUSTED_SURFACE_DENOMINATOR = 11;

export function parseCodeowners(content) {
  const entries = new Map();
  for (const line of String(content).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [pattern, ...owners] = trimmed.split(/\s+/u);
    entries.set(pattern.replace(/^\//u, ""), owners);
  }
  return entries;
}

export function verifyTrustedSurfaceCoverage(codeownersContent) {
  const findings = [];
  const entries = parseCodeowners(codeownersContent);
  if (TRUSTED_SURFACE_FILES.length !== TRUSTED_SURFACE_DENOMINATOR) findings.push("TRUSTED_SURFACE_DENOMINATOR_DRIFT");
  for (const file of TRUSTED_SURFACE_FILES) {
    const owners = entries.get(file);
    if (!owners || owners.length === 0) findings.push(`TRUSTED_FILE_UNCOVERED_${file}`);
    else if (!owners.includes(`@${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}`)) findings.push(`TRUSTED_FILE_WRONG_OWNER_${file}`);
  }
  return findings.length
    ? { verdict: "SURFACE_OPEN", findings, denominator: TRUSTED_SURFACE_DENOMINATOR }
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
  const priorOwners = parseCodeowners(change.priorCodeowners ?? "");
  const approvers = Array.isArray(change.approvals) ? change.approvals : [];
  const author = typeof change.author === "string" ? change.author : null;
  if (!author) findings.push("CHANGE_AUTHOR_MISSING");
  for (const file of touched) {
    const owners = (priorOwners.get(file) ?? []).map((o) => o.replace(/^@/u, ""));
    if (owners.length === 0) { findings.push(`PRIOR_OWNERSHIP_ABSENT_${file}`); continue; }
    const independent = approvers.filter((a) => owners.includes(a) && a !== author);
    if (independent.length === 0) findings.push(`INDEPENDENT_CODE_OWNER_APPROVAL_MISSING_${file}`);
  }
  if (touched.length === TRUSTED_SURFACE_FILES.length) findings.push("COORDINATED_FULL_SURFACE_REWRITE");
  if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");
  const blocking = findings.some((f) => f.startsWith("INDEPENDENT_CODE_OWNER_APPROVAL_MISSING_")
    || f.startsWith("PRIOR_OWNERSHIP_ABSENT_")
    || f === "SELF_APPROVAL_REJECTED"
    || f === "CHANGE_AUTHOR_MISSING");
  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };
  if (findings.length) return { verdict: "CHANGE_FLAGGED", findings };
  return { verdict: "CHANGE_AUTHORIZED", findings: [] };
}

// ---------------------------------------------------------------------------
// §X — declared vs observed execution.
// ---------------------------------------------------------------------------
export function classifyExecutionEvidence(claim, artifactReader) {
  if (!claim || typeof claim !== "object") {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_CLAIM_MISSING"] };
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
    try {
      const bytes = artifactReader(artifact.path);
      if (sha256(bytes) !== artifact.sha256) findings.push("FABRICATED_EXECUTION_ARTIFACT");
    } catch {
      findings.push("EXECUTION_ARTIFACT_UNREADABLE");
    }
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

export function assessExternalCustody(observationReceipts) {
  const findings = [];
  const receipts = Array.isArray(observationReceipts) ? observationReceipts : [];
  const byControl = new Map();
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== "object") { findings.push("CUSTODY_RECEIPT_MALFORMED"); continue; }
    if (receipt.source !== "GITHUB_OBSERVATION") { findings.push("SIMULATED_INDEPENDENCE_REJECTED"); continue; }
    const binding = validateReceiptBinding(receipt);
    if (binding.verdict !== "RECEIPT_BOUND") { findings.push(`CUSTODY_RECEIPT_UNBOUND_${receipt.controlId ?? "UNKNOWN"}`); continue; }
    byControl.set(receipt.controlId, receipt);
  }
  const unproven = CUSTODY_CONTROLS.filter((control) => !byControl.has(control.id));
  for (const control of unproven) findings.push(`CUSTODY_NOT_PROVEN_${control.id}`);
  const custodyProven = unproven.length === 0 && !findings.includes("SIMULATED_INDEPENDENCE_REJECTED");
  return {
    verdict: custodyProven ? "EXTERNAL_CUSTODY_OBSERVED" : "NOT_PROVEN",
    trustedCertificationAuthorized: custodyProven,
    findings,
    controlDenominator: CUSTODY_CONTROLS.length,
    controlsProven: CUSTODY_CONTROLS.length - unproven.length,
  };
}

export function assessGateCompleteness(gateEvidence) {
  const findings = [];
  const evidence = gateEvidence && typeof gateEvidence === "object" ? gateEvidence : {};
  for (const gate of NAMED_HUMAN_GATES) {
    const record = evidence[gate];
    if (!record) { findings.push(`GATE_MISSING_${gate}`); continue; }
    if (validateReceiptBinding(record).verdict !== "RECEIPT_BOUND") findings.push(`GATE_UNBOUND_${gate}`);
  }
  return findings.length
    ? { verdict: "GATES_INCOMPLETE", findings, gateDenominator: NAMED_HUMAN_GATES.length }
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
    : { verdict: "ROLLBACK_AUTHORIZED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-019 / P1AF-008 — honest claim ceiling.
// ---------------------------------------------------------------------------
export function computeClaimCeiling(custodyAssessment, localImplementationGreen) {
  if (custodyAssessment?.verdict === "EXTERNAL_CUSTODY_OBSERVED" && custodyAssessment?.trustedCertificationAuthorized === true) {
    return { claim: "EXTERNAL_CUSTODY_OBSERVED", trustedCertificationAuthorized: true };
  }
  // Absent observed custody the maximum honest claim is bounded, regardless of
  // what the caller asserts. Trusted certification must not run. P1AF-008.
  return {
    claim: localImplementationGreen === true
      ? "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING"
      : "EXTERNAL_ASSURANCE_AUTHORITY_PENDING",
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
]);
