// P1A-01 mutation harness. Mutation denominator derives from PROPERTY_REGISTER.
// A mutant is KILLED when >=1 invariant probe fails against it (or it fails to
// load). Survivors required: 0. Covers V2 (F1..F4) and V3 (H1..H6) guards, incl.
// negative controls proving each new guard's removal is detected.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as edSign } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./validate-p1a-authority-root.mjs", import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const D = (c) => c.repeat(64);
const importSource = async (s) => import(`data:text/javascript;base64,${Buffer.from(s).toString("base64")}`);

function makeTrust() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const anchors = Object.fromEntries(["GITHUB_ACTIONS_PROTECTED_RUN", "FOUNDER_DARKSIEDCEO", "CODEX"].map((p) => [p, { status: "PROVISIONED", publicKeyPem: pem }]));
  return { anchors, privateKey };
}
function goodObserved(m) { return { remote: m.AUTHORIZED_REBUILD_BASE.repositoryRemote, sha: m.AUTHORIZED_REBUILD_BASE.sha, objectType: "commit", tree: m.AUTHORIZED_REBUILD_BASE.tree, parents: [...m.AUTHORIZED_REBUILD_BASE.parents], dirty: false }; }
function goodReviewer(m, id = "CODEX") { const c = m.CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id); return { REVIEWER_ID: id, DOMAIN: c.DOMAIN, EXECUTION_ORIGIN: c.EXECUTION_ORIGIN, REVIEW_CONTEXT_ID: "ctx", INDEPENDENCE_CLASS: c.INDEPENDENCE_CLASS, POLICY_VERSION: m.POLICY_VERSION, SUBJECT_IDENTITY: D("a") }; }
function goodPolicyRoot(m) { return { frozenLedgerSha256: m.CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256, founderFreezeSha256: m.CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256, releaseAuthoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, requirementDenominator: 124 }; }
function sign(m, att, priv) { return { ...att, signature: edSign(null, m.attestationMessage(att), priv).toString("base64") }; }
function writeJson(dir, name, obj) { const b = JSON.stringify(obj); writeFileSync(join(dir, name), b); return { path: name, sha256: sha256(b) }; }
const FULL_WF = "name: x\non: [push]\njobs:\n  a:\n    steps:\n      - run: node scripts/validate-p1a-authority-root.mjs\n      - run: node scripts/test-p1a-authority-root.mjs\n      - run: node scripts/test-p1a-authority-root-mutation.mjs\n";
const PARTIAL_WF = "name: x\non: [push]\njobs:\n  a:\n    steps:\n      - run: node scripts/validate-p1a-authority-root.mjs\n";
function withWorkflow(m, content, probe) {
  const dir = mkdtempSync(join(tmpdir(), "wf-"));
  try { mkdirSync(join(dir, ".github", "workflows"), { recursive: true }); writeFileSync(join(dir, m.AUTHORITY_ENFORCEMENT_WORKFLOW), content); return probe(dir, sha256(content)); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const PROBES = {
  base_wrong_sha: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), sha: "1".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_tree: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), tree: "2".repeat(40) }).verdict, "BASE_REJECTED"),
  base_wrong_parents: (m) => { assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [] }).verdict, "BASE_REJECTED"); assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [...m.AUTHORIZED_REBUILD_BASE.parents].reverse() }).verdict, "BASE_REJECTED"); },
  base_wrong_remote: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), remote: "https://x/y.git" }).verdict, "BASE_REJECTED"),
  base_dirty: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), dirty: true }).verdict, "BASE_REJECTED"),
  base_good: (m) => assert.equal(m.verifyRebuildBase(goodObserved(m)).verdict, "BASE_VERIFIED"),
  prohibited_base: (m) => { for (const bc of m.PROHIBITED_BASE_CLASSES) assert.equal(m.rejectProhibitedBase({ ref: "main", sha: "3".repeat(40), baseClass: bc }).verdict, "BASE_REJECTED"); },
  manifest_reduction: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: ["OMEGA", "META"], requirementDenominator: 124 }).verdict, "MANIFEST_REJECTED"),
  caller_reviewers: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewers: [] }).verdict, "MANIFEST_REJECTED"),
  registry_replacement: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewerRegistry: {} }).verdict, "MANIFEST_REJECTED"),
  denominator_sub: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 20 }).verdict, "MANIFEST_REJECTED"),
  one_role: (m) => assert.ok(m.validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 }).findings.includes("SELF_CONSISTENT_ONE_ROLE_MANIFEST")),
  load_registry: (m) => { assert.equal(m.loadReviewerRegistry({}).verdict, "REVIEWER_REGISTRY_REPLACEMENT"); assert.equal(m.loadReviewerRegistry(undefined).verdict, "CANONICAL"); },
  reviewer_fields: (m) => { for (const f of ["REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID", "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY"]) { const c = goodReviewer(m); delete c[f]; assert.equal(m.validateReviewClaim(c).verdict, "REVIEW_REJECTED", f); } },
  unknown_reviewer: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), REVIEWER_ID: "FAKE" }).verdict, "REVIEW_REJECTED"),
  wrong_domain: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), DOMAIN: "FINAL_CERTIFICATION" }).verdict, "REVIEW_REJECTED"),
  stale_contract: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), POLICY_VERSION: "V0" }).verdict, "REVIEW_REJECTED"),
  caller_independence: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CLAUDE_CODE"), INDEPENDENCE_CLASS: "JUDGE" }).verdict, "REVIEW_REJECTED"),
  subject_digest: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), SUBJECT_IDENTITY: "zzz" }).verdict, "REVIEW_REJECTED"),
  origin_mismatch: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), EXECUTION_ORIGIN: "CLAUDE_CODE_SESSION" }).verdict, "REVIEW_REJECTED"),
  single_reviewer: (m) => { const c = goodReviewer(m, "AEGIS_OMEGA"); assert.equal(m.validateStageAssignments(Object.fromEntries(m.CANONICAL_REVIEW_STAGES.map((s) => [s, { ...c }]))).verdict, "STAGES_REJECTED"); },
  policy_anchors: (m) => { for (const f of ["frozenLedgerSha256", "founderFreezeSha256", "releaseAuthoritySha256", "requirementDenominator"]) { const c = goodPolicyRoot(m); c[f] = f === "requirementDenominator" ? 1 : D("9"); assert.equal(m.verifyPolicyRoot(c).verdict, "POLICY_ROOT_REJECTED", f); } assert.equal(m.verifyPolicyRoot(goodPolicyRoot(m)).verdict, "POLICY_ROOT_VERIFIED"); },
  surface_denominator: (m) => { assert.equal(m.TRUSTED_SURFACE_FILES.length, 15); assert.equal(m.TRUSTED_SURFACE_DENOMINATOR, 15); assert.equal(m.FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11); assert.ok(m.TRUSTED_SURFACE_FILES.includes(m.AUTHORITY_ENFORCEMENT_WORKFLOW)); },
  surface_uncovered: (m) => { const out = m.verifyTrustedSurfaceCoverage("/.github/CODEOWNERS @DarksiedCEO\n"); assert.equal(out.verdict, "SURFACE_OPEN"); assert.ok(out.findings.includes("TRUSTED_FILE_UNCOVERED_scripts/validate-p1a-threat-model.mjs")); },
  surface_wrong_owner: (m) => assert.equal(m.verifyTrustedSurfaceCoverage(m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @attacker`).join("\n")).verdict, "SURFACE_OPEN"),
  surface_closed_positive: (m) => assert.equal(m.verifyTrustedSurfaceCoverage(m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n")).verdict, "SURFACE_CLOSED"),
  codeowners_last_match: (m) => { assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]); assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt\n", "a.txt").owners, []); },
  codeowners_glob: (m) => { assert.deepEqual(m.codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/f.mjs").owners, ["@x"]); assert.deepEqual(m.codeownersOwnersFor("/scripts/*.mjs @x\n", "scripts/sub/f.mjs").owners, []); assert.deepEqual(m.codeownersOwnersFor("/scripts/ @x\n", "scripts/deep/f.mjs").owners, ["@x"]); },
  codeowners_unsupported: (m) => { const out = m.codeownersOwnersFor("!x @a\n", "x"); assert.equal(out.owners, null); },
  coordinated_rewrite: (m) => { const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n"); const out = m.assessTrustedSurfaceChange({ files: [...m.TRUSTED_SURFACE_FILES], author: "attacker", approvals: ["attacker"], priorCodeowners: prior }); assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED")); },
  non_owner_approval: (m) => { const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n"); assert.equal(m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "attacker", approvals: ["accomplice"], priorCodeowners: prior }).verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); },
  // H6 parent gap
  parent_codeowners_gap: (m) => { const prior = m.TRUSTED_SURFACE_FILES.filter((f) => f !== "scripts/test-p1a-authority-root-mutation.mjs").map((f) => `/${f} @DarksiedCEO`).join("\n"); const out = m.assessTrustedSurfaceChange({ files: ["scripts/test-p1a-authority-root-mutation.mjs"], author: "codex", approvals: ["DarksiedCEO"], priorCodeowners: prior }); assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); assert.ok(out.findings.includes("PARENT_CODEOWNERS_GAP_scripts/test-p1a-authority-root-mutation.mjs")); },
  // attestation core
  attestation_unprovisioned_reason: (m) => { const { privateKey } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: m.AUTHORIZED_REBUILD_BASE.sha, issuedAt: "t" }, privateKey); assert.equal(m.verifyExternalAttestation(att, "OBSERVED_EXECUTION", m.AUTHORIZED_REBUILD_BASE.sha).reason, "EXTERNAL_AUTHORITY_UNPROVISIONED"); },
  attestation_positive: (m) => { const { anchors, privateKey } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: m.AUTHORIZED_REBUILD_BASE.sha, issuedAt: "t" }, privateKey); assert.equal(m.verifyExternalAttestation(att, "OBSERVED_EXECUTION", m.AUTHORIZED_REBUILD_BASE.sha, anchors).verified, true); },
  attestation_forged: (m) => { const { anchors } = makeTrust(); const { privateKey: other } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: m.AUTHORIZED_REBUILD_BASE.sha, issuedAt: "t" }, other); assert.equal(m.verifyExternalAttestation(att, "OBSERVED_EXECUTION", m.AUTHORIZED_REBUILD_BASE.sha, anchors).verified, false); },
  attestation_wrong_subject: (m) => { const { anchors, privateKey } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: D("1").slice(0, 40), claimType: "OBSERVED_EXECUTION", scope: "s", issuedAt: "t" }, privateKey); assert.equal(m.verifyExternalAttestation(att, "OBSERVED_EXECUTION", "s", anchors).verified, false); },
  attestation_wrong_claim: (m) => { const { anchors, privateKey } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: "s", issuedAt: "t" }, privateKey); assert.equal(m.verifyExternalAttestation(att, "HUMAN_GATE", "s", anchors).verified, false); },
  attestation_wrong_scope: (m) => { const { anchors, privateKey } = makeTrust(); const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: "A", issuedAt: "t" }, privateKey); assert.equal(m.verifyExternalAttestation(att, "OBSERVED_EXECUTION", "B", anchors).verified, false); },
  // H1 execution requires signed attestation
  execution_unsigned_fails: (m) => { const dir = mkdtempSync(join(tmpdir(), "ex-")); try { const b = JSON.stringify({ producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: m.AUTHORIZED_REBUILD_BASE.sha }); writeFileSync(join(dir, "r.json"), b); assert.equal(m.classifyExecutionEvidence(dir, { subjectSha: m.AUTHORIZED_REBUILD_BASE.sha, artifacts: [{ path: "r.json", sha256: sha256(b), producer: "CODEX", subjectSha: m.AUTHORIZED_REBUILD_BASE.sha }] }).verdict, "EXECUTION_UNPROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  execution_signed_positive: (m) => { const { anchors, privateKey } = makeTrust(); const dir = mkdtempSync(join(tmpdir(), "exp-")); try { const att = sign(m, { producer: "CODEX", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "OBSERVED_EXECUTION", scope: m.AUTHORIZED_REBUILD_BASE.sha, issuedAt: "t" }, privateKey); const r = writeJson(dir, "r.json", att); assert.equal(m.classifyExecutionEvidence(dir, { subjectSha: m.AUTHORIZED_REBUILD_BASE.sha, artifacts: [{ path: r.path, sha256: r.sha256, producer: "CODEX", subjectSha: m.AUTHORIZED_REBUILD_BASE.sha }] }, anchors).verdict, "OBSERVED_EXECUTION"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  execution_subject_unbound: (m) => { const dir = mkdtempSync(join(tmpdir(), "eu-")); try { assert.equal(m.classifyExecutionEvidence(dir, { artifacts: [{ path: "r.json", sha256: D("a"), producer: "CODEX" }] }).findings.includes("EXECUTION_SUBJECT_UNBOUND"), true); } finally { rmSync(dir, { recursive: true, force: true }); } },
  // H2 custody requires signed
  custody_unsigned_fails: (m) => { const dir = mkdtempSync(join(tmpdir(), "cu-")); try { const refs = m.CUSTODY_CONTROLS.map((c) => { const r = { controlId: c.id, producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, authoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, claimType: "GITHUB_CUSTODY_OBSERVATION", scope: c.id, source: "GITHUB_OBSERVATION" }; return { controlId: c.id, ...writeJson(dir, `${c.id}.json`, r) }; }); assert.equal(m.assessExternalCustody(dir, refs).verdict, "NOT_PROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  custody_signed_positive_never_authorizes: (m) => { const { anchors, privateKey } = makeTrust(); const dir = mkdtempSync(join(tmpdir(), "cp-")); try { const refs = m.CUSTODY_CONTROLS.map((c) => { const r = sign(m, { controlId: c.id, producer: "GITHUB_ACTIONS_PROTECTED_RUN", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, authoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, claimType: "GITHUB_CUSTODY_OBSERVATION", scope: c.id, issuedAt: "t" }, privateKey); return { controlId: c.id, ...writeJson(dir, `${c.id}.json`, r) }; }); const out = m.assessExternalCustody(dir, refs, anchors); assert.equal(out.verdict, "CUSTODY_SIGNATURE_VERIFIED"); assert.equal(out.trustedCertificationAuthorized, false); } finally { rmSync(dir, { recursive: true, force: true }); } },
  custody_default_not_proven: (m) => { const dir = mkdtempSync(join(tmpdir(), "cd-")); try { assert.equal(m.assessExternalCustody(dir, []).verdict, "NOT_PROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  ceiling_never_authorizes: (m) => { assert.equal(m.computeClaimCeiling({ verdict: "CUSTODY_SIGNATURE_VERIFIED", trustedCertificationAuthorized: true }, true).trustedCertificationAuthorized, false); assert.equal(m.LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false); },
  // H3 gates signed
  gates_unsigned_fails: (m) => { const dir = mkdtempSync(join(tmpdir(), "gu-")); try { const refs = {}; for (const g of m.NAMED_HUMAN_GATES) refs[g] = writeJson(dir, `${g}.json`, { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "HUMAN_GATE", scope: g }); assert.equal(m.assessGateCompleteness(dir, refs).verdict, "GATES_INCOMPLETE"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  gates_signed_positive: (m) => { const { anchors, privateKey } = makeTrust(); const dir = mkdtempSync(join(tmpdir(), "gp-")); try { const refs = {}; for (const g of m.NAMED_HUMAN_GATES) refs[g] = writeJson(dir, `${g}.json`, sign(m, { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "HUMAN_GATE", scope: g, issuedAt: "t" }, privateKey)); assert.equal(m.assessGateCompleteness(dir, refs, anchors).verdict, "GATES_COMPLETE"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  gates_fabricated_object_fails: (m) => { const dir = mkdtempSync(join(tmpdir(), "gf-")); try { assert.equal(m.assessGateCompleteness(dir, Object.fromEntries(m.NAMED_HUMAN_GATES.map((g) => [g, { subjectSha256: D("a") }]))).verdict, "GATES_INCOMPLETE"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  // H4 rollback
  rollback_plan_not_auth: (m) => { assert.equal(m.assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED"); },
  rollback_unexecuted_unproven: (m) => { const dir = mkdtempSync(join(tmpdir(), "ru-")); try { assert.equal(m.authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, null).verdict, "ROLLBACK_EXECUTION_UNPROVEN"); const ref = writeJson(dir, "rb.json", { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "ROLLBACK_EXECUTION", scope: "DISABLE_DISPATCH" }); assert.equal(m.authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: ref.path, sha256: ref.sha256 }).verdict, "ROLLBACK_EXECUTION_UNPROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  rollback_signed_positive: (m) => { const { anchors, privateKey } = makeTrust(); const dir = mkdtempSync(join(tmpdir(), "rp-")); try { const att = sign(m, { producer: "FOUNDER_DARKSIEDCEO", subjectBaseSha: m.AUTHORIZED_REBUILD_BASE.sha, claimType: "ROLLBACK_EXECUTION", scope: "DISABLE_DISPATCH", issuedAt: "t" }, privateKey); const ref = writeJson(dir, "rb.json", att); assert.equal(m.authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: ref.path, sha256: ref.sha256 }, anchors).verdict, "ROLLBACK_AUTHORIZED"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  rollback_history_rewrite: (m) => assert.ok(m.assessRollbackAction({ kind: "HISTORY_REWRITE" }).findings.includes("HISTORY_REWRITE_PROHIBITED")),
  // H5 enforcement surface
  enforcement_full_defined: (m) => withWorkflow(m, FULL_WF, (dir, sha) => { const out = m.verifyEnforcementSurface(dir, sha); assert.equal(out.verdict, "ENFORCEMENT_SURFACE_DEFINED"); assert.equal(out.requiredStatusCheckEnforced, "EXTERNAL_NOT_OBSERVED"); }),
  enforcement_partial_incomplete: (m) => withWorkflow(m, PARTIAL_WF, (dir, sha) => { const out = m.verifyEnforcementSurface(dir, sha); assert.equal(out.verdict, "ENFORCEMENT_SURFACE_INCOMPLETE"); assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_BATTERY")); assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_MUTATION")); }),
  enforcement_not_asserted: (m) => withWorkflow(m, FULL_WF, (dir, sha) => { assert.equal(m.verifyEnforcementSurface(dir, sha).requiredStatusCheckEnforced, "EXTERNAL_NOT_OBSERVED"); }),
  // carried fs/boundary/supersession
  path_escape: (m) => { const dir = mkdtempSync(join(tmpdir(), "pe-")); try { writeFileSync(join(dir, "secret"), "s"); mkdirSync(join(dir, "root")); mkdirSync(join(dir, "root", "sub")); writeFileSync(join(dir, "root", "a.json"), "in"); assert.equal(m.readAuthorityArtifact(join(dir, "root"), "../secret", sha256("s")).verdict, "ARTIFACT_REJECTED"); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "sub/../a.json", sha256("in")).findings.includes("PATH_ESCAPE_REJECTED")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  symlink: (m) => { const dir = mkdtempSync(join(tmpdir(), "sl-")); try { mkdirSync(join(dir, "root")); writeFileSync(join(dir, "out"), "x"); symlinkSync(join(dir, "out"), join(dir, "root", "al")); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "al", sha256("x")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED")); mkdirSync(join(dir, "od")); writeFileSync(join(dir, "od", "a.json"), "y"); symlinkSync(join(dir, "od"), join(dir, "root", "dl")); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "dl/a.json", sha256("y")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  digest_binding: (m) => { const dir = mkdtempSync(join(tmpdir(), "db-")); try { writeFileSync(join(dir, "a.json"), "real"); assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("expected")).verdict, "ARTIFACT_REJECTED"); assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("real")).verdict, "ARTIFACT_VERIFIED"); assert.ok(m.readAuthorityArtifact(dir, "a.json", "nothex").findings.includes("EXPECTED_DIGEST_MISSING")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  supersession: (m) => {
    assert.ok(m.acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_CHAIN_MISMATCH"));
    assert.ok(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false }).findings.includes("PREDECESSOR_NOT_PRESERVED"));
    assert.ok(m.acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_WITHOUT_FOUNDER_DECISION"));
    assert.equal(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).verdict, "SUPERSESSION_ACCEPTED");
  },
  gates_absent_ref_incomplete: (m) => { const dir = mkdtempSync(join(tmpdir(), "ga-")); try { assert.equal(m.assessGateCompleteness(dir, {}).verdict, "GATES_INCOMPLETE"); assert.ok(m.assessGateCompleteness(dir, {}).findings.some((f) => f.startsWith("GATE_MISSING_"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  boundary: (m) => { for (const cap of m.OUT_OF_BOUNDARY_CAPABILITIES) assert.equal(m.assertCapabilityPlacement(cap, "DarksiedCEO/zbestmedia").verdict, "BOUNDARY_VIOLATION"); },
  spec_not_runtime: (m) => assert.equal(m.assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" }).verdict, "CLAIM_REJECTED"),
};

const MUTANTS = [
  { p: "BASE_SHA", find: `if (observed.sha !== AUTHORIZED_REBUILD_BASE.sha) findings.push("WRONG_BASE_SHA");`, r: `` },
  { p: "BASE_TREE", find: `if (observed.tree !== AUTHORIZED_REBUILD_BASE.tree) findings.push("WRONG_BASE_TREE");`, r: `` },
  { p: "BASE_REMOTE", find: `if (observed.remote !== AUTHORIZED_REBUILD_BASE.repositoryRemote) findings.push("WRONG_REPOSITORY_REMOTE");`, r: `` },
  { p: "BASE_PARENTS", find: `|| AUTHORIZED_REBUILD_BASE.parents.some((p, i) => parents[i] !== p)) findings.push("WRONG_BASE_PARENTS");`, r: `|| false) findings.push("WRONG_BASE_PARENTS");` },
  { p: "BASE_DIRTY", find: `if (observed.dirty === true) findings.push("PROHIBITED_BASE_DIRTY_LOCAL_HEAD");`, r: `` },
  { p: "PROHIBITED_BASE", find: `return { verdict: "BASE_REJECTED", findings: [\`PROHIBITED_BASE_\${cls}\`] };`, r: `return { verdict: "BASE_ACCEPTED", findings: [] };` },
  { p: "MANIFEST_REDUCTION", find: `if (!stages.includes(stage)) findings.push(\`MANIFEST_ROLE_REDUCTION_\${stage}\`);`, r: `` },
  { p: "CALLER_REVIEWERS", find: `if (manifest.reviewers !== undefined) findings.push("CALLER_DEFINED_REVIEWERS_REJECTED");`, r: `` },
  { p: "REGISTRY_REPLACE", find: `if (manifest.reviewerRegistry !== undefined) findings.push("REVIEWER_REGISTRY_REPLACEMENT");`, r: `` },
  { p: "REGISTRY_LOAD", find: `  if (candidateSupplied !== undefined) {
    return { verdict: "REVIEWER_REGISTRY_REPLACEMENT", registry: null };
  }`, r: `` },
  { p: "DENOMINATOR", find: `  if (manifest.requirementDenominator !== CANONICAL_AUTHORITY_ANCHORS.requirementDenominator) {
    findings.push("DENOMINATOR_SUBSTITUTION");
  }`, r: `` },
  { p: "ONE_ROLE", find: `if (stages.length === 1) findings.push("SELF_CONSISTENT_ONE_ROLE_MANIFEST");`, r: `` },
  { p: "REVIEWER_FIELDS", find: `    if (typeof claim[field] !== "string" || claim[field].length === 0) findings.push(\`REVIEWER_FIELD_MISSING_\${field}\`);`, r: `` },
  { p: "UNKNOWN_REVIEWER", find: `if (!canonical) findings.push("UNKNOWN_REVIEWER");`, r: `` },
  { p: "STALE_CONTRACT", find: `if (claim.POLICY_VERSION !== CANONICAL_REVIEWER_REGISTRY.policyVersion) findings.push("STALE_REVIEWER_CONTRACT");`, r: `` },
  { p: "WRONG_DOMAIN", find: `if (claim.DOMAIN !== canonical.DOMAIN) findings.push("WRONG_DOMAIN_REVIEWER");`, r: `` },
  { p: "ORIGIN_MISMATCH", find: `if (claim.EXECUTION_ORIGIN !== canonical.EXECUTION_ORIGIN) findings.push("EXECUTION_ORIGIN_MISMATCH");`, r: `` },
  { p: "CALLER_INDEPENDENCE", find: `if (claim.INDEPENDENCE_CLASS !== canonical.INDEPENDENCE_CLASS) findings.push("CALLER_DECLARED_INDEPENDENCE_REJECTED");`, r: `` },
  { p: "SUBJECT_DIGEST", find: `if (!HEX64.test(claim.SUBJECT_IDENTITY)) findings.push("SUBJECT_IDENTITY_NOT_DIGEST_BOUND");`, r: `` },
  { p: "SINGLE_REVIEWER", find: `  if (seen.size === CANONICAL_REVIEW_STAGES.length && distinct.size === 1) {
    findings.push("SINGLE_REVIEWER_ALL_STAGES");
  }`, r: `` },
  { p: "POLICY_LEDGER", find: `if (claimed.frozenLedgerSha256 !== anchors.frozenLedgerSha256) findings.push("POLICY_ROOT_SUBSTITUTION_LEDGER");`, r: `` },
  { p: "POLICY_FREEZE", find: `if (claimed.founderFreezeSha256 !== anchors.founderFreezeSha256) findings.push("POLICY_ROOT_SUBSTITUTION_FREEZE");`, r: `` },
  { p: "POLICY_RELEASE", find: `if (claimed.releaseAuthoritySha256 !== anchors.releaseAuthoritySha256) findings.push("POLICY_ROOT_SUBSTITUTION_RELEASE");`, r: `` },
  { p: "POLICY_DENOM", find: `if (claimed.requirementDenominator !== anchors.requirementDenominator) findings.push("POLICY_ROOT_SUBSTITUTION_DENOMINATOR");`, r: `` },
  { p: "SURFACE_WORKFLOW", find: `  ".github/workflows/p1a-authority-enforcement.yml",
  ".github/workflows/p1a-certify.yml",`, r: `  ".github/workflows/p1a-certify.yml",` },
  { p: "SURFACE_MUTATION", find: `  "scripts/test-p1a-authority-root-mutation.mjs",
  "scripts/test-p1a-authority-root.mjs",`, r: `  "scripts/test-p1a-authority-root.mjs",` },
  { p: "SURFACE_UNCOVERED", find: `    if (resolution.owners.length === 0) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);`, r: `    if (false) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);` },
  { p: "SURFACE_WRONG_OWNER", find: `    else if (!resolution.owners.includes(\`@\${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}\`)) findings.push(\`TRUSTED_FILE_WRONG_OWNER_\${file}\`);`, r: `` },
  { p: "CODEOWNERS_LASTMATCH", find: `    if (codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;`, r: `    if (!winner && codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;` },
  { p: "CODEOWNERS_STAR", find: `    if (ch === "*") out += "[^/]*";`, r: `    if (ch === "*") out += ".*";` },
  { p: "CODEOWNERS_UNSUPPORTED", find: `      findings.push(\`CODEOWNERS_UNSUPPORTED_PATTERN_LINE_\${i + 1}\`);
      continue;`, r: `` },
  { p: "COORD_REWRITE_APPROVAL", find: `    const independent = approvers.filter((a) => owners.includes(a) && a !== author);`, r: `    const independent = approvers;` },
  { p: "COORD_REWRITE_BLOCK", find: `  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };`, r: `` },
  { p: "SELF_APPROVAL", find: `if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");`, r: `` },
  { p: "PARENT_GAP_DETECT", find: `    if (prior.owners === null || prior.owners.length === 0) findings.push(\`PARENT_CODEOWNERS_GAP_\${file}\`);`, r: `` },
  // EQUIVALENT MUTANT (declared, not silently dropped): removing PARENT_CODEOWNERS_GAP
  // from the blocking predicate does not change any reachable verdict, because every
  // ENFORCEMENT_TEST_SURFACE file is also a TRUSTED_SURFACE_FILE, so the same change
  // already blocks via PRIOR_OWNERSHIP_ABSENT_. The GAP finding is still emitted and
  // is proven killable by PARENT_GAP_DETECT. Kept for defense-in-depth if a future
  // enforcement file is added outside the trusted surface.
  { p: "PARENT_GAP_BLOCK", equivalent: true, find: `    || f.startsWith("PARENT_CODEOWNERS_GAP_")`, r: `` },
  // attestation core
  { p: "ATT_UNPROVISIONED", find: `  if (!anchor || anchor.publicKeyPem == null) return { verified: false, reason: "EXTERNAL_AUTHORITY_UNPROVISIONED" };`, r: `` },
  { p: "ATT_WRONG_SUBJECT", find: `  if (attestation.subjectBaseSha !== AUTHORIZED_REBUILD_BASE.sha) return { verified: false, reason: "ATTESTATION_WRONG_SUBJECT" };`, r: `` },
  { p: "ATT_WRONG_CLAIM", find: `  if (attestation.claimType !== expectedClaimType) return { verified: false, reason: "ATTESTATION_WRONG_CLAIM_TYPE" };`, r: `` },
  { p: "ATT_WRONG_SCOPE", find: `  if (expectedScope !== undefined && attestation.scope !== expectedScope) return { verified: false, reason: "ATTESTATION_WRONG_SCOPE" };`, r: `` },
  { p: "ATT_VERIFY_RESULT", find: `  return ok ? { verified: true, reason: null } : { verified: false, reason: "ATTESTATION_SIGNATURE_INVALID" };`, r: `  return { verified: true, reason: null };` },
  // H1
  { p: "EXEC_ATT_REQUIRED", find: `    const v = verifyExternalAttestation(attestation, "OBSERVED_EXECUTION", claim.subjectSha, trustAnchors);
    if (!v.verified) { findings.push(\`EXECUTION_ATTESTATION_UNVERIFIED_\${v.reason}\`); continue; }`, r: `` },
  { p: "EXEC_SUBJECT_UNBOUND", find: `  if (!HEX40.test(claim.subjectSha ?? "") && !HEX64.test(claim.subjectSha ?? "")) {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_SUBJECT_UNBOUND"] };
  }`, r: `` },
  // H2
  { p: "CUSTODY_ATT_REQUIRED", find: `      const v = verifyExternalAttestation(receipt, "GITHUB_CUSTODY_OBSERVATION", receipt.controlId, trustAnchors);
      if (!v.verified) { findings.push(\`CUSTODY_ATTESTATION_UNVERIFIED_\${receipt.controlId}_\${v.reason}\`); continue; }`, r: `` },
  { p: "CUSTODY_VERDICT", find: `    verdict: allVerified ? "CUSTODY_SIGNATURE_VERIFIED" : "NOT_PROVEN",`, r: `    verdict: "CUSTODY_SIGNATURE_VERIFIED",` },
  { p: "CEILING_AUTH", find: `    custodySignatureVerified: custodySignatureVerified === true,
    trustedCertificationAuthorized: false,`, r: `    custodySignatureVerified: custodySignatureVerified === true,
    trustedCertificationAuthorized: custodySignatureVerified === true,` },
  // H3
  { p: "GATE_ATT_REQUIRED", find: `      const v = verifyExternalAttestation(att, "HUMAN_GATE", gate, trustAnchors);
      if (!v.verified) { findings.push(\`GATE_UNVERIFIED_\${gate}_\${v.reason}\`); continue; }`, r: `      verified.add(gate);` },
  { p: "GATE_MISSING", find: `  for (const gate of NAMED_HUMAN_GATES) if (!verified.has(gate)) findings.push(\`GATE_MISSING_\${gate}\`);`, r: `` },
  // H4
  { p: "ROLLBACK_PLAN_VERDICT", find: `    : { verdict: "ROLLBACK_PLAN_VALIDATED", findings: [] };`, r: `    : { verdict: "ROLLBACK_AUTHORIZED", findings: [] };` },
  { p: "ROLLBACK_EXEC_REQUIRED", find: `  const v = verifyExternalAttestation(att, "ROLLBACK_EXECUTION", action.kind, trustAnchors);
  if (!v.verified) return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: [\`ROLLBACK_EXECUTION_UNVERIFIED_\${v.reason}\`] };`, r: `` },
  { p: "ROLLBACK_EVIDENCE_MISSING", find: `    return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: ["ROLLBACK_EXECUTION_EVIDENCE_MISSING"] };`, r: `    return { verdict: "ROLLBACK_AUTHORIZED", findings: [] };` },
  // H5
  { p: "ENFORCE_BATTERY", find: `  if (!text.includes("scripts/test-p1a-authority-root.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_BATTERY");`, r: `` },
  { p: "ENFORCE_MUTATION", find: `  if (!text.includes("scripts/test-p1a-authority-root-mutation.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_MUTATION");`, r: `` },
  { p: "ENFORCE_NOT_ASSERTED", find: `    : { verdict: "ENFORCEMENT_SURFACE_DEFINED", findings: [], requiredStatusCheckEnforced: "EXTERNAL_NOT_OBSERVED" };`, r: `    : { verdict: "ENFORCEMENT_SURFACE_DEFINED", findings: [], requiredStatusCheckEnforced: "ENFORCED" };` },
  // fs / boundary / supersession
  { p: "PATH_ESCAPE", find: `  if (typeof relPath !== "string" || isAbsolute(relPath) || relPath.split(/[\\\\/]/u).includes("..")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["PATH_ESCAPE_REJECTED"] };
  }`, r: `` },
  { p: "SYMLINK", find: `    if (st.isSymbolicLink()) return { verdict: "ARTIFACT_REJECTED", findings: ["SYMLINK_SUBSTITUTION_REJECTED"] };`, r: `` },
  { p: "DIGEST_BIND", find: `    if (sha256(bytes) !== expectedSha256) return { verdict: "ARTIFACT_REJECTED", findings: ["ARTIFACT_DIGEST_MISMATCH"] };`, r: `` },
  { p: "EXPECTED_DIGEST", find: `  if (!HEX64.test(expectedSha256 ?? "")) {
    return { verdict: "ARTIFACT_REJECTED", findings: ["EXPECTED_DIGEST_MISSING"] };
  }`, r: `` },
  { p: "SUPERSESSION_CHAIN", find: `if (prior && HEX64.test(next.supersedesSha256 ?? "") && next.supersedesSha256 !== prior.sha256) findings.push("SUPERSESSION_CHAIN_MISMATCH");`, r: `` },
  { p: "SUPERSESSION_PRESERVE", find: `if (!prior || prior.preserved !== true) findings.push("PREDECESSOR_NOT_PRESERVED");`, r: `` },
  { p: "SUPERSESSION_FOUNDER", find: `if (!HEX64.test(next.founderDecisionSha256 ?? "")) findings.push("SUPERSESSION_WITHOUT_FOUNDER_DECISION");`, r: `` },
  { p: "BOUNDARY", find: `  if (OUT_OF_BOUNDARY_CAPABILITIES.includes(capability)
    && Object.keys(REPOSITORY_AUTHORITY_ROLES).includes(repository)) {
    return { verdict: "BOUNDARY_VIOLATION", findings: [\`CAPABILITY_INSIDE_TRUST_BOUNDARY_\${capability}\`] };
  }`, r: `` },
  { p: "SPEC_RUNTIME", find: `  if (claim.assertedStatus === "OPERATIONAL_AGENT" && role !== "RUNTIME_AUTHORITY") {
    return { verdict: "CLAIM_REJECTED", findings: ["SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"] };
  }`, r: `` },
  { p: "HISTORY_REWRITE", find: `  if (action.kind === "HISTORY_REWRITE" || action.forcePush === true || action.deletesHistory === true) {
    findings.push("HISTORY_REWRITE_PROHIBITED");
  }`, r: `` },
];

