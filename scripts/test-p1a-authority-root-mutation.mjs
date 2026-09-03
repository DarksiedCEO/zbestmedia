// P1A-01 mutation harness (V4). Two modules now: the production validator and
// the injectable attestation core. Production mutants load the mutated validator
// source (with its core import rewritten to an absolute URL to the REAL core)
// and run production probes. Core mutants load the mutated core directly and run
// core probes with an ephemeral key + temp ledger + injected clock. Survivors
// required: 0; equivalent mutants are declared and logged.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as edSign } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VALIDATE_PATH = fileURLToPath(new URL("./validate-p1a-authority-root.mjs", import.meta.url));
const CORE_PATH = fileURLToPath(new URL("./p1a-attestation-core.mjs", import.meta.url));
const CORE_ABS = new URL("./p1a-attestation-core.mjs", import.meta.url).href;
const SRC_VALIDATE = readFileSync(VALIDATE_PATH, "utf8");
const SRC_CORE = readFileSync(CORE_PATH, "utf8");
const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const D = (c) => c.repeat(64);
const HEXID = (c) => c.repeat(32);
const BASE = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";
const importSrc = async (s) => import(`data:text/javascript;base64,${Buffer.from(s).toString("base64")}`);
const importValidate = async (s) => importSrc(s.replace('"./p1a-attestation-core.mjs"', JSON.stringify(CORE_ABS)));

function makeKey() { const { publicKey, privateKey } = generateKeyPairSync("ed25519"); return { pem: publicKey.export({ type: "spki", format: "pem" }), privateKey }; }
function tempStore(c) { return c.makeFsReplayStore(mkdtempSync(join(tmpdir(), "ml-"))); }
const NOW = Date.parse("2026-08-26T12:00:00Z");
function makeAtt(c, priv, over = {}) {
  const att = { attestationId: HEXID("a"), claimType: "OBSERVED_EXECUTION", commit: BASE, expiresAt: "2026-08-26T12:05:00Z", issuedAt: "2026-08-26T12:00:00Z", keyId: "codex", producer: "CODEX", repository: c.CANONICAL_REPOSITORY, scope: BASE, ...over };
  const signable = {}; for (const f of c.SIGNED_FIELDS) signable[f] = att[f];
  att.signature = edSign(null, c.canonicalAttestationMessage(signable), priv).toString("base64");
  return att;
}
function anchor(pem, keyId = "codex") { return { status: "PROVISIONED", publicKeyPem: pem, keyId }; }
const expect = (c, claimType, scope) => ({ claimType, scope, subject: BASE });

// ---- CORE probes (core module `c`; BASE injected as BASE) --------------
const CORE_PROBES = {
  positive: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, true); },
  replay: (c) => { const { pem, privateKey } = makeKey(); const store = tempStore(c); const raw = JSON.stringify(makeAtt(c, privateKey)); assert.equal(c.verifyAttestationCore(raw, expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: store }).verified, true); assert.equal(c.verifyAttestationCore(raw, expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: store }).reason, "REPLAY_DETECTED"); },
  missing_store: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: null }).reason, "MISSING_REPLAY_STORE"); },
  repo: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { repository: "https://github.com/x/y.git" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, false); },
  subject: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { commit: D("9").slice(0, 40) })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, false); },
  claim: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "HUMAN_GATE", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, false); },
  scope: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "OBSERVED_EXECUTION", "other"), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, false); },
  unprovisioned: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "OBSERVED_EXECUTION", BASE), { status: "UNPROVISIONED", publicKeyPem: pem, keyId: "codex" }, { nowMs: NOW, replayStore: tempStore(c) }).reason, "EXTERNAL_AUTHORITY_UNPROVISIONED"); },
  null_anchor: (c) => { const { privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey)), expect(c, "OBSERVED_EXECUTION", BASE), null, { nowMs: NOW, replayStore: tempStore(c) }).verified, false); },
  keyid: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { keyId: "attacker" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem, "codex"), { nowMs: NOW, replayStore: tempStore(c) }).reason, "KEY_ID_NOT_TRUSTED"); },
  expired: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: HEXID("1"), issuedAt: "2026-08-26T11:00:00Z", expiresAt: "2026-08-26T11:05:00Z" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "ATTESTATION_EXPIRED"); },
  future: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: HEXID("2"), issuedAt: "2026-08-26T13:00:00Z", expiresAt: "2026-08-26T13:05:00Z" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "ATTESTATION_NOT_YET_VALID"); },
  window: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: HEXID("3"), issuedAt: "2026-08-26T00:00:00Z", expiresAt: "2026-08-27T00:00:00Z" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "VALIDITY_WINDOW_TOO_LARGE"); },
  bad_time: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: HEXID("4"), issuedAt: "nope" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "TIMESTAMP_INVALID"); },
  expiry_not_after: (c) => { const { pem, privateKey } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: HEXID("5"), issuedAt: "2026-08-26T12:00:00Z", expiresAt: "2026-08-26T12:00:00Z" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "EXPIRY_NOT_AFTER_ISSUED"); },
  field_set: (c) => { const { pem, privateKey } = makeKey(); const att = makeAtt(c, privateKey); assert.equal(c.verifyAttestationCore(JSON.stringify({ ...att, extra: 1 }), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "ATTESTATION_FIELD_SET_INVALID"); },
  doc_canonical: (c) => {
    const { pem, privateKey } = makeKey(); const att = makeAtt(c, privateKey);
    const canon = JSON.stringify(att);
    const chk = (raw) => c.verifyAttestationCore(raw, expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) });
    assert.equal(chk(canon).verified, true);
    // literal duplicate key
    assert.equal(chk(`${canon.slice(0, -1)},"scope":"${BASE}"}`).reason, "DOCUMENT_NOT_CANONICAL");
    // escaped duplicate key
    assert.equal(chk(`${canon.slice(0, -1)},"\\u0073cope":"${BASE}"}`).reason, "DOCUMENT_NOT_CANONICAL");
    // reordered fields
    const reordered = JSON.stringify({ signature: att.signature, scope: att.scope, repository: att.repository, producer: att.producer, keyId: att.keyId, issuedAt: att.issuedAt, expiresAt: att.expiresAt, commit: att.commit, claimType: att.claimType, attestationId: att.attestationId });
    assert.equal(chk(reordered).reason, "DOCUMENT_NOT_CANONICAL");
    // insignificant whitespace
    assert.equal(chk(canon.replace(/,/gu, ", ")).reason, "DOCUMENT_NOT_CANONICAL");
  },
  sig_canonical: (c) => { const { pem, privateKey } = makeKey(); const att = makeAtt(c, privateKey); assert.equal(c.verifyAttestationCore(JSON.stringify({ ...att, signature: `${att.signature.slice(0, 8)}\n${att.signature.slice(8)}` }), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "SIGNATURE_ENCODING_NON_CANONICAL"); assert.equal(c.verifyAttestationCore(JSON.stringify({ ...att, signature: `${att.signature}xx` }), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "SIGNATURE_ENCODING_NON_CANONICAL"); },
  sig_noncanonical_padding: (c) => {
    // The final base64 data char of a canonical 64-byte signature carries 4
    // padding bits that MUST be zero. Setting bit0 yields a string that decodes
    // to the identical 64 signature bytes (signature still valid) but is NOT the
    // canonical encoding — only the encode-back equality check rejects it.
    const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const { pem, privateKey } = makeKey(); const att = makeAtt(c, privateKey);
    const last = att.signature[85];
    const nonCanon = ALPHA[ALPHA.indexOf(last) | 1];
    const alt = att.signature.slice(0, 85) + nonCanon + att.signature.slice(86);
    assert.notEqual(alt, att.signature);
    // Sanity: decodes to the same bytes (so signature would otherwise verify).
    assert.equal(Buffer.from(alt, "base64").toString("hex"), Buffer.from(att.signature, "base64").toString("hex"));
    const out = c.verifyAttestationCore(JSON.stringify({ ...att, signature: alt }), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) });
    assert.equal(out.reason, "SIGNATURE_ENCODING_NON_CANONICAL");
  },
  sig_forged: (c) => { const { pem } = makeKey(); const { privateKey: other } = makeKey(); assert.equal(c.verifyAttestationCore(JSON.stringify(makeAtt(c, other)), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).reason, "SIGNATURE_INVALID"); },
  producer_unknown: (c) => { const { pem, privateKey } = makeKey(); assert.notEqual(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { producer: "ATTACKER" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, true); },
  id_invalid: (c) => { const { pem, privateKey } = makeKey(); assert.notEqual(c.verifyAttestationCore(JSON.stringify(makeAtt(c, privateKey, { attestationId: "short" })), expect(c, "OBSERVED_EXECUTION", BASE), anchor(pem), { nowMs: NOW, replayStore: tempStore(c) }).verified, true); },
};

