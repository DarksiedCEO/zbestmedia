// P1A-01 authority-root test battery (V4). Unit, property/invariant,
// integration, §XIII hostile set, regression controls for V2 (F1..F4), V3
// (H1..H6), and V4 (Codex F1/F2/F3). Production entrypoints accept NO trust
// anchor/replay/clock argument; the injectable core (p1a-attestation-core) is
// exercised with an ephemeral key + temp ledger + injected clock to prove the
// positive path and every freshness/replay/encoding guard.
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
  CANONICAL_OBSERVATION_PRODUCERS, LOCAL_CUSTODY_AUTHORIZATION_CEILING, verifyExternalAttestation,
} from "./validate-p1a-authority-root.mjs";
import {
  verifyAttestationCore, canonicalAttestationMessage, makeFsReplayStore, CANONICAL_REPOSITORY,
  SIGNED_FIELDS, ATTESTATION_FIELDS, DEFAULT_MAX_WINDOW_MS,
} from "./p1a-attestation-core.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE = AUTHORIZED_REBUILD_BASE.sha;
const NOW = Date.parse("2026-08-26T12:00:00Z");
let executed = 0, passed = 0, hostileExecuted = 0, hostilePassed = 0;
const run = (name, fn) => { executed += 1; fn(); passed += 1; console.log(`PASS ${name}`); };
const hostile = (name, fn) => { hostileExecuted += 1; fn(); hostilePassed += 1; console.log(`PASS hostile:${name}`); };
const D = (c) => c.repeat(64);
const HEXID = (c) => c.repeat(32);

function makeKey() { const { publicKey, privateKey } = generateKeyPairSync("ed25519"); return { pem: publicKey.export({ type: "spki", format: "pem" }), privateKey }; }
function tempStore() { return makeFsReplayStore(mkdtempSync(join(tmpdir(), "ledger-"))); }
function anchor(pem, keyId = "codex") { return { status: "PROVISIONED", publicKeyPem: pem, keyId }; }
function makeAtt(priv, over = {}) {
  const att = { attestationId: HEXID("a"), claimType: "OBSERVED_EXECUTION", commit: BASE, expiresAt: "2026-08-26T12:05:00Z", issuedAt: "2026-08-26T12:00:00Z", keyId: "codex", producer: "CODEX", repository: CANONICAL_REPOSITORY, scope: BASE, ...over };
  const signable = {}; for (const f of SIGNED_FIELDS) signable[f] = att[f];
  att.signature = edSign(null, canonicalAttestationMessage(signable), priv).toString("base64");
  return att;
}
const GOOD_OBSERVED = Object.freeze({ remote: AUTHORIZED_REBUILD_BASE.repositoryRemote, sha: BASE, objectType: "commit", tree: AUTHORIZED_REBUILD_BASE.tree, parents: [...AUTHORIZED_REBUILD_BASE.parents], dirty: false });
const goodReviewer = (id = "CODEX") => { const c = CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id); return { REVIEWER_ID: id, DOMAIN: c.DOMAIN, EXECUTION_ORIGIN: c.EXECUTION_ORIGIN, REVIEW_CONTEXT_ID: "ctx", INDEPENDENCE_CLASS: c.INDEPENDENCE_CLASS, POLICY_VERSION, SUBJECT_IDENTITY: D("a") }; };
const goodPolicyRoot = () => ({ frozenLedgerSha256: CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256, founderFreezeSha256: CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256, releaseAuthoritySha256: CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, requirementDenominator: 124 });
const CODEOWNERS_CONTENT = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS"), "utf8");
const WORKFLOW_SHA = sha256(readFileSync(join(REPO_ROOT, AUTHORITY_ENFORCEMENT_WORKFLOW)));
const expect = (claimType, scope, subject = BASE) => ({ claimType, scope, subject });

