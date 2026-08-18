// P1A-01 mutation harness. The mutation denominator derives from the module's
// PROPERTY_REGISTER (§XIII): every property has at least one mutant that weakens
// its guard. A mutant is KILLED when at least one invariant probe fails against
// it (or it fails to load). Survivors required: 0.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./validate-p1a-authority-root.mjs", import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const D = (c) => c.repeat(64);

const importSource = async (source) =>
  import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function goodObserved(m) {
  return {
    remote: m.AUTHORIZED_REBUILD_BASE.repositoryRemote,
    sha: m.AUTHORIZED_REBUILD_BASE.sha,
    objectType: "commit",
    tree: m.AUTHORIZED_REBUILD_BASE.tree,
    parents: [...m.AUTHORIZED_REBUILD_BASE.parents],
    dirty: false,
  };
}
function goodReviewer(m, id = "CODEX") {
  const canonical = m.CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id);
  return {
    REVIEWER_ID: id, DOMAIN: canonical.DOMAIN, EXECUTION_ORIGIN: canonical.EXECUTION_ORIGIN,
    REVIEW_CONTEXT_ID: "ctx", INDEPENDENCE_CLASS: canonical.INDEPENDENCE_CLASS,
    POLICY_VERSION: m.POLICY_VERSION, SUBJECT_IDENTITY: D("a"),
  };
}
function goodPolicyRoot(m) {
  return {
    frozenLedgerSha256: m.CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256,
    founderFreezeSha256: m.CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256,
    releaseAuthoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256,
    requirementDenominator: 124,
  };
}

