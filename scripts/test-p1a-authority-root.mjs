// P1A-01 authority-root test battery: unit, property/invariant, integration,
// §XIII hostile set, plus regression controls for all six Codex
// INDEPENDENT_REVIEW_BLOCK V2 findings (F1..F4) and V3 findings (H1..H6).
// Every hostile case fails closed. External-proof paths use a real Ed25519
// positive control (ephemeral key) and fail closed under the default
// UNPROVISIONED production trust anchors.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as edSign } from "node:crypto";
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
  ENFORCEMENT_TEST_SURFACE, AUTHORITY_ENFORCEMENT_WORKFLOW,
  parseCodeownersRules, codeownersOwnersFor,
  verifyTrustedSurfaceCoverage, assessTrustedSurfaceChange, verifyEnforcementSurface, selfCheck,
  classifyExecutionEvidence, validateReceiptBinding, acceptSupersession, CUSTODY_CONTRACT_REQUIRED_FIELDS,
  EXTERNAL_CUSTODY_CONTRACT, CUSTODY_CONTROLS, NAMED_HUMAN_GATES, assessExternalCustody,
  assessGateCompleteness, ROLLBACK_CONTRACT, assessRollbackAction, authorizeRollback, computeClaimCeiling,
  rejectSimulatedIndependence, OUT_OF_BOUNDARY_CAPABILITIES, REPOSITORY_AUTHORITY_ROLES,
  assertCapabilityPlacement, assertAuthoritySeparation, readAuthorityArtifact,
  laneAuthorityStatus, PROPERTY_REGISTER, POLICY_VERSION,
  CANONICAL_OBSERVATION_PRODUCERS, LOCAL_CUSTODY_AUTHORIZATION_CEILING,
  EXTERNAL_AUTHORITY_TRUST_ANCHORS, attestationMessage, verifyExternalAttestation,
} from "./validate-p1a-authority-root.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE = AUTHORIZED_REBUILD_BASE.sha;
let executed = 0, passed = 0, hostileExecuted = 0, hostilePassed = 0;
const run = (name, fn) => { executed += 1; fn(); passed += 1; console.log(`PASS ${name}`); };
const hostile = (name, fn) => { hostileExecuted += 1; fn(); hostilePassed += 1; console.log(`PASS hostile:${name}`); };
const D = (c) => c.repeat(64);

// --- Ed25519 test authority (proves the crypto path; never in production) ----
function makeTrust() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const anchors = Object.fromEntries(["GITHUB_ACTIONS_PROTECTED_RUN", "FOUNDER_DARKSIEDCEO", "CODEX"].map((p) => [p, { status: "PROVISIONED", publicKeyPem: pem }]));
  return { anchors, privateKey };
}
function sign(att, privateKey) {
  return { ...att, signature: edSign(null, attestationMessage(att), privateKey).toString("base64") };
}
function writeJson(dir, name, obj) {
  const body = JSON.stringify(obj);
  writeFileSync(join(dir, name), body);
  return { path: name, sha256: sha256(body), body: obj };
}

const GOOD_OBSERVED = Object.freeze({
  remote: AUTHORIZED_REBUILD_BASE.repositoryRemote, sha: BASE, objectType: "commit",
  tree: AUTHORIZED_REBUILD_BASE.tree, parents: [...AUTHORIZED_REBUILD_BASE.parents], dirty: false,
});
const goodReviewer = (id = "CODEX") => {
  const c = CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id);
  return { REVIEWER_ID: id, DOMAIN: c.DOMAIN, EXECUTION_ORIGIN: c.EXECUTION_ORIGIN, REVIEW_CONTEXT_ID: "ctx-1", INDEPENDENCE_CLASS: c.INDEPENDENCE_CLASS, POLICY_VERSION, SUBJECT_IDENTITY: D("a") };
};
const goodPolicyRoot = () => ({ frozenLedgerSha256: CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256, founderFreezeSha256: CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256, releaseAuthoritySha256: CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, requirementDenominator: 124 });
const CODEOWNERS_CONTENT = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS"), "utf8");
const WORKFLOW_SHA = sha256(readFileSync(join(REPO_ROOT, AUTHORITY_ENFORCEMENT_WORKFLOW)));