// ---- PRODUCTION probes (validator module `m`, real core, sealed unprovisioned) ---
function goodObserved(m) { return { remote: m.AUTHORIZED_REBUILD_BASE.repositoryRemote, sha: m.AUTHORIZED_REBUILD_BASE.sha, objectType: "commit", tree: m.AUTHORIZED_REBUILD_BASE.tree, parents: [...m.AUTHORIZED_REBUILD_BASE.parents], dirty: false }; }
function goodReviewer(m, id = "CODEX") { const x = m.CANONICAL_REVIEWER_REGISTRY.reviewers.find((r) => r.REVIEWER_ID === id); return { REVIEWER_ID: id, DOMAIN: x.DOMAIN, EXECUTION_ORIGIN: x.EXECUTION_ORIGIN, REVIEW_CONTEXT_ID: "c", INDEPENDENCE_CLASS: x.INDEPENDENCE_CLASS, POLICY_VERSION: m.POLICY_VERSION, SUBJECT_IDENTITY: D("a") }; }
function goodPolicyRoot(m) { return { frozenLedgerSha256: m.CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256, founderFreezeSha256: m.CANONICAL_AUTHORITY_ANCHORS.founderFreezeSha256, releaseAuthoritySha256: m.CANONICAL_AUTHORITY_ANCHORS.releaseAuthoritySha256, requirementDenominator: 124 }; }
// A well-formed signed attestation file (valid for an ephemeral key) that must
// STILL fail closed in production because sealed anchors are UNPROVISIONED.
function writeSignedExec(m, dir, claimType = "OBSERVED_EXECUTION", scope = m.AUTHORIZED_REBUILD_BASE.sha) {
  const { privateKey } = makeKey();
  const B = m.AUTHORIZED_REBUILD_BASE.sha;
  const att = { attestationId: HEXID("a"), claimType, commit: B, expiresAt: "2026-08-26T12:05:00Z", issuedAt: "2026-08-26T12:00:00Z", keyId: "codex", producer: "CODEX", repository: "https://github.com/DarksiedCEO/zbestmedia.git", scope };
  const signable = {}; for (const f of ["attestationId", "claimType", "commit", "expiresAt", "issuedAt", "keyId", "producer", "repository", "scope"]) signable[f] = att[f];
  att.signature = edSign(null, Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(signable).sort().map((k) => [k, signable[k]]))), "utf8"), privateKey).toString("base64");
  const body = JSON.stringify(att); writeFileSync(join(dir, "e.json"), body);
  return { path: "e.json", sha256: sha256(body), producer: "CODEX", subjectSha: B };
}
const PROD_PROBES = {
  base_sha: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), sha: "1".repeat(40) }).verdict, "BASE_REJECTED"),
  base_tree: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), tree: "2".repeat(40) }).verdict, "BASE_REJECTED"),
  base_parents: (m) => { assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [] }).verdict, "BASE_REJECTED"); assert.equal(m.verifyRebuildBase({ ...goodObserved(m), parents: [...m.AUTHORIZED_REBUILD_BASE.parents].reverse() }).verdict, "BASE_REJECTED"); },
  base_dirty: (m) => assert.equal(m.verifyRebuildBase({ ...goodObserved(m), dirty: true }).verdict, "BASE_REJECTED"),
  base_good: (m) => assert.equal(m.verifyRebuildBase(goodObserved(m)).verdict, "BASE_VERIFIED"),
  prohibited: (m) => { for (const bc of m.PROHIBITED_BASE_CLASSES) assert.equal(m.rejectProhibitedBase({ ref: "main", sha: "3".repeat(40), baseClass: bc }).verdict, "BASE_REJECTED"); },
  manifest_reduction: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: ["OMEGA", "META"], requirementDenominator: 124 }).verdict, "MANIFEST_REJECTED"),
  caller_reviewers: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewers: [] }).verdict, "MANIFEST_REJECTED"),
  registry_replace: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 124, reviewerRegistry: {} }).verdict, "MANIFEST_REJECTED"),
  denominator: (m) => assert.equal(m.validateAuthorityManifest({ reviewStages: [...m.CANONICAL_REVIEW_STAGES], requirementDenominator: 20 }).verdict, "MANIFEST_REJECTED"),
  one_role: (m) => assert.ok(m.validateAuthorityManifest({ reviewStages: ["OMEGA"], requirementDenominator: 124 }).findings.includes("SELF_CONSISTENT_ONE_ROLE_MANIFEST")),
  registry_load: (m) => { assert.equal(m.loadReviewerRegistry({}).verdict, "REVIEWER_REGISTRY_REPLACEMENT"); assert.equal(m.loadReviewerRegistry(undefined).verdict, "CANONICAL"); },
  reviewer_fields: (m) => { for (const f of ["REVIEWER_ID", "DOMAIN", "EXECUTION_ORIGIN", "REVIEW_CONTEXT_ID", "INDEPENDENCE_CLASS", "POLICY_VERSION", "SUBJECT_IDENTITY"]) { const c = goodReviewer(m); delete c[f]; assert.equal(m.validateReviewClaim(c).verdict, "REVIEW_REJECTED", f); } },
  unknown_reviewer: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), REVIEWER_ID: "F" }).verdict, "REVIEW_REJECTED"),
  wrong_domain: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), DOMAIN: "FINAL_CERTIFICATION" }).verdict, "REVIEW_REJECTED"),
  stale: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), POLICY_VERSION: "V0" }).verdict, "REVIEW_REJECTED"),
  independence: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CLAUDE_CODE"), INDEPENDENCE_CLASS: "JUDGE" }).verdict, "REVIEW_REJECTED"),
  subj_digest: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m), SUBJECT_IDENTITY: "zz" }).verdict, "REVIEW_REJECTED"),
  origin: (m) => assert.equal(m.validateReviewClaim({ ...goodReviewer(m, "CODEX"), EXECUTION_ORIGIN: "CLAUDE_CODE_SESSION" }).verdict, "REVIEW_REJECTED"),
  single_reviewer: (m) => { const c = goodReviewer(m, "AEGIS_OMEGA"); assert.equal(m.validateStageAssignments(Object.fromEntries(m.CANONICAL_REVIEW_STAGES.map((s) => [s, { ...c }]))).verdict, "STAGES_REJECTED"); },
  policy: (m) => { for (const f of ["frozenLedgerSha256", "founderFreezeSha256", "releaseAuthoritySha256", "requirementDenominator"]) { const c = goodPolicyRoot(m); c[f] = f === "requirementDenominator" ? 1 : D("9"); assert.equal(m.verifyPolicyRoot(c).verdict, "POLICY_ROOT_REJECTED", f); } assert.equal(m.verifyPolicyRoot(goodPolicyRoot(m)).verdict, "POLICY_ROOT_VERIFIED"); },
  surface_denom: (m) => { assert.equal(m.TRUSTED_SURFACE_FILES.length, 16); assert.equal(m.TRUSTED_SURFACE_DENOMINATOR, 16); assert.equal(m.FROZEN_BASE_TRUSTED_SURFACE_DENOMINATOR, 11); assert.ok(m.TRUSTED_SURFACE_FILES.includes(m.AUTHORITY_ENFORCEMENT_WORKFLOW)); },
  surface_uncovered: (m) => { const out = m.verifyTrustedSurfaceCoverage("/.github/CODEOWNERS @DarksiedCEO\n"); assert.equal(out.verdict, "SURFACE_OPEN"); assert.ok(out.findings.includes("TRUSTED_FILE_UNCOVERED_scripts/validate-p1a-threat-model.mjs")); },
  surface_wrong_owner: (m) => assert.equal(m.verifyTrustedSurfaceCoverage(m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @a`).join("\n")).verdict, "SURFACE_OPEN"),
  surface_closed: (m) => assert.equal(m.verifyTrustedSurfaceCoverage(m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n")).verdict, "SURFACE_CLOSED"),
  co_last_match: (m) => { assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt @y\n", "a.txt").owners, ["@y"]); assert.deepEqual(m.codeownersOwnersFor("/a.txt @x\n/a.txt\n", "a.txt").owners, []); },
  co_glob: (m) => { assert.deepEqual(m.codeownersOwnersFor("/s/*.mjs @x\n", "s/f.mjs").owners, ["@x"]); assert.deepEqual(m.codeownersOwnersFor("/s/*.mjs @x\n", "s/sub/f.mjs").owners, []); },
  co_unsupported: (m) => assert.equal(m.codeownersOwnersFor("!x @a\n", "x").owners, null),
  coordinated: (m) => { const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n"); const out = m.assessTrustedSurfaceChange({ files: [...m.TRUSTED_SURFACE_FILES], author: "a", approvals: ["a"], priorCodeowners: prior }); assert.equal(out.verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); assert.ok(out.findings.includes("SELF_APPROVAL_REJECTED")); },
  non_owner: (m) => { const prior = m.TRUSTED_SURFACE_FILES.map((f) => `/${f} @DarksiedCEO`).join("\n"); assert.equal(m.assessTrustedSurfaceChange({ files: [".github/CODEOWNERS"], author: "a", approvals: ["b"], priorCodeowners: prior }).verdict, "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK"); },
  parent_gap_detect: (m) => { const prior = m.TRUSTED_SURFACE_FILES.filter((f) => f !== "scripts/test-p1a-authority-root-mutation.mjs").map((f) => `/${f} @DarksiedCEO`).join("\n"); assert.ok(m.assessTrustedSurfaceChange({ files: ["scripts/test-p1a-authority-root-mutation.mjs"], author: "x", approvals: ["DarksiedCEO"], priorCodeowners: prior }).findings.includes("PARENT_CODEOWNERS_GAP_scripts/test-p1a-authority-root-mutation.mjs")); },
  exec_fail_closed: (m) => { const dir = mkdtempSync(join(tmpdir(), "pe-")); try { const art = writeSignedExec(m, dir, "OBSERVED_EXECUTION", m.AUTHORIZED_REBUILD_BASE.sha); const out = m.classifyExecutionEvidence(dir, { subjectSha: m.AUTHORIZED_REBUILD_BASE.sha, artifacts: [art] }); assert.equal(out.verdict, "EXECUTION_UNPROVEN"); assert.ok(out.findings.some((f) => f.includes("EXTERNAL_AUTHORITY_UNPROVISIONED"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  custody_fail_closed: (m) => { const dir = mkdtempSync(join(tmpdir(), "cf-")); try { const cid = m.CUSTODY_CONTROLS[0].id; const art = writeSignedExec(m, dir, "GITHUB_CUSTODY_OBSERVATION", cid); const out = m.assessExternalCustody(dir, [{ controlId: cid, path: art.path, sha256: art.sha256 }]); assert.equal(out.verdict, "NOT_PROVEN"); assert.ok(out.findings.some((f) => f.includes("EXTERNAL_AUTHORITY_UNPROVISIONED"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  gates_fail_closed: (m) => { const dir = mkdtempSync(join(tmpdir(), "gf-")); try { const g = m.NAMED_HUMAN_GATES[0]; const art = writeSignedExec(m, dir, "HUMAN_GATE", g); const out = m.assessGateCompleteness(dir, { [g]: { path: art.path, sha256: art.sha256 } }); assert.equal(out.verdict, "GATES_INCOMPLETE"); assert.ok(out.findings.some((f) => f.includes("EXTERNAL_AUTHORITY_UNPROVISIONED"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  rollback_fail_closed: (m) => { const dir = mkdtempSync(join(tmpdir(), "rf-")); try { const art = writeSignedExec(m, dir, "ROLLBACK_EXECUTION", "DISABLE_DISPATCH"); const out = m.authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, { path: art.path, sha256: art.sha256 }); assert.equal(out.verdict, "ROLLBACK_EXECUTION_UNPROVEN"); assert.ok(out.findings.some((f) => f.includes("EXTERNAL_AUTHORITY_UNPROVISIONED"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  exec_subject_unbound: (m) => { const dir = mkdtempSync(join(tmpdir(), "eu-")); try { assert.ok(m.classifyExecutionEvidence(dir, { artifacts: [{ path: "x", sha256: D("a"), producer: "CODEX" }] }).findings.includes("EXECUTION_SUBJECT_UNBOUND")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  custody_default: (m) => { const dir = mkdtempSync(join(tmpdir(), "cd-")); try { assert.equal(m.assessExternalCustody(dir, []).verdict, "NOT_PROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  custody_ref_check: (m) => { const dir = mkdtempSync(join(tmpdir(), "cr-")); try { const out = m.assessExternalCustody(dir, [{ controlId: "NOPE", path: "x.json", sha256: D("a") }]); assert.equal(out.verdict, "NOT_PROVEN"); assert.ok(out.findings.includes("CUSTODY_RECEIPT_UNKNOWN_CONTROL")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  ceiling: (m) => { assert.equal(m.computeClaimCeiling({ verdict: "CUSTODY_SIGNATURE_VERIFIED", trustedCertificationAuthorized: true }, true).trustedCertificationAuthorized, false); assert.equal(m.LOCAL_CUSTODY_AUTHORIZATION_CEILING.trustedCertificationAuthorized, false); },
  gates_absent: (m) => { const dir = mkdtempSync(join(tmpdir(), "ga-")); try { const out = m.assessGateCompleteness(dir, {}); assert.equal(out.verdict, "GATES_INCOMPLETE"); assert.ok(out.findings.some((f) => f.startsWith("GATE_MISSING_"))); } finally { rmSync(dir, { recursive: true, force: true }); } },
  rollback_plan: (m) => assert.equal(m.assessRollbackAction({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }).verdict, "ROLLBACK_PLAN_VALIDATED"),
  rollback_unexecuted: (m) => { const dir = mkdtempSync(join(tmpdir(), "ru-")); try { assert.equal(m.authorizeRollback({ kind: "DISABLE_DISPATCH", mechanism: "REMOVE_ENVIRONMENT_APPROVAL" }, dir, null).verdict, "ROLLBACK_EXECUTION_UNPROVEN"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  rollback_history: (m) => assert.ok(m.assessRollbackAction({ kind: "HISTORY_REWRITE" }).findings.includes("HISTORY_REWRITE_PROHIBITED")),
  enforce_full: (m) => { const dir = mkdtempSync(join(tmpdir(), "wf-")); try { mkdirSync(join(dir, ".github", "workflows"), { recursive: true }); const wf = "steps:\n- run: node scripts/validate-p1a-authority-root.mjs\n- run: node scripts/test-p1a-authority-root.mjs\n- run: node scripts/test-p1a-authority-root-mutation.mjs\n"; writeFileSync(join(dir, m.AUTHORITY_ENFORCEMENT_WORKFLOW), wf); const out = m.verifyEnforcementSurface(dir, sha256(wf)); assert.equal(out.verdict, "ENFORCEMENT_SURFACE_DEFINED"); assert.equal(out.requiredStatusCheckEnforced, "EXTERNAL_NOT_OBSERVED"); } finally { rmSync(dir, { recursive: true, force: true }); } },
  enforce_partial: (m) => { const dir = mkdtempSync(join(tmpdir(), "wp-")); try { mkdirSync(join(dir, ".github", "workflows"), { recursive: true }); const wf = "steps:\n- run: node scripts/validate-p1a-authority-root.mjs\n"; writeFileSync(join(dir, m.AUTHORITY_ENFORCEMENT_WORKFLOW), wf); const out = m.verifyEnforcementSurface(dir, sha256(wf)); assert.equal(out.verdict, "ENFORCEMENT_SURFACE_INCOMPLETE"); assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_BATTERY")); assert.ok(out.findings.includes("WORKFLOW_DOES_NOT_INVOKE_MUTATION")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  boundary: (m) => { for (const cap of m.OUT_OF_BOUNDARY_CAPABILITIES) assert.equal(m.assertCapabilityPlacement(cap, "DarksiedCEO/zbestmedia").verdict, "BOUNDARY_VIOLATION"); },
  spec: (m) => assert.equal(m.assertAuthoritySeparation({ repository: "DarksiedCEO/zbestmedia", assertedStatus: "OPERATIONAL_AGENT" }).verdict, "CLAIM_REJECTED"),
  path_escape: (m) => { const dir = mkdtempSync(join(tmpdir(), "px-")); try { writeFileSync(join(dir, "secret"), "s"); mkdirSync(join(dir, "root")); mkdirSync(join(dir, "root", "sub")); writeFileSync(join(dir, "root", "a.json"), "in"); assert.equal(m.readAuthorityArtifact(join(dir, "root"), "../secret", sha256("s")).verdict, "ARTIFACT_REJECTED"); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "sub/../a.json", sha256("in")).findings.includes("PATH_ESCAPE_REJECTED")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  symlink: (m) => { const dir = mkdtempSync(join(tmpdir(), "sl-")); try { mkdirSync(join(dir, "root")); writeFileSync(join(dir, "out"), "x"); symlinkSync(join(dir, "out"), join(dir, "root", "al")); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "al", sha256("x")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED")); mkdirSync(join(dir, "od")); writeFileSync(join(dir, "od", "a.json"), "y"); symlinkSync(join(dir, "od"), join(dir, "root", "dl")); assert.ok(m.readAuthorityArtifact(join(dir, "root"), "dl/a.json", sha256("y")).findings.includes("SYMLINK_SUBSTITUTION_REJECTED")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  digest: (m) => { const dir = mkdtempSync(join(tmpdir(), "dg-")); try { writeFileSync(join(dir, "a.json"), "real"); assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("expected")).verdict, "ARTIFACT_REJECTED"); assert.equal(m.readAuthorityArtifact(dir, "a.json", sha256("real")).verdict, "ARTIFACT_VERIFIED"); assert.ok(m.readAuthorityArtifact(dir, "a.json", "nothex").findings.includes("EXPECTED_DIGEST_MISSING")); } finally { rmSync(dir, { recursive: true, force: true }); } },
  supersession: (m) => { assert.ok(m.acceptSupersession({ supersedesSha256: D("a"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_CHAIN_MISMATCH")); assert.ok(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: false }).findings.includes("PREDECESSOR_NOT_PRESERVED")); assert.ok(m.acceptSupersession({ supersedesSha256: D("c") }, { sha256: D("c"), preserved: true }).findings.includes("SUPERSESSION_WITHOUT_FOUNDER_DECISION")); assert.equal(m.acceptSupersession({ supersedesSha256: D("c"), founderDecisionSha256: D("b") }, { sha256: D("c"), preserved: true }).verdict, "SUPERSESSION_ACCEPTED"); },
};

const CORE_MUTANTS = [
  { p: "FIELD_SET", find: `  if (keys.length !== ATTESTATION_FIELDS.length || !ATTESTATION_FIELDS.every((f) => Object.prototype.hasOwnProperty.call(att, f))) {\n    return { verified: false, reason: "ATTESTATION_FIELD_SET_INVALID" };\n  }`, r: `` },
  { p: "DOCUMENT_CANONICAL", find: `  if (rawText !== canonicalEnvelopeText(att)) return { verified: false, reason: "DOCUMENT_NOT_CANONICAL" };`, r: `` },
  { p: "ID_INVALID", find: `  if (!HEX_ID.test(att.attestationId ?? "")) return { verified: false, reason: "ATTESTATION_ID_INVALID" };`, r: `` },
  { p: "PRODUCER", find: `  if (!CANONICAL_PRODUCERS.includes(att.producer)) return { verified: false, reason: "PRODUCER_UNKNOWN" };`, r: `` },
  { p: "REPO", find: `  if (att.repository !== CANONICAL_REPOSITORY) return { verified: false, reason: "REPOSITORY_BINDING_INVALID" };`, r: `` },
  { p: "SIG_CANONICAL", find: `  if (!isCanonicalEd25519Signature(att.signature)) return { verified: false, reason: "SIGNATURE_ENCODING_NON_CANONICAL" };`, r: `` },
  { p: "SIG_CANONICAL_ENCODEBACK", find: `  return buf.length === 64 && buf.toString("base64") === sig;`, r: `  return buf.length === 64;` },
  // EQUIVALENT (declared): the regex is subsumed by the encode-back equality
  // check. Node's Buffer.toString("base64") emits only canonical base64, so any
  // string equal to its own re-encoding necessarily matches the alphabet+length
  // the regex enforces. Removing the regex while keeping encode-back+length
  // changes no reachable acceptance. Kept as an early/defensive structural gate.
  { p: "SIG_CANONICAL_REGEX", equivalent: true, find: `  if (typeof sig !== "string" || !CANONICAL_B64_64.test(sig)) return false;`, r: `  if (typeof sig !== "string") return false;` },
  { p: "CLAIM_TYPE", find: `  if (att.claimType !== expected?.claimType) return { verified: false, reason: "CLAIM_TYPE_MISMATCH" };`, r: `` },
  { p: "SCOPE", find: `  if (att.scope !== expected?.scope) return { verified: false, reason: "SCOPE_MISMATCH" };`, r: `` },
  { p: "SUBJECT", find: `  if (att.commit !== expected?.subject) return { verified: false, reason: "SUBJECT_MISMATCH" };`, r: `` },
  { p: "ANCHOR_STATUS", find: `  if (!anchor || anchor.status !== "PROVISIONED" || anchor.publicKeyPem == null) return { verified: false, reason: "EXTERNAL_AUTHORITY_UNPROVISIONED" };`, r: `  if (!anchor || anchor.publicKeyPem == null) return { verified: false, reason: "EXTERNAL_AUTHORITY_UNPROVISIONED" };` },
  { p: "KEYID", find: `  if (anchor.keyId !== att.keyId) return { verified: false, reason: "KEY_ID_NOT_TRUSTED" };`, r: `` },
  { p: "NOT_BEFORE", find: `  if (nowMs < issued - skew) return { verified: false, reason: "ATTESTATION_NOT_YET_VALID" };`, r: `` },
  { p: "NOT_AFTER", find: `  if (nowMs > expires + skew) return { verified: false, reason: "ATTESTATION_EXPIRED" };`, r: `` },
  { p: "WINDOW", find: `  if (expires - issued > maxWindow) return { verified: false, reason: "VALIDITY_WINDOW_TOO_LARGE" };`, r: `` },
  { p: "EXPIRY_ORDER", find: `  if (expires <= issued) return { verified: false, reason: "EXPIRY_NOT_AFTER_ISSUED" };`, r: `` },
  { p: "TIME_PARSE", find: `  if (Number.isNaN(issued) || Number.isNaN(expires)) return { verified: false, reason: "TIMESTAMP_INVALID" };`, r: `` },
  { p: "SIG_VERIFY", find: `  if (!ok) return { verified: false, reason: "SIGNATURE_INVALID" };`, r: `` },
  { p: "STORE_PRESENT", find: `  if (!store || typeof store.consume !== "function") return { verified: false, reason: "MISSING_REPLAY_STORE" };`, r: `` },
  { p: "CONSUME_CHECK", find: `  if (!consumed.ok) return { verified: false, reason: consumed.reason };`, r: `` },
  { p: "REPLAY_ATOMIC", find: `constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY`, r: `constants.O_CREAT | constants.O_WRONLY` },
];

const VALIDATE_MUTANTS = [
  { p: "BASE_SHA", find: `if (observed.sha !== AUTHORIZED_REBUILD_BASE.sha) findings.push("WRONG_BASE_SHA");`, r: `` },
  { p: "BASE_TREE", find: `if (observed.tree !== AUTHORIZED_REBUILD_BASE.tree) findings.push("WRONG_BASE_TREE");`, r: `` },
  { p: "BASE_PARENTS", find: `|| AUTHORIZED_REBUILD_BASE.parents.some((p, i) => parents[i] !== p)) findings.push("WRONG_BASE_PARENTS");`, r: `|| false) findings.push("WRONG_BASE_PARENTS");` },
  { p: "BASE_DIRTY", find: `if (observed.dirty === true) findings.push("PROHIBITED_BASE_DIRTY_LOCAL_HEAD");`, r: `` },
  { p: "PROHIBITED", find: `return { verdict: "BASE_REJECTED", findings: [\`PROHIBITED_BASE_\${cls}\`] };`, r: `return { verdict: "BASE_ACCEPTED", findings: [] };` },
  { p: "MANIFEST_REDUCTION", find: `if (!stages.includes(stage)) findings.push(\`MANIFEST_ROLE_REDUCTION_\${stage}\`);`, r: `` },
  { p: "CALLER_REVIEWERS", find: `if (manifest.reviewers !== undefined) findings.push("CALLER_DEFINED_REVIEWERS_REJECTED");`, r: `` },
  { p: "REGISTRY_REPLACE", find: `if (manifest.reviewerRegistry !== undefined) findings.push("REVIEWER_REGISTRY_REPLACEMENT");`, r: `` },
  { p: "REGISTRY_LOAD", find: `  if (candidateSupplied !== undefined) {\n    return { verdict: "REVIEWER_REGISTRY_REPLACEMENT", registry: null };\n  }`, r: `` },
  { p: "DENOMINATOR", find: `  if (manifest.requirementDenominator !== CANONICAL_AUTHORITY_ANCHORS.requirementDenominator) {\n    findings.push("DENOMINATOR_SUBSTITUTION");\n  }`, r: `` },
  { p: "ONE_ROLE", find: `if (stages.length === 1) findings.push("SELF_CONSISTENT_ONE_ROLE_MANIFEST");`, r: `` },
  { p: "REVIEWER_FIELDS", find: `    if (typeof claim[field] !== "string" || claim[field].length === 0) findings.push(\`REVIEWER_FIELD_MISSING_\${field}\`);`, r: `` },
  { p: "UNKNOWN_REVIEWER", find: `if (!canonical) findings.push("UNKNOWN_REVIEWER");`, r: `` },
  { p: "STALE", find: `if (claim.POLICY_VERSION !== CANONICAL_REVIEWER_REGISTRY.policyVersion) findings.push("STALE_REVIEWER_CONTRACT");`, r: `` },
  { p: "WRONG_DOMAIN", find: `if (claim.DOMAIN !== canonical.DOMAIN) findings.push("WRONG_DOMAIN_REVIEWER");`, r: `` },
  { p: "ORIGIN", find: `if (claim.EXECUTION_ORIGIN !== canonical.EXECUTION_ORIGIN) findings.push("EXECUTION_ORIGIN_MISMATCH");`, r: `` },
  { p: "INDEPENDENCE", find: `if (claim.INDEPENDENCE_CLASS !== canonical.INDEPENDENCE_CLASS) findings.push("CALLER_DECLARED_INDEPENDENCE_REJECTED");`, r: `` },
  { p: "SUBJ_DIGEST", find: `if (!HEX64.test(claim.SUBJECT_IDENTITY)) findings.push("SUBJECT_IDENTITY_NOT_DIGEST_BOUND");`, r: `` },
  { p: "SINGLE_REVIEWER", find: `  if (seen.size === CANONICAL_REVIEW_STAGES.length && distinct.size === 1) {\n    findings.push("SINGLE_REVIEWER_ALL_STAGES");\n  }`, r: `` },
  { p: "POLICY_LEDGER", find: `if (claimed.frozenLedgerSha256 !== anchors.frozenLedgerSha256) findings.push("POLICY_ROOT_SUBSTITUTION_LEDGER");`, r: `` },
  { p: "POLICY_FREEZE", find: `if (claimed.founderFreezeSha256 !== anchors.founderFreezeSha256) findings.push("POLICY_ROOT_SUBSTITUTION_FREEZE");`, r: `` },
  { p: "POLICY_RELEASE", find: `if (claimed.releaseAuthoritySha256 !== anchors.releaseAuthoritySha256) findings.push("POLICY_ROOT_SUBSTITUTION_RELEASE");`, r: `` },
  { p: "POLICY_DENOM", find: `if (claimed.requirementDenominator !== anchors.requirementDenominator) findings.push("POLICY_ROOT_SUBSTITUTION_DENOMINATOR");`, r: `` },
  { p: "SURFACE_WORKFLOW", find: `  ".github/workflows/p1a-authority-enforcement.yml",\n  ".github/workflows/p1a-certify.yml",`, r: `  ".github/workflows/p1a-certify.yml",` },
  { p: "SURFACE_MUTATION", find: `  "scripts/test-p1a-authority-root-mutation.mjs",\n  "scripts/test-p1a-authority-root.mjs",`, r: `  "scripts/test-p1a-authority-root.mjs",` },
  { p: "SURFACE_UNCOVERED", find: `    if (resolution.owners.length === 0) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);`, r: `    if (false) findings.push(\`TRUSTED_FILE_UNCOVERED_\${file}\`);` },
  { p: "SURFACE_WRONG_OWNER", find: `    else if (!resolution.owners.includes(\`@\${CANONICAL_AUTHORITY_ANCHORS.founderIdentity}\`)) findings.push(\`TRUSTED_FILE_WRONG_OWNER_\${file}\`);`, r: `` },
  { p: "CO_LASTMATCH", find: `    if (codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;`, r: `    if (!winner && codeownersPatternToRegex(rule.pattern).test(filePath)) winner = rule;` },
  { p: "CO_STAR", find: `    if (ch === "*") out += "[^/]*";`, r: `    if (ch === "*") out += ".*";` },
  { p: "CO_UNSUPPORTED", find: `      findings.push(\`CODEOWNERS_UNSUPPORTED_PATTERN_LINE_\${i + 1}\`);\n      continue;`, r: `` },
  { p: "COORD_APPROVAL", find: `    const independent = approvers.filter((a) => owners.includes(a) && a !== author);`, r: `    const independent = approvers;` },
  { p: "COORD_BLOCK", find: `  if (blocking) return { verdict: "AUTHORITY_ROOT_COORDINATED_REWRITE_BLOCK", findings };`, r: `` },
  { p: "SELF_APPROVAL", find: `if (author && approvers.length > 0 && approvers.every((a) => a === author)) findings.push("SELF_APPROVAL_REJECTED");`, r: `` },
  { p: "PARENT_GAP_DETECT", find: `    if (prior.owners === null || prior.owners.length === 0) findings.push(\`PARENT_CODEOWNERS_GAP_\${file}\`);`, r: `` },
  { p: "PARENT_GAP_BLOCK", equivalent: true, find: `    || f.startsWith("PARENT_CODEOWNERS_GAP_")`, r: `` },
  { p: "EXEC_VERIFY_CALL", find: `    const v = verifyExternalAttestation(rawText, "OBSERVED_EXECUTION", claim.subjectSha, claim.subjectSha);\n    if (!v.verified) { findings.push(\`EXECUTION_ATTESTATION_UNVERIFIED_\${v.reason}\`); continue; }`, r: `` },
  { p: "EXEC_SUBJECT_UNBOUND", find: `  if (!HEX40.test(claim.subjectSha ?? "") && !HEX64.test(claim.subjectSha ?? "")) {\n    return { verdict: "EXECUTION_UNPROVEN", findings: ["EXECUTION_SUBJECT_UNBOUND"] };\n  }`, r: `` },
  { p: "CUSTODY_VERIFY_CALL", find: `      const v = verifyExternalAttestation(read.bytes.toString("utf8"), "GITHUB_CUSTODY_OBSERVATION", ref.controlId, AUTHORIZED_REBUILD_BASE.sha);\n      if (!v.verified) { findings.push(\`CUSTODY_ATTESTATION_UNVERIFIED_\${ref.controlId}_\${v.reason}\`); continue; }`, r: `` },
  { p: "CUSTODY_UNKNOWN_CONTROL", find: `      if (!CUSTODY_CONTROLS.some((c) => c.id === ref.controlId)) { findings.push("CUSTODY_RECEIPT_UNKNOWN_CONTROL"); continue; }`, r: `` },
  { p: "CUSTODY_VERDICT", find: `    verdict: allVerified ? "CUSTODY_SIGNATURE_VERIFIED" : "NOT_PROVEN",`, r: `    verdict: "CUSTODY_SIGNATURE_VERIFIED",` },
  { p: "CEILING", find: `    custodySignatureVerified: custodySignatureVerified === true,\n    trustedCertificationAuthorized: false,`, r: `    custodySignatureVerified: custodySignatureVerified === true,\n    trustedCertificationAuthorized: custodySignatureVerified === true,` },
  { p: "GATE_VERIFY_CALL", find: `      const v = verifyExternalAttestation(read.bytes.toString("utf8"), "HUMAN_GATE", gate, AUTHORIZED_REBUILD_BASE.sha);\n      if (!v.verified) { findings.push(\`GATE_UNVERIFIED_\${gate}_\${v.reason}\`); continue; }\n      verified.add(gate);`, r: `      verified.add(gate);` },
  { p: "GATE_MISSING", find: `  for (const gate of NAMED_HUMAN_GATES) if (!verified.has(gate)) findings.push(\`GATE_MISSING_\${gate}\`);`, r: `` },
  { p: "ROLLBACK_PLAN", find: `    : { verdict: "ROLLBACK_PLAN_VALIDATED", findings: [] };`, r: `    : { verdict: "ROLLBACK_AUTHORIZED", findings: [] };` },
  { p: "ROLLBACK_EXEC", find: `  const v = verifyExternalAttestation(read.bytes.toString("utf8"), "ROLLBACK_EXECUTION", action.kind, AUTHORIZED_REBUILD_BASE.sha);\n  if (!v.verified) return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: [\`ROLLBACK_EXECUTION_UNVERIFIED_\${v.reason}\`] };`, r: `` },
  { p: "ROLLBACK_EVIDENCE", find: `    return { verdict: "ROLLBACK_EXECUTION_UNPROVEN", findings: ["ROLLBACK_EXECUTION_EVIDENCE_MISSING"] };`, r: `    return { verdict: "ROLLBACK_AUTHORIZED", findings: [] };` },
  { p: "SEALED_ANCHOR_LOOKUP", find: `  return Object.prototype.hasOwnProperty.call(SEALED_TRUST_ANCHORS, keyId) ? SEALED_TRUST_ANCHORS[keyId] : null;`, r: `  return { status: "PROVISIONED", publicKeyPem: "x", keyId };` },
  { p: "ENFORCE_BATTERY", find: `  if (!text.includes("scripts/test-p1a-authority-root.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_BATTERY");`, r: `` },
  { p: "ENFORCE_MUTATION", find: `  if (!text.includes("scripts/test-p1a-authority-root-mutation.mjs")) findings.push("WORKFLOW_DOES_NOT_INVOKE_MUTATION");`, r: `` },
  { p: "PATH_ESCAPE", find: `  if (typeof relPath !== "string" || isAbsolute(relPath) || relPath.split(/[\\\\/]/u).includes("..")) {\n    return { verdict: "ARTIFACT_REJECTED", findings: ["PATH_ESCAPE_REJECTED"] };\n  }`, r: `` },
  { p: "SYMLINK", find: `    if (st.isSymbolicLink()) return { verdict: "ARTIFACT_REJECTED", findings: ["SYMLINK_SUBSTITUTION_REJECTED"] };`, r: `` },
  { p: "DIGEST_BIND", find: `    if (sha256(bytes) !== expectedSha256) return { verdict: "ARTIFACT_REJECTED", findings: ["ARTIFACT_DIGEST_MISMATCH"] };`, r: `` },
  { p: "EXPECTED_DIGEST", find: `  if (!HEX64.test(expectedSha256 ?? "")) {\n    return { verdict: "ARTIFACT_REJECTED", findings: ["EXPECTED_DIGEST_MISSING"] };\n  }`, r: `` },
  { p: "SUPERSESSION_CHAIN", find: `if (prior && HEX64.test(next.supersedesSha256 ?? "") && next.supersedesSha256 !== prior.sha256) findings.push("SUPERSESSION_CHAIN_MISMATCH");`, r: `` },
  { p: "SUPERSESSION_PRESERVE", find: `if (!prior || prior.preserved !== true) findings.push("PREDECESSOR_NOT_PRESERVED");`, r: `` },
  { p: "SUPERSESSION_FOUNDER", find: `if (!HEX64.test(next.founderDecisionSha256 ?? "")) findings.push("SUPERSESSION_WITHOUT_FOUNDER_DECISION");`, r: `` },
  { p: "BOUNDARY", find: `  if (OUT_OF_BOUNDARY_CAPABILITIES.includes(capability)\n    && Object.keys(REPOSITORY_AUTHORITY_ROLES).includes(repository)) {\n    return { verdict: "BOUNDARY_VIOLATION", findings: [\`CAPABILITY_INSIDE_TRUST_BOUNDARY_\${capability}\`] };\n  }`, r: `` },
  { p: "SPEC", find: `  if (claim.assertedStatus === "OPERATIONAL_AGENT" && role !== "RUNTIME_AUTHORITY") {\n    return { verdict: "CLAIM_REJECTED", findings: ["SPECIFICATION_IS_NOT_AN_OPERATIONAL_AGENT"] };\n  }`, r: `` },
  { p: "HISTORY_REWRITE", find: `  if (action.kind === "HISTORY_REWRITE" || action.forcePush === true || action.deletesHistory === true) {\n    findings.push("HISTORY_REWRITE_PROHIBITED");\n  }`, r: `` },
];