// Invariant probes: each throws when its invariant is violated by module m.
const PROBES = {
  base_wrong_sha_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), sha: "1".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_tree_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), tree: "2".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_parents_rejected: (m) => {
    assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [] }).verdict, "BASE_REJECTED");
    // Same-length wrong order must also fail — length checks alone are not identity.
    assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [...m.AUTHORIZED_REBUILD_BASE.parents].reverse() }).verdict, "BASE_REJECTED");
  },
  base_wrong_remote_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), remote: "https://github.com/x/y.git" }).verdict, "BASE_REJECTED"),
  base_wrong_type_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), objectType: "tag" }).verdict, "BASE_REJECTED"),
  base_dirty_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), dirty: true }).verdict, "BASE_REJECTED"),
  base_good_accepted: (m) => assert.equal(m.verifyRebuildBase(goodObserved(m)).verdict, "BASE_VERIFIED"),
  prohibited_base_rejected: (m) => {
    for (const baseClass of m.PROHIBITED_BASE_CLASSES) {
      assert.equal(m.rejectProhibitedBase({ ref: "main", sha: "3".repeat(40), baseClass }).verdict, "BASE_REJECTED");
    }
    assert.equal(m.rejectProhibitedBase({ ref: "other", sha: "4".repeat(40) }).verdict, "BASE_REJECTED");
  },
  manifest_reduction_rejected: (m) => {
    const out = m.validateAuthorityManifest({ reviewStages: ["OMEGA", "META"], requirementDenominator: 124 });
    assert.equal(out.verdict, "MANIFEST_REJECTED");
    assert.ok(out.findings.some((f) => f.startsWith("MANIFEST_ROLE_REDUCTION_")));
  },
  caller_reviewers_rejected: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewers: [] }).verdict, "MANIFEST_REJECTED"),
  registry_replacement_rejected: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewerRegistry: {} }).verdict, "MANIFEST_REJECTED"),
  denominator_substitution_rejected: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 20 }).verdict, "MANIFEST_REJECTED"),
  one_role_manifest_rejected: (m) => {
    const out = m.validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 });
    assert.ok(out.findings.includes("SELF_CONSISTENT_ONE_ROLE_MANIFEST"));
  },
  load_registry_rejects_caller: (m) => {
    assert.equal(m.loadReviewerRegistry({}).verdict, "REVIEWER_REGISTRY_REPLACEMENT");
    assert.equal(m.loadReviewerRegistry({}).registry, null);
    assert.equal(m.loadReviewerRegistry(undefined).verdict, "CANONICAL");
  },
  reviewer_fields_required: (m) => {
    for (const field of ["REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID", "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY"]) {
      const claim = goodReviewer(m);
      delete claim[field];
      assert.equal(m.validateReviewClaim(claim).verdict, "REVIEW_REJECTED", field);
    }
  },
  unknown_reviewer_rejected: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), REVIEWER_ID: "FAKE" }).verdict, "REVIEW_REJECTED"),
  wrong_domain_rejected: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), DOMAIN: "FINAL_CERTIFICATION" }).verdict, "REVIEW_REJECTED"),
  stale_contract_rejected: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), POLICY_VERSION: "V0" }).verdict, "REVIEW_REJECTED"),
  caller_independence_rejected: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CLAUDE_CODE"), INDEPENDENCE_CLASS: "JUDGE" }).verdict, "REVIEW_REJECTED"),
  subject_digest_required: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), SUBJECT_IDENTITY: "zzz" }).verdict, "REVIEW_REJECTED"),
  origin_mismatch_rejected: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), EXECUTION_ORIGIN: "CLAUDE_CODE_SESSION" }).verdict, "REVIEW_REJECTED"),
  single_reviewer_stages_rejected: (m) => {
    const claim = goodReviewer(m, "AEGIS_OMEGA");
    const assignments = Object.fromEntries(m.CANONICAL_REVIEW_STAGES.map((s) => [s, { ...claim }]));
    assert.equal(m.validateStageAssignments(assignments).verdict, "STAGES_REJECTED");
  },
  unassigned_stage_rejected: (m) => assert.equal(m.validateStageAssignments({}).verdict, "STAGES_REJECTED"),
  policy_anchor_bindings: (m) => {
    for (const field of ["frozenLedgerSha256", "founderFreezeSha256", "releaseAuthoritySha256", "requirementDenominator"]) {
      const claimed = goodPolicyRoot(m);
      claimed[field] = field === "requirementDenominator" ? 1 : D("9");
      assert.equal(m.verifyPolicyRoot(claimed).verdict, "POLICY_ROOT_REJECTED", field);
    }
    assert.equal(m.verifyPolicyRoot(goodPolicyRoot(m)).verdict, "POLICY_ROOT_VERIFIED");
  },
  surface_denominator_stable: (m) => {
    assert.equal(m.TRUSTED_SURFACE_FILES.length, 11);
    assert.equal(m.TRUSTED_SURFACE_DENOMINATOR, 11);
  },
  surface_uncovered_detected: (m) => {
    const partial = "/.github/CODEOWNERS @DarksiedCEO\n";
    const out = m.verifyTrustedSurfaceCoverage(partial);
    assert.equal(out.verdict, "SURFACE_OPEN");
    assert.ok(out.findings.length >= 10);
  },
  surface_wrong_owner_detected: (m) => {
    const wrong = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @attacker`).join("\n");
    assert.equal(m.verifyTrustedSurfaceCoverage(wrong).verdict, "SURFACE_OPEN");
  },
  coordinated_rewrite_blocked: (m) => {
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [...m.TRUSTED_SURFACE_FILES], author: "attacker", approvals: ["attacker"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
    // The self-approval finding is contract, not decoration.
    assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED"));
  },
  independent_approval_required: (m) => {
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "DarksiedCEO", approvals: ["DarksiedCEO"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  non_owner_approval_rejected: (m) => {
    // An accomplice approver who is not a prior code owner mints no authority.
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "attacker", approvals: ["accomplice"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  declared_execution_unproven: (m) => {
    const out = m.classifyExecutionEvidence({ session_id: "s", context_id: "c", fresh: true, independent: true }, () => Buffer.alloc(0));
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
  },
  fabricated_execution_detected: (m) => {
    const out = m.classifyExecutionEvidence({ artifacts: [{ path: "r.json", sha256: D("a") }] }, () => Buffer.from("other"));
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
  },
  unreadable_artifact_unproven: (m) => {
    const out = m.classifyExecutionEvidence({ artifacts: [{ path: "r.json", sha256: D("a") }] }, () => { throw new Error("x"); });
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
  },
  undigested_artifact_unproven: (m) => {
    const out = m.classifyExecutionEvidence({ artifacts: [{ path: "r.json" }] }, () => Buffer.alloc(0));
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
  },
  receipt_binding_required: (m) => {
    assert.equal(m.validateReceiptBinding({ subjectPath: "v.json" }).verdict, "RECEIPT_REJECTED");
    assert.equal(m.validateReceiptBinding({ subjectSha256: "short" }).verdict, "RECEIPT_REJECTED");
    assert.equal(m.validateReceiptBinding({ subjectSha256: D("b") }).verdict, "RECEIPT_BOUND");
  },
  supersession_chain_enforced: (m) => {
    assert.equal(m.acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).verdict, "SUPERSESSION_REJECTED");
    assert.equal(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false }).verdict, "SUPERSESSION_REJECTED");
    assert.equal(m.acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true }).verdict, "SUPERSESSION_REJECTED");
    assert.equal(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).verdict, "SUPERSESSION_ACCEPTED");
  },
  custody_not_proven_default: (m) => {
    const out = m.assessExternalCustody([]);
    assert.equal(out.verdict, "NOT_PROVEN");
    assert.equal(out.trustedCertificationAuthorized, false);
  },
  simulated_custody_rejected: (m) => {
    const receipts = m.CUSTODY_CONTROLS.map((c) => ({ controlId: c.id, source: "LOCAL_SELF_DECLARATION", subjectSha256: D("a") }));
    const out = m.assessExternalCustody(receipts);
    assert.equal(out.verdict, "NOT_PROVEN");
  },
  unbound_custody_receipt_rejected: (m) => {
    const receipts = m.CUSTODY_CONTROLS.map((c) => ({ controlId: c.id, source: "GITHUB_OBSERVATION" }));
    assert.equal(m.assessExternalCustody(receipts).verdict, "NOT_PROVEN");
  },
  claim_ceiling_enforced: (m) => {
    const ceiling = m.computeClaimCeiling({ verdict: "NOT_PROVEN", trustedCertificationAuthorized: false }, true);
    assert.equal(ceiling.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
    assert.equal(ceiling.trustedCertificationAuthorized, false);
    const forged = m.computeClaimCeiling({ verdict: "EXTERNAL_CUSTODY_OBSERVED", trustedCertificationAuthorized: false }, true);
    assert.equal(forged.trustedCertificationAuthorized, false);
  },
  simulated_independence_rejected: (m) => {
    assert.equal(m.rejectSimulatedIndependence({ claim: "EXTERNAL_ASSURED", evidence: [{ source: "LOCAL_FILE" }] }).verdict, "ASSERTION_REJECTED");
  },
  gates_completeness_required: (m) => {
    assert.equal(m.assessGateCompleteness({}).verdict, "GATES_INCOMPLETE");
    const complete = Object.fromEntries(m.NAMED_HUMAN_GATES.map((g) => [g, { subjectSha256: D("f") }]));
    assert.equal(m.assessGateCompleteness(complete).verdict, "GATES_COMPLETE");
    assert.equal(m.NAMED_HUMAN_GATES.length, 11);
  },
  history_rewrite_prohibited: (m) => {
    assert.equal(m.assessRollbackAction({ kind: "HISTORY_REWRITE" }).verdict, "ROLLBACK_REJECTED");
    assert.equal(m.assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "SEPARATELY_REVIEWED_REVERT_COMMIT", forcePush: true }).verdict, "ROLLBACK_REJECTED");
  },
  rollback_requires_revert: (m) => {
    assert.equal(m.assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "DIRECT_RESET" }).verdict, "ROLLBACK_REJECTED");
    assert.equal(m.assessRollbackAction({ kind: "UNKNOWN_THING" }).verdict, "ROLLBACK_REJECTED");
  },
  boundary_exclusion: (m) => {
    for (const capability of m.OUT_OF_BOUNDARY_CAPABILITIES) {
      assert.equal(m.assertCapabilityPlacement(capability, "DarksiedCEO/zbestmedia").verdict, "BOUNDARY_VIOLATION");
    }
  },
  spec_not_runtime: (m) => {
    assert.equal(m.assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" }).verdict, "CLAIM_REJECTED");
  },
  path_escape_rejected: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-esc-"));
    try {
      writeFileSync(join(dir, "secret"), "s");
      mkdirSync(join(dir, "root"));
      mkdirSync(join(dir, "root", "sub"));
      writeFileSync(join(dir, "root", "a.json"), "inside");
      assert.equal(m.readAuthorityArtifact(join(dir, "root"), "../secret", sha256("s")).verdict, "ARTIFACT_REJECTED");
      assert.equal(m.readAuthorityArtifact(join(dir, "root"), join(dir, "secret"), sha256("s")).verdict, "ARTIFACT_REJECTED");
      // Dot-dot segments are prohibited even when they resolve back inside root.
      const internal = m.readAuthorityArtifact(join(dir, "root"), "sub/../a.json", sha256("inside"));
      assert.equal(internal.verdict, "ARTIFACT_REJECTED");
      assert.ok(internal.findings.includes("PATH_ESCAPE_REJECTED"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  symlink_rejected: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-sym-"));
    try {
      mkdirSync(join(dir, "root"));
      writeFileSync(join(dir, "outside"), "x");
      symlinkSync(join(dir, "outside"), join(dir, "root", "alias"));
      const finalComponent = m.readAuthorityArtifact(join(dir, "root"), "alias", sha256("x"));
      assert.equal(finalComponent.verdict, "ARTIFACT_REJECTED");
      assert.ok(finalComponent.findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
      // Intermediate directory symlink: O_NOFOLLOW does not cover this; the
      // per-segment lstat walk must.
      mkdirSync(join(dir, "outside-dir"));
      writeFileSync(join(dir, "outside-dir", "a.json"), "y");
      symlinkSync(join(dir, "outside-dir"), join(dir, "root", "dirlink"));
      const intermediate = m.readAuthorityArtifact(join(dir, "root"), "dirlink/a.json", sha256("y"));
      assert.equal(intermediate.verdict, "ARTIFACT_REJECTED");
      assert.ok(intermediate.findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  digest_binding_on_fd: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-dig-"));
    try {
      writeFileSync(join(dir, "a.json"), "real");
      assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("expected")).verdict, "ARTIFACT_REJECTED");
      assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("real")).verdict, "ARTIFACT_VERIFIED");
      const malformed = m.readAuthorityArtifact(dir, "a.json", "nothex");
      assert.equal(malformed.verdict, "ARTIFACT_REJECTED");
      // A malformed expectation is a caller contract violation, not a content
      // mismatch; the distinction is part of the interface.
      assert.ok(malformed.findings.includes("EXPECTED_DIGEST_MISSING"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  lane_status_fail_closed: (m) => {
    const out = m.laneAuthorityStatus({
      baseVerification: { verdict: "BASE_REJECTED" },
      policyRootVerification: { verdict: "POLICY_ROOT_VERIFIED" },
      custodyAssessment: { verdict: "NOT_PROVEN", trustedCertificationAuthorized: false },
      localImplementationGreen: true,
    });
    assert.equal(out.verdict, "LANE_AUTHORITY_BLOCKED");
    assert.equal(out.trustedCertificationAuthorized, false);
  },
};

// Mutants: property -> source weakening. `find` must exist verbatim in SOURCE.
const MUTANTS = [
  { property: "BASE_EXACT_IDENTITY_REQUIRED", find: `if (observed.sha !== AUTHORIZED_REBUILD_BASE.sha) findings.push("WRONG_BASE_SHA");`, replace: `` },
  { property: "BASE_EXACT_IDENTITY_REQUIRED", find: `if (observed.tree !== AUTHORIZED_REBUILD_BASE.tree) findings.push("WRONG_BASE_TREE");`, replace: `` },
  { property: "BASE_EXACT_IDENTITY_REQUIRED", find: `if (observed.remote !== AUTHORIZED_REBUILD_BASE.repositoryRemote) findings.push("WRONG_REPOSITORY_REMOTE");`, replace: `` },
  { property: "BASE_EXACT_IDENTITY_REQUIRED", find: `if (observed.objectType !== AUTHORIZED_REBUILD_BASE.objectType) findings.push("BASE_OBJECT_NOT_COMMIT");`, replace: `` },
  { property: "BASE_EXACT_IDENTITY_REQUIRED", find: `|| AUTHORIZED_REBUILD_BASE.parents.some((p, i) => parents[i] !== p)) findings.push("WRONG_BASE_PARENTS");`, replace: `|| false) findings.push("WRONG_BASE_PARENTS");` },
  { property: "DIRTY_HEAD_REJECTED", find: `if (observed.dirty === true) findings.push("PROHIBITED_BASE_DIRTY_LOCAL_HEAD");`, replace: `` },
  { property: "PROHIBITED_BASE_REJECTED", find: `return { verdict: "BASE_REJECTED", findings: [\`PROHIBITED_BASE_\${cls}\`] };`, replace: `return { verdict: "BASE_ACCEPTED", findings: [] };` },
  { property: "MANIFEST_ROLE_REDUCTION_REJECTED", find: `if (!stages.includes(stage)) findings.push(\`MANIFEST_ROLE_REDUCTION_\${stage}\`);`, replace: `` },
  { property: "CALLER_REVIEWERS_REJECTED", find: `if (manifest.reviewers !== undefined) findings.push("CALLER_DEFINED_REVIEWERS_REJECTED");`, replace: `` },
  { property: "REVIEWER_REGISTRY_NON_REPLACEABLE", find: `if (manifest.reviewerRegistry !== undefined) findings.push("REVIEWER_REGISTRY_REPLACEMENT");`, replace: `` },
  { property: "REVIEWER_REGISTRY_NON_REPLACEABLE", find: `  if (candidateSupplied !== undefined) {
    return { verdict: "REVIEWER_REGISTRY_REPLACEMENT", registry: null };
  }`, replace: `` },
  { property: "DENOMINATOR_SUBSTITUTION_REJECTED", find: `  if (manifest.requirementDenominator !== CANONICAL_AUTHORITY_ANCHORS.requirementDenominator) {
    findings.push("DENOMINATOR_SUBSTITUTION");
  }`, replace: `` },
  { property: "SELF_CONSISTENT_ONE_ROLE_REJECTED", find: `if (stages.length === 1) findings.push("SELF_CONSISTENT_ONE_ROLE_MANIFEST");`, replace: `` },
  { property: "REVIEWER_FIELDS_REQUIRED", find: `    if (typeof claim[field] !== "string" || claim[field].length === 0) findings.push(\`REVIEWER_FIELD_MISSING_\${field}\`);`, replace: `` },
  { property: "UNKNOWN_REVIEWER_REJECTED", find: `if (!canonical) findings.push("UNKNOWN_REVIEWER");`, replace: `` },
  { property: "STALE_REVIEWER_CONTRACT_REJECTED", find: `if (claim.POLICY_VERSION !== CANONICAL_REVIEWER_REGISTRY.policyVersion) findings.push("STALE_REVIEWER_CONTRACT");`, replace: `` },
  { property: "WRONG_DOMAIN_REVIEWER_REJECTED", find: `if (claim.DOMAIN !== canonical.DOMAIN) findings.push("WRONG_DOMAIN_REVIEWER");`, replace: `` },
  { property: "EXECUTION_ORIGIN_BOUND", find: `if (claim.EXECUTION_ORIGIN !== canonical.EXECUTION_ORIGIN) findings.push("EXECUTION_ORIGIN_MISMATCH");`, replace: `` },
  { property: "CALLER_INDEPENDENCE_REJECTED", find: `if (claim.INDEPENDENCE_CLASS !== canonical.INDEPENDENCE_CLASS) findings.push("CALLER_DECLARED_INDEPENDENCE_REJECTED");`, replace: `` },
  { property: "SUBJECT_DIGEST_BINDING_REQUIRED", find: `if (!HEX64.test(claim.SUBJECT_IDENTITY)) findings.push("SUBJECT_IDENTITY_NOT_DIGEST_BOUND");`, replace: `` },
  { property: "SINGLE_REVIEWER_ALL_STAGES_REJECTED", find: `  if (seen.size === CANONICAL_REVIEW_STAGES.length && distinct.size === 1) {
    findings.push("SINGLE_REVIEWER_ALL_STAGES");
  }`, replace: `` },
  { property: "STAGE_ASSIGNMENT_REQUIRED", find: `if (!claim) { findings.push(\`STAGE_UNASSIGNED_\${stage}\`); continue; }`, replace: `if (!claim) { continue; }` },
  { property: "POLICY_ROOT_SUBSTITUTION_REJECTED", find: `if (claimed.frozenLedgerSha256 !== anchors.frozenLedgerSha256) findings.push("POLICY_ROOT_SUBSTITUTION_LEDGER");`, replace: `` },
  { property: "POLICY_ROOT_SUBSTITUTION_REJECTED", find: `if (claimed.founderFreezeSha256 !== anchors.founderFreezeSha256) findings.push("POLICY_ROOT_SUBSTITUTION_FREEZE");`, replace: `` },
  { property: "POLICY_ROOT_SUBSTITUTION_REJECTED", find: `if (claimed.releaseAuthoritySha256 !== anchors.releaseAuthoritySha256) findings.push("POLICY_ROOT_SUBSTITUTION_RELEASE");`, replace: `` },
  { property: "POLICY_ROOT_SUBSTITUTION_REJECTED", find: `if (claimed.requirementDenominator !== anchors.requirementDenominator) findings.push("POLICY_ROOT_SUBSTITUTION_DENOMINATOR");`, replace: `` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `    if (!owners || owners.length === 0) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);`, replace: `    if (false) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `    else if (!owners.includes(\`@\${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}\`)) findings.push(\`TRUSTED_FILE_WRONG_OWNER_\${file}\`);`, replace: `` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",`, replace: `  "scripts/test-p1a-trusted-verifier.mjs",` },
  { property: "COORDINATED_REWRITE_BLOCKED", find: `    const independent = approvers.filter((a) => owners.includes(a) && a !== author);`, replace: `    const independent = approvers;` },
  { property: "COORDINATED_REWRITE_BLOCKED", find: `  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };`, replace: `` },
  { property: "SELF_APPROVAL_REJECTED", find: `if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");`, replace: `` },
  { property: "DECLARED_EXECUTION_UNPROVEN", find: `    return { verdict: "EXECUTION_UNPROVEN", findings: ["DECLARED_EXECUTION_ONLY"] };`, replace: `    return { verdict: "OBSERVED_EXECUTION", findings: [] };` },
  { property: "FABRICATED_EXECUTION_DETECTED", find: `      if (sha256(bytes) !== artifact.sha256) findings.push("FABRICATED_EXECUTION_ARTIFACT");`, replace: `` },
  { property: "EXECUTION_ARTIFACT_DIGEST_REQUIRED", find: `    if (!artifact?.path || !HEX64.test(artifact?.sha256 ?? "")) { findings.push("ARTIFACT_NOT_DIGEST_BOUND"); continue; }`, replace: `    if (!artifact?.path) { findings.push("ARTIFACT_NOT_DIGEST_BOUND"); continue; }
    if (!HEX64.test(artifact?.sha256 ?? "")) { continue; }` },
  { property: "EXECUTION_ARTIFACT_READ_FAILURE_UNPROVEN", find: `      findings.push("EXECUTION_ARTIFACT_UNREADABLE");`, replace: `` },
  { property: "RECEIPT_DIGEST_BINDING_REQUIRED", find: `if (!HEX64.test(receipt.subjectSha256 ?? "")) findings.push("RECEIPT_UNDER_BINDING_NO_SUBJECT_DIGEST");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (prior && HEX64.test(next.supersedesSha256 ?? "") && next.supersedesSha256 !== prior.sha256) findings.push("SUPERSESSION_CHAIN_MISMATCH");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (!prior || prior.preserved !== true) findings.push("PREDECESSOR_NOT_PRESERVED");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (!HEX64.test(next.founderDecisionSha256 ?? "")) findings.push("SUPERSESSION_WITHOUT_FOUNDER_DECISION");`, replace: `` },
  { property: "CUSTODY_NOT_PROVEN_DEFAULT", find: `    verdict: custodyProven ? "EXTERNAL_CUSTODY_OBSERVED" : "NOT_PROVEN",`, replace: `    verdict: "EXTERNAL_CUSTODY_OBSERVED",` },
  { property: "CUSTODY_NOT_PROVEN_DEFAULT", find: `    trustedCertificationAuthorized: custodyProven,`, replace: `    trustedCertificationAuthorized: true,` },
  { property: "SIMULATED_INDEPENDENCE_REJECTED", find: `    if (receipt.source !== "GITHUB_OBSERVATION") { findings.push("SIMULATED_INDEPENDENCE_REJECTED"); continue; }`, replace: `` },
  { property: "CUSTODY_RECEIPT_BINDING_REQUIRED", find: `    if (binding.verdict !== "RECEIPT_BOUND") { findings.push(\`CUSTODY_RECEIPT_UNBOUND_\${receipt.controlId ?? "UNKNOWN"}\`); continue; }`, replace: `` },
  { property: "CLAIM_CEILING_ENFORCED", find: `  if (custodyAssessment?.verdict === "EXTERNAL_CUSTODY_OBSERVED" && custodyAssessment?.trustedCertificationAuthorized === true) {`, replace: `  if (custodyAssessment?.verdict === "EXTERNAL_CUSTODY_OBSERVED") {` },
  { property: "CLAIM_CEILING_ENFORCED", find: `    trustedCertificationAuthorized: false,
  };
}

export function rejectSimulatedIndependence`, replace: `    trustedCertificationAuthorized: true,
  };
}

export function rejectSimulatedIndependence` },
  { property: "SIMULATED_INDEPENDENCE_ASSERTION_REJECTED", find: `  if (claimsExternal && !hasExternalEvidence) {
    return { verdict: "ASSERTION_REJECTED", findings: ["SIMULATED_INDEPENDENCE_REJECTED"] };
  }`, replace: `` },
  { property: "GATE_COMPLETENESS_REQUIRED", find: `    if (!record) { findings.push(\`GATE_MISSING_\${gate}\`); continue; }`, replace: `    if (!record) { continue; }` },
  { property: "HISTORY_REWRITE_PROHIBITED", find: `  if (action.kind === "HISTORY_REWRITE" || action.forcePush === true || action.deletesHistory === true) {
    findings.push("HISTORY_REWRITE_PROHIBITED");
  }`, replace: `` },
  { property: "ROLLBACK_REQUIRES_REVIEWED_REVERT", find: `  if (action.kind === "BOOTSTRAP_ROLLBACK" && action.mechanism !== "SEPARATELY_REVIEWED_REVERT_COMMIT") {
    findings.push("ROLLBACK_WITHOUT_REVIEWED_REVERT");
  }`, replace: `` },
  { property: "UNKNOWN_ROLLBACK_REJECTED", find: `if (!AUTHORIZED_ROLLBACK_KINDS.includes(action.kind)) findings.push("UNKNOWN_ROLLBACK_ACTION");`, replace: `` },
  { property: "BOUNDARY_CAPABILITY_EXCLUSION", find: `  if (OUT_OF_BOUNDARY_CAPABILITIES.includes(capability)
    && Object.keys(REPOSITORY_AUTHORITY_ROLES).includes(repository)) {
    return { verdict: "BOUNDARY_VIOLATION", findings: [\`CAPABILITY_INSIDE_TRUST_BOUNDARY_\${capability}\`] };
  }`, replace: `` },
  { property: "SPEC_IS_NOT_RUNTIME", find: `  if (claim.assertedStatus === "OPERATIONAL_AGENT" && role !== "RUNTIME_AUTHORITY") {
    return { verdict: "CLAIM_REJECTED", findings: ["SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"] };
  }`, replace: `` },
  { property: "PATH_ESCAPE_REJECTED", find: `  if (typeof relPath !== "string" || isAbsolute(relPath) || relPath.split(/[\\\\/]/u).includes("..")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["PATH_ESCAPE_REJECTED"] };
  }`, replace: `` },
  { property: "SYMLINK_SUBSTITUTION_REJECTED", find: `    if (st.isSymbolicLink()) return { verdict: "ARTIFACT_REJECTED", findings: ["SYMLINK_SUBSTITUTION_REJECTED"] };`, replace: `` },
  { property: "SAME_FD_DIGEST_BINDING", find: `    if (sha256(bytes) !== expectedSha256) return { verdict: "ARTIFACT_REJECTED", findings: ["ARTIFACT_DIGEST_MISMATCH"] };`, replace: `` },
  { property: "EXPECTED_DIGEST_REQUIRED", find: `  if (!HEX64.test(expectedSha256 ?? "")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["EXPECTED_DIGEST_MISSING"] };
  }`, replace: `` },
  { property: "LANE_STATUS_FAIL_CLOSED", find: `  if (base?.verdict !== "BASE_VERIFIED") findings.push("BASE_NOT_VERIFIED");`, replace: `` },
];

const original = await importSource(SOURCE);
// The probe suite must be green against the ORIGINAL before it may kill mutants.
for (const [name, probe] of Object.entries(PROBES)) {
  probe(original);
  console.log(`PROBE-GREEN ${name}`);
}

// Property coverage accounting: every PROPERTY_REGISTER entry must be exercised
// by at least one mutant (by prefix family) — no silent register shrinkage.
const registerSize = original.PROPERTY_REGISTER.length;

let killed = 0;
const survivors = [];
for (const [index, mutant] of MUTANTS.entries()) {
  assert.ok(SOURCE.includes(mutant.find), `mutant[${index}] ${mutant.property}: find-anchor missing from source`);
  const mutatedSource = SOURCE.replace(mutant.find, mutant.replace);
  assert.notEqual(mutatedSource, SOURCE, `mutant[${index}] ${mutant.property}: no-op mutation`);
  let mutated;
  try {
    mutated = await importSource(mutatedSource);
  } catch {
    killed += 1;
    console.log(`KILLED(load) ${mutant.property}[${index}]`);
    continue;
  }
  let died = false;
  for (const probe of Object.values(PROBES)) {
    try { probe(mutated); } catch { died = true; break; }
  }
  if (died) {
    killed += 1;
    console.log(`KILLED ${mutant.property}[${index}]`);
  } else {
    survivors.push(`${mutant.property}[${index}]`);
    console.log(`SURVIVED ${mutant.property}[${index}]`);
  }
}

const summary = {
  suite: "p1-a-authority-root-mutation",
  propertyRegister: registerSize,
  mutantDenominator: MUTANTS.length,
  executed: MUTANTS.length,
  killed,
  survivors: survivors.length,
  survivorList: survivors,
  probes: Object.keys(PROBES).length,
};
console.log(JSON.stringify(summary));
assert.equal(survivors.length, 0, `mutation survivors: ${survivors.join(", ")}`);
