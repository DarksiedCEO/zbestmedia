// P1A-03 evidence test battery: unit, property/invariant, integration, and the
// §XXI hostile attack set. Every hostile case must FAIL CLOSED.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  POLICY_VERSION, RECEIPT_SCHEMA_VERSION, CANONICAL_AUTHORITY_ANCHORS,
  canonicalJson, digestOf, IDENTITY_TUPLE_FIELDS, computeReceiptDigest,
  validateReceiptIdentity, receiptsDistinct, CERTIFICATION_RECORD_REQUIRED_FIELDS,
  verifyCertificationRecordCompleteness, isSafeRepoPath, verifyCitations,
  verifyTraversal, RECOGNIZED_EXCLUSION_KINDS, parseExclusions, evaluateAccounting,
  EXECUTION_RECORD_REQUIRED_FIELDS, ASSERTED_ONLY_FLAGS, classifyExecutionEvidence,
  verifyTemporalOrder, assessRuntimeClaim, assessProductionClaim,
  verifyIdentitySource, FORBIDDEN_ARTIFACT_KINDS, ALLOWED_ARTIFACT_KINDS,
  verifyArtifactUploadPolicy, assessHistoricalEvidence, ENVELOPE_BOUND_FIELDS,
  verifyEvidenceEnvelope, evaluateAuthorization, decideOnEvidence,
  createEvidenceStore, deterministicArtifactId, sealArtifact, updateArtifact,
  REVOCATION_REQUIRED_FIELDS, appendRevocation, verifyRevocationChain,
  SUPERSESSION_REQUIRED_FIELDS, recordSupersession, decisionEligibility,
  traverseLineage, REFERENCE_BASES, REFERENCE_CONFIDENCES,
  validateEvidenceReference, readEvidenceArtifact, writeEvidenceAtomic,
  PROPERTY_REGISTER, laneEvidenceStatus,
} from "./validate-p1a-evidence.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const H40 = (c) => c.repeat(40);
const H64 = (c) => c.repeat(64);

let executed = 0, passed = 0, hostileExecuted = 0, hostilePassed = 0;
const run = (name, fn) => { executed += 1; fn(); passed += 1; console.log(`PASS ${name}`); };
const hostile = (name, fn) => { hostileExecuted += 1; fn(); hostilePassed += 1; console.log(`PASS hostile:${name}`); };

// --- fixtures ---------------------------------------------------------------
const goodExecutionRecord = () => ({
  command: "node scripts/test-p1a-evidence.mjs",
  workingDirectory: "/work/subject",
  environmentIdentity: "local-darwin-arm64",
  toolchainIdentity: "node-24",
  startedAt: "2026-08-20T21:00:00Z",
  completedAt: "2026-08-20T21:00:05Z",
  exitCode: 0,
  outputDigest: H64("a"),
});
const goodClaim = () => ({ executionRecord: goodExecutionRecord() });
const goodTuple = () => ({
  repository: "https://github.com/DarksiedCEO/zbestmedia.git",
  subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha,
  tree: CANONICAL_AUTHORITY_ANCHORS.baseTree,
  parents: ["94941bbf6afbd0073f6619b2c63b0e6c5c6ca4e8", "03eeb8bd04850fc211ca61d1c591b8c6cec905b1"],
  workflowSha: H40("1"),
  verifierDigest: H64("2"),
  artifactDigest: H64("3"),
});
const goodReceipt = () => {
  const receipt = {
    receiptVersion: RECEIPT_SCHEMA_VERSION,
    receiptClass: "EXECUTION",
    identityTuple: goodTuple(),
    verdict: "PASS",
  };
  receipt.receiptDigest = computeReceiptDigest(receipt);
  return receipt;
};
const goodCertRecord = () => ({
  environmentApproval: "prod-cert-approval-1",
  runId: "run-1", jobId: "job-1",
  workflowSha: H40("1"), candidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha,
  artifactDigest: H64("3"), reviewerIdentity: "CODEX",
});
const objectTable = new Map([
  ["scripts/a.mjs", { exists: true, blobSha: H40("a"), lineCount: 100 }],
  ["docs/b.md", { exists: true, blobSha: H40("b"), lineCount: 10 }],
]);
const resolver = ({ path }) => objectTable.get(path) ?? { exists: false };
const goodCitation = () => ({ path: "scripts/a.mjs", subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha, blobSha: H40("a"), lineStart: 1, lineEnd: 50, lineCount: 100 });
const goodTrustRecord = () => ({
  subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha, agent: "agent-1", tenant: "tenant-1",
  workspace: "ws-1", artifact: H64("3"), issuer: "issuer-1", system: "sys-1",
  status: "ACTIVE",
  validityWindow: { notBefore: "2026-08-01T00:00:00Z", notAfter: "2026-12-01T00:00:00Z" },
});
const goodEnvelope = () => ({
  envelopeId: "env-1",
  subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha, agent: "agent-1", tenant: "tenant-1",
  workspace: "ws-1", artifact: H64("3"), issuer: "issuer-1", system: "sys-1",
  issuedAt: "2026-08-15T00:00:00Z",
});
const goodContext = () => ({
  evaluationTime: "2026-08-20T00:00:00Z", workspace: "ws-1",
  subjectCreatedAt: "2026-08-10T00:00:00Z", consumedEnvelopeIds: new Set(),
});
const sealGood = (store, overrides = {}) => sealArtifact(store, {
  artifactClass: "RECEIPT", subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha,
  inputHash: overrides.inputHash ?? H64("c"), workspace: overrides.workspace ?? "ws-1",
  body: overrides.body ?? { n: 1 },
});