const original = await importSource(SOURCE);
for (const [name, probe] of Object.entries(PROBES)) { probe(original); console.log(`PROBE-GREEN ${name}`); }
const registerSize = original.PROPERTY_REGISTER.length;

let killed = 0; const survivors = []; const equivalentSurvived = []; const equivalentDeclared = [];
for (const [index, mut] of MUTANTS.entries()) {
  assert.ok(SOURCE.includes(mut.find), `mutant[${index}] ${mut.p}: find-anchor missing`);
  const mutated = SOURCE.replace(mut.find, mut.r);
  assert.notEqual(mutated, SOURCE, `mutant[${index}] ${mut.p}: no-op`);
  if (mut.equivalent) equivalentDeclared.push(`${mut.p}[${index}]`);
  let mod;
  try { mod = await importSource(mutated); } catch { killed += 1; console.log(`KILLED(load) ${mut.p}[${index}]`); continue; }
  let died = false;
  for (const probe of Object.values(PROBES)) { try { probe(mod); } catch { died = true; break; } }
  if (died) { killed += 1; console.log(`KILLED ${mut.p}[${index}]`); }
  else if (mut.equivalent) { equivalentSurvived.push(`${mut.p}[${index}]`); console.log(`EQUIVALENT(survived-as-declared) ${mut.p}[${index}]`); }
  else { survivors.push(`${mut.p}[${index}]`); console.log(`SURVIVED ${mut.p}[${index}]`); }
}

// A declared-equivalent mutant that gets KILLED anyway means the equivalence claim
// was wrong — surface it as an error rather than hiding it.
const wronglyDeclaredEquivalent = equivalentDeclared.filter((e) => !equivalentSurvived.includes(e));
console.log(JSON.stringify({ suite: "p1-a-authority-root-mutation", propertyRegister: registerSize, mutantDenominator: MUTANTS.length, executed: MUTANTS.length, killed, survivors: survivors.length, survivorList: survivors, equivalentDeclared: equivalentDeclared.length, equivalentSurvived, wronglyDeclaredEquivalent, probes: Object.keys(PROBES).length }));
assert.equal(survivors.length, 0, `mutation survivors: ${survivors.join(", ")}`);
assert.equal(wronglyDeclaredEquivalent.length, 0, `mutants declared equivalent but killed: ${wronglyDeclaredEquivalent.join(", ")}`);