// custody receipt (signed OK by default helper)
function custodyReceipt(controlId, mutate = () => {}) {
  const r = { artifactId: `RECEIPT_${controlId}`, controlId, producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectBaseSha: BASE, authoritySha256: CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, claimType: "GITHUB_CUSTODY_OBSERVATION", scope: controlId, issuedAt: "2026-08-26T00:00:00Z" };
  mutate(r);
  return r;
}
function writeSignedCustody(dir, priv, mutate = () => {}) {
  return CUSTODY_CONTROLS.map((c) => {
    const receipt = sign(custodyReceipt(c.id, mutate), priv);
    return { controlId: c.id, ...writeJson(dir, `${c.id}.json`, receipt) };
  });
}
function writeSignedGates(dir, priv) {
  const refs = {};
  for (const g of NAMED_HUMAN_GATES) {
    const att = sign({ producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: BASE, claimType: "HUMAN_GATE", scope: g, issuedAt: "t" }, priv);
    refs[g] = writeJson(dir, `${g}.json`, att);
  }
  return refs;
}

// ------------------------------- STATIC ------------------------------------
run("static:property_register_covers_v3_findings", () => {
  assert.ok(PROPERTY_REGISTER.length >= 58);
  assert.equal(new Set(PROPERTY_REGISTER).size, PROPERTY_REGISTER.length);
  for (const p of ["EXECUTION_REQUIRES_SIGNED_ATTESTATION", "CUSTODY_REQUIRES_SIGNED_ATTESTATION", "GATE_COMPLETION_REQUIRES_SIGNED_ARTIFACT", "ROLLBACK_AUTHORIZATION_REQUIRES_EXECUTION", "ENFORCEMENT_SURFACE_WORKFLOW_WIRED", "PARENT_CODEOWNERS_GAP_FAILS_CLOSED", "ATTESTATION_SIGNATURE_VERIFIED_ED25519"]) {
    assert.ok(PROPERTY_REGISTER.includes(p), p);
  }
});
run("static:production_trust_anchors_unprovisioned", () => {
  for (const producer of Object.keys(EXTERNAL_AUTHORITY_TRUST_ANCHORS)) {
    assert.equal(EXTERNAL_AUTHORITY_TRUST_ANCHORS[producer].publicKeyPem, null, producer);
    assert.equal(EXTERNAL_AUTHORITY_TRUST_ANCHORS[producer].status, "UNPROVISIONED", producer);
  }
});
run("static:custody_contract_fully_bound", () => {
  for (const f of CUSTODY_CONTRACT_REQUIRED_FIELDS) assert.ok(typeof EXTERNAL_CUSTODY_CONTRACT[f] === "string" && EXTERNAL_CUSTODY_CONTRACT[f].length > 0, f);
  assert.equal(EXTERNAL_CUSTODY_CONTRACT.status, "CONTRACT_DEFINED_PROVISIONING_NOT_PROVEN");
  assert.equal(LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false);
});
run("static:trusted_surface_15_with_frozen_base_11_and_workflow", () => {
  assert.equal(TRUSTED_SURFACE_FILES.length, 15);
  assert.equal(TRUSTED_SURFACE_DENOMINATOR, 15);
  assert.equal(FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11);
  assert.ok(TRUSTED_SURFACE_FILES.includes(AUTHORITY_ENFORCEMENT_WORKFLOW));
  for (const f of ENFORCEMENT_TEST_SURFACE) assert.ok(TRUSTED_SURFACE_FILES.includes(f), f);
});
run("static:gate_denominator_11", () => assert.equal(NAMED_HUMAN_GATES.length, 11));
run("static:frozen_constants_immutable", () => {
  assert.throws(() => { AUTHORIZED_REBUILD_BASE.sha = "x"; }, TypeError);
  assert.throws(() => { PROPERTY_REGISTER.push("x"); }, TypeError);
  assert.throws(() => { EXTERNAL_AUTHORITY_TRUST_ANCHORS.CODEX = {}; }, TypeError);
});