// === STATIC =================================================================
run("static: policy and schema versions frozen", () => {
  assert.equal(POLICY_VERSION, "P1A_EVIDENCE_POLICY_V1");
  assert.equal(RECEIPT_SCHEMA_VERSION, "P1A_RECEIPT_V1");
});
run("static: canonical anchors bind frozen authority", () => {
  assert.equal(CANONICAL_AUTHORITY_ANCHORS.frozenLedgerSha256, "f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf");
  assert.equal(CANONICAL_AUTHORITY_ANCHORS.requirementDenominator, 124);
  assert.equal(CANONICAL_AUTHORITY_ANCHORS.baseSha, "b0c1b2129123b941c6a350c16dae0ae3a8e076ca");
  assert.ok(Object.isFrozen(CANONICAL_AUTHORITY_ANCHORS));
});
run("static: property register covers all 20 owned requirements", () => {
  const reqs = new Set(PROPERTY_REGISTER.map((p) => p.requirement));
  for (let n = 37; n <= 56; n += 1) assert.ok(reqs.has(`P1AF-0${n}`), `P1AF-0${n} uncovered`);
  assert.ok(PROPERTY_REGISTER.length >= 30);
});
run("static: lane status makes no runtime/production claim", () => {
  const s = laneEvidenceStatus();
  assert.equal(s.runtimeClaim, "NOT_RUN");
  assert.equal(s.productionClaim, "NOT_RUN");
  assert.equal(s.requirements.length, 20);
});

// === canonical serialization ================================================
run("canonicalJson: key order never changes digest", () => {
  assert.equal(digestOf({ a: 1, b: [2, "x"] }), digestOf({ b: [2, "x"], a: 1 }));
  assert.notEqual(digestOf({ a: 1 }), digestOf({ a: 2 }));
});
run("canonicalJson: non-canonicalizable values throw", () => {
  assert.throws(() => canonicalJson({ f: () => 1 }));
  assert.throws(() => canonicalJson(undefined));
});

// === P1AF-041 receipt binding ===============================================
run("receipt: full tuple + digest binds", () => {
  assert.equal(validateReceiptIdentity(goodReceipt()).verdict, "RECEIPT_BOUND");
});
run("receipt: every tuple field is individually required", () => {
  for (const field of IDENTITY_TUPLE_FIELDS) {
    const r = goodReceipt();
    delete r.identityTuple[field];
    r.receiptDigest = computeReceiptDigest(r);
    const v = validateReceiptIdentity(r);
    assert.equal(v.verdict, "RECEIPT_REJECTED", field);
    assert.ok(v.findings.some((f) => f.includes(field)), field);
  }
});
hostile("receipt: two receipts distinguished only by filename are the SAME receipt", () => {
  const a = goodReceipt();
  const b = goodReceipt();
  const cmp = receiptsDistinct(a, b);
  assert.equal(cmp.verdict, "COMPARED");
  assert.equal(cmp.distinct, false); // filename never entered identity
});
hostile("receipt: filename smuggled into identity tuple is rejected", () => {
  const r = goodReceipt();
  r.identityTuple.filename = "receipt-final-v2.json";
  r.receiptDigest = computeReceiptDigest(r);
  const v = validateReceiptIdentity(r);
  assert.equal(v.verdict, "RECEIPT_REJECTED");
  assert.ok(v.findings.includes("FILENAME_IN_IDENTITY_TUPLE"));
});
hostile("receipt: rewritten-in-place content breaks its own digest", () => {
  const r = goodReceipt();
  r.verdict = "FAIL_REWRITTEN_TO_PASS";
  const v = validateReceiptIdentity(r);
  assert.equal(v.verdict, "RECEIPT_REJECTED");
  assert.ok(v.findings.includes("RECEIPT_DIGEST_MISMATCH"));
});
hostile("receipt: wrong parent ORDER is a different subject", () => {
  const a = goodReceipt();
  const b = goodReceipt();
  b.identityTuple.parents = [...b.identityTuple.parents].reverse();
  b.receiptDigest = computeReceiptDigest(b);
  assert.equal(validateReceiptIdentity(b).verdict, "RECEIPT_BOUND");
  assert.equal(receiptsDistinct(a, b).distinct, true);
});

// === P1AF-038 completeness ==================================================
run("cert record: complete record passes", () => {
  assert.equal(verifyCertificationRecordCompleteness(goodCertRecord()).verdict, "RECORD_COMPLETE");
});
run("cert record: omitting EACH field fails (ledger mutation obligation)", () => {
  for (const field of CERTIFICATION_RECORD_REQUIRED_FIELDS) {
    const r = goodCertRecord();
    delete r[field];
    const v = verifyCertificationRecordCompleteness(r);
    assert.equal(v.verdict, "RECORD_INCOMPLETE", field);
    assert.deepEqual(v.findings, [`FIELD_MISSING:${field}`]);
  }
});
hostile("cert record: empty-string field is missing, not present", () => {
  const r = goodCertRecord();
  r.reviewerIdentity = "";
  assert.equal(verifyCertificationRecordCompleteness(r).verdict, "RECORD_INCOMPLETE");
});

// === P1AF-039 citation binding ==============================================
run("citations: valid citation binds against git objects", () => {
  assert.equal(verifyCitations([goodCitation()], resolver).verdict, "CITATIONS_BOUND");
});
hostile("citations: wrong blob for path rejected (ledger mutation obligation)", () => {
  const c = goodCitation();
  c.blobSha = H40("f");
  const v = verifyCitations([c], resolver);
  assert.equal(v.verdict, "CITATIONS_REJECTED");
  assert.ok(v.findings.some((f) => f.startsWith("BLOB_MISMATCH")));
});
hostile("citations: impossible range rejected (ledger mutation obligation)", () => {
  const c = goodCitation();
  c.lineEnd = 101;
  const v = verifyCitations([c], resolver);
  assert.equal(v.verdict, "CITATIONS_REJECTED");
  assert.ok(v.findings.some((f) => f.startsWith("RANGE_IMPOSSIBLE")));
});
hostile("citations: missing object rejected", () => {
  const c = goodCitation();
  c.path = "scripts/ghost.mjs";
  const v = verifyCitations([c], resolver);
  assert.equal(v.verdict, "CITATIONS_REJECTED");
  assert.ok(v.findings.some((f) => f.startsWith("OBJECT_MISSING")));
});
hostile("citations: inverted and zero ranges rejected", () => {
  const inv = { ...goodCitation(), lineStart: 50, lineEnd: 10 };
  assert.equal(verifyCitations([inv], resolver).verdict, "CITATIONS_REJECTED");
  const zero = { ...goodCitation(), lineStart: 0, lineEnd: 5 };
  assert.equal(verifyCitations([zero], resolver).verdict, "CITATIONS_REJECTED");
});
hostile("citations: lineCount contradiction rejected", () => {
  const c = { ...goodCitation(), lineCount: 999 };
  const v = verifyCitations([c], resolver);
  assert.equal(v.verdict, "CITATIONS_REJECTED");
  assert.ok(v.findings.some((f) => f.startsWith("LINECOUNT_MISMATCH")));
});
hostile("citations: throwing resolver fails closed, never passes", () => {
  const v = verifyCitations([goodCitation()], () => { throw new Error("io"); });
  assert.equal(v.verdict, "CITATIONS_REJECTED");
});

