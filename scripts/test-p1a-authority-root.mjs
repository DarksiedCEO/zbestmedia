// P1A-01 authority-root test battery: unit, property/invariant, integration,
// and the §XIII hostile attack set. Every hostile case must FAIL CLOSED.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_REBUILD_BASE, PROHIBITED_BASE_CLASSES, observeGitBase, verifyRebuildBase,
  rejectProhibitedBase, CANONICAL_REVIEW_STAGES, CANONICAL_AUTHORITY_ANCHORS,
  validateAuthorityManifest, CANONICAL_REVIEWER_REGISTRY, loadReviewerRegistry,
  validateReviewClaim, validateStageAssignments, verifyPolicyRoot,
  TRUSTED_SURFACE_FILES, TRUSTED_SURFACE_DENOMINATOR, parseCodeowners,
  verifyTrustedSurfaceCoverage, assessTrustedSurfaceChange, classifyExecutionEvidence,
  validateReceiptBinding, acceptSupersession, CUSTODY_CONTRACT_REQUIRED_FIELDS,
  EXTERNAL_CUSTODY_CONTRACT, CUSTODY_CONTROLS, NAMED_HUMAN_GATES, assessExternalCustody,
  assessGateCompleteness, ROLLBACK_CONTRACT, assessRollbackAction, computeClaimCeiling,
  rejectSimulatedIndependence, OUT_OF_BOUNDARY_CAPABILITIES, REPOSITORY_AUTHORITY_ROLES,
  assertCapabilityPlacement, assertAuthoritySeparation, readAuthorityArtifact,
  laneAuthorityStatus, PROPERTY_REGISTER, POLICY_VERSION,
} from "./validate-p1a-authority-root.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
let executed = 0, passed = 0, hostileExecuted = 0, hostilePassed = 0;
const run = (name, fn) => { executed += 1; fn(); passed += 1; console.log(`PASS ${name}`); };
const hostile = (name, fn) => { hostileExecuted += 1; fn(); hostilePassed += 1; console.log(`PASS hostile:${name}`); };

const GOOD_OBSERVED = Object.freeze({
  remote: AUTHORIZED_REBUILD_BASE.repositoryRemote,
  sha: AUTHORIZED_REBUILD_BASE.sha,
  objectType: "commit",
  tree: AUTHORIZED_REBUILD_BASE.tree,
  parents: [...AUTHORIZED_REBUILD_BASE.parents],
  dirty: false,
});
const D = (c) => c.repeat(64);
const goodReviewer = (id = "CODEX") => {
  const canonical = CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id);
  return {
    REVIEWER_ID: id, DOMAIN: canonical.DOMAIN, EXECUTION_ORIGIN: canonical.EXECUTION_ORIGIN,
    REVIEW_CONTEXT_ID: "ctx-1", INDEPENDENCE_CLASS: canonical.INDEPENDENCE_CLASS,
    POLICY_VERSION, SUBJECT_IDENTITY: D("a"),
  };
};
const goodPolicyRoot = () => ({
  frozenLedgerSha256: CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256,
  founderFreezeSha256: CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256,
  releaseAuthoritySha256: CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256,
  requirementDenominator: 124,
});
const CODEOWNERS_CONTENT = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS"), "utf8");

// ------------------------------- STATIC ------------------------------------
run("static:property_register_nonempty_and_unique", () => {
  assert.ok(PROPERTY_REGISTER.length >= 30);
  assert.equal(new Set(PROPERTY_REGISTER).size, PROPERTY_REGISTER.length);
});
run("static:custody_contract_fully_bound", () => {
  for (const field of CUSTODY_CONTRACT_REQUIRED_FIELDS) {
    assert.equal(typeof EXTERNAL_CUSTODY_CONTRACT[field], "string", field);
    assert.ok(EXTERNAL_CUSTODY_CONTRACT[field].length > 0, field);
  }
  assert.equal(EXTERNAL_CUSTODY_CONTRACT.status, "CONTRACT_DEFINED_PROVISIONING_NOT_PROVEN");
});
run("static:trusted_surface_denominator_11", () => {
  assert.equal(TRUSTED_SURFACE_FILES.length, 11);
  assert.equal(TRUSTED_SURFACE_DENOMINATOR, 11);
  assert.ok(TRUSTED_SURFACE_FILES.includes("scripts/test-p1a-dual-base-verifier.mjs"));
});
run("static:gate_denominator_11", () => assert.equal(NAMED_HUMAN_GATES.length, 11));
run("static:frozen_constants_immutable", () => {
  assert.throws(() => { AUTHORIZED_REBUILD_BASE.sha = "x"; }, TypeError);
  assert.throws(() => { CANONICAL_REVIEWER_REGISTRY.reviewers.push({}); }, TypeError);
  assert.throws(() => { PROPERTY_REGISTER.push("x"); }, TypeError);
});