// -------------------------------- UNIT -------------------------------------
run("unit:base_verified_on_exact_identity", () => assert.equal(verifyRebuildBase(GOOD_OBSERVED).verdict, "BASE_VERIFIED"));
run("unit:authority_manifest_accepts_canonical", () => assert.equal(validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124 }).verdict, "MANIFEST_ACCEPTED"));
run("unit:reviewer_registry_canonical_without_caller_input", () => {
  const out = loadReviewerRegistry(undefined);
  assert.equal(out.verdict, "CANONICAL"); assert.equal(out.registry, CANONICAL_REVIEWER_REGISTRY);
});
run("unit:review_claim_accepts_canonical_reviewer", () => assert.equal(validateReviewClaim(goodReviewer()).verdict, "REVIEW_ACCEPTED"));
run("unit:policy_root_verified", () => assert.equal(verifyPolicyRoot(goodPolicyRoot()).verdict, "POLICY_ROOT_VERIFIED"));
run("unit:codeowners_github_semantics", () => {
  assert.deepEqual(codeownersOwnersFor("/a/b.txt @x\n", "a/b.txt").owners, ["@x"]);
  assert.deepEqual(codeownersOwnersFor("/scripts/ @x\n", "scripts/deep/f.mjs").owners, ["@x"]);
  assert.deepEqual(codeownersOwnersFor("CODEOWNERS @x\n", ".github/CODEOWNERS").owners, ["@x"]);
  assert.deepEqual(codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/f.mjs").owners, ["@x"]);
  assert.deepEqual(codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/sub/f.mjs").owners, []);
  assert.deepEqual(codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]);
  assert.deepEqual(codeownersOwnersFor("/a.txt @x\n/a.txt\n", "a.txt").owners, []);
});
run("unit:attestation_ed25519_positive_and_negative", () => {
  const { anchors, privateKey } = makeTrust();
  const att = sign({ producer: "CODEX", subjectBaseSha: BASE, claimType: "OBSERVED_EXECUTION", scope: BASE, issuedAt: "t" }, privateKey);
  assert.equal(verifyExternalAttestation(att, "OBSERVED_EXECUTION", BASE, anchors).verified, true);
  // default (unprovisioned) anchors: same attestation fails closed
  assert.equal(verifyExternalAttestation(att, "OBSERVED_EXECUTION", BASE).reason, "EXTERNAL_AUTHORITY_UNPROVISIONED");
  // tampered signature
  assert.equal(verifyExternalAttestation({ ...att, signature: Buffer.from("x").toString("base64") }, "OBSERVED_EXECUTION", BASE, anchors).verified, false);
  // wrong claim type / subject / scope
  assert.equal(verifyExternalAttestation(att, "HUMAN_GATE", BASE, anchors).reason, "ATTESTATION_WRONG_CLAIM_TYPE");
  assert.equal(verifyExternalAttestation({ ...att, subjectBaseSha: D("9").slice(0, 40) }, "OBSERVED_EXECUTION", BASE, anchors).reason, "ATTESTATION_WRONG_SUBJECT");
  assert.equal(verifyExternalAttestation(att, "OBSERVED_EXECUTION", "other-scope", anchors).reason, "ATTESTATION_WRONG_SCOPE");
});
run("unit:rollback_plan_never_authorizes", () => {
  assert.equal(assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED");
  assert.equal(assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "SEPARATELY_REVIEWED_REVERT_COMMIT" }).verdict, "ROLLBACK_PLAN_VALIDATED");
});
run("unit:boundary_roles_fixed", () => {
  assert.equal(REPOSITORY_AUTHORITY_ROLES["DarksiedCEO/zbestmedia"], "SPECIFICATION_CONSTRUCTION_AUTHORITY");
  assert.equal(assertCapabilityPlacement("SEARCH_INTELLIGENCE", "DarksiedCEO/separate").verdict, "PLACEMENT_ALLOWED");
});