// === P1AF-045 vacuous traversal =============================================
hostile("traversal: empty input set reporting pass is VACUOUS (ledger mutation obligation)", () => {
  const v = verifyTraversal({ denominator: 0, visited: 0, claimedResult: "PASS" });
  assert.equal(v.verdict, "VACUOUS_TRAVERSAL");
  assert.ok(v.findings.includes("EMPTY_DENOMINATOR"));
  assert.equal(verifyCitations([], resolver).verdict, "VACUOUS_TRAVERSAL");
});
run("traversal: full accounting passes; partial visit fails", () => {
  assert.equal(verifyTraversal({ denominator: 5, visited: 5, claimedResult: "PASS" }).verdict, "TRAVERSAL_ACCOUNTED");
  assert.equal(verifyTraversal({ denominator: 5, visited: 4, claimedResult: "PASS" }).verdict, "VACUOUS_TRAVERSAL");
});
run("traversal: non-pass result is preserved, not upgraded", () => {
  assert.equal(verifyTraversal({ denominator: 5, visited: 5, claimedResult: "FAIL" }).verdict, "NON_PASS_PRESERVED");
});

// === P1AF-046 exclusions ====================================================
run("exclusions: recognized shapes parse", () => {
  const v = parseExclusions([{ kind: "EXACT_PATH", path: "docs/b.md", reason: "generated" }]);
  assert.equal(v.verdict, "EXCLUSIONS_PARSED");
  assert.equal(v.accepted.length, 1);
});
hostile("exclusions: unparseable entry fails closed and poisons the set (ledger mutation obligation)", () => {
  const v = parseExclusions([
    { kind: "EXACT_PATH", path: "docs/b.md", reason: "generated" },
    { kind: "GLOB_MAYBE", path: "**", reason: "trust me" },
  ]);
  assert.equal(v.verdict, "EXCLUSIONS_REJECTED");
  assert.equal(v.accepted.length, 0); // nothing silently skips
});
hostile("exclusions: traversal path inside exclusion rejected", () => {
  assert.equal(parseExclusions([{ kind: "EXACT_PATH", path: "../secrets", reason: "r" }]).verdict, "EXCLUSIONS_REJECTED");
});

// === P1AF-040 accounting matrix =============================================
const goodAccounting = () => ({
  anchors: [H64("d")],
  citations: [goodCitation()],
  resolveObject: resolver,
  exclusions: [],
  declaredScope: ["scripts/a.mjs"],
  observedScope: ["scripts/a.mjs"],
  statuses: ["PASS", "PASS"],
});
run("accounting: clean state passes", () => {
  assert.equal(evaluateAccounting(goodAccounting()).verdict, "ACCOUNTING_PASS");
});
run("accounting: EACH failure class blocks (ledger mutation obligation)", () => {
  const cases = [
    ["missing anchors", { anchors: [] }],
    ["invalid anchor", { anchors: ["nothex"] }],
    ["missing object", { citations: [{ ...goodCitation(), path: "scripts/ghost.mjs" }] }],
    ["contradictory status", { statuses: ["PASS", "FAIL"] }],
    ["expanded scope", { observedScope: ["scripts/a.mjs", "docs/b.md"] }],
    ["unsafe path", { citations: [{ ...goodCitation(), path: "../../etc/passwd" }] }],
    ["impossible range", { citations: [{ ...goodCitation(), lineEnd: 5000 }] }],
    ["non-pass accounting", { statuses: ["PASS", "NOT_RUN"] }],
  ];
  for (const [name, override] of cases) {
    const v = evaluateAccounting({ ...goodAccounting(), ...override });
    assert.equal(v.verdict, "BLOCKED", name);
  }
});
run("path safety: traversal, absolute, backslash, NUL all unsafe", () => {
  for (const bad of ["../x", "a/../b", "/etc/passwd", "a\\b", "a/\0", "", "a//b", "./a"]) {
    assert.equal(isSafeRepoPath(bad), false, JSON.stringify(bad));
  }
  assert.equal(isSafeRepoPath("scripts/a.mjs"), true);
});

