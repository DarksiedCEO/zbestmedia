// P1A-01 mutation harness. The mutation denominator derives from the module's
// PROPERTY_REGISTER (§XIII): every property has at least one mutant that weakens
// its guard. A mutant is KILLED when at least one invariant probe fails against
// it (or it fails to load). Survivors required: 0.
// Post-Codex-review: probes and mutants cover the four INDEPENDENT_REVIEW_BLOCK
// finding classes (custody fabrication, execution reader boundary, authority
// module on the trusted surface, CODEOWNERS GitHub semantics).
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
function withCustodyFixture(m, mutate, probe) {
  const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-cust-"));
  try {
    const refs = [];
    for (const control of m.CUSTODY_CONTROLS) {
      const receipt = {
        artifactId: `RECEIPT_${control.id}`,
        controlId: control.id,
        source: "GITHUB_OBSERVATION",
        producer: "GITHUB_ACTIONS_PROTECTED_RUN",
        subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha,
        authoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256,
      };
      if (mutate) mutate(receipt);
      const body = JSON.stringify(receipt);
      writeFileSync(join(dir, `${control.id}.json`), body);
      refs.push({ controlId: receipt.controlId, path: `${control.id}.json`, sha256: sha256(body) });
    }
    return probe(dir, refs);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Invariant probes: each throws when its invariant is violated by module m.
const PROBES = {
  base_wrong_sha_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), sha: "1".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_tree_rejected: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), tree: "2".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_parents_rejected: (m) => {
    assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [] }).verdict, "BASE_REJECTED");
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
    assert.equal(m.TRUSTED_SURFACE_FILES.length, 14);
    assert.equal(m.TRUSTED_SURFACE_DENOMINATOR, 14);
    assert.equal(m.FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11);
    for (const f of ["scripts/validate-p1a-authority-root.mjs", "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs", "scripts/test-p1a-dual-base-verifier.mjs"]) {
      assert.ok(m.TRUSTED_SURFACE_FILES.includes(f), f);
    }
  },
  surface_uncovered_detected: (m) => {
    const partial = "/.github/CODEOWNERS @DarksiedCEO\n";
    const out = m.verifyTrustedSurfaceCoverage(partial);
    assert.equal(out.verdict, "SURFACE_OPEN");
    assert.ok(out.findings.length >= 13);
    // The finding code must be UNCOVERED (no rule at all), not merely wrong-owner.
    assert.ok(out.findings.includes("TRUSTED_FILE_UNCOVERED_scripts/validate-p1a-threat-model.mjs"));
  },
  surface_wrong_owner_detected: (m) => {
    const wrong = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @attacker`).join("\n");
    assert.equal(m.verifyTrustedSurfaceCoverage(wrong).verdict, "SURFACE_OPEN");
  },
  surface_closed_positive: (m) => {
    const good = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    assert.equal(m.verifyTrustedSurfaceCoverage(good).verdict, "SURFACE_CLOSED");
  },
  codeowners_last_match_wins: (m) => {
    assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]);
    assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt\n", "a.txt").owners, []);
  },
  codeowners_glob_semantics: (m) => {
    assert.deepEqual(m.codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/f.mjs").owners, ["@x"]);
    assert.deepEqual(m.codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/sub/f.mjs").owners, []);
    assert.deepEqual(m.codeownersOwnersFor("/scripts/**/f.mjs @x\n", "scripts/a/b/f.mjs").owners, ["@x"]);
    assert.deepEqual(m.codeownersOwnersFor("CODEOWNERS @x\n", ".github/CODEOWNERS").owners, ["@x"]);
    assert.deepEqual(m.codeownersOwnersFor("/scripts/ @x\n", "scripts/deep/f.mjs").owners, ["@x"]);
    assert.deepEqual(m.codeownersOwnersFor("/scripts/ @x\n", "scripts").owners, []);
  },
  codeowners_unsupported_fail_closed: (m) => {
    for (const bad of ["!x @a\n", "/a[b].txt @a\n"]) {
      const out = m.codeownersOwnersFor(bad, "x");
      assert.equal(out.owners, null, bad);
      assert.ok(out.findings.length >= 1, bad);
    }
    const surface = m.verifyTrustedSurfaceCoverage(`${m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n")}\n!evil @x\n`);
    assert.equal(surface.verdict, "SURFACE_OPEN");
  },
  coordinated_rewrite_blocked: (m) => {
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [...m.TRUSTED_SURFACE_FILES], author: "attacker", approvals: ["attacker"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
    assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED"));
  },
  independent_approval_required: (m) => {
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "DarksiedCEO", approvals: ["DarksiedCEO"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  non_owner_approval_rejected: (m) => {
    const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n");
    const out = m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "attacker", approvals: ["accomplice"], priorCodeowners: prior });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  unparseable_prior_ownership_blocks: (m) => {
    const out = m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "attacker", approvals: [], priorCodeowners: "![broken\n" });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  cleared_prior_ownership_blocks: (m) => {
    const out = m.assessTrustedSurfaceChange({
      files: [".github/CODEOWNERS"], author: "attacker", approvals: ["DarksiedCEO"],
      priorCodeowners: "/.github/CODEOWNERS @DarksiedCEO\n/.github/CODEOWNERS\n",
    });
    assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  },
  declared_execution_unproven: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-exd-"));
    try {
      const out = m.classifyExecutionEvidence(dir, { subjectSha: m.AUTHORIZED_REBUILD_BASE.sha, session_id: "s", context_id: "c", fresh: true, independent: true });
      assert.equal(out.verdict, "EXECUTION_UNPROVEN");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  execution_reader_is_fixed: (m) => {
    assert.equal(m.classifyExecutionEvidence.length, 2);
  },
  execution_bindings_enforced: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-exb-"));
    try {
      const body = JSON.stringify({ run: "real" });
      writeFileSync(join(dir, "r.json"), body);
      const good = { path: "r.json", sha256: sha256(body), producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: m.AUTHORIZED_REBUILD_BASE.sha };
      const claim = { subjectSha: m.AUTHORIZED_REBUILD_BASE.sha };
      assert.equal(m.classifyExecutionEvidence(dir, { ...claim, artifacts: [good] }).verdict, "OBSERVED_EXECUTION");
      assert.equal(m.classifyExecutionEvidence(dir, { artifacts: [good] }).verdict, "EXECUTION_UNPROVEN");
      const wrongSubject = m.classifyExecutionEvidence(dir, { ...claim, artifacts: [{ ...good, subjectSha: "5".repeat(40) }] });
      assert.equal(wrongSubject.verdict, "EXECUTION_UNPROVEN");
      assert.ok(wrongSubject.findings.includes("ARTIFACT_WRONG_SUBJECT"));
      const badProducer = m.classifyExecutionEvidence(dir, { ...claim, artifacts: [{ ...good, producer: "MY_READER" }] });
      assert.ok(badProducer.findings.includes("ARTIFACT_PRODUCER_UNKNOWN"));
      const forged = m.classifyExecutionEvidence(dir, { ...claim, artifacts: [{ ...good, sha256: D("2") }] });
      assert.ok(forged.findings.includes("FABRICATED_EXECUTION_ARTIFACT"));
      const missing = m.classifyExecutionEvidence(dir, { ...claim, artifacts: [{ ...good, path: "absent.json" }] });
      assert.ok(missing.findings.includes("EXECUTION_ARTIFACT_UNREADABLE"));
      const undigested = m.classifyExecutionEvidence(dir, { ...claim, artifacts: [{ path: "r.json", producer: "CODEX", subjectSha: claim.subjectSha }] });
      assert.ok(undigested.findings.includes("ARTIFACT_NOT_DIGEST_BOUND"));
      // Both claim and artifact lacking subjectSha must NOT pair up as
      // undefined === undefined and slip through as observed execution.
      const bothUnbound = m.classifyExecutionEvidence(dir, { artifacts: [{ path: "r.json", sha256: sha256(body), producer: "CODEX" }] });
      assert.equal(bothUnbound.verdict, "EXECUTION_UNPROVEN");
      assert.ok(bothUnbound.findings.includes("EXECUTION_SUBJECT_UNBOUND"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
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
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-cd-"));
    try {
      const out = m.assessExternalCustody(dir, []);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.equal(out.trustedCertificationAuthorized, false);
      assert.equal(m.assessExternalCustody("", []).verdict, "NOT_PROVEN");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  custody_objects_are_not_receipts: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-mut-co-"));
    try {
      const objects = m.CUSTODY_CONTROLS.map((c) => ({ controlId: c.id, source: "GITHUB_OBSERVATION", subjectSha256: D("a") }));
      const out = m.assessExternalCustody(dir, objects);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.ok(out.findings.includes("CUSTODY_RECEIPT_REF_MALFORMED"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  custody_valid_local_never_authorizes: (m) => {
    withCustodyFixture(m, null, (dir, refs) => {
      const out = m.assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "CUSTODY_EVIDENCE_RECORDED_LOCALLY");
      assert.notEqual(out.verdict, "EXTERNAL_CUSTODY_OBSERVED");
      assert.equal(out.trustedCertificationAuthorized, false);
    });
  },
  custody_producer_required: (m) => {
    withCustodyFixture(m, (r) => { r.producer = "SELF_DECLARED"; }, (dir, refs) => {
      const out = m.assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.ok(out.findings.some((f) => f.startsWith("CUSTODY_PRODUCER_UNKNOWN_")));
    });
  },
  custody_subject_required: (m) => {
    withCustodyFixture(m, (r) => { r.subjectBaseSha = "9".repeat(40); }, (dir, refs) => {
      const out = m.assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.ok(out.findings.some((f) => f.startsWith("CUSTODY_WRONG_SUBJECT_")));
    });
  },
  custody_authority_required: (m) => {
    withCustodyFixture(m, (r) => { r.authoritySha256 = D("7"); }, (dir, refs) => {
      const out = m.assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.ok(out.findings.some((f) => f.startsWith("CUSTODY_AUTHORITY_UNBOUND_")));
    });
  },
  simulated_custody_rejected: (m) => {
    withCustodyFixture(m, (r) => { r.source = "LOCAL_SELF_DECLARATION"; }, (dir, refs) => {
      const out = m.assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "NOT_PROVEN");
      assert.ok(out.findings.includes("SIMULATED_INDEPENDENCE_REJECTED"));
    });
  },
  claim_ceiling_enforced: (m) => {
    const ceiling = m.computeClaimCeiling({ verdict: "NOT_PROVEN", trustedCertificationAuthorized: false }, true);
    assert.equal(ceiling.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
    assert.equal(ceiling.trustedCertificationAuthorized, false);
    const forged = m.computeClaimCeiling({ verdict: "EXTERNAL_CUSTODY_OBSERVED", trustedCertificationAuthorized: true }, true);
    assert.equal(forged.trustedCertificationAuthorized, false);
    // Locally recorded custody evidence is the strongest local state and must
    // STILL not authorize — the core of Codex finding F1.
    const recorded = m.computeClaimCeiling({ verdict: "CUSTODY_EVIDENCE_RECORDED_LOCALLY", trustedCertificationAuthorized: false }, true);
    assert.equal(recorded.trustedCertificationAuthorized, false);
    assert.equal(recorded.custodyEvidenceRecorded, true);
    assert.equal(m.LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false);
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
  { property: "AUTHORITY_MODULE_IN_TRUSTED_SURFACE", find: `  "scripts/validate-p1a-authority-root.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",`, replace: `  "scripts/validate-p1a-certification-accounting.mjs",` },
  { property: "AUTHORITY_MODULE_IN_TRUSTED_SURFACE", find: `  "scripts/test-p1a-authority-root-mutation.mjs",
  "scripts/test-p1a-authority-root.mjs",`, replace: `  "scripts/test-p1a-authority-root.mjs",` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",`, replace: `  "scripts/test-p1a-trusted-verifier.mjs",` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `    if (resolution.owners.length === 0) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);`, replace: `    if (false) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);` },
  { property: "TRUSTED_SURFACE_FULL_COVERAGE", find: `    else if (!resolution.owners.includes(\`@\${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}\`)) findings.push(\`TRUSTED_FILE_WRONG_OWNER_\${file}\`);`, replace: `` },
  { property: "CODEOWNERS_LAST_MATCH_WINS_MODELED", find: `    if (codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;`, replace: `    if (!winner && codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;` },
  { property: "CODEOWNERS_LAST_MATCH_WINS_MODELED", find: `    if (codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;`, replace: `    if (rule.owners.length && codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;` },
  { property: "CODEOWNERS_GLOB_SEMANTICS_MODELED", find: `    if (ch === "*") out += "[^/]*";`, replace: `    if (ch === "*") out += ".*";` },
  { property: "CODEOWNERS_GLOB_SEMANTICS_MODELED", find: `  const prefix = anchored ? "^" : "^(?:.*/)?";`, replace: `  const prefix = "^";` },
  { property: "CODEOWNERS_GLOB_SEMANTICS_MODELED", find: `  const suffix = dirOnly ? "/.*$" : "(?:/.*)?$";`, replace: `  const suffix = "(?:/.*)?$";` },
  { property: "CODEOWNERS_UNSUPPORTED_SYNTAX_FAIL_CLOSED", find: `      findings.push(\`CODEOWNERS_UNSUPPORTED_PATTERN_LINE_\${i + 1}\`);
      continue;`, replace: `` },
  { property: "COORDINATED_REWRITE_BLOCKED", find: `    const independent = approvers.filter((a) => owners.includes(a) && a !== author);`, replace: `    const independent = approvers;` },
  { property: "COORDINATED_REWRITE_BLOCKED", find: `  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };`, replace: `` },
  { property: "COORDINATED_REWRITE_BLOCKED", find: `    if (resolution.owners === null) { findings.push(\`PRIOR_OWNERSHIP_UNPARSEABLE_\${file}\`); continue; }`, replace: `    if (resolution.owners === null) { continue; }` },
  { property: "SELF_APPROVAL_REJECTED", find: `if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");`, replace: `` },
  { property: "DECLARED_EXECUTION_UNPROVEN", find: `    return { verdict: "EXECUTION_UNPROVEN", findings: ["DECLARED_EXECUTION_ONLY"] };`, replace: `    return { verdict: "OBSERVED_EXECUTION", findings: [] };` },
  { property: "EXECUTION_SUBJECT_BINDING_REQUIRED", find: `  if (!HEX40.test(claim.subjectSha ?? "") && !HEX64.test(claim.subjectSha ?? "")) {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_SUBJECT_UNBOUND"] };
  }`, replace: `` },
  { property: "EXECUTION_SUBJECT_BINDING_REQUIRED", find: `    if (artifact.subjectSha !== claim.subjectSha) { findings.push("ARTIFACT_WRONG_SUBJECT"); continue; }`, replace: `` },
  { property: "EXECUTION_PRODUCER_IDENTITY_REQUIRED", find: `    if (!(artifact.producer in CANONICAL_OBSERVATION_PRODUCERS)) { findings.push("ARTIFACT_PRODUCER_UNKNOWN"); continue; }`, replace: `` },
  { property: "EXECUTION_READER_FIXED_TRUSTED", find: `    const read = readAuthorityArtifact(evidenceRoot, artifact.path, artifact.sha256);
    if (read.verdict !== "ARTIFACT_VERIFIED") {
      findings.push(read.findings.includes("ARTIFACT_DIGEST_MISMATCH") ? "FABRICATED_EXECUTION_ARTIFACT" : "EXECUTION_ARTIFACT_UNREADABLE");
    }`, replace: `` },
  { property: "EXECUTION_ARTIFACT_DIGEST_REQUIRED", find: `    if (!artifact?.path || !HEX64.test(artifact?.sha256 ?? "")) { findings.push("ARTIFACT_NOT_DIGEST_BOUND"); continue; }`, replace: `    if (!artifact?.path) { findings.push("ARTIFACT_NOT_DIGEST_BOUND"); continue; }
    if (!HEX64.test(artifact?.sha256 ?? "")) { continue; }` },
  { property: "RECEIPT_DIGEST_BINDING_REQUIRED", find: `if (!HEX64.test(receipt.subjectSha256 ?? "")) findings.push("RECEIPT_UNDER_BINDING_NO_SUBJECT_DIGEST");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (prior && HEX64.test(next.supersedesSha256 ?? "") && next.supersedesSha256 !== prior.sha256) findings.push("SUPERSESSION_CHAIN_MISMATCH");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (!prior || prior.preserved !== true) findings.push("PREDECESSOR_NOT_PRESERVED");`, replace: `` },
  { property: "SUPERSESSION_CHAIN_ENFORCED", find: `if (!HEX64.test(next.founderDecisionSha256 ?? "")) findings.push("SUPERSESSION_WITHOUT_FOUNDER_DECISION");`, replace: `` },
  { property: "CUSTODY_RECEIPTS_ARE_ARTIFACTS_NOT_OBJECTS", find: `      if (!ref || typeof ref !== "object" || !ref.path || !HEX64.test(ref.sha256 ?? "")) { findings.push("CUSTODY_RECEIPT_REF_MALFORMED"); continue; }`, replace: `` },
  { property: "CUSTODY_PRODUCER_IDENTITY_REQUIRED", find: `      if (!producer) { findings.push(\`CUSTODY_PRODUCER_UNKNOWN_\${receipt.controlId}\`); continue; }`, replace: `` },
  { property: "CUSTODY_SUBJECT_BINDING_REQUIRED", find: `      if (receipt.subjectBaseSha !== AUTHORIZED_REBUILD_BASE.sha) { findings.push(\`CUSTODY_WRONG_SUBJECT_\${receipt.controlId}\`); continue; }`, replace: `` },
  { property: "CUSTODY_AUTHORITY_BINDING_REQUIRED", find: `      if (!CUSTODY_AUTHORITY_DIGESTS.includes(receipt.authoritySha256)) { findings.push(\`CUSTODY_AUTHORITY_UNBOUND_\${receipt.controlId}\`); continue; }`, replace: `` },
  { property: "SIMULATED_INDEPENDENCE_REJECTED", find: `      if (receipt.source !== "GITHUB_OBSERVATION") { findings.push("SIMULATED_INDEPENDENCE_REJECTED"); continue; }`, replace: `` },
  { property: "CUSTODY_NOT_PROVEN_DEFAULT", find: `    verdict: allRecorded ? "CUSTODY_EVIDENCE_RECORDED_LOCALLY" : "NOT_PROVEN",`, replace: `    verdict: "CUSTODY_EVIDENCE_RECORDED_LOCALLY",` },
  { property: "LOCAL_CUSTODY_CANNOT_AUTHORIZE_CERTIFICATION", find: `    trustedCertificationAuthorized: false,
    findings,
    controlDenominator: CUSTODY_CONTROLS.length,`, replace: `    trustedCertificationAuthorized: true,
    findings,
    controlDenominator: CUSTODY_CONTROLS.length,` },
  { property: "CLAIM_CEILING_ENFORCED", find: `    custodyEvidenceRecorded: evidenceRecorded === true,
    trustedCertificationAuthorized: false,`, replace: `    custodyEvidenceRecorded: evidenceRecorded === true,
    trustedCertificationAuthorized: evidenceRecorded === true,` },
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