// ------------------------ POSITIVE CONTROLS (crypto works) ------------------
run("positive:observed_execution_with_signed_attestation", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "pos-exec-"));
  try {
    const att = sign({ producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectBaseSha: BASE, claimType: "OBSERVED_EXECUTION", scope: BASE, issuedAt: "t" }, privateKey);
    const ref = writeJson(dir, "exec.json", att);
    const out = classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: ref.path, sha256: ref.sha256, producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: BASE }] }, anchors);
    assert.equal(out.verdict, "OBSERVED_EXECUTION");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
run("positive:custody_signature_verified_but_never_authorizes", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "pos-cust-"));
  try {
    const refs = writeSignedCustody(dir, privateKey);
    const out = assessExternalCustody(dir, refs, anchors);
    assert.equal(out.verdict, "CUSTODY_SIGNATURE_VERIFIED");
    assert.equal(out.trustedCertificationAuthorized, false);
    assert.equal(computeClaimCeiling(out, true).trustedCertificationAuthorized, false);
    assert.equal(computeClaimCeiling(out, true).custodySignatureVerified, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
run("positive:gates_complete_with_signed_attestations", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "pos-gate-"));
  try {
    const refs = writeSignedGates(dir, privateKey);
    assert.equal(assessGateCompleteness(dir, refs, anchors).verdict, "GATES_COMPLETE");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
run("positive:rollback_authorized_with_signed_execution", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "pos-rb-"));
  try {
    const att = sign({ producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: BASE, claimType: "ROLLBACK_EXECUTION", scope: "DISABLE_DISPATCH", issuedAt: "t" }, privateKey);
    const ref = writeJson(dir, "rb.json", att);
    const out = authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: ref.path, sha256: ref.sha256 }, anchors);
    assert.equal(out.verdict, "ROLLBACK_AUTHORIZED");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------- H1..H6 REGRESSION CONTROLS -----------------------