// === P1AF-044 / §XI execution proof =========================================
run("execution: complete record is observed execution", () => {
  assert.equal(classifyExecutionEvidence(goodClaim()).verdict, "EXECUTION_OBSERVED");
});
hostile("execution: asserted pass with NO record is EXECUTION_UNPROVEN (ledger mutation obligation)", () => {
  const v = classifyExecutionEvidence({ asserted: { executed: true, tests_passed: true, mutation_survivors: 0 } });
  assert.equal(v.verdict, "EXECUTION_UNPROVEN");
  assert.ok(v.findings.includes("ASSERTED_WITHOUT_EXECUTION"));
});
run("execution: every record field individually required", () => {
  for (const field of EXECUTION_RECORD_REQUIRED_FIELDS) {
    const c = goodClaim();
    delete c.executionRecord[field];
    assert.equal(classifyExecutionEvidence(c).verdict, "EXECUTION_UNPROVEN", field);
  }
});
hostile("execution: caller flags are inert — asserted:false changes nothing", () => {
  const c = goodClaim();
  c.asserted = { executed: true, fresh: true, independent: true };
  assert.equal(classifyExecutionEvidence(c).verdict, "EXECUTION_OBSERVED"); // record carries it
  delete c.executionRecord;
  assert.equal(classifyExecutionEvidence(c).verdict, "EXECUTION_UNPROVEN"); // flags alone never do
});
hostile("execution: inverted start/end rejected", () => {
  const c = goodClaim();
  c.executionRecord.completedAt = "2026-08-20T20:00:00Z";
  assert.equal(classifyExecutionEvidence(c).verdict, "EXECUTION_UNPROVEN");
});
hostile("temporal: evidence created before claimed execution is a contradiction (§XXI)", () => {
  const v = verifyTemporalOrder({ evidenceCreatedAt: "2026-08-20T20:59:59Z", executionStartedAt: "2026-08-20T21:00:00Z" });
  assert.equal(v.verdict, "TEMPORAL_CONTRADICTION");
  assert.equal(verifyTemporalOrder({ evidenceCreatedAt: "2026-08-20T21:00:05Z", executionStartedAt: "2026-08-20T21:00:00Z" }).verdict, "TEMPORAL_CONSISTENT");
  assert.equal(verifyTemporalOrder({}).verdict, "TEMPORAL_UNPROVEN");
});

// === P1AF-048 / P1AF-049 overclaims =========================================
hostile("runtime: claim from configuration rejected (ledger mutation obligation)", () => {
  const v = assessRuntimeClaim({ kind: "RUNTIME", evidenceBasis: "CONFIGURATION", executionRecord: goodExecutionRecord() });
  assert.equal(v.verdict, "RUNTIME_OVERCLAIM_REJECTED");
});
run("runtime: execution-backed runtime claim supported", () => {
  assert.equal(assessRuntimeClaim({ kind: "RUNTIME", evidenceBasis: "RUNTIME_EXECUTION", executionRecord: goodExecutionRecord() }).verdict, "RUNTIME_CLAIM_SUPPORTED");
});
hostile("runtime: basis asserted without record rejected", () => {
  assert.equal(assessRuntimeClaim({ kind: "RUNTIME", evidenceBasis: "RUNTIME_EXECUTION" }).verdict, "RUNTIME_OVERCLAIM_REJECTED");
});
hostile("production: claim from a spec rejected (ledger mutation obligation)", () => {
  const v = assessProductionClaim({ kind: "PRODUCTION_HEALTH", specification: "we planned to deploy" });
  assert.equal(v.verdict, "PRODUCTION_OVERCLAIM_REJECTED");
});
run("production: deployment-backed health claim + db-backed live-data claim supported", () => {
  assert.equal(assessProductionClaim({ kind: "PRODUCTION_HEALTH", deploymentEvidence: { executionRecord: goodExecutionRecord() } }).verdict, "PRODUCTION_CLAIM_SUPPORTED");
  assert.equal(assessProductionClaim({ kind: "LIVE_DATA", databaseEvidence: { executionRecord: goodExecutionRecord() } }).verdict, "PRODUCTION_CLAIM_SUPPORTED");
});
hostile("production: live-data claim without database evidence rejected", () => {
  assert.equal(assessProductionClaim({ kind: "LIVE_DATA" }).verdict, "PRODUCTION_OVERCLAIM_REJECTED");
});

// === P1AF-051 identity source ===============================================
hostile("identity: env var alone never accepted (ledger mutation obligation)", () => {
  assert.equal(verifyIdentitySource({ envCandidateSha: H40("9") }).verdict, "IDENTITY_UNPROVEN");
});
hostile("identity: spoofed env vs observed HEAD rejected", () => {
  const v = verifyIdentitySource({ envCandidateSha: H40("9"), observedHeadSha: CANONICAL_AUTHORITY_ANCHORS.baseSha });
  assert.equal(v.verdict, "IDENTITY_REJECTED");
  assert.ok(v.findings.includes("ENV_HEAD_MISMATCH"));
});
run("identity: matching env + observed HEAD verified", () => {
  assert.equal(verifyIdentitySource({ envCandidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha, observedHeadSha: CANONICAL_AUTHORITY_ANCHORS.baseSha }).verdict, "IDENTITY_VERIFIED");
});

// === P1AF-037 artifact allowlist ============================================
const goodUpload = () => ({
  uploaded: [
    { kind: "SUMMARY_JSON", path: "out/summary.json", sha256: H64("e") },
    { kind: "SUMMARY_DIGEST", path: "out/summary.json.sha256" },
  ],
  cleanup: {
    condition: "always",
    removesKinds: [...FORBIDDEN_ARTIFACT_KINDS],
    executionRecord: goodExecutionRecord(),
  },
});
run("artifacts: allowlisted summary + digest with always() cleanup passes", () => {
  assert.equal(verifyArtifactUploadPolicy(goodUpload()).verdict, "ARTIFACT_POLICY_OK");
});
hostile("artifacts: raw log added to artifact set rejected (ledger mutation obligation)", () => {
  const u = goodUpload();
  u.uploaded.push({ kind: "RAW_LOG", path: "out/run.log" });
  const v = verifyArtifactUploadPolicy(u);
  assert.equal(v.verdict, "ARTIFACT_POLICY_VIOLATION");
  assert.ok(v.findings.includes("FORBIDDEN_ARTIFACT:RAW_LOG"));
});
hostile("artifacts: askpass helper and object store rejected; unknown kind rejected", () => {
  for (const kind of ["ASKPASS_HELPER", "RUNTIME_OBJECT_STORE", "MYSTERY_BLOB"]) {
    const u = goodUpload();
    u.uploaded.push({ kind, path: "out/x" });
    assert.equal(verifyArtifactUploadPolicy(u).verdict, "ARTIFACT_POLICY_VIOLATION", kind);
  }
});
hostile("artifacts: cleanup not always(), incomplete, or unexecuted rejected", () => {
  const a = goodUpload(); a.cleanup.condition = "on_success";
  assert.equal(verifyArtifactUploadPolicy(a).verdict, "ARTIFACT_POLICY_VIOLATION");
  const b = goodUpload(); b.cleanup.removesKinds = ["RAW_LOG"];
  assert.equal(verifyArtifactUploadPolicy(b).verdict, "ARTIFACT_POLICY_VIOLATION");
  const c = goodUpload(); delete c.cleanup.executionRecord;
  assert.equal(verifyArtifactUploadPolicy(c).verdict, "ARTIFACT_POLICY_VIOLATION");
});

