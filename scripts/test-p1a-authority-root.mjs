// P1A-01 authority-root test battery: unit, property/invariant, integration,
// and the §XIII hostile attack set — including reproductions of all four
// INDEPENDENT_REVIEW_BLOCK findings (CODEX-F1..F4). Every hostile case must
// FAIL CLOSED.
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
  TRUSTED_SURFACE_FILES, TRUSTED_SURFACE_DENOMINATOR, FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR,
  parseCodeownersRules, codeownersOwnersFor,
  verifyTrustedSurfaceCoverage, assessTrustedSurfaceChange, classifyExecutionEvidence,
  validateReceiptBinding, acceptSupersession, CUSTODY_CONTRACT_REQUIRED_FIELDS,
  EXTERNAL_CUSTODY_CONTRACT, CUSTODY_CONTROLS, NAMED_HUMAN_GATES, assessExternalCustody,
  assessGateCompleteness, ROLLBACK_CONTRACT, assessRollbackAction, computeClaimCeiling,
  rejectSimulatedIndependence, OUT_OF_BOUNDARY_CAPABILITIES, REPOSITORY_AUTHORITY_ROLES,
  assertCapabilityPlacement, assertAuthoritySeparation, readAuthorityArtifact,
  laneAuthorityStatus, PROPERTY_REGISTER, POLICY_VERSION,
  CANONICAL_OBSERVATION_PRODUCERS, LOCAL_CUSTODY_AUTHORIZATION_CEILING,
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

// Writes a full, well-formed on-disk custody receipt set. `mutate` lets hostile
// cases corrupt one binding at a time.
function writeCustodyFixture(dir, mutate = () => {}) {
  const refs = [];
  for (const control of CUSTODY_CONTROLS) {
    const receipt = {
      artifactId: `RECEIPT_${control.id}`,
      controlId: control.id,
      source: "GITHUB_OBSERVATION",
      producer: "GITHUB_ACTIONS_PROTECTED_RUN",
      subjectBaseSha: AUTHORIZED_REBUILD_BASE.sha,
      authoritySha256: CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256,
    };
    mutate(receipt);
    const body = JSON.stringify(receipt);
    const path = `${control.id}.json`;
    writeFileSync(join(dir, path), body);
    refs.push({ controlId: receipt.controlId, path, sha256: sha256(body) });
  }
  return refs;
}