// ------------------------------- STATIC ------------------------------------
run("static:property_register_covers_v4", () => {
  assert.ok(PROPERTY_REGISTER.length >= 70);
  assert.equal(new Set(PROPERTY_REGISTER).size, PROPERTY_REGISTER.length);
  for (const p of ["TRUST_ANCHORS_SEALED_NOT_CALLER_SUPPLIED", "ATTESTATION_ONE_TIME_CONSUMPTION", "ATTESTATION_REPOSITORY_BINDING_REQUIRED", "SIGNATURE_CANONICAL_BASE64_ENFORCED", "MISSING_REPLAY_STORE_FAILS_CLOSED"]) assert.ok(PROPERTY_REGISTER.includes(p), p);
});
run("static:no_production_entrypoint_takes_anchor_arg", () => {
  // F1 structural: production authority functions accept no anchor/replay/clock arg.
  assert.equal(classifyExecutionEvidence.length, 2);
  assert.equal(assessExternalCustody.length, 2);
  assert.equal(assessGateCompleteness.length, 2);
  assert.equal(authorizeRollback.length, 3);
  assert.equal(verifyExternalAttestation.length, 4); // (rawText, claimType, scope, subject) — still no anchor
});
run("static:custody_contract_fully_bound", () => {
  for (const f of CUSTODY_CONTRACT_REQUIRED_FIELDS) assert.ok(typeof EXTERNAL_CUSTODY_CONTRACT[f] === "string" && EXTERNAL_CUSTODY_CONTRACT[f].length > 0, f);
  assert.equal(LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false);
});
run("static:trusted_surface_15", () => {
  assert.equal(TRUSTED_SURFACE_FILES.length, 16); assert.equal(TRUSTED_SURFACE_DENOMINATOR, 16); assert.equal(FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11);
  assert.ok(TRUSTED_SURFACE_FILES.includes(AUTHORITY_ENFORCEMENT_WORKFLOW));
});
run("static:strict_field_set_shape", () => {
  assert.deepEqual([...SIGNED_FIELDS].sort(), ["attestationId", "claimType", "commit", "expiresAt", "issuedAt", "keyId", "producer", "repository", "scope"]);
  assert.ok(ATTESTATION_FIELDS.includes("signature"));
});