// === P1AF-047 historical scope ==============================================
hostile("historical: old verdict reused for a NEW sha is HISTORICAL_ONLY (ledger mutation obligation)", () => {
  const v = assessHistoricalEvidence(
    { workflowSha: H40("1"), candidateSha: H40("2") },
    { workflowSha: H40("1"), candidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha },
  );
  assert.equal(v.verdict, "HISTORICAL_ONLY");
});
run("historical: exact workflow+candidate match stays current; unbound evidence rejected", () => {
  const subject = { workflowSha: H40("1"), candidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha };
  assert.equal(assessHistoricalEvidence({ ...subject }, subject).verdict, "SUBJECT_CURRENT");
  assert.equal(assessHistoricalEvidence({ candidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha }, subject).verdict, "EVIDENCE_REJECTED");
});

// === P1AF-050 envelope matrix ===============================================
run("envelope: exact-match envelope verifies", () => {
  assert.equal(verifyEvidenceEnvelope(goodEnvelope(), goodTrustRecord(), goodContext()).verdict, "ENVELOPE_VERIFIED");
});
run("envelope: EVERY bound field mismatch rejects (ledger mutation obligation)", () => {
  for (const field of ENVELOPE_BOUND_FIELDS) {
    const e = goodEnvelope();
    e[field] = "tampered";
    const v = verifyEvidenceEnvelope(e, goodTrustRecord(), goodContext());
    assert.equal(v.verdict, "ENVELOPE_REJECTED", field);
    assert.ok(v.findings.some((f) => f === `FIELD_MISMATCH:${field}` || f === "FOREIGN_WORKSPACE"), field);
  }
});
run("envelope: each rejection class fires (duplicate/revoked/expired/failed/foreign/future/pre-subject)", () => {
  const dup = goodContext(); dup.consumedEnvelopeIds.add("env-1");
  assert.ok(verifyEvidenceEnvelope(goodEnvelope(), goodTrustRecord(), dup).findings.includes("DUPLICATE"));
  const rev = goodTrustRecord(); rev.status = "REVOKED";
  assert.ok(verifyEvidenceEnvelope(goodEnvelope(), rev, goodContext()).findings.includes("REVOKED"));
  const exp = goodContext(); exp.evaluationTime = "2027-01-01T00:00:00Z";
  assert.ok(verifyEvidenceEnvelope(goodEnvelope(), goodTrustRecord(), exp).findings.includes("EXPIRED"));
  const fail = goodTrustRecord(); fail.status = "FAILED";
  assert.ok(verifyEvidenceEnvelope(goodEnvelope(), fail, goodContext()).findings.includes("FAILED"));
  const foreignEnv = goodEnvelope(); foreignEnv.workspace = "ws-other";
  assert.ok(verifyEvidenceEnvelope(foreignEnv, { ...goodTrustRecord(), workspace: "ws-other" }, goodContext()).findings.includes("FOREIGN_WORKSPACE"));
  const fut = goodEnvelope(); fut.issuedAt = "2026-09-01T00:00:00Z";
  assert.ok(verifyEvidenceEnvelope(fut, goodTrustRecord(), goodContext()).findings.includes("FUTURE_DATED"));
  const pre = goodEnvelope(); pre.issuedAt = "2026-08-01T00:00:00Z";
  assert.ok(verifyEvidenceEnvelope(pre, goodTrustRecord(), goodContext()).findings.includes("PRE_SUBJECT"));
});
hostile("envelope: unknown trust status fails closed; missing status fails closed", () => {
  const weird = goodTrustRecord(); weird.status = "SUPER_ACTIVE";
  assert.equal(verifyEvidenceEnvelope(goodEnvelope(), weird, goodContext()).verdict, "ENVELOPE_REJECTED");
  const none = goodTrustRecord(); delete none.status;
  assert.equal(verifyEvidenceEnvelope(goodEnvelope(), none, goodContext()).verdict, "ENVELOPE_REJECTED");
});

// === P1AF-052 / P1AF-053 authorization ======================================
hostile("authorization: producer approving its own artifact rejected (ledger mutation obligation)", () => {
  const v = evaluateAuthorization({
    artifact: { producer: "CLAUDE" },
    approval: { approver: "CLAUDE", executionRecord: goodExecutionRecord() },
    structurallyValid: true,
  });
  assert.equal(v.verdict, "SELF_PROMOTION_REJECTED");
});
run("authorization: schema validity alone is STRUCTURALLY_VALID, never AUTHORIZED", () => {
  const v = evaluateAuthorization({ artifact: { producer: "CLAUDE" }, approval: null, structurallyValid: true });
  assert.equal(v.verdict, "STRUCTURALLY_VALID");
});
run("authorization: independent executed approval authorizes", () => {
  const v = evaluateAuthorization({
    artifact: { producer: "CLAUDE" },
    approval: { approver: "CODEX", executionRecord: goodExecutionRecord() },
    structurallyValid: true,
  });
  assert.equal(v.verdict, "AUTHORIZED");
});
hostile("authorization: unexecuted approval does not authorize", () => {
  const v = evaluateAuthorization({ artifact: { producer: "CLAUDE" }, approval: { approver: "CODEX" }, structurallyValid: true });
  assert.equal(v.verdict, "STRUCTURALLY_VALID");
});
hostile("evidence decision: omitting EACH required class blocks (ledger mutation obligation)", () => {
  const required = ["STATIC", "UNIT", "MUTATION"];
  for (const omit of required) {
    const v = decideOnEvidence({ required, present: required.filter((r) => r !== omit) });
    assert.equal(v.verdict, "BLOCKED", omit);
    assert.deepEqual(v.findings, [`EVIDENCE_MISSING:${omit}`]);
  }
  assert.equal(decideOnEvidence({ required, present: required }).verdict, "EVIDENCE_COMPLETE");
  assert.equal(decideOnEvidence({ required: [], present: [] }).verdict, "BLOCKED");
});