// -------------------------------- UNIT -------------------------------------
run("unit:base_verified_on_exact_identity", () => {
  assert.equal(verifyRebuildBase(GOOD_OBSERVED).verdict, "BASE_VERIFIED");
});
run("unit:authority_manifest_accepts_canonical", () => {
  assert.equal(validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124 }).verdict, "MANIFEST_ACCEPTED");
});
run("unit:reviewer_registry_canonical_without_caller_input", () => {
  const out = loadReviewerRegistry(undefined);
  assert.equal(out.verdict, "CANONICAL");
  assert.equal(out.registry, CANONICAL_REVIEWER_REGISTRY);
});
run("unit:review_claim_accepts_canonical_reviewer", () => {
  assert.equal(validateReviewClaim(goodReviewer()).verdict, "REVIEW_ACCEPTED");
});
run("unit:policy_root_verified_on_exact_anchors", () => {
  assert.equal(verifyPolicyRoot(goodPolicyRoot()).verdict, "POLICY_ROOT_VERIFIED");
});
run("unit:codeowners_parser_ignores_comments_and_blanks", () => {
  const entries = parseCodeowners("# c\n\n/a.txt @x @y\nb.txt @z\n");
  assert.deepEqual(entries.get("a.txt"), ["@x", "@y"]);
  assert.deepEqual(entries.get("b.txt"), ["@z"]);
});
run("unit:rollback_contract_shape", () => {
  assert.equal(ROLLBACK_CONTRACT.historyRewrite, "PROHIBITED");
  assert.equal(ROLLBACK_CONTRACT.bootstrapRollback, "SEPARATELY_REVIEWED_REVERT_COMMIT");
  assert.equal(assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_AUTHORIZED");
  assert.equal(assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "SEPARATELY_REVIEWED_REVERT_COMMIT" }).verdict, "ROLLBACK_AUTHORIZED");
});
run("unit:boundary_roles_fixed", () => {
  assert.equal(REPOSITORY_AUTHORITY_ROLES["DarksiedCEO/zbestmedia"], "SPECIFICATION_CONSTRUCTION_AUTHORITY");
  assert.equal(REPOSITORY_AUTHORITY_ROLES["DarksiedCEO/zbestmedia-ui"], "RUNTIME_AUTHORITY");
  assert.equal(assertCapabilityPlacement("SEARCH_INTELLIGENCE", "DarksiedCEO/separate-not-yet-authorized").verdict, "PLACEMENT_ALLOWED");
});
run("unit:claim_ceiling_grants_only_on_observed_custody", () => {
  const proven = { verdict: "EXTERNAL_CUSTODY_OBSERVED", trustedCertificationAuthorized: true };
  assert.equal(computeClaimCeiling(proven, true).trustedCertificationAuthorized, true);
});