hostile("H1_unauthenticated_producer_label_fails_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "h1-"));
  try {
    const body = JSON.stringify({ attacker: "controlled", producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectBaseSha: BASE, claimType: "OBSERVED_EXECUTION", scope: BASE });
    writeFileSync(join(dir, "r.json"), body);
    const out = classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "r.json", sha256: sha256(body), producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: BASE }] });
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
    assert.ok(out.findings.some((f) => f.startsWith("EXECUTION_ATTESTATION_UNVERIFIED_EXTERNAL_AUTHORITY_UNPROVISIONED")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H2_caller_asserted_github_observation_fails_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "h2-"));
  try {
    const refs = CUSTODY_CONTROLS.map((c) => {
      const r = { ...custodyReceipt(c.id), source: "GITHUB_OBSERVATION" }; // caller string, no signature
      return { controlId: c.id, ...writeJson(dir, `${c.id}.json`, r) };
    });
    const out = assessExternalCustody(dir, refs);
    assert.equal(out.verdict, "NOT_PROVEN");
    assert.ok(out.findings.some((f) => f.startsWith("CUSTODY_ATTESTATION_UNVERIFIED_")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H3_fabricated_gate_digests_fail_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "h3-"));
  try {
    // old attack shape (object of {subjectSha256}) is now a malformed ref
    const fakeObj = Object.fromEntries(NAMED_HUMAN_GATES.map((g) => [g, { subjectSha256: D("a") }]));
    const out1 = assessGateCompleteness(dir, fakeObj);
    assert.equal(out1.verdict, "GATES_INCOMPLETE");
    // caller writes unsigned gate files -> still incomplete under default anchors
    const refs = {};
    for (const g of NAMED_HUMAN_GATES) refs[g] = writeJson(dir, `${g}.json`, { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: BASE, claimType: "HUMAN_GATE", scope: g });
    const out2 = assessGateCompleteness(dir, refs);
    assert.equal(out2.verdict, "GATES_INCOMPLETE");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H4_unexecuted_rollback_fails_closed", () => {
  assert.equal(assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED");
  const dir = mkdtempSync(join(tmpdir(), "h4-"));
  try {
    // authorize with no execution evidence
    assert.equal(authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, null).verdict, "ROLLBACK_EXECUTION_UNPROVEN");
    // authorize with an UNSIGNED execution artifact under default anchors
    const ref = writeJson(dir, "rb.json", { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: BASE, claimType: "ROLLBACK_EXECUTION", scope: "DISABLE_DISPATCH" });
    const out = authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: ref.path, sha256: ref.sha256 });
    assert.equal(out.verdict, "ROLLBACK_EXECUTION_UNPROVEN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H5_enforcement_surface_defined_but_not_asserted_enforced", () => {
  const out = verifyEnforcementSurface(REPO_ROOT, WORKFLOW_SHA);
  assert.equal(out.verdict, "ENFORCEMENT_SURFACE_DEFINED");
  assert.equal(out.requiredStatusCheckEnforced, "EXTERNAL_NOT_OBSERVED");
  // tampered/absent workflow -> incomplete/absent
  assert.equal(verifyEnforcementSurface(REPO_ROOT, D("0")).verdict, "ENFORCEMENT_SURFACE_ABSENT");
});
hostile("H6_parent_codeowners_gap_fails_closed", () => {
  // parent CODEOWNERS lacking the mutation harness entry must block the change
  const priorWithoutMutation = CODEOWNERS_CONTENT.split("\n").filter((l) => !l.includes("test-p1a-authority-root-mutation.mjs")).join("\n");
  const out = assessTrustedSurfaceChange({ files: ["scripts/test-p1a-authority-root-mutation.mjs"], author: "codex", approvals: ["DarksiedCEO"], priorCodeowners: priorWithoutMutation });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  assert.ok(out.findings.includes("PARENT_CODEOWNERS_GAP_scripts/test-p1a-authority-root-mutation.mjs"));
});

// -------------------- ATTESTATION HOSTILE VARIANTS --------------------------
hostile("attestation_forged_wrong_key", () => {
  const { anchors } = makeTrust();
  const { privateKey: otherKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "forge-"));
  try {
    const att = sign({ producer: "CODEX", subjectBaseSha: BASE, claimType: "OBSERVED_EXECUTION", scope: BASE, issuedAt: "t" }, otherKey);
    const ref = writeJson(dir, "e.json", att);
    const out = classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: ref.path, sha256: ref.sha256, producer: "CODEX", subjectSha: BASE }] }, anchors);
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
    assert.ok(out.findings.some((f) => f.includes("ATTESTATION_SIGNATURE_INVALID")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("attestation_replayed_across_control", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "replay-"));
  try {
    // sign a receipt for control A, then present it under control B's ref+file
    const controlA = CUSTODY_CONTROLS[0].id, controlB = CUSTODY_CONTROLS[1].id;
    const attA = sign(custodyReceipt(controlA), privateKey);
    // reuse attA's signature but change controlId to B -> scope no longer matches signed scope
    const forged = { ...attA, controlId: controlB };
    const ref = { controlId: controlB, ...writeJson(dir, `${controlB}.json`, forged) };
    const others = CUSTODY_CONTROLS.filter((c) => c.id !== controlB).map((c) => ({ controlId: c.id, ...writeJson(dir, `${c.id}.json`, sign(custodyReceipt(c.id), privateKey)) }));
    const out = assessExternalCustody(dir, [ref, ...others], anchors);
    assert.equal(out.verdict, "NOT_PROVEN");
    assert.ok(out.findings.some((f) => f.startsWith(`CUSTODY_ATTESTATION_UNVERIFIED_${controlB}`)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("attestation_cross_subject_rejected", () => {
  const { anchors, privateKey } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "xsub-"));
  try {
    const att = sign({ producer: "CODEX", subjectBaseSha: D("1").slice(0, 40), claimType: "OBSERVED_EXECUTION", scope: BASE, issuedAt: "t" }, privateKey);
    const ref = writeJson(dir, "e.json", att);
    const out = classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: ref.path, sha256: ref.sha256, producer: "CODEX", subjectSha: BASE }] }, anchors);
    assert.equal(out.verdict, "EXECUTION_UNPROVEN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("attestation_missing_malformed_substituted", () => {
  const { anchors } = makeTrust();
  const dir = mkdtempSync(join(tmpdir(), "mms-"));
  try {
    // missing file
    assert.equal(classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "absent.json", sha256: D("a"), producer: "CODEX", subjectSha: BASE }] }, anchors).verdict, "EXECUTION_UNPROVEN");
    // malformed json
    writeFileSync(join(dir, "bad.json"), "not-json{");
    assert.ok(classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "bad.json", sha256: sha256("not-json{"), producer: "CODEX", subjectSha: BASE }] }, anchors).findings.includes("EXECUTION_ATTESTATION_NOT_JSON"));
    // substituted (digest mismatch)
    writeFileSync(join(dir, "s.json"), "swapped");
    assert.ok(classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "s.json", sha256: D("b"), producer: "CODEX", subjectSha: BASE }] }, anchors).findings.includes("FABRICATED_EXECUTION_ARTIFACT"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// -------------------- WORKFLOW-BYPASS / DIRECT-INVOCATION --------------------
hostile("workflow_bypass_probe", () => {
  // a workflow that omits the validator/battery/mutation invocation is incomplete
  const dir = mkdtempSync(join(tmpdir(), "wf-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    const partial = "name: x\non: [push]\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/validate-p1a-authority-root.mjs\n";
    writeFileSync(join(dir, AUTHORITY_ENFORCEMENT_WORKFLOW), partial);
    const out = verifyEnforcementSurface(dir, sha256(partial));
    assert.equal(out.verdict, "ENFORCEMENT_SURFACE_INCOMPLETE");
    assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_BATTERY"));
    assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_MUTATION"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
run("integration:enforcement_workflow_invokes_all_three", () => {
  const wf = readFileSync(join(REPO_ROOT, AUTHORITY_ENFORCEMENT_WORKFLOW), "utf8");
  for (const s of ["scripts/validate-p1a-authority-root.mjs", "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs"]) assert.ok(wf.includes(s), s);
});

// -------------------- CODEOWNERS MATCHING PER CHANGED FILE -------------------
run("integration:codeowners_covers_every_changed_file", () => {
  for (const file of ["scripts/validate-p1a-authority-root.mjs", "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs", AUTHORITY_ENFORCEMENT_WORKFLOW]) {
    const res = codeownersOwnersFor(CODEOWNERS_CONTENT, file);
    assert.deepEqual(res.owners, ["@DarksiedCEO"], file);
  }
  assert.equal(verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT).verdict, "SURFACE_CLOSED");
  assert.equal(verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT).covered, 15);
});

// ----------------------------- PROPERTY / INVARIANT ------------------------
run("property:any_single_base_field_deviation_rejected", () => {
  for (const mut of [{ remote: "https://github.com/a/b.git" }, { sha: D("b").slice(0, 40) }, { objectType: "tag" }, { tree: D("c").slice(0, 40) }, { parents: [] }, { parents: [...AUTHORIZED_REBUILD_BASE.parents].reverse() }, { dirty: true }]) {
    assert.equal(verifyRebuildBase({ ...GOOD_OBSERVED, ...mut }).verdict, "BASE_REJECTED", JSON.stringify(mut));
  }
});
run("property:every_prohibited_base_class_rejected", () => {
  assert.equal(PROHIBITED_BASE_CLASSES.length, 7);
  for (const bc of PROHIBITED_BASE_CLASSES) assert.equal(rejectProhibitedBase({ ref: "main", sha: D("d").slice(0, 40), baseClass: bc }).verdict, "BASE_REJECTED");
});
run("property:every_custody_binding_enforced", () => {
  const { anchors, privateKey } = makeTrust();
  for (const [label, mutate, prefix] of [
    ["producer", (r) => { r.producer = "SELF"; }, "CUSTODY_PRODUCER_UNKNOWN_"],
    ["subject", (r) => { r.subjectBaseSha = D("9").slice(0, 40); }, "CUSTODY_WRONG_SUBJECT_"],
    ["authority", (r) => { r.authoritySha256 = D("8"); }, "CUSTODY_AUTHORITY_UNBOUND_"],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), "cb-"));
    try {
      const refs = writeSignedCustody(dir, privateKey, mutate);
      const out = assessExternalCustody(dir, refs, anchors);
      assert.equal(out.verdict, "NOT_PROVEN", label);
      assert.ok(out.findings.some((f) => f.startsWith(prefix)), label);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
run("property:codeowners_coverage_detects_each_removal", () => {
  assert.equal(verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT).verdict, "SURFACE_CLOSED");
  for (const file of TRUSTED_SURFACE_FILES) {
    const reduced = CODEOWNERS_CONTENT.split("\n").filter((line) => line.trim() !== `/${file} @DarksiedCEO`).join("\n");
    assert.notEqual(reduced, CODEOWNERS_CONTENT, file);
    assert.ok(verifyTrustedSurfaceCoverage(reduced).findings.includes(`TRUSTED_FILE_UNCOVERED_${file}`), file);
  }
});

// ----------------------------- INTEGRATION ---------------------------------
run("integration:live_worktree_base_observation", () => {
  const o = observeGitBase(REPO_ROOT);
  assert.equal(o.sha, BASE); assert.equal(o.tree, AUTHORIZED_REBUILD_BASE.tree); assert.deepEqual(o.parents, [...AUTHORIZED_REBUILD_BASE.parents]);
});
run("integration:threat_model_trusted_list_amended", async () => {
  const tm = await import("./validate-p1a-threat-model.mjs");
  for (const f of tm.AMENDMENT_CONTROLLED_FILES) assert.ok(tm.TRUSTED_INFRASTRUCTURE_FILES.includes(f), f);
  for (const f of tm.TRUSTED_INFRASTRUCTURE_FILES) assert.ok(TRUSTED_SURFACE_FILES.includes(f), f);
  assert.equal(tm.TRUSTED_INFRASTRUCTURE_FILES.length, FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR);
});
run("integration:lane_authority_status_fail_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "lane-"));
  try {
    const good = laneAuthorityStatus({ baseVerification: verifyRebuildBase(GOOD_OBSERVED), policyRootVerification: verifyPolicyRoot(goodPolicyRoot()), custodyAssessment: assessExternalCustody(dir, []), localImplementationGreen: true });
    assert.equal(good.verdict, "LANE_AUTHORITY_MODEL_VERIFIED");
    assert.equal(good.trustedCertificationAuthorized, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------- HOSTILE (carried) -------------------------
hostile("coordinated_authority_root_rewrite", () => {
  const out = assessTrustedSurfaceChange({ files: [...TRUSTED_SURFACE_FILES], author: "attacker", approvals: ["attacker"], priorCodeowners: CODEOWNERS_CONTENT });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
  assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED"));
});
hostile("manifest_role_reduction", () => {
  const out = validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 });
  assert.equal(out.verdict, "MANIFEST_REJECTED");
  assert.ok(out.findings.includes("MANIFEST_ROLE_REDUCTION_META"));
});
hostile("reviewer_registry_replacement", () => {
  assert.equal(loadReviewerRegistry({ reviewers: [] }).verdict, "REVIEWER_REGISTRY_REPLACEMENT");
  assert.ok(validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewerRegistry: {} }).findings.includes("REVIEWER_REGISTRY_REPLACEMENT"));
});
hostile("policy_root_substitution", () => {
  const out = verifyPolicyRoot({ frozenLedgerSha256: D("1"), founderFreezeSha256: D("2"), releaseAuthoritySha256: D("3"), requirementDenominator: 1 });
  assert.equal(out.verdict, "POLICY_ROOT_REJECTED"); assert.equal(out.findings.length, 4);
});
hostile("caller_declared_independence", () => {
  const out = validateReviewClaim({ ...goodReviewer("CLAUDE_CODE"), INDEPENDENCE_CLASS: "INDEPENDENT_MODEL" });
  assert.ok(out.findings.includes("CALLER_DECLARED_INDEPENDENCE_REJECTED"));
});
hostile("symlink_alias_attack", () => {
  const dir = mkdtempSync(join(tmpdir(), "sym-"));
  try {
    mkdirSync(join(dir, "safe")); writeFileSync(join(dir, "outside"), "secret"); writeFileSync(join(dir, "safe", "real.json"), "{}");
    symlinkSync(join(dir, "outside"), join(dir, "safe", "alias.json"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "alias.json", sha256("secret")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "../outside", sha256("secret")).findings.includes("PATH_ESCAPE_REJECTED"));
    mkdirSync(join(dir, "od")); writeFileSync(join(dir, "od", "a.json"), "y"); symlinkSync(join(dir, "od"), join(dir, "safe", "dl"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "dl/a.json", sha256("y")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    mkdirSync(join(dir, "safe", "sub"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "sub/../real.json", sha256("{}")).findings.includes("PATH_ESCAPE_REJECTED"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("toctou_digest_binding", () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-"));
  try { writeFileSync(join(dir, "a.json"), "swapped"); assert.ok(readAuthorityArtifact(dir, "a.json", sha256("expected")).findings.includes("ARTIFACT_DIGEST_MISMATCH")); } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("supersession_weakness", () => {
  assert.ok(acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_CHAIN_MISMATCH"));
  assert.ok(acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false }).findings.includes("PREDECESSOR_NOT_PRESERVED"));
  assert.ok(acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_WITHOUT_FOUNDER_DECISION"));
});
hostile("rollback_history_rewrite_prohibited", () => {
  assert.ok(assessRollbackAction({ kind: "HISTORY_REWRITE" }).findings.includes("HISTORY_REWRITE_PROHIBITED"));
  assert.ok(assessRollbackAction({ kind: "BOOTSTRAP_ROLLBACK", mechanism: "DIRECT_RESET" }).findings.includes("ROLLBACK_WITHOUT_REVIEWED_REVERT"));
});
hostile("spec_claims_runtime_status", () => {
  assert.ok(assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" }).findings.includes("SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"));
});
hostile("boundary_capability_implantation", () => {
  for (const cap of OUT_OF_BOUNDARY_CAPABILITIES) for (const repo of Object.keys(REPOSITORY_AUTHORITY_ROLES)) assert.equal(assertCapabilityPlacement(cap, repo).verdict, "BOUNDARY_VIOLATION");
});
hostile("null_and_malformed_inputs_fail_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-"));
  try {
    for (const bad of [null, undefined, 42, "s", []]) {
      assert.notEqual(verifyRebuildBase(bad).verdict, "BASE_VERIFIED");
      assert.notEqual(validateAuthorityManifest(bad).verdict, "MANIFEST_ACCEPTED");
      assert.notEqual(verifyPolicyRoot(bad).verdict, "POLICY_ROOT_VERIFIED");
      assert.notEqual(assessRollbackAction(bad).verdict, "ROLLBACK_PLAN_VALIDATED");
      assert.notEqual(assessExternalCustody(bad, bad).verdict, "CUSTODY_SIGNATURE_VERIFIED");
      assert.notEqual(classifyExecutionEvidence(bad, bad).verdict, "OBSERVED_EXECUTION");
      assert.notEqual(assessGateCompleteness(bad, bad).verdict, "GATES_COMPLETE");
      assert.notEqual(verifyExternalAttestation(bad, "OBSERVED_EXECUTION", BASE).verified, true);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log(JSON.stringify({
  suite: "p1-a-authority-root",
  required: executed + hostileExecuted, executed: executed + hostileExecuted, passed: passed + hostilePassed,
  unitPropertyIntegration: { executed, passed }, hostile: { executed: hostileExecuted, passed: hostilePassed },
  failed: (executed - passed) + (hostileExecuted - hostilePassed), skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