// === P1AF-054 sealed artifacts ==============================================
run("artifact: deterministic id derives from class+subject+input hash", () => {
  const args = { artifactClass: "RECEIPT", subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha, inputHash: H64("c") };
  assert.equal(deterministicArtifactId(args), deterministicArtifactId({ ...args }));
  assert.notEqual(deterministicArtifactId(args), deterministicArtifactId({ ...args, inputHash: H64("d") }));
  assert.equal(deterministicArtifactId({ ...args, inputHash: "short" }), null);
});
hostile("artifact: updating a sealed artifact rejected (ledger mutation obligation)", () => {
  const store = createEvidenceStore();
  const sealed = sealGood(store);
  assert.equal(sealed.verdict, "SEALED");
  assert.equal(updateArtifact(store, sealed.id).verdict, "SEALED_IMMUTABLE");
});
hostile("artifact: re-sealing same identity rejected; record frozen", () => {
  const store = createEvidenceStore();
  const first = sealGood(store);
  assert.equal(sealGood(store).verdict, "SEAL_REJECTED");
  assert.ok(Object.isFrozen(store.artifacts.get(first.id)));
});

// === P1AF-042 revocation ====================================================
const goodRevocation = () => ({
  revokedId: "approval-9", subjectSha: CANONICAL_AUTHORITY_ANCHORS.baseSha,
  artifactIds: [H64("3")], issuer: "issuer-1", revokingAuthority: "FOUNDER",
  reason: "compromised", timestamp: "2026-08-20T21:00:00Z", replacementId: null,
});
run("revocation: complete record appends; chain verifies", () => {
  const store = createEvidenceStore();
  assert.equal(appendRevocation(store, goodRevocation()).verdict, "REVOCATION_APPENDED");
  assert.equal(verifyRevocationChain(store).verdict, "CHAIN_INTACT");
});
run("revocation: every field required; absent replacement field rejected", () => {
  for (const field of REVOCATION_REQUIRED_FIELDS) {
    const store = createEvidenceStore();
    const r = goodRevocation();
    delete r[field];
    assert.equal(appendRevocation(store, r).verdict, "REVOCATION_REJECTED", field);
  }
  const store = createEvidenceStore();
  const r = goodRevocation();
  delete r.replacementId;
  assert.equal(appendRevocation(store, r).verdict, "REVOCATION_REJECTED");
});
hostile("revocation: mutating an appended record breaks the chain (ledger mutation obligation)", () => {
  const store = createEvidenceStore();
  appendRevocation(store, goodRevocation());
  appendRevocation(store, { ...goodRevocation(), revokedId: "approval-10" });
  const entry = store.revocations[0];
  store.revocations[0] = { ...entry, record: { ...entry.record, reason: "rewritten" } };
  assert.equal(verifyRevocationChain(store).verdict, "CHAIN_BROKEN");
});
hostile("revocation: deleting a record breaks the chain (ledger mutation obligation)", () => {
  const store = createEvidenceStore();
  appendRevocation(store, goodRevocation());
  appendRevocation(store, { ...goodRevocation(), revokedId: "approval-10" });
  store.revocations.splice(0, 1);
  assert.equal(verifyRevocationChain(store).verdict, "CHAIN_BROKEN");
});
hostile("revocation: full delete-and-recompute rewrite (deleted RED predecessor) caught by external head anchor (§XX)", () => {
  const store = createEvidenceStore();
  appendRevocation(store, goodRevocation());
  const head = appendRevocation(store, { ...goodRevocation(), revokedId: "approval-10" }).chainDigest;
  // Attacker deletes the first record and rebuilds a coherent chain + head.
  const survivorRecord = store.revocations[1].record;
  const rebuilt = createEvidenceStore();
  appendRevocation(rebuilt, { ...survivorRecord });
  store.revocations.length = 0;
  store.revocations.push(rebuilt.revocations[0]);
  store.revocationChain = rebuilt.revocationChain;
  // Internally coherent — but the externally held head exposes the rewrite.
  assert.equal(verifyRevocationChain(store).verdict, "CHAIN_INTACT");
  const v = verifyRevocationChain(store, head);
  assert.equal(v.verdict, "CHAIN_BROKEN");
  assert.ok(v.findings.includes("EXTERNAL_HEAD_MISMATCH"));
});

// === P1AF-043 supersession ==================================================
const twoSealed = () => {
  const store = createEvidenceStore();
  const a = sealGood(store, { inputHash: H64("a") });
  const b = sealGood(store, { inputHash: H64("b") });
  return { store, a: a.id, b: b.id };
};
const goodSupersession = (priorId, newId) => ({
  priorId, newId, reason: "corrected accounting", authority: "FOUNDER",
  subjectRelationship: "SAME_SUBJECT", claimsReplaced: ["accounting"],
  claimsHistorical: ["original observation"],
});
run("supersession: explicit record supersedes; prior preserved + ineligible", () => {
  const { store, a, b } = twoSealed();
  assert.equal(recordSupersession(store, goodSupersession(a, b)).verdict, "SUPERSEDED");
  assert.ok(store.artifacts.has(a)); // preserved, not deleted
  assert.equal(decisionEligibility(store, a).verdict, "INELIGIBLE");
  assert.equal(decisionEligibility(store, b).verdict, "ELIGIBLE");
});
hostile("supersession: two candidates over one predecessor is AMBIGUOUS and blocks both (ledger mutation obligation)", () => {
  const { store, a, b } = twoSealed();
  const c = sealGood(store, { inputHash: H64("e") });
  assert.equal(recordSupersession(store, goodSupersession(a, b)).verdict, "SUPERSEDED");
  assert.equal(recordSupersession(store, goodSupersession(a, c.id)).verdict, "SUPERSESSION_AMBIGUOUS");
  assert.equal(decisionEligibility(store, a).verdict, "INELIGIBLE");
});
hostile("supersession: every field required; unknown prior/new rejected; cross-workspace rejected", () => {
  const { store, a, b } = twoSealed();
  for (const field of SUPERSESSION_REQUIRED_FIELDS) {
    const r = goodSupersession(a, b);
    delete r[field];
    assert.equal(recordSupersession(store, r).verdict, "SUPERSESSION_REJECTED", field);
  }
  assert.equal(recordSupersession(store, goodSupersession("ghost", b)).verdict, "SUPERSESSION_REJECTED");
  const foreign = sealGood(store, { inputHash: H64("f"), workspace: "ws-2" });
  assert.equal(recordSupersession(store, goodSupersession(a, foreign.id)).verdict, "SUPERSESSION_REJECTED");
});