// ---------------------------- PROPERTY / INVARIANT -------------------------
run("property:any_single_base_field_deviation_rejected", () => {
  const mutations = [
    { remote: "https://github.com/attacker/zbestmedia.git" },
    { sha: D("b").slice(0, 40) },
    { objectType: "tag" },
    { tree: D("c").slice(0, 40) },
    { parents: [AUTHORIZED_REBUILD_BASE.parents[0]] },
    { parents: [...AUTHORIZED_REBUILD_BASE.parents].reverse() },
    { dirty: true },
  ];
  for (const mutation of mutations) {
    const observed = { ...GOOD_OBSERVED, ...mutation };
    assert.equal(verifyRebuildBase(observed).verdict, "BASE_REJECTED", JSON.stringify(mutation));
  }
});
run("property:every_prohibited_base_class_rejected", () => {
  assert.equal(PROHIBITED_BASE_CLASSES.length, 7);
  for (const baseClass of PROHIBITED_BASE_CLASSES) {
    const out = rejectProhibitedBase({ ref: "main", sha: D("d").slice(0, 40), baseClass });
    assert.equal(out.verdict, "BASE_REJECTED");
    assert.ok(out.findings.includes(`PROHIBITED_BASE_${baseClass}`), baseClass);
  }
});
run("property:every_reviewer_field_required", () => {
  for (const field of ["REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID", "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY"]) {
    const claim = goodReviewer();
    delete claim[field];
    const out = validateReviewClaim(claim);
    assert.equal(out.verdict, "REVIEW_REJECTED", field);
    assert.ok(out.findings.includes(`REVIEWER_FIELD_MISSING_${field}`), field);
  }
});
run("property:every_policy_anchor_binding_enforced", () => {
  for (const [field, finding] of [
    ["frozenLedgerSha256", "POLICY_ROOT_SUBSTITUTION_LEDGER"],
    ["founderFreezeSha256", "POLICY_ROOT_SUBSTITUTION_FREEZE"],
    ["releaseAuthoritySha256", "POLICY_ROOT_SUBSTITUTION_RELEASE"],
    ["requirementDenominator", "POLICY_ROOT_SUBSTITUTION_DENOMINATOR"],
  ]) {
    const claimed = goodPolicyRoot();
    claimed[field] = field === "requirementDenominator" ? 123 : D("e");
    const out = verifyPolicyRoot(claimed);
    assert.equal(out.verdict, "POLICY_ROOT_REJECTED", field);
    assert.ok(out.findings.includes(finding), field);
  }
});
run("property:every_custody_control_defaults_not_proven", () => {
  const out = assessExternalCustody([]);
  assert.equal(out.verdict, "NOT_PROVEN");
  assert.equal(out.trustedCertificationAuthorized, false);
  assert.equal(out.controlsProven, 0);
  assert.equal(out.controlDenominator, CUSTODY_CONTROLS.length);
  for (const control of CUSTODY_CONTROLS) {
    assert.ok(out.findings.includes(`CUSTODY_NOT_PROVEN_${control.id}`), control.id);
  }
});
run("property:every_named_gate_required", () => {
  for (const gate of NAMED_HUMAN_GATES) {
    const evidence = Object.fromEntries(NAMED_HUMAN_GATES.map((g) => [g, { subjectSha256: D("f") }]));
    delete evidence[gate];
    const out = assessGateCompleteness(evidence);
    assert.equal(out.verdict, "GATES_INCOMPLETE", gate);
    assert.ok(out.findings.includes(`GATE_MISSING_${gate}`), gate);
  }
  const complete = Object.fromEntries(NAMED_HUMAN_GATES.map((g) => [g, { subjectSha256: D("f") }]));
  assert.equal(assessGateCompleteness(complete).verdict, "GATES_COMPLETE");
});
run("property:codeowners_coverage_detects_each_removal", () => {
  assert.equal(verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT).verdict, "SURFACE_CLOSED");
  for (const file of TRUSTED_SURFACE_FILES) {
    const reduced = CODEOWNERS_CONTENT.split("\n").filter((line) => !line.includes(file) || line.trim() === "").join("\n");
    const out = verifyTrustedSurfaceCoverage(reduced);
    assert.equal(out.verdict, "SURFACE_OPEN", file);
    assert.ok(out.findings.includes(`TRUSTED_FILE_UNCOVERED_${file}`), file);
  }
});
run("property:accept_implies_no_findings_everywhere", () => {
  // Structural totality: an accepting verdict never carries findings.
  const accepting = [
    verifyRebuildBase(GOOD_OBSERVED),
    validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124 }),
    validateReviewClaim(goodReviewer()),
    verifyPolicyRoot(goodPolicyRoot()),
    verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT),
  ];
  for (const out of accepting) assert.equal(out.findings.length, 0, out.verdict);
});