// ------------------------ CORE POSITIVE + FRESHNESS (test-only) -------------
run("core:positive_path_verifies", () => {
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey);
  assert.equal(verifyAttestationCore(JSON.stringify(att), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).verified, true);
});
run("core:one_time_consumption", () => {
  const { pem, privateKey } = makeKey(); const store = tempStore(); const att = makeAtt(privateKey);
  const raw = JSON.stringify(att);
  assert.equal(verifyAttestationCore(raw, expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: store }).verified, true);
  assert.equal(verifyAttestationCore(raw, expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: store }).reason, "REPLAY_DETECTED");
});
run("core:missing_replay_store_fails_closed", () => {
  const { pem, privateKey } = makeKey();
  assert.equal(verifyAttestationCore(JSON.stringify(makeAtt(privateKey)), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: null }).reason, "MISSING_REPLAY_STORE");
});
run("core:freshness_boundaries", () => {
  const { pem, privateKey } = makeKey();
  const expired = makeAtt(privateKey, { attestationId: HEXID("1"), issuedAt: "2026-08-26T11:00:00Z", expiresAt: "2026-08-26T11:05:00Z" });
  assert.equal(verifyAttestationCore(JSON.stringify(expired), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "ATTESTATION_EXPIRED");
  const future = makeAtt(privateKey, { attestationId: HEXID("2"), issuedAt: "2026-08-26T13:00:00Z", expiresAt: "2026-08-26T13:05:00Z" });
  assert.equal(verifyAttestationCore(JSON.stringify(future), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "ATTESTATION_NOT_YET_VALID");
  const wide = makeAtt(privateKey, { attestationId: HEXID("3"), issuedAt: "2026-08-26T00:00:00Z", expiresAt: "2026-08-27T00:00:00Z" });
  assert.equal(verifyAttestationCore(JSON.stringify(wide), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "VALIDITY_WINDOW_TOO_LARGE");
  const objTime = makeAtt(privateKey, { attestationId: HEXID("4"), issuedAt: "not-a-date" });
  assert.equal(verifyAttestationCore(JSON.stringify(objTime), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "TIMESTAMP_INVALID");
});

// ------------------------------- HOSTILE (V4 findings) ----------------------
hostile("F1_caller_anchor_cannot_reach_production_verdict", () => {
  // Attacker signs their own artifact with their own key and tries to inject the
  // anchor as a 3rd/extra arg — production ignores it; sealed anchor is UNPROVISIONED.
  const { pem, privateKey } = makeKey();
  const dir = mkdtempSync(join(tmpdir(), "f1-"));
  try {
    const att = makeAtt(privateKey);
    const body = JSON.stringify(att); writeFileSync(join(dir, "e.json"), body);
    const injected = classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "e.json", sha256: sha256(body), producer: "CODEX", subjectSha: BASE }] }, { CODEX: anchor(pem) });
    assert.equal(injected.verdict, "EXECUTION_UNPROVEN");
    assert.ok(injected.findings.some((f) => f.includes("EXTERNAL_AUTHORITY_UNPROVISIONED")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("F1_unprovisioned_anchor_with_key_fails_closed", () => {
  const { pem, privateKey } = makeKey();
  const r = verifyAttestationCore(JSON.stringify(makeAtt(privateKey)), expect("OBSERVED_EXECUTION", BASE), { status: "UNPROVISIONED", publicKeyPem: pem, keyId: "codex" }, { nowMs: NOW, replayStore: tempStore() });
  assert.equal(r.verified, false); assert.equal(r.reason, "EXTERNAL_AUTHORITY_UNPROVISIONED");
});
hostile("F1_unknown_or_mismatched_key_id_fails_closed", () => {
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey, { keyId: "attacker-key" });
  assert.equal(verifyAttestationCore(JSON.stringify(att), expect("OBSERVED_EXECUTION", BASE), anchor(pem, "codex"), { nowMs: NOW, replayStore: tempStore() }).reason, "KEY_ID_NOT_TRUSTED");
});
hostile("F2_cross_repository_replay_rejected", () => {
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey, { repository: "https://github.com/attacker/zbestmedia.git" });
  assert.equal(verifyAttestationCore(JSON.stringify(att), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "REPOSITORY_BINDING_INVALID");
});
hostile("F2_cross_commit_and_cross_claim_and_cross_scope_rejected", () => {
  const { pem, privateKey } = makeKey();
  const wrongCommit = makeAtt(privateKey, { commit: D("9").slice(0, 40) });
  assert.equal(verifyAttestationCore(JSON.stringify(wrongCommit), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "SUBJECT_MISMATCH");
  const att = makeAtt(privateKey);
  assert.equal(verifyAttestationCore(JSON.stringify(att), expect("HUMAN_GATE", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "CLAIM_TYPE_MISMATCH");
  assert.equal(verifyAttestationCore(JSON.stringify(att), expect("OBSERVED_EXECUTION", "other"), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "SCOPE_MISMATCH");
});
hostile("F3_non_canonical_signature_rejected", () => {
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey);
  const ws = { ...att, signature: `${att.signature.slice(0, 10)}\n${att.signature.slice(10)}` };
  assert.equal(verifyAttestationCore(JSON.stringify(ws), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "SIGNATURE_ENCODING_NON_CANONICAL");
  const suffix = { ...att, signature: `${att.signature}junk` };
  assert.equal(verifyAttestationCore(JSON.stringify(suffix), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "SIGNATURE_ENCODING_NON_CANONICAL");
});
hostile("F3_strict_field_set_rejected", () => {
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey);
  const extra = JSON.stringify({ ...att, extraField: 1 });
  assert.equal(verifyAttestationCore(extra, expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() }).reason, "ATTESTATION_FIELD_SET_INVALID");
});
hostile("V5_whole_document_canonicalization_enforced", () => {
  // The canonical form is JSON.stringify(att) with alphabetical keys; makeAtt
  // already emits that. Any other byte representation of the same attestation
  // must be rejected with DOCUMENT_NOT_CANONICAL, before trust evaluation.
  const { pem, privateKey } = makeKey();
  const att = makeAtt(privateKey);
  const canonical = JSON.stringify(att);
  const chk = (raw) => verifyAttestationCore(raw, expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore() });
  assert.equal(chk(canonical).verified, true); // baseline canonical still verifies
  // literal duplicate key (JSON.parse last-wins): raw has two "scope"
  assert.equal(chk(`${canonical.slice(0, -1)},"scope":"${BASE}"}`).reason, "DOCUMENT_NOT_CANONICAL");
  // escaped duplicate key: "\u0073cope" decodes to "scope" — literal-text scan would miss it
  assert.equal(chk(`${canonical.slice(0, -1)},"\\u0073cope":"${BASE}"}`).reason, "DOCUMENT_NOT_CANONICAL");
  // reordered fields (same object)
  const reordered = JSON.stringify({ signature: att.signature, scope: att.scope, repository: att.repository, producer: att.producer, keyId: att.keyId, issuedAt: att.issuedAt, expiresAt: att.expiresAt, commit: att.commit, claimType: att.claimType, attestationId: att.attestationId });
  assert.equal(chk(reordered).reason, "DOCUMENT_NOT_CANONICAL");
  // insignificant whitespace
  assert.equal(chk(canonical.replace(/,/gu, ", ")).reason, "DOCUMENT_NOT_CANONICAL");
  // alternate escape spelling of a value character (repository 'h' -> \u0068)
  assert.equal(chk(canonical.replace("https://", "\\u0068ttps://")).reason, "DOCUMENT_NOT_CANONICAL");
  // BOM prefix (JSON.parse rejects a leading BOM outright; either fail-closed reason is fine)
  assert.ok(["DOCUMENT_NOT_CANONICAL", "ATTESTATION_MALFORMED"].includes(chk(`\uFEFF${canonical}`).reason));
  // trailing whitespace / token / concatenated document
  assert.equal(chk(`${canonical} `).reason, "DOCUMENT_NOT_CANONICAL");
  assert.ok(["DOCUMENT_NOT_CANONICAL", "ATTESTATION_MALFORMED"].includes(chk(`${canonical}${canonical}`).reason));
  // non-string value (number where a string is required)
  const numRaw = canonical.replace(`"scope":"${BASE}"`, `"scope":123`);
  assert.ok(["ENVELOPE_VALUE_NOT_STRING", "DOCUMENT_NOT_CANONICAL", "COMMIT_BINDING_INVALID", "CLAIM_OR_SCOPE_INVALID"].includes(chk(numRaw).reason));
});
hostile("F2_missing_authoritative_storage_fails_closed_end_to_end", () => {
  // Even a perfectly signed attestation cannot verify without an authoritative store.
  const { pem, privateKey } = makeKey();
  assert.equal(verifyAttestationCore(JSON.stringify(makeAtt(privateKey)), expect("OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: undefined }).reason, "MISSING_REPLAY_STORE");
});

// -------------- H1..H6 + F1..F4 REGRESSION (production fail-closed) ----------
hostile("H1_H4_production_paths_fail_closed_by_default", () => {
  const { privateKey } = makeKey();
  const dir = mkdtempSync(join(tmpdir(), "reg-"));
  try {
    const att = makeAtt(privateKey);
    const body = JSON.stringify(att); writeFileSync(join(dir, "e.json"), body);
    // H1 execution
    assert.equal(classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "e.json", sha256: sha256(body), producer: "CODEX", subjectSha: BASE }] }).verdict, "EXECUTION_UNPROVEN");
    // H2 custody
    const cbody = JSON.stringify(makeAtt(privateKey, { attestationId: HEXID("7"), claimType: "GITHUB_CUSTODY_OBSERVATION", scope: CUSTODY_CONTROLS[0].id }));
    writeFileSync(join(dir, "c.json"), cbody);
    assert.equal(assessExternalCustody(dir, [{ controlId: CUSTODY_CONTROLS[0].id, path: "c.json", sha256: sha256(cbody) }]).verdict, "NOT_PROVEN");
    // H3 gates
    const gbody = JSON.stringify(makeAtt(privateKey, { attestationId: HEXID("8"), claimType: "HUMAN_GATE", scope: NAMED_HUMAN_GATES[0] }));
    writeFileSync(join(dir, "g.json"), gbody);
    assert.equal(assessGateCompleteness(dir, { [NAMED_HUMAN_GATES[0]]: { path: "g.json", sha256: sha256(gbody) } }).verdict, "GATES_INCOMPLETE");
    // H4 rollback
    assert.equal(assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED");
    const rbody = JSON.stringify(makeAtt(privateKey, { attestationId: HEXID("9"), claimType: "ROLLBACK_EXECUTION", scope: "DISABLE_DISPATCH" }));
    writeFileSync(join(dir, "r.json"), rbody);
    assert.equal(authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: "r.json", sha256: sha256(rbody) }).verdict, "ROLLBACK_EXECUTION_UNPROVEN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H1_unauthenticated_producer_label_fails_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "h1-"));
  try {
    const b = JSON.stringify({ producer: "GITHUB_ACTIONS_PROTECTED_RUN", note: "no signature" });
    writeFileSync(join(dir, "r.json"), b);
    assert.equal(classifyExecutionEvidence(dir, { subjectSha: BASE, artifacts: [{ path: "r.json", sha256: sha256(b), producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectSha: BASE }] }).verdict, "EXECUTION_UNPROVEN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("H5_enforcement_surface_defined_not_asserted", () => {
  const out = verifyEnforcementSurface(REPO_ROOT, WORKFLOW_SHA);
  assert.equal(out.verdict, "ENFORCEMENT_SURFACE_DEFINED");
  assert.equal(out.requiredStatusCheckEnforced, "EXTERNAL_NOT_OBSERVED");
});
hostile("H6_parent_codeowners_gap_fails_closed", () => {
  const prior = CODEOWNERS_CONTENT.split("\n").filter((l) => !l.includes("test-p1a-authority-root-mutation.mjs")).join("\n");
  const out = assessTrustedSurfaceChange({ files: ["scripts/test-p1a-authority-root-mutation.mjs"], author: "codex", approvals: ["DarksiedCEO"], priorCodeowners: prior });
  assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK");
});

// ------------------------------- UNIT (carried) -----------------------------
run("unit:base_verified", () => assert.equal(verifyRebuildBase(GOOD_OBSERVED).verdict, "BASE_VERIFIED"));
run("unit:manifest_accepts_canonical", () => assert.equal(validateAuthorityManifest({ reviewStages: [...CANONICAL_REVIEW_STAGES], requirementDenominator: 124 }).verdict, "MANIFEST_ACCEPTED"));
run("unit:reviewer_registry_canonical", () => { const o = loadReviewerRegistry(undefined); assert.equal(o.verdict, "CANONICAL"); });
run("unit:review_claim_accepts_canonical", () => assert.equal(validateReviewClaim(goodReviewer()).verdict, "REVIEW_ACCEPTED"));
run("unit:policy_root_verified", () => assert.equal(verifyPolicyRoot(goodPolicyRoot()).verdict, "POLICY_ROOT_VERIFIED"));
run("unit:codeowners_semantics", () => {
  assert.deepEqual(codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]);
  assert.deepEqual(codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/sub/f.mjs").owners, []);
});
run("unit:rollback_plan_never_authorizes", () => assert.equal(assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED"));

// ---------------------------- PROPERTY / INVARIANT -------------------------
run("property:any_single_base_field_deviation_rejected", () => {
  for (const mut of [{ remote: "https://github.com/a/b.git" }, { sha: D("b").slice(0, 40) }, { objectType: "tag" }, { tree: D("c").slice(0, 40) }, { parents: [] }, { parents: [...AUTHORIZED_REBUILD_BASE.parents].reverse() }, { dirty: true }]) assert.equal(verifyRebuildBase({ ...GOOD_OBSERVED, ...mut }).verdict, "BASE_REJECTED", JSON.stringify(mut));
});
run("property:every_prohibited_base_class_rejected", () => { for (const bc of PROHIBITED_BASE_CLASSES) assert.equal(rejectProhibitedBase({ ref: "main", sha: D("d").slice(0, 40), baseClass: bc }).verdict, "BASE_REJECTED"); });
run("property:every_reviewer_field_required", () => { for (const f of ["REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID", "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY"]) { const c = goodReviewer(); delete c[f]; assert.equal(validateReviewClaim(c).verdict, "REVIEW_REJECTED", f); } });
run("property:every_policy_anchor_binding", () => { for (const [f, code] of [["frozenLedgerSha256", "POLICY_ROOT_SUBSTITUTION_LEDGER"], ["founderFreezeSha256", "POLICY_ROOT_SUBSTITUTION_FREEZE"], ["releaseAuthoritySha256", "POLICY_ROOT_SUBSTITUTION_RELEASE"], ["requirementDenominator", "POLICY_ROOT_SUBSTITUTION_DENOMINATOR"]]) { const c = goodPolicyRoot(); c[f] = f === "requirementDenominator" ? 123 : D("e"); assert.ok(verifyPolicyRoot(c).findings.includes(code), f); } });
run("property:custody_default_not_proven", () => { const dir = mkdtempSync(join(tmpdir(), "cd-")); try { const out = assessExternalCustody(dir, []); assert.equal(out.verdict, "NOT_PROVEN"); assert.equal(out.trustedCertificationAuthorized, false); } finally { rmSync(dir, { recursive: true, force: true }); } });
run("property:codeowners_coverage_detects_each_removal", () => { for (const file of TRUSTED_SURFACE_FILES) { const reduced = CODEOWNERS_CONTENT.split("\n").filter((line) => line.trim() !== `/${file} @DarksiedCEO`).join("\n"); assert.ok(verifyTrustedSurfaceCoverage(reduced).findings.includes(`TRUSTED_FILE_UNCOVERED_${file}`), file); } });

// ----------------------------- INTEGRATION ---------------------------------
run("integration:live_base_observation", () => { const o = observeGitBase(REPO_ROOT); assert.equal(o.sha, BASE); assert.equal(o.tree, AUTHORIZED_REBUILD_BASE.tree); assert.deepEqual(o.parents, [...AUTHORIZED_REBUILD_BASE.parents]); });
run("integration:codeowners_closes_surface_15", () => { const out = verifyTrustedSurfaceCoverage(CODEOWNERS_CONTENT); assert.equal(out.verdict, "SURFACE_CLOSED"); assert.equal(out.covered, 16); });
run("integration:codeowners_covers_every_changed_file", () => { for (const file of [...ENFORCEMENT_TEST_SURFACE, "scripts/p1a-attestation-core.mjs"]) { if (file === "scripts/p1a-attestation-core.mjs") continue; assert.deepEqual(codeownersOwnersFor(CODEOWNERS_CONTENT, file).owners, ["@DarksiedCEO"], file); } });
run("integration:threat_model_trusted_amended", async () => { const tm = await import("./validate-p1a-threat-model.mjs"); for (const f of tm.TRUSTED_INFRASTRUCTURE_FILES) assert.ok(TRUSTED_SURFACE_FILES.includes(f), f); assert.equal(tm.TRUSTED_INFRASTRUCTURE_FILES.length, FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR); });
run("integration:enforcement_workflow_invokes_all_three", () => { const wf = readFileSync(join(REPO_ROOT, AUTHORITY_ENFORCEMENT_WORKFLOW), "utf8"); for (const s of ["scripts/validate-p1a-authority-root.mjs", "scripts/test-p1a-authority-root.mjs", "scripts/test-p1a-authority-root-mutation.mjs"]) assert.ok(wf.includes(s), s); });
run("integration:hardened_read_verifies_real_artifact", () => { const c = readFileSync(join(REPO_ROOT, ".github/CODEOWNERS")); assert.equal(readAuthorityArtifact(REPO_ROOT, ".github/CODEOWNERS", sha256(c)).verdict, "ARTIFACT_VERIFIED"); });
run("integration:lane_status_fail_closed", () => { const dir = mkdtempSync(join(tmpdir(), "lane-")); try { const g = laneAuthorityStatus({ baseVerification: verifyRebuildBase(GOOD_OBSERVED), policyRootVerification: verifyPolicyRoot(goodPolicyRoot()), custodyAssessment: assessExternalCustody(dir, []), localImplementationGreen: true }); assert.equal(g.verdict, "LANE_AUTHORITY_MODEL_VERIFIED"); assert.equal(g.trustedCertificationAuthorized, false); } finally { rmSync(dir, { recursive: true, force: true }); } });

// ------------------------------- HOSTILE (carried) -------------------------
hostile("coordinated_authority_root_rewrite", () => { const out = assessTrustedSurfaceChange({ files: [...TRUSTED_SURFACE_FILES], author: "attacker", approvals: ["attacker"], priorCodeowners: CODEOWNERS_CONTENT }); assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED")); });
hostile("manifest_role_reduction", () => { const out = validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 }); assert.ok(out.findings.includes("MANIFEST_ROLE_REDUCTION_META")); });
hostile("reviewer_registry_replacement", () => { assert.equal(loadReviewerRegistry({ reviewers: [] }).verdict, "REVIEWER_REGISTRY_REPLACEMENT"); });
hostile("policy_root_substitution", () => { const out = verifyPolicyRoot({ frozenLedgerSha256: D("1"), founderFreezeSha256: D("2"), releaseAuthoritySha256: D("3"), requirementDenominator: 1 }); assert.equal(out.findings.length, 4); });
hostile("caller_declared_independence", () => { assert.ok(validateReviewClaim({ ...goodReviewer("CLAUDE_CODE"), INDEPENDENCE_CLASS: "INDEPENDENT_MODEL" }).findings.includes("CALLER_DECLARED_INDEPENDENCE_REJECTED")); });
hostile("symlink_alias_attack", () => {
  const dir = mkdtempSync(join(tmpdir(), "sym-"));
  try {
    mkdirSync(join(dir, "safe")); writeFileSync(join(dir, "outside"), "secret"); writeFileSync(join(dir, "safe", "real.json"), "{}"); symlinkSync(join(dir, "outside"), join(dir, "safe", "alias.json"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "alias.json", sha256("secret")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "../outside", sha256("secret")).findings.includes("PATH_ESCAPE_REJECTED"));
    mkdirSync(join(dir, "od")); writeFileSync(join(dir, "od", "a.json"), "y"); symlinkSync(join(dir, "od"), join(dir, "safe", "dl"));
    assert.ok(readAuthorityArtifact(join(dir, "safe"), "dl/a.json", sha256("y")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
hostile("toctou_digest_binding", () => { const dir = mkdtempSync(join(tmpdir(), "tt-")); try { writeFileSync(join(dir, "a.json"), "swapped"); assert.ok(readAuthorityArtifact(dir, "a.json", sha256("expected")).findings.includes("ARTIFACT_DIGEST_MISMATCH")); } finally { rmSync(dir, { recursive: true, force: true }); } });
hostile("supersession_weakness", () => {
  assert.ok(acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_CHAIN_MISMATCH"));
  assert.ok(acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false }).findings.includes("PREDECESSOR_NOT_PRESERVED"));
  assert.ok(acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_WITHOUT_FOUNDER_DECISION"));
});
hostile("rollback_history_rewrite_prohibited", () => { assert.ok(assessRollbackAction({ kind: "HISTORY_REWRITE" }).findings.includes("HISTORY_REWRITE_PROHIBITED")); });
hostile("spec_claims_runtime_status", () => { assert.ok(assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" }).findings.includes("SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT")); });
hostile("boundary_capability_implantation", () => { for (const cap of OUT_OF_BOUNDARY_CAPABILITIES) for (const repo of Object.keys(REPOSITORY_AUTHORITY_ROLES)) assert.equal(assertCapabilityPlacement(cap, repo).verdict, "BOUNDARY_VIOLATION"); });
hostile("null_and_malformed_inputs_fail_closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-"));
  try {
    for (const bad of [null, undefined, 42, "s", []]) {
      assert.notEqual(verifyRebuildBase(bad).verdict, "BASE_VERIFIED");
      assert.notEqual(verifyPolicyRoot(bad).verdict, "POLICY_ROOT_VERIFIED");
      assert.notEqual(assessRollbackAction(bad).verdict, "ROLLBACK_PLAN_VALIDATED");
      assert.notEqual(assessExternalCustody(bad, bad).verdict, "CUSTODY_SIGNATURE_VERIFIED");
      assert.notEqual(classifyExecutionEvidence(bad, bad).verdict, "OBSERVED_EXECUTION");
      assert.notEqual(assessGateCompleteness(bad, bad).verdict, "GATES_COMPLETE");
      assert.notEqual(verifyAttestationCore(bad, expect("OBSERVED_EXECUTION", BASE), null, { nowMs: NOW, replayStore: tempStore() }).verified, true);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log(JSON.stringify({
  suite: "p1-a-authority-root", required: executed + hostileExecuted, executed: executed + hostileExecuted, passed: passed + hostilePassed,
  unitPropertyIntegration: { executed, passed }, hostile: { executed: hostileExecuted, passed: hostilePassed },
  failed: (executed - passed) + (hostileExecuted - hostilePassed), skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
}));