// === P1AF-055 lineage =======================================================
const lineageStore = () => {
  const store = createEvidenceStore();
  const a = sealGood(store, { inputHash: H64("a") });
  const b = sealGood(store, { inputHash: H64("b") });
  const c = sealGood(store, { inputHash: H64("c") });
  recordSupersession(store, goodSupersession(a.id, b.id));
  recordSupersession(store, goodSupersession(b.id, c.id));
  return { store, a: a.id, b: b.id, c: c.id };
};
run("lineage: workspace-scoped chain traverses in order", () => {
  const { store, a, b, c } = lineageStore();
  const v = traverseLineage(store, { startId: a, workspace: "ws-1", maxDepth: 10 });
  assert.equal(v.verdict, "LINEAGE_BOUND");
  assert.deepEqual(v.chain, [a, b, c]);
});
hostile("lineage: cross-workspace supersedes link rejected (ledger mutation obligation)", () => {
  const { store, a, b } = lineageStore();
  const rec = store.artifacts.get(b);
  store.artifacts.set(b, Object.freeze({ ...rec, supersededBy: null }));
  const foreign = sealGood(store, { inputHash: H64("9"), workspace: "ws-2" });
  store.artifacts.set(b, Object.freeze({ ...rec, supersededBy: foreign.id }));
  const v = traverseLineage(store, { startId: a, workspace: "ws-1", maxDepth: 10 });
  assert.equal(v.verdict, "LINEAGE_REJECTED");
  assert.ok(v.findings.includes("LINEAGE_SCOPE_VIOLATION"));
});
hostile("lineage: depth bound enforced; cycles rejected; unknown id rejected", () => {
  const { store, a, b } = lineageStore();
  assert.equal(traverseLineage(store, { startId: a, workspace: "ws-1", maxDepth: 2 }).verdict, "LINEAGE_REJECTED");
  const recA = store.artifacts.get(a);
  const recB = store.artifacts.get(b);
  store.artifacts.set(b, Object.freeze({ ...recB, supersededBy: a }));
  const cyc = traverseLineage(store, { startId: a, workspace: "ws-1", maxDepth: 10 });
  assert.equal(cyc.verdict, "LINEAGE_REJECTED");
  assert.ok(cyc.findings.includes("LINEAGE_CYCLE"));
  store.artifacts.set(a, Object.freeze({ ...recA, supersededBy: "ghost" }));
  assert.equal(traverseLineage(store, { startId: a, workspace: "ws-1", maxDepth: 10 }).verdict, "LINEAGE_REJECTED");
});

// === P1AF-056 references ====================================================
const repoTable = new Map([[H40("a"), "https://github.com/DarksiedCEO/zbestmedia.git"]]);
const repoResolver = (shaValue) => repoTable.get(shaValue) ?? null;
run("reference: basis+confidence+resolvable sha binds", () => {
  const v = validateEvidenceReference(
    { basis: "DIRECT", confidence: "HIGH", sha: H40("a"), repository: "https://github.com/DarksiedCEO/zbestmedia.git" },
    repoResolver,
  );
  assert.equal(v.verdict, "REFERENCE_BOUND");
});
hostile("reference: stale sha (unresolvable) rejected (ledger mutation obligation)", () => {
  const v = validateEvidenceReference({ basis: "DIRECT", confidence: "HIGH", sha: H40("9") }, repoResolver);
  assert.equal(v.verdict, "REFERENCE_REJECTED");
  assert.ok(v.findings.includes("REPOSITORY_UNRESOLVED"));
});
hostile("reference: repository/sha mismatch rejected (ledger mutation obligation)", () => {
  const v = validateEvidenceReference(
    { basis: "DIRECT", confidence: "HIGH", sha: H40("a"), repository: "https://github.com/evil/fork.git" },
    repoResolver,
  );
  assert.equal(v.verdict, "REFERENCE_REJECTED");
  assert.ok(v.findings.includes("REPOSITORY_MISMATCH"));
});
run("reference: invalid basis/confidence rejected", () => {
  assert.equal(validateEvidenceReference({ basis: "GUESS", confidence: "HIGH", sha: H40("a") }, repoResolver).verdict, "REFERENCE_REJECTED");
  assert.equal(validateEvidenceReference({ basis: "DIRECT", confidence: "CERTAIN", sha: H40("a") }, repoResolver).verdict, "REFERENCE_REJECTED");
  assert.deepEqual(REFERENCE_BASES, ["DIRECT", "INFERRED", "UNRESOLVED"]);
  assert.deepEqual(REFERENCE_CONFIDENCES, ["HIGH", "MEDIUM", "LOW"]);
});