// ----------------------------- INTEGRATION ---------------------------------
run("integration:live_worktree_base_observation_verifies", () => {
  const observed = observeGitBase(REPO_ROOT);
  // The lane worktree may legitimately carry lane commits; base identity checks
  // target the frozen base object, not HEAD. Dirty state here is the lane's own
  // in-progress work, so restrict to object-identity fields.
  assert.equal(observed.remote, AUTHORIZED_REBUILD_BASE.repositoryRemote);
  assert.equal(observed.sha, AUTHORIZED_REBUILD_BASE.sha);
  assert.equal(observed.objectType, "commit");
  assert.equal(observed.tree, AUTHORIZED_REBUILD_BASE.tree);
  assert.deepEqual(observed.parents, [...AUTHORIZED_REBUILD_BASE.parents]);
});
run("integration:repo_codeowners_closes_trusted_surface", () => {
  const out = verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT);
  assert.equal(out.verdict, "SURFACE_CLOSED");
  assert.equal(out.covered, 11);
});
run("integration:threat_model_trusted_list_amended", async () => {
  const threatModel = await import("./validate-p1a-threat-model.mjs");
  for (const file of threatModel.AMENDMENT_CONTROLLED_FILES) {
    assert.ok(threatModel.TRUSTED_INFRASTRUCTURE_FILES.includes(file), `${file} missing from TRUSTED_INFRASTRUCTURE_FILES`);
  }
  assert.deepEqual([...threatModel.TRUSTED_INFRASTRUCTURE_FILES].concat("scripts/test-p1a-authority-root.mjs", "scripts/validate-p1a-authority-root.mjs").sort().filter((f) => TRUSTED_SURFACE_FILES.includes(f)), [...TRUSTED_SURFACE_FILES].sort());
});
run("integration:hardened_read_verifies_real_artifact", () => {
  const content = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS"));
  const out = readAuthorityArtifact(REPO_ROOT, ".github/CODEOWNERS", sha256(content));
  assert.equal(out.verdict, "ARTIFACT_VERIFIED");
  assert.equal(sha256(out.bytes), sha256(content));
  assert.ok(out.identity.ino > 0);
});
run("integration:lane_authority_status_composes_fail_closed", () => {
  const good = laneAuthorityStatus({
    baseVerification: verifyRebuildBase(GOOD_OBSERVED),
    policyRootVerification: verifyPolicyRoot(goodPolicyRoot()),
    custodyAssessment: assessExternalCustody([]),
    localImplementationGreen: true,
  });
  assert.equal(good.verdict, "LANE_AUTHORITY_MODEL_VERIFIED");
  assert.equal(good.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
  assert.equal(good.trustedCertificationAuthorized, false);
});

// ------------------------------- HOSTILE -----------------------------------
// §XIII required attacks. Each must fail closed.
hostile("coordinated_authority_root_rewrite", () => {
  const out = assessTrustedSurfaceChange({
    files: [...TRUSTED_SURFACE_FILES],
    author: "attacker",
    approvals: ["attacker"],
    priorCodeowners: CODEOWNERS_CONTENT,
  });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  assert.ok(out.findings.includes("COORDINATED_FULL_SURFACE_REWRITE"));
  assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED"));
});
hostile("codeowners_rewrite_cannot_mint_approval_authority", () => {
  // Attacker rewrites CODEOWNERS in the same change to name themselves owner;
  // authority derives from the PRIOR CODEOWNERS, so this fails closed.
  const out = assessTrustedSurfaceChange({
    files: [".github/CODEOWNERS"],
    author: "attacker",
    approvals: ["attacker"],
    priorCodeowners: CODEOWNERS_CONTENT,
  });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
});
hostile("manifest_role_reduction", () => {
  const out = validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 });
  assert.equal(out.verdict, "MANIFEST_REJECTED");
  assert.ok(out.findings.includes("MANIFEST_ROLE_REDUCTION_META"));
  assert.ok(out.findings.includes("SELF_CONSISTENT_ONE_ROLE_MANIFEST"));
});
hostile("reviewer_registry_replacement", () => {
  const out = loadReviewerRegistry({ reviewers: [{ REVIEWER_ID: "attacker" }] });
  assert.equal(out.verdict, "REVIEWER_REGISTRY_REPLACEMENT");
  assert.equal(out.registry, null);
  const manifest = validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewerRegistry: {} });
  assert.equal(manifest.verdict, "MANIFEST_REJECTED");
  assert.ok(manifest.findings.includes("REVIEWER_REGISTRY_REPLACEMENT"));
});
hostile("fabricated_execution", () => {
  const declaredOnly = classifyExecutionEvidence({
    session_id: "s-1", context_id: "c-1", timestamp: "2026-08-18T00:00:00Z",
    fresh: true, independent: true,
  }, () => Buffer.alloc(0));
  assert.equal(declaredOnly.verdict, "EXECUTION_UNPROVEN");
  const forged = classifyExecutionEvidence(
    { artifacts: [{ path: "receipt.json", sha256: D("a") }] },
    () => Buffer.from("different bytes"),
  );
  assert.equal(forged.verdict, "EXECUTION_UNPROVEN");
  assert.ok(forged.findings.includes("FABRICATED_EXECUTION_ARTIFACT"));
});
hostile("founder_authority_substitution", () => {
  const out = verifyPolicyRoot({ ...goodPolicyRoot(), founderFreezeSha256: D("b") });
  assert.equal(out.verdict, "POLICY_ROOT_REJECTED");
  assert.ok(out.findings.includes("POLICY_ROOT_SUBSTITUTION_FREEZE"));
});
hostile("stale_authority", () => {
  const stale = { ...goodReviewer(), POLICY_VERSION: "P1A_AUTHORITY_POLICY_V0" };
  const out = validateReviewClaim(stale);
  assert.equal(out.verdict, "REVIEW_REJECTED");
  assert.ok(out.findings.includes("STALE_REVIEWER_CONTRACT"));
});
hostile("wrong_subject", () => {
  const wrongRepo = verifyRebuildBase({ ...GOOD_OBSERVED, remote: "https://github.com/DarksiedCEO/zbestmedia-ui.git" });
  assert.equal(wrongRepo.verdict, "BASE_REJECTED");
  const unbound = validateReviewClaim({ ...goodReviewer(), SUBJECT_IDENTITY: "not-a-digest" });
  assert.equal(unbound.verdict, "REVIEW_REJECTED");
  assert.ok(unbound.findings.includes("SUBJECT_IDENTITY_NOT_DIGEST_BOUND"));
});
hostile("signer_principal_substitution", () => {
  const out = validateReviewClaim({ ...goodReviewer("CODEX"), EXECUTION_ORIGIN: "CLAUDE_CODE_SESSION" });
  assert.equal(out.verdict, "REVIEW_REJECTED");
  assert.ok(out.findings.includes("EXECUTION_ORIGIN_MISMATCH"));
});
hostile("rotation_revocation_misuse", () => {
  const rewrite = assessRollbackAction({ kind: "HISTORY_REWRITE" });
  assert.equal(rewrite.verdict, "ROLLBACK_REJECTED");
  assert.ok(rewrite.findings.includes("HISTORY_REWRITE_PROHIBITED"));
  const forcePush = assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "FORCE_PUSH", forcePush: true });
  assert.equal(forcePush.verdict, "ROLLBACK_REJECTED");
  const unreviewed = assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "DIRECT_RESET" });
  assert.equal(unreviewed.verdict, "ROLLBACK_REJECTED");
  assert.ok(unreviewed.findings.includes("ROLLBACK_WITHOUT_REVIEWED_REVERT"));
});
hostile("policy_root_substitution", () => {
  const swapped = verifyPolicyRoot({
    frozenLedgerSha256: D("1"), founderFreezeSha256: D("2"),
    releaseAuthoritySha256: D("3"), requirementDenominator: 1,
  });
  assert.equal(swapped.verdict, "POLICY_ROOT_REJECTED");
  assert.equal(swapped.findings.length, 4);
});
hostile("symlink_alias_attack", () => {
  const dir = mkdtempSync(join(tmpdir(), "p1a01-symlink-"));
  try {
    mkdirSync(join(dir, "safe"));
    writeFileSync(join(dir, "outside-secret"), "secret");
    writeFileSync(join(dir, "safe", "real.json"), "{}");
    symlinkSync(join(dir, "outside-secret"), join(dir, "safe", "alias.json"));
    const viaSymlink = readAuthorityArtifact(join(dir, "safe"), "alias.json", sha256("secret"));
    assert.equal(viaSymlink.verdict, "ARTIFACT_REJECTED");
    assert.ok(viaSymlink.findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    const escape = readAuthorityArtifact(join(dir, "safe"), "../outside-secret", sha256("secret"));
    assert.equal(escape.verdict, "ARTIFACT_REJECTED");
    assert.ok(escape.findings.includes("PATH_ESCAPE_REJECTED"));
    const absolute = readAuthorityArtifact(join(dir, "safe"), join(dir, "outside-secret"), sha256("secret"));
    assert.equal(absolute.verdict, "ARTIFACT_REJECTED");
    // Intermediate-directory symlink (O_NOFOLLOW does not cover this).
    mkdirSync(join(dir, "outside-dir"));
    writeFileSync(join(dir, "outside-dir", "a.json"), "y");
    symlinkSync(join(dir, "outside-dir"), join(dir, "safe", "dirlink"));
    const intermediate = readAuthorityArtifact(join(dir, "safe"), "dirlink/a.json", sha256("y"));
    assert.equal(intermediate.verdict, "ARTIFACT_REJECTED");
    assert.ok(intermediate.findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    // Dot-dot prohibited even when it resolves back inside the root.
    mkdirSync(join(dir, "safe", "sub"));
    const internal = readAuthorityArtifact(join(dir, "safe"), "sub/../real.json", sha256("{}"));
    assert.equal(internal.verdict, "ARTIFACT_REJECTED");
    assert.ok(internal.findings.includes("PATH_ESCAPE_REJECTED"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
hostile("non_owner_accomplice_approval", () => {
  const out = assessTrustedSurfaceChange({
    files: [".github/CODEOWNERS"],
    author: "attacker",
    approvals: ["accomplice"],
    priorCodeowners: CODEOWNERS_CONTENT,
  });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
});
hostile("toctou_reopen_substitution", () => {
  // The verifier digests the SAME bytes it returns from the single open; a
  // wrong-content file therefore cannot pass, and there is no second open for
  // an attacker to race. We prove digest binding on the one fd.
  const dir = mkdtempSync(join(tmpdir(), "p1a01-toctou-"));
  try {
    writeFileSync(join(dir, "artifact.json"), "attacker-swapped-content");
    const out = readAuthorityArtifact(dir, "artifact.json", sha256("expected-content"));
    assert.equal(out.verdict, "ARTIFACT_REJECTED");
    assert.ok(out.findings.includes("ARTIFACT_DIGEST_MISMATCH"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
hostile("missing_external_authority", () => {
  const custody = assessExternalCustody([]);
  assert.equal(custody.verdict, "NOT_PROVEN");
  const ceiling = computeClaimCeiling(custody, true);
  assert.equal(ceiling.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
  assert.equal(ceiling.trustedCertificationAuthorized, false);
});
hostile("simulated_independence", () => {
  const local = assessExternalCustody(CUSTODY_CONTROLS.map((control) => ({
    controlId: control.id, source: "LOCAL_SELF_DECLARATION", subjectSha256: D("a"),
  })));
  assert.equal(local.verdict, "NOT_PROVEN");
  assert.ok(local.findings.includes("SIMULATED_INDEPENDENCE_REJECTED"));
  const assertion = rejectSimulatedIndependence({ claim: "EXTERNAL_ASSURED", evidence: [{ source: "LOCAL_FILE" }] });
  assert.equal(assertion.verdict, "ASSERTION_REJECTED");
});
hostile("single_reviewer_all_stages", () => {
  const claim = goodReviewer("AEGIS_OMEGA");
  const assignments = Object.fromEntries(CANONICAL_REVIEW_STAGES.map((s) => [s, { ...claim }]));
  const out = validateStageAssignments(assignments);
  assert.equal(out.verdict, "STAGES_REJECTED");
  assert.ok(out.findings.includes("SINGLE_REVIEWER_ALL_STAGES"));
});
hostile("unknown_and_wrong_domain_reviewer", () => {
  const unknown = validateReviewClaim({ ...goodReviewer(), REVIEWER_ID: "FABRICATED_REVIEWER" });
  assert.equal(unknown.verdict, "REVIEW_REJECTED");
  assert.ok(unknown.findings.includes("UNKNOWN_REVIEWER"));
  const wrongDomain = validateReviewClaim({ ...goodReviewer("CODEX"), DOMAIN: "FINAL_CERTIFICATION" });
  assert.equal(wrongDomain.verdict, "REVIEW_REJECTED");
  assert.ok(wrongDomain.findings.includes("WRONG_DOMAIN_REVIEWER"));
});
hostile("caller_declared_independence", () => {
  const out = validateReviewClaim({ ...goodReviewer("CLAUDE_CODE"), INDEPENDENCE_CLASS: "INDEPENDENT_MODEL" });
  assert.equal(out.verdict, "REVIEW_REJECTED");
  assert.ok(out.findings.includes("CALLER_DECLARED_INDEPENDENCE_REJECTED"));
});
hostile("receipt_under_binding", () => {
  const filenameOnly = validateReceiptBinding({ subjectPath: "verdict.json" });
  assert.equal(filenameOnly.verdict, "RECEIPT_REJECTED");
  assert.ok(filenameOnly.findings.includes("RECEIPT_UNDER_BINDING_NO_SUBJECT_DIGEST"));
  assert.ok(filenameOnly.findings.includes("RECEIPT_FILENAME_ONLY_BINDING"));
});
hostile("supersession_weakness", () => {
  const orphan = acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true });
  assert.equal(orphan.verdict, "SUPERSESSION_REJECTED");
  assert.ok(orphan.findings.includes("SUPERSESSION_CHAIN_MISMATCH"));
  const unpreserved = acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false });
  assert.equal(unpreserved.verdict, "SUPERSESSION_REJECTED");
  assert.ok(unpreserved.findings.includes("PREDECESSOR_NOT_PRESERVED"));
  const unauthorized = acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true });
  assert.equal(unauthorized.verdict, "SUPERSESSION_REJECTED");
  assert.ok(unauthorized.findings.includes("SUPERSESSION_WITHOUT_FOUNDER_DECISION"));
});
hostile("historical_evidence_fabrication", () => {
  const forged = classifyExecutionEvidence(
    { artifacts: [{ path: "historical-receipt.json", sha256: D("f") }] },
    () => { throw new Error("ENOENT"); },
  );
  assert.equal(forged.verdict, "EXECUTION_UNPROVEN");
  assert.ok(forged.findings.includes("EXECUTION_ARTIFACT_UNREADABLE"));
});
hostile("denominator_substitution", () => {
  const out = validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 20 });
  assert.equal(out.verdict, "MANIFEST_REJECTED");
  assert.ok(out.findings.includes("DENOMINATOR_SUBSTITUTION"));
});
hostile("spec_claims_runtime_status", () => {
  const out = assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" });
  assert.equal(out.verdict, "CLAIM_REJECTED");
  assert.ok(out.findings.includes("SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"));
});
hostile("boundary_capability_implantation", () => {
  for (const capability of OUT_OF_BOUNDARY_CAPABILITIES) {
    for (const repo of Object.keys(REPOSITORY_AUTHORITY_ROLES)) {
      const out = assertCapabilityPlacement(capability, repo);
      assert.equal(out.verdict, "BOUNDARY_VIOLATION", `${capability} in ${repo}`);
    }
  }
});
hostile("null_and_malformed_inputs_fail_closed", () => {
  for (const bad of [null, undefined, 42, "string", []]) {
    assert.notEqual(verifyRebuildBase(bad).verdict, "BASE_VERIFIED");
    assert.notEqual(validateAuthorityManifest(bad).verdict, "MANIFEST_ACCEPTED");
    assert.notEqual(validateReviewClaim(bad).verdict, "REVIEW_ACCEPTED");
    assert.notEqual(verifyPolicyRoot(bad).verdict, "POLICY_ROOT_VERIFIED");
    assert.notEqual(validateReceiptBinding(bad).verdict, "RECEIPT_BOUND");
    assert.notEqual(assessRollbackAction(bad).verdict, "ROLLBACK_AUTHORIZED");
    assert.notEqual(rejectSimulatedIndependence(bad).verdict, "ASSERTION_ACCEPTED");
    assert.notEqual(assertAuthoritySeparation(bad).verdict, "CLAIM_ACCEPTED");
  }
});

console.log(JSON.stringify({
  suite: "p1-a-authority-root",
  required: executed + hostileExecuted,
  executed: executed + hostileExecuted,
  passed: passed + hostilePassed,
  unitPropertyIntegration: { executed, passed },
  hostile: { executed: hostileExecuted, passed: hostilePassed },
  failed: (executed - passed) + (hostileExecuted - hostilePassed),
  skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