// Sanity: probe suites green against originals (inject BASE into core module ns copy).
const coreOrig = await importSrc(SRC_CORE);
for (const [n, probe] of Object.entries(CORE_PROBES)) { probe(coreOrig); console.log(`CORE-PROBE-GREEN ${n}`); }
const validateOrig = await importValidate(SRC_VALIDATE);
for (const [n, probe] of Object.entries(PROD_PROBES)) { probe(validateOrig); console.log(`PROD-PROBE-GREEN ${n}`); }
const registerSize = validateOrig.PROPERTY_REGISTER.length;

let killed = 0; const survivors = []; const equivSurvived = []; const equivDeclared = [];
async function runSet(label, mutants, SRC, importer, PROBES) {
  for (const [i, mut] of mutants.entries()) {
    assert.ok(SRC.includes(mut.find), `${label}[${i}] ${mut.p}: find-anchor missing`);
    const mutated = SRC.replace(mut.find, mut.r);
    assert.notEqual(mutated, SRC, `${label}[${i}] ${mut.p}: no-op`);
    if (mut.equivalent) equivDeclared.push(`${label}:${mut.p}[${i}]`);
    let mod; try { mod = await importer(mutated); } catch { killed += 1; console.log(`KILLED(load) ${label}:${mut.p}[${i}]`); continue; }
    let died = false; for (const probe of Object.values(PROBES)) { try { probe(mod); } catch { died = true; break; } }
    if (died) { killed += 1; console.log(`KILLED ${label}:${mut.p}[${i}]`); }
    else if (mut.equivalent) { equivSurvived.push(`${label}:${mut.p}[${i}]`); console.log(`EQUIVALENT ${label}:${mut.p}[${i}]`); }
    else { survivors.push(`${label}:${mut.p}[${i}]`); console.log(`SURVIVED ${label}:${mut.p}[${i}]`); }
  }
}
await runSet("CORE", CORE_MUTANTS, SRC_CORE, importSrc, CORE_PROBES);
await runSet("VALIDATE", VALIDATE_MUTANTS, SRC_VALIDATE, importValidate, PROD_PROBES);

const total = CORE_MUTANTS.length + VALIDATE_MUTANTS.length;
const wrongEquiv = equivDeclared.filter((e) => !equivSurvived.includes(e));
console.log(JSON.stringify({ suite: "p1-a-authority-root-mutation", propertyRegister: registerSize, mutantDenominator: total, executed: total, killed, survivors: survivors.length, survivorList: survivors, equivalentDeclared: equivDeclared.length, equivalentSurvived: equivSurvived, wronglyDeclaredEquivalent: wrongEquiv, coreProbes: Object.keys(CORE_PROBES).length, prodProbes: Object.keys(PROD_PROBES).length }));
assert.equal(survivors.length, 0, `survivors: ${survivors.join(", ")}`);
assert.equal(wrongEquiv.length, 0, `wrongly-declared equivalent: ${wrongEquiv.join(", ")}`);