// ------------------------------- STATIC ------------------------------------
run("static:property_register_covers_review_findings", () => {
  assert.ok(PROPERTY_REGISTER.length >= 45);
  assert.equal(new Set(PROPERTY_REGISTER).size, PROPERTY_REGISTER.length);
  for (const p of ["LOCAL_CUSTODY_CANNOT_AUTHORIZE_CERTIFICATION", "EXECUTION_READER_FIXED_TRUSTED",
    "AUTHORITY_MODULE_IN_TRUSTED_SURFACE", "CODEOWNERS_LAST_MATCH_WINS_MODELED"]) {
    assert.ok(PROPERTY_REGISTER.includes(p), p);
  }
});
run("static:custody_contract_fully_bound", () => {
  for (const field of CUSTODY_CONTRACT_REQUIRED_FIELDS) {
    assert.equal(typeof EXTERNAL_CUSTODY_CONTRACT[field], "string", field);
    assert.ok(EXTERNAL_CUSTODY_CONTRACT[field].length > 0, field);
  }
  assert.equal(EXTERNAL_CUSTODY_CONTRACT.status, "CONTRACT_DEFINED_PROVISIONING_NOT_PROVEN");
  assert.equal(LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false);
});
run("static:trusted_surface_denominator_14_with_frozen_base_11", () => {
  assert.equal(TRUSTED_SURFACE_FILES.length, 14);
  assert.equal(TRUSTED_SURFACE_DENOMINATOR, 14);
  assert.equal(FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11);
  for (const f of ["scripts/test-p1a-dual-base-verifier.mjs", "scripts/validate-p1a-authority-root.mjs",
    "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs"]) {
    assert.ok(TRUSTED_SURFACE_FILES.includes(f), f);
  }
});
run("static:gate_denominator_11", () => assert.equal(NAMED_HUMAN_GATES.length, 11));
run("static:producer_registry_fixed", () => {
  assert.deepEqual(Object.keys(CANONICAL_OBSERVATION_PRODUCERS).sort(),
    ["CODEX", "FOUNDER_DARKSIEDCEO", "GITHUB_ACTIONS_PROTECTED_RUN"]);
  assert.throws(() => { CANONICAL_OBSERVATION_PRODUCERS.ATTACKER = {}; }, TypeError);
});
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
run("unit:codeowners_github_semantics", () => {
  // Anchored exact path.
  assert.deepEqual(codeownersOwnersFor("/a/b.txt @x\n", "a/b.txt").owners, ["@x"]);
  // Directory pattern owns contents.
  assert.deepEqual(codeownersOwnersFor("/scripts/ @x\n", "scripts/deep/f.mjs").owners, ["@x"]);
  // Bare (unanchored) name matches at any depth.
  assert.deepEqual(codeownersOwnersFor("CODEOWNERS @x\n", ".github/CODEOWNERS").owners, ["@x"]);
  // Star does not cross slash.
  assert.deepEqual(codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/f.mjs").owners, ["@x"]);
  assert.deepEqual(codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/sub/f.mjs").owners, []);
  // Double star crosses directories.
  assert.deepEqual(codeownersOwnersFor("/scripts/**/f.mjs @x\n", "scripts/a/b/f.mjs").owners, ["@x"]);
  // LAST match wins; empty owners on winner clears ownership.
  assert.deepEqual(codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]);
  assert.deepEqual(codeownersOwnersFor("/a.txt @x\n/a.txt\n", "a.txt").owners, []);
  // Comments and blanks ignored.
  assert.equal(parseCodeownersRules("# c\n\n/a @x\n").rules.length, 1);
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
run("unit:observed_execution_positive_control", () => {
  const dir = mkdtempSync(join(tmpdir(), "p1a01-exec-pos-"));
  try {
    const body = JSON.stringify({ run: "real" });
    writeFileSync(join(dir, "receipt.json"), body);
    const out = classifyExecutionEvidence(dir, {
      subjectSha: AUTHORIZED_REBUILD_BASE.sha,
      artifacts: [{ path: "receipt.json", sha256: sha256(body), producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: AUTHORIZED_REBUILD_BASE.sha }],
    });
    assert.equal(out.verdict, "OBSERVED_EXECUTION");
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  const dir = mkdtempSync(join(tmpdir(), "p1a01-cust-def-"));
  try {
    const out = assessExternalCustody(dir, []);
    assert.equal(out.verdict, "NOT_PROVEN");
    assert.equal(out.trustedCertificationAuthorized, false);
    assert.equal(out.controlsRecorded, 0);
    assert.equal(out.controlDenominator, CUSTODY_CONTROLS.length);
    for (const control of CUSTODY_CONTROLS) {
      assert.ok(out.findings.includes(`CUSTODY_NOT_PROVEN_${control.id}`), control.id);
    }
    assert.equal(assessExternalCustody("", []).verdict, "NOT_PROVEN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
run("property:every_custody_binding_enforced", () => {
  const mutations = [
    ["producer", (r) => { r.producer = "SELF_DECLARED_LOCAL"; }, "CUSTODY_PRODUCER_UNKNOWN_"],
    ["subject", (r) => { r.subjectBaseSha = D("9").slice(0, 40); }, "CUSTODY_WRONG_SUBJECT_"],
    ["authority", (r) => { r.authoritySha256 = D("8"); }, "CUSTODY_AUTHORITY_UNBOUND_"],
    ["source", (r) => { r.source = "LOCAL_SELF_DECLARATION"; }, "SIMULATED_INDEPENDENCE_REJECTED"],
  ];
  for (const [label, mutate, prefix] of mutations) {
    const dir = mkdtempSync(join(tmpdir(), "p1a01-cust-bind-"));
    try {
      const refs = writeCustodyFixture(dir, mutate);
      const out = assessExternalCustody(dir, refs);
      assert.equal(out.verdict, "NOT_PROVEN", label);
      assert.equal(out.trustedCertificationAuthorized, false, label);
      assert.ok(out.findings.some((f) => f.startsWith(prefix)), label);
    } finally { rmSync(dir, { recursive: true, force: true }); }
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
    const reduced = CODEOWNERS_CONTENT.split("\n").filter((line) => line.trim() !== `/${file} @DarksiedCEO`).join("\n");
    assert.notEqual(reduced, CODEOWNERS_CONTENT, `no-op removal for ${file}`);
    const out = verifyTrustedSurfaceCoverage(reduced);
    assert.equal(out.verdict, "SURFACE_OPEN", file);
    assert.ok(out.findings.includes(`TRUSTED_FILE_UNCOVERED_${file}`), file);
  }
});
run("property:accept_implies_no_findings_everywhere", () => {
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
  assert.equal(observed.remote, AUTHORIZED_REBUILD_BASE.repositoryRemote);
  assert.equal(observed.sha, AUTHORIZED_REBUILD_BASE.sha);
  assert.equal(observed.objectType, "commit");
  assert.equal(observed.tree, AUTHORIZED_REBUILD_BASE.tree);
  assert.deepEqual(observed.parents, [...AUTHORIZED_REBUILD_BASE.parents]);
});
run("integration:repo_codeowners_closes_trusted_surface", () => {
  const out = verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT);
  assert.equal(out.verdict, "SURFACE_CLOSED");
  assert.equal(out.covered, 14);
});
run("integration:threat_model_trusted_list_amended", async () => {
  const threatModel = await import("./validate-p1a-threat-model.mjs");
  for (const file of threatModel.AMENDMENT_CONTROLLED_FILES) {
    assert.ok(threatModel.TRUSTED_INFRASTRUCTURE_FILES.includes(file), `${file} missing from TRUSTED_INFRASTRUCTURE_FILES`);
  }
  // The enforcement surface (14) is a superset of the frozen base list (11).
  for (const file of threatModel.TRUSTED_INFRASTRUCTURE_FILES) {
    assert.ok(TRUSTED_SURFACE_FILES.includes(file), `${file} missing from enforcement surface`);
  }
  assert.equal(threatModel.TRUSTED_INFRASTRUCTURE_FILES.length, FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR);
});
run("integration:hardened_read_verifies_real_artifact", () => {
  const content = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS"));
  const out = readAuthorityArtifact(REPO_ROOT, ".github/CODEOWNERS", sha256(content));
  assert.equal(out.verdict, "ARTIFACT_VERIFIED");
  assert.equal(sha256(out.bytes), sha256(content));
  assert.ok(out.identity.ino > 0);
});
run("integration:lane_authority_status_composes_fail_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "p1a01-lane-"));
  try {
    const good = laneAuthorityStatus({
      baseVerification: verifyRebuildBase(GOOD_OBSERVED),
      policyRootVerification: verifyPolicyRoot(goodPolicyRoot()),
      custodyAssessment: assessExternalCustody(dir, []),
      localImplementationGreen: true,
    });
    assert.equal(good.verdict, "LANE_AUTHORITY_MODEL_VERIFIED");
    assert.equal(good.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
    assert.equal(good.trustedCertificationAuthorized, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------- HOSTILE -----------------------------------
hostile("codex_f1_fabricated_custody_cannot_authorize", () => {
  // In-memory receipt objects (the original attack shape) are no longer inputs:
  // refs without on-disk digest-bound artifacts are malformed.
  const dirA = mkdtempSync(join(tmpdir(), "p1a01-f1a-"));
  try {
    const inMemory = CUSTODY_CONTROLS.map((c) => ({ controlId: c.id, source: "GITHUB_OBSERVATION", subjectSha256: D("a") }));
    const out = assessExternalCustody(dirA, inMemory);
    assert.equal(out.verdict, "NOT_PROVEN");
    assert.ok(out.findings.includes("CUSTODY_RECEIPT_REF_MALFORMED"));
  } finally { rmSync(dirA, { recursive: true, force: true }); }
  // Even a FULLY well-formed local receipt set cannot authorize certification:
  // the strongest local verdict is evidence-recorded, authorization stays false.
  const dirB = mkdtempSync(join(tmpdir(), "p1a01-f1b-"));
  try {
    const refs = writeCustodyFixture(dirB);
    const out = assessExternalCustody(dirB, refs);
    assert.equal(out.verdict, "CUSTODY_EVIDENCE_RECORDED_LOCALLY");
    assert.equal(out.trustedCertificationAuthorized, false);
    const ceiling = computeClaimCeiling(out, true);
    assert.equal(ceiling.trustedCertificationAuthorized, false);
    assert.equal(ceiling.custodyEvidenceRecorded, true);
    // A forged assessment object cannot re-open the ceiling either.
    const forged = computeClaimCeiling({ verdict: "EXTERNAL_CUSTODY_OBSERVED", trustedCertificationAuthorized: true }, true);
    assert.equal(forged.trustedCertificationAuthorized, false);
  } finally { rmSync(dirB, { recursive: true, force: true }); }
});
hostile("codex_f2_execution_reader_injection_removed", () => {
  assert.equal(classifyExecutionEvidence.length, 2); // (evidenceRoot, claim) — no reader parameter
  const dir = mkdtempSync(join(tmpdir(), "p1a01-f2-"));
  try {
    const body = JSON.stringify({ run: "real" });
    writeFileSync(join(dir, "r.json"), body);
    const base = { subjectSha: AUTHORIZED_REBUILD_BASE.sha };
    const goodArtifact = { path: "r.json", sha256: sha256(body), producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: AUTHORIZED_REBUILD_BASE.sha };
    // Wrong-subject receipt rejected.
    const wrongSubject = classifyExecutionEvidence(dir, { ...base, artifacts: [{ ...goodArtifact, subjectSha: D("1").slice(0, 40) }] });
    assert.equal(wrongSubject.verdict, "EXECUTION_UNPROVEN");
    assert.ok(wrongSubject.findings.includes("ARTIFACT_WRONG_SUBJECT"));
    // Unknown producer rejected.
    const unknownProducer = classifyExecutionEvidence(dir, { ...base, artifacts: [{ ...goodArtifact, producer: "MY_OWN_READER" }] });
    assert.ok(unknownProducer.findings.includes("ARTIFACT_PRODUCER_UNKNOWN"));
    // Digest mismatch = fabricated.
    const forged = classifyExecutionEvidence(dir, { ...base, artifacts: [{ ...goodArtifact, sha256: D("2") }] });
    assert.ok(forged.findings.includes("FABRICATED_EXECUTION_ARTIFACT"));
    // Symlinked artifact rejected by the fixed reader.
    writeFileSync(join(dir, "outside"), body);
    symlinkSync(join(dir, "outside"), join(dir, "alias.json"));
    const viaSymlink = classifyExecutionEvidence(dir, { ...base, artifacts: [{ ...goodArtifact, path: "alias.json" }] });
    assert.equal(viaSymlink.verdict, "EXECUTION_UNPROVEN");
    // Unbound execution subject rejected outright.
    const unbound = classifyExecutionEvidence(dir, { artifacts: [goodArtifact] });
    assert.ok(unbound.findings.includes("EXECUTION_SUBJECT_UNBOUND"));
    // Claim and artifact BOTH lacking subjectSha must not pair as undefined===undefined.
    const bothUnbound = classifyExecutionEvidence(dir, { artifacts: [{ path: "r.json", sha256: sha256(body), producer: "CODEX" }] });
    assert.equal(bothUnbound.verdict, "EXECUTION_UNPROVEN");
    assert.ok(bothUnbound.findings.includes("EXECUTION_SUBJECT_UNBOUND"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("codex_f3_authority_module_on_trusted_surface", () => {
  for (const file of ["scripts/validate-p1a-authority-root.mjs", "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs"]) {
    const reduced = CODEOWNERS_CONTENT.split("\n").filter((line) => line.trim() !== `/${file} @DarksiedCEO`).join("\n");
    const out = verifyTrustedSurfaceCoverage(reduced);
    assert.equal(out.verdict, "SURFACE_OPEN", file);
    assert.ok(out.findings.includes(`TRUSTED_FILE_UNCOVERED_${file}`), file);
  }
  const change = assessTrustedSurfaceChange({
    files: ["scripts/validate-p1a-authority-root.mjs"],
    author: "attacker",
    approvals: ["attacker"],
    priorCodeowners: CODEOWNERS_CONTENT,
  });
  assert.equal(change.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
});
hostile("codex_f4_codeowners_github_semantics_attacks", () => {
  // Last-match-wins: a later rule clearing owners un-protects the file.
  const cleared = `${CODEOWNERS_CONTENT}\n/scripts/validate-p1a-authority-root.mjs\n`;
  const outCleared = verifyTrustedSurfaceCoverage(cleared);
  assert.equal(outCleared.verdict, "SURFACE_OPEN");
  assert.ok(outCleared.findings.includes("TRUSTED_FILE_UNCOVERED_scripts/validate-p1a-authority-root.mjs"));
  // Last-match-wins: a later rule hijacking ownership to an attacker.
  const hijacked = `${CODEOWNERS_CONTENT}\n/scripts/validate-p1a-authority-root.mjs @attacker\n`;
  const outHijacked = verifyTrustedSurfaceCoverage(hijacked);
  assert.equal(outHijacked.verdict, "SURFACE_OPEN");
  assert.ok(outHijacked.findings.includes("TRUSTED_FILE_WRONG_OWNER_scripts/validate-p1a-authority-root.mjs"));
  // Unanchored glob override hits every .mjs trusted file.
  const globbed = `${CODEOWNERS_CONTENT}\n*.mjs @attacker\n`;
  const outGlobbed = verifyTrustedSurfaceCoverage(globbed);
  assert.equal(outGlobbed.verdict, "SURFACE_OPEN");
  assert.ok(outGlobbed.findings.some((f) => f.startsWith("TRUSTED_FILE_WRONG_OWNER_scripts/")));
  // Unsupported syntax fails CLOSED rather than being mis-modeled.
  for (const bad of ["!scripts/secret.mjs @x\n", "/scripts/[ab].mjs @x\n", "\\#literal @x\n"]) {
    const out = verifyTrustedSurfaceCoverage(`${CODEOWNERS_CONTENT}\n${bad}`);
    assert.equal(out.verdict, "SURFACE_OPEN", bad);
    assert.ok(out.findings.some((f) => f.startsWith("CODEOWNERS_UNSUPPORTED_PATTERN_LINE_") || f.startsWith("CODEOWNERS_MALFORMED_OWNER_LINE_")), bad);
  }
  // Change assessment derives prior ownership under the same semantics: a prior
  // file whose last matching rule cleared owners gives NO approval authority.
  const change = assessTrustedSurfaceChange({
    files: [".github/CODEOWNERS"],
    author: "attacker",
    approvals: ["DarksiedCEO"],
    priorCodeowners: "/.github/CODEOWNERS @DarksiedCEO\n/.github/CODEOWNERS\n",
  });
  assert.equal(change.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  assert.ok(change.findings.includes("PRIOR_OWNERSHIP_ABSENT_.github/CODEOWNERS"));
});
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
  const out = assessTrustedSurfaceChange({
    files: [".github/CODEOWNERS"],
    author: "attacker",
    approvals: ["attacker"],
    priorCodeowners: CODEOWNERS_CONTENT,
  });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
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
  const dir = mkdtempSync(join(tmpdir(), "p1a01-fab-"));
  try {
    const declaredOnly = classifyExecutionEvidence(dir, {
      subjectSha: AUTHORIZED_REBUILD_BASE.sha,
      session_id: "s-1", context_id: "c-1", timestamp: "2026-08-18T00:00:00Z",
      fresh: true, independent: true,
    });
    assert.equal(declaredOnly.verdict, "EXECUTION_UNPROVEN");
    assert.ok(declaredOnly.findings.includes("DECLARED_EXECUTION_ONLY"));
    writeFileSync(join(dir, "receipt.json"), "different bytes");
    const forged = classifyExecutionEvidence(dir, {
      subjectSha: AUTHORIZED_REBUILD_BASE.sha,
      artifacts: [{ path: "receipt.json", sha256: D("a"), producer: "CODEX", subjectSha: AUTHORIZED_REBUILD_BASE.sha }],
    });
    assert.equal(forged.verdict, "EXECUTION_UNPROVEN");
    assert.ok(forged.findings.includes("FABRICATED_EXECUTION_ARTIFACT"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
    mkdirSync(join(dir, "outside-dir"));
    writeFileSync(join(dir, "outside-dir", "a.json"), "y");
    symlinkSync(join(dir, "outside-dir"), join(dir, "safe", "dirlink"));
    const intermediate = readAuthorityArtifact(join(dir, "safe"), "dirlink/a.json", sha256("y"));
    assert.equal(intermediate.verdict, "ARTIFACT_REJECTED");
    assert.ok(intermediate.findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    mkdirSync(join(dir, "safe", "sub"));
    const internal = readAuthorityArtifact(join(dir, "safe"), "sub/../real.json", sha256("{}"));
    assert.equal(internal.verdict, "ARTIFACT_REJECTED");
    assert.ok(internal.findings.includes("PATH_ESCAPE_REJECTED"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
hostile("toctou_reopen_substitution", () => {
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
  const dir = mkdtempSync(join(tmpdir(), "p1a01-noext-"));
  try {
    const custody = assessExternalCustody(dir, []);
    assert.equal(custody.verdict, "NOT_PROVEN");
    const ceiling = computeClaimCeiling(custody, true);
    assert.equal(ceiling.claim, "LOCAL_IMPLEMENTATION_GREEN/EXTERNAL_ASSURANCE_AUTHORITY_PENDING");
    assert.equal(ceiling.trustedCertificationAuthorized, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("simulated_independence", () => {
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
  const dir = mkdtempSync(join(tmpdir(), "p1a01-hist-"));
  try {
    const forged = classifyExecutionEvidence(dir, {
      subjectSha: AUTHORIZED_REBUILD_BASE.sha,
      artifacts: [{ path: "historical-receipt.json", sha256: D("f"), producer: "CODEX", subjectSha: AUTHORIZED_REBUILD_BASE.sha }],
    });
    assert.equal(forged.verdict, "EXECUTION_UNPROVEN");
    assert.ok(forged.findings.includes("EXECUTION_ARTIFACT_UNREADABLE"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
    assert.notEqual(assessExternalCustody(bad, bad).verdict, "CUSTODY_EVIDENCE_RECORDED_LOCALLY");
    assert.notEqual(classifyExecutionEvidence(bad, bad).verdict, "OBSERVED_EXECUTION");
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