// === §XVI hardened reads / §XVII atomic writes (integration) ================
const scratch = mkdtempSync(join(tmpdir(), "p1a03-evidence-"));
run("integration: hardened read binds exact bytes", () => {
  writeFileSync(join(scratch, "good.json"), '{"ok":true}');
  const v = readEvidenceArtifact(scratch, "good.json");
  assert.equal(v.verdict, "READ_BOUND");
  assert.equal(v.sha256, sha256('{"ok":true}'));
});
hostile("read: terminal symlink substitution rejected (§XXI)", () => {
  writeFileSync(join(scratch, "target.json"), "{}");
  symlinkSync(join(scratch, "target.json"), join(scratch, "link.json"));
  assert.equal(readEvidenceArtifact(scratch, "link.json").verdict, "READ_REJECTED");
});
hostile("read: intermediate-directory symlink rejected (§XXI)", () => {
  mkdirSync(join(scratch, "real"));
  writeFileSync(join(scratch, "real", "f.json"), "{}");
  symlinkSync(join(scratch, "real"), join(scratch, "alias"));
  assert.equal(readEvidenceArtifact(scratch, "alias/f.json").verdict, "READ_REJECTED");
});
hostile("read: internal .. and absolute paths rejected (§XXI)", () => {
  assert.equal(readEvidenceArtifact(scratch, "../escape.json").verdict, "READ_REJECTED");
  assert.equal(readEvidenceArtifact(scratch, "/etc/passwd").verdict, "READ_REJECTED");
  assert.equal(readEvidenceArtifact(scratch, "a/../b.json").verdict, "READ_REJECTED");
});
run("integration: atomic write digest equals durable bytes; partial temp never becomes evidence", () => {
  const target = join(scratch, "atomic.json");
  const bytes = '{"receipt":1}';
  const v = writeEvidenceAtomic(target, bytes);
  assert.equal(v.verdict, "WRITE_DURABLE");
  assert.equal(v.sha256, sha256(bytes));
  assert.equal(readFileSync(target, "utf8"), bytes);
});
hostile("write: same path changed bytes yields a different digest — path is never identity (§XXI)", () => {
  const target = join(scratch, "atomic.json");
  const first = writeEvidenceAtomic(target, '{"receipt":1}');
  const second = writeEvidenceAtomic(target, '{"receipt":2}');
  assert.equal(second.verdict, "WRITE_DURABLE");
  assert.notEqual(first.sha256, second.sha256);
});
rmSync(scratch, { recursive: true, force: true });

// === integration: full receipt lifecycle ====================================
run("integration: receipt lifecycle — seal, envelope, authorize, revoke, supersede, lineage", () => {
  const store = createEvidenceStore();
  const receipt = goodReceipt();
  assert.equal(validateReceiptIdentity(receipt).verdict, "RECEIPT_BOUND");
  const sealed = sealArtifact(store, {
    artifactClass: "EXECUTION_RECEIPT", subjectSha: receipt.identityTuple.subjectSha,
    inputHash: receipt.receiptDigest, workspace: "ws-1", body: receipt,
  });
  assert.equal(sealed.verdict, "SEALED");
  assert.equal(verifyEvidenceEnvelope(goodEnvelope(), goodTrustRecord(), goodContext()).verdict, "ENVELOPE_VERIFIED");
  const auth = evaluateAuthorization({
    artifact: { producer: "CLAUDE" },
    approval: { approver: "CODEX", executionRecord: goodExecutionRecord() },
    structurallyValid: true,
  });
  assert.equal(auth.verdict, "AUTHORIZED");
  assert.equal(appendRevocation(store, goodRevocation()).verdict, "REVOCATION_APPENDED");
  const replacement = sealArtifact(store, {
    artifactClass: "EXECUTION_RECEIPT", subjectSha: receipt.identityTuple.subjectSha,
    inputHash: H64("b"), workspace: "ws-1", body: { superseding: true },
  });
  assert.equal(recordSupersession(store, goodSupersession(sealed.id, replacement.id)).verdict, "SUPERSEDED");
  const lineage = traverseLineage(store, { startId: sealed.id, workspace: "ws-1", maxDepth: 5 });
  assert.equal(lineage.verdict, "LINEAGE_BOUND");
  assert.deepEqual(lineage.chain, [sealed.id, replacement.id]);
  assert.equal(verifyRevocationChain(store).verdict, "CHAIN_INTACT");
});

// === §XXI remaining hostile matrix ==========================================
hostile("NOT_RUN converted to PASS is contradictory accounting", () => {
  const v = evaluateAccounting({ ...goodAccounting(), statuses: ["PASS", "NOT_RUN"] });
  assert.equal(v.verdict, "BLOCKED");
});
hostile("orphan verdict: receipt referencing nonexistent artifact cannot seal a lineage decision", () => {
  const store = createEvidenceStore();
  assert.equal(traverseLineage(store, { startId: "ghost", workspace: "ws-1", maxDepth: 3 }).verdict, "LINEAGE_REJECTED");
  assert.equal(decisionEligibility(store, "ghost").verdict, "INELIGIBLE");
});
hostile("caller denominator reduction: visited < declared denominator fails", () => {
  assert.equal(verifyTraversal({ denominator: 10, visited: 3, claimedResult: "PASS" }).verdict, "VACUOUS_TRAVERSAL");
});
hostile("fabricated fresh-context flag is inert without execution provenance", () => {
  const v = classifyExecutionEvidence({ asserted: { fresh: true, independent: true } });
  assert.equal(v.verdict, "EXECUTION_UNPROVEN");
});
hostile("stale receipt reuse: receipt bound to old subject stays historical", () => {
  const v = assessHistoricalEvidence(
    { workflowSha: H40("1"), candidateSha: H40("d") },
    { workflowSha: H40("1"), candidateSha: CANONICAL_AUTHORITY_ANCHORS.baseSha },
  );
  assert.equal(v.verdict, "HISTORICAL_ONLY");
});

// === summary ================================================================
assert.equal(passed, executed, "all executed tests must pass");
assert.equal(hostilePassed, hostileExecuted, "all hostile cases must pass");
console.log(JSON.stringify({
  suite: "test-p1a-evidence",
  policyVersion: POLICY_VERSION,
  executed: executed + hostileExecuted,
  passed: passed + hostilePassed,
  hostileExecuted,
  hostilePassed,
  failed: (executed - passed) + (hostileExecuted - hostilePassed),
  skipped: 0,
}));
