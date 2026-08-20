// P1A-03 mutation harness. The mutation denominator derives from the module's
// PROPERTY_REGISTER (§XXI): every property has at least one mutant that weakens
// its guard. A mutant is KILLED when at least one invariant probe fails against
// it (or it fails to load). A mutant whose find-pattern is absent from the
// source is an APPLICATION FAILURE (the harness itself fails closed).
// Survivors required: 0.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./validate-p1a-evidence.mjs", import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const H40 = (c) => c.repeat(40);
const H64 = (c) => c.repeat(64);
const BASE = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";

const importSource = async (source) =>
  import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// --- shared fixtures --------------------------------------------------------
const goodExec = () => ({
  command: "node x", workingDirectory: "/w", environmentIdentity: "env",
  toolchainIdentity: "node-24", startedAt: "2026-08-20T21:00:00Z",
  completedAt: "2026-08-20T21:00:05Z", exitCode: 0, outputDigest: H64("a"),
});
const goodTuple = () => ({
  repository: "r", subjectSha: BASE, tree: H40("c"),
  parents: [H40("d")], workflowSha: H40("1"), verifierDigest: H64("2"), artifactDigest: H64("3"),
});
const goodReceipt = (m) => {
  const r = { receiptVersion: m.RECEIPT_SCHEMA_VERSION, receiptClass: "EXECUTION", identityTuple: goodTuple(), verdict: "PASS" };
  r.receiptDigest = m.computeReceiptDigest(r);
  return r;
};
const goodCert = () => ({
  environmentApproval: "a", runId: "r", jobId: "j", workflowSha: H40("1"),
  candidateSha: BASE, artifactDigest: H64("3"), reviewerIdentity: "CODEX",
});
const table = new Map([["scripts/a.mjs", { exists: true, blobSha: H40("a"), lineCount: 100 }]]);
const resolver = ({ path }) => table.get(path) ?? { exists: false };
const goodCitation = () => ({ path: "scripts/a.mjs", subjectSha: BASE, blobSha: H40("a"), lineStart: 1, lineEnd: 50, lineCount: 100 });
const goodTrust = () => ({
  subjectSha: BASE, agent: "agent-1", tenant: "t", workspace: "ws-1", artifact: H64("3"),
  issuer: "i", system: "s", status: "ACTIVE",
  validityWindow: { notBefore: "2026-08-01T00:00:00Z", notAfter: "2026-12-01T00:00:00Z" },
});
const goodEnv = () => ({
  envelopeId: "env-1", subjectSha: BASE, agent: "agent-1", tenant: "t", workspace: "ws-1",
  artifact: H64("3"), issuer: "i", system: "s", issuedAt: "2026-08-15T00:00:00Z",
});
const goodCtx = () => ({
  evaluationTime: "2026-08-20T00:00:00Z", workspace: "ws-1",
  subjectCreatedAt: "2026-08-10T00:00:00Z", consumedEnvelopeIds: new Set(),
});
const goodUpload = (m) => ({
  uploaded: [
    { kind: "SUMMARY_JSON", path: "out/summary.json", sha256: H64("e") },
    { kind: "SUMMARY_DIGEST", path: "out/summary.json.sha256" },
  ],
  cleanup: { condition: "always", removesKinds: [...m.FORBIDDEN_ARTIFACT_KINDS], executionRecord: goodExec() },
});
const goodRevocation = () => ({
  revokedId: "ap-9", subjectSha: BASE, artifactIds: [H64("3")], issuer: "i",
  revokingAuthority: "FOUNDER", reason: "compromised", timestamp: "2026-08-20T21:00:00Z", replacementId: null,
});
const seal = (m, store, inputHash, workspace = "ws-1") => m.sealArtifact(store, {
  artifactClass: "RECEIPT", subjectSha: BASE, inputHash, workspace, body: { inputHash },
});
const goodSup = (priorId, newId) => ({
  priorId, newId, reason: "r", authority: "FOUNDER", subjectRelationship: "SAME_SUBJECT",
  claimsReplaced: ["x"], claimsHistorical: ["y"],
});

// --- invariant probes: each throws when its invariant is violated -----------
const PROBES = {
  p037_raw_log_rejected: (m) => {
    const u = goodUpload(m);
    u.uploaded.push({ kind: "RAW_LOG", path: "out/run.log" });
    const v = m.verifyArtifactUploadPolicy(u);
    assert.equal(v.verdict, "ARTIFACT_POLICY_VIOLATION");
    // The finding class matters: a forbidden kind must be named as FORBIDDEN,
    // not merely fall through as unrecognized.
    assert.ok(v.findings.includes("FORBIDDEN_ARTIFACT:RAW_LOG"));
  },
  p037_cleanup_always: (m) => {
    const u = goodUpload(m);
    u.cleanup.condition = "on_success";
    assert.equal(m.verifyArtifactUploadPolicy(u).verdict, "ARTIFACT_POLICY_VIOLATION");
  },
  p037_good_passes: (m) => assert.equal(m.verifyArtifactUploadPolicy(goodUpload(m)).verdict, "ARTIFACT_POLICY_OK"),
  p038_each_field: (m) => {
    for (const f of m.CERTIFICATION_RECORD_REQUIRED_FIELDS) {
      const r = goodCert();
      delete r[f];
      assert.equal(m.verifyCertificationRecordCompleteness(r).verdict, "RECORD_INCOMPLETE", f);
    }
    assert.ok(m.CERTIFICATION_RECORD_REQUIRED_FIELDS.includes("reviewerIdentity"));
    const empty = goodCert(); empty.reviewerIdentity = "";
    assert.equal(m.verifyCertificationRecordCompleteness(empty).verdict, "RECORD_INCOMPLETE");
  },
  p039_blob_mismatch: (m) => {
    const c = goodCitation(); c.blobSha = H40("f");
    assert.equal(m.verifyCitations([c], resolver).verdict, "CITATIONS_REJECTED");
  },
  p039_impossible_range: (m) => {
    const c = goodCitation(); c.lineEnd = 101;
    assert.equal(m.verifyCitations([c], resolver).verdict, "CITATIONS_REJECTED");
  },
  p040_contradiction_blocks: (m) => {
    const state = { anchors: [H64("d")], citations: [goodCitation()], resolveObject: resolver, exclusions: [], statuses: ["PASS", "FAIL"] };
    const v = m.evaluateAccounting(state);
    assert.equal(v.verdict, "BLOCKED");
    // PASS+FAIL must be reported as the contradiction it is, not only as a
    // generic non-pass state.
    assert.ok(v.findings.includes("CONTRADICTORY_STATUS"));
  },
  p040_not_run_blocks: (m) => {
    const state = { anchors: [H64("d")], citations: [goodCitation()], resolveObject: resolver, exclusions: [], statuses: ["PASS", "NOT_RUN"] };
    assert.equal(m.evaluateAccounting(state).verdict, "BLOCKED");
  },
  p040_missing_anchors_block: (m) => {
    const state = { anchors: [], citations: [goodCitation()], resolveObject: resolver, exclusions: [], statuses: ["PASS"] };
    assert.equal(m.evaluateAccounting(state).verdict, "BLOCKED");
  },
  p040_unsafe_path: (m) => {
    assert.equal(m.isSafeRepoPath("../x"), false);
    assert.equal(m.isSafeRepoPath("a/../b"), false);
  },
  p041_workflow_sha_format: (m) => {
    const r = goodReceipt(m);
    r.identityTuple.workflowSha = "not-a-sha-but-nonempty";
    r.receiptDigest = m.computeReceiptDigest(r);
    assert.equal(m.validateReceiptIdentity(r).verdict, "RECEIPT_REJECTED");
  },
  p041_digest_binds: (m) => {
    const r = goodReceipt(m);
    r.verdict = "FAIL_REWRITTEN_TO_PASS";
    const v = m.validateReceiptIdentity(r);
    assert.equal(v.verdict, "RECEIPT_REJECTED");
    assert.ok(v.findings.includes("RECEIPT_DIGEST_MISMATCH"));
  },
  p041_filename_not_identity: (m) => {
    const r = goodReceipt(m);
    r.identityTuple.filename = "final-v2.json";
    r.receiptDigest = m.computeReceiptDigest(r);
    assert.ok(m.validateReceiptIdentity(r).findings.includes("FILENAME_IN_IDENTITY_TUPLE"));
  },
  p042_replacement_field_required: (m) => {
    const store = m.createEvidenceStore();
    const r = goodRevocation();
    delete r.replacementId;
    assert.equal(m.appendRevocation(store, r).verdict, "REVOCATION_REJECTED");
  },
  p042_chain_mutation_detected: (m) => {
    const store = m.createEvidenceStore();
    m.appendRevocation(store, goodRevocation());
    m.appendRevocation(store, { ...goodRevocation(), revokedId: "ap-10" });
    const e = store.revocations[0];
    store.revocations[0] = { ...e, record: { ...e.record, reason: "rewritten" } };
    const v = m.verifyRevocationChain(store);
    assert.equal(v.verdict, "CHAIN_BROKEN");
    assert.ok(v.findings.includes("ENTRY_MUTATED:0"));
  },
  p042_chain_digest_tamper_detected: (m) => {
    const store = m.createEvidenceStore();
    m.appendRevocation(store, goodRevocation());
    m.appendRevocation(store, { ...goodRevocation(), revokedId: "ap-10" });
    const e = store.revocations[1];
    store.revocations[1] = { ...e, chainDigest: H64("f") };
    const v = m.verifyRevocationChain(store);
    assert.equal(v.verdict, "CHAIN_BROKEN");
    assert.ok(v.findings.includes("CHAIN_MUTATED:1"));
  },
  p042_external_head_detects_rewrite: (m) => {
    const store = m.createEvidenceStore();
    m.appendRevocation(store, goodRevocation());
    const head = m.appendRevocation(store, { ...goodRevocation(), revokedId: "ap-10" }).chainDigest;
    const survivorRecord = store.revocations[1].record;
    const rebuilt = m.createEvidenceStore();
    m.appendRevocation(rebuilt, { ...survivorRecord });
    store.revocations.length = 0;
    store.revocations.push(rebuilt.revocations[0]);
    store.revocationChain = rebuilt.revocationChain;
    const v = m.verifyRevocationChain(store, head);
    assert.equal(v.verdict, "CHAIN_BROKEN");
    assert.ok(v.findings.includes("EXTERNAL_HEAD_MISMATCH"));
  },
  p042_chain_deletion_detected: (m) => {
    const store = m.createEvidenceStore();
    m.appendRevocation(store, goodRevocation());
    m.appendRevocation(store, { ...goodRevocation(), revokedId: "ap-10" });
    store.revocations.splice(0, 1);
    assert.equal(m.verifyRevocationChain(store).verdict, "CHAIN_BROKEN");
  },
  p043_unknown_prior_rejected: (m) => {
    const store = m.createEvidenceStore();
    const b = seal(m, store, H64("b"));
    assert.equal(m.recordSupersession(store, goodSup("ghost", b.id)).verdict, "SUPERSESSION_REJECTED");
  },
  p043_ambiguity_blocks: (m) => {
    const store = m.createEvidenceStore();
    const a = seal(m, store, H64("a"));
    const b = seal(m, store, H64("b"));
    const c = seal(m, store, H64("e"));
    assert.equal(m.recordSupersession(store, goodSup(a.id, b.id)).verdict, "SUPERSEDED");
    assert.equal(m.recordSupersession(store, goodSup(a.id, c.id)).verdict, "SUPERSESSION_AMBIGUOUS");
    assert.equal(m.decisionEligibility(store, a.id).verdict, "INELIGIBLE");
  },
  p044_assertion_never_proof: (m) => {
    const v = m.classifyExecutionEvidence({ asserted: { executed: true, tests_passed: true, mutation_survivors: 0 } });
    assert.equal(v.verdict, "EXECUTION_UNPROVEN");
  },
  p045_empty_denominator: (m) => {
    assert.equal(m.verifyTraversal({ denominator: 0, visited: 0, claimedResult: "PASS" }).verdict, "VACUOUS_TRAVERSAL");
    assert.equal(m.verifyCitations([], resolver).verdict, "VACUOUS_TRAVERSAL");
    assert.equal(m.verifyTraversal({ denominator: 10, visited: 3, claimedResult: "PASS" }).verdict, "VACUOUS_TRAVERSAL");
  },
  p046_unparseable_blocks: (m) => {
    const v = m.parseExclusions([{ kind: "GLOB_MAYBE", path: "x", reason: "r" }]);
    assert.equal(v.verdict, "EXCLUSIONS_REJECTED");
    assert.equal(v.accepted.length, 0);
  },
  p047_historical_scope: (m) => {
    const v = m.assessHistoricalEvidence(
      { workflowSha: H40("1"), candidateSha: H40("2") },
      { workflowSha: H40("1"), candidateSha: BASE },
    );
    assert.equal(v.verdict, "HISTORICAL_ONLY");
  },
  p048_runtime_needs_execution: (m) => {
    assert.equal(m.assessRuntimeClaim({ kind: "RUNTIME", evidenceBasis: "RUNTIME_EXECUTION" }).verdict, "RUNTIME_OVERCLAIM_REJECTED");
    const cfg = m.assessRuntimeClaim({ kind: "RUNTIME", evidenceBasis: "CONFIGURATION", executionRecord: goodExec() });
    assert.equal(cfg.verdict, "RUNTIME_OVERCLAIM_REJECTED");
    // Configuration must be named as a non-execution basis, not merely fall
    // through as an unrecognized string.
    assert.ok(cfg.findings.includes("NON_EXECUTION_BASIS"));
  },
  p049_production_needs_deployment: (m) => {
    assert.equal(m.assessProductionClaim({ kind: "PRODUCTION_HEALTH", specification: "planned" }).verdict, "PRODUCTION_OVERCLAIM_REJECTED");
    assert.equal(m.assessProductionClaim({ kind: "LIVE_DATA" }).verdict, "PRODUCTION_OVERCLAIM_REJECTED");
  },
  p050_field_mismatch: (m) => {
    const e = goodEnv(); e.agent = "tampered";
    assert.equal(m.verifyEvidenceEnvelope(e, goodTrust(), goodCtx()).verdict, "ENVELOPE_REJECTED");
  },
  p050_rejection_classes: (m) => {
    const dup = goodCtx(); dup.consumedEnvelopeIds.add("env-1");
    assert.ok(m.verifyEvidenceEnvelope(goodEnv(), goodTrust(), dup).findings.includes("DUPLICATE"));
    const rev = goodTrust(); rev.status = "REVOKED";
    assert.ok(m.verifyEvidenceEnvelope(goodEnv(), rev, goodCtx()).findings.includes("REVOKED"));
    const exp = goodCtx(); exp.evaluationTime = "2027-01-01T00:00:00Z";
    assert.ok(m.verifyEvidenceEnvelope(goodEnv(), goodTrust(), exp).findings.includes("EXPIRED"));
    const fut = goodEnv(); fut.issuedAt = "2026-09-01T00:00:00Z";
    assert.ok(m.verifyEvidenceEnvelope(fut, goodTrust(), goodCtx()).findings.includes("FUTURE_DATED"));
    const pre = goodEnv(); pre.issuedAt = "2026-08-01T00:00:00Z";
    assert.ok(m.verifyEvidenceEnvelope(pre, goodTrust(), goodCtx()).findings.includes("PRE_SUBJECT"));
  },
  p051_env_not_identity: (m) => {
    assert.equal(m.verifyIdentitySource({ envCandidateSha: H40("9") }).verdict, "IDENTITY_UNPROVEN");
    assert.equal(m.verifyIdentitySource({ envCandidateSha: H40("9"), observedHeadSha: BASE }).verdict, "IDENTITY_REJECTED");
  },
  p052_no_self_promotion: (m) => {
    const v = m.evaluateAuthorization({
      artifact: { producer: "CLAUDE" },
      approval: { approver: "CLAUDE", executionRecord: goodExec() },
      structurallyValid: true,
    });
    assert.equal(v.verdict, "SELF_PROMOTION_REJECTED");
  },
  p052_schema_not_authority: (m) => {
    assert.equal(m.evaluateAuthorization({ artifact: { producer: "C" }, approval: null, structurallyValid: true }).verdict, "STRUCTURALLY_VALID");
  },
  p053_missing_blocks: (m) => {
    assert.equal(m.decideOnEvidence({ required: ["STATIC", "UNIT"], present: ["STATIC"] }).verdict, "BLOCKED");
  },
  p054_sealed_immutable: (m) => {
    const store = m.createEvidenceStore();
    const s = seal(m, store, H64("c"));
    assert.equal(m.updateArtifact(store, s.id).verdict, "SEALED_IMMUTABLE");
  },
  p054_deterministic_id: (m) => {
    const a = m.deterministicArtifactId({ artifactClass: "R", subjectSha: BASE, inputHash: H64("c") });
    const b = m.deterministicArtifactId({ artifactClass: "R", subjectSha: BASE, inputHash: H64("d") });
    assert.notEqual(a, b);
  },
  p055_workspace_scoped: (m) => {
    const store = m.createEvidenceStore();
    const a = seal(m, store, H64("a"));
    const foreign = seal(m, store, H64("9"), "ws-2");
    const rec = store.artifacts.get(a.id);
    store.artifacts.set(a.id, Object.freeze({ ...rec, supersededBy: foreign.id }));
    const v = m.traverseLineage(store, { startId: a.id, workspace: "ws-1", maxDepth: 10 });
    assert.equal(v.verdict, "LINEAGE_REJECTED");
    assert.ok(v.findings.includes("LINEAGE_SCOPE_VIOLATION"));
  },
  p055_depth_bounded: (m) => {
    const store = m.createEvidenceStore();
    const a = seal(m, store, H64("a"));
    const b = seal(m, store, H64("b"));
    const c = seal(m, store, H64("e"));
    m.recordSupersession(store, goodSup(a.id, b.id));
    m.recordSupersession(store, goodSup(b.id, c.id));
    assert.equal(m.traverseLineage(store, { startId: a.id, workspace: "ws-1", maxDepth: 2 }).verdict, "LINEAGE_REJECTED");
  },
  p056_basis_required: (m) => {
    const repoResolver = (s) => (s === H40("a") ? "repo" : null);
    assert.equal(m.validateEvidenceReference({ basis: "GUESS", confidence: "HIGH", sha: H40("a") }, repoResolver).verdict, "REFERENCE_REJECTED");
  },
  p056_repository_resolution: (m) => {
    const repoResolver = (s) => (s === H40("a") ? "repo" : null);
    assert.equal(m.validateEvidenceReference({ basis: "DIRECT", confidence: "HIGH", sha: H40("9") }, repoResolver).verdict, "REFERENCE_REJECTED");
    assert.equal(m.validateEvidenceReference({ basis: "DIRECT", confidence: "HIGH", sha: H40("a"), repository: "evil" }, repoResolver).verdict, "REFERENCE_REJECTED");
  },
  pxvi_symlink_rejected: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a03-mut-"));
    try {
      writeFileSync(join(dir, "t.json"), "{}");
      symlinkSync(join(dir, "t.json"), join(dir, "l.json"));
      assert.equal(m.readEvidenceArtifact(dir, "l.json").verdict, "READ_REJECTED");
      mkdirSync(join(dir, "real"));
      writeFileSync(join(dir, "real", "f.json"), "{}");
      symlinkSync(join(dir, "real"), join(dir, "alias"));
      assert.equal(m.readEvidenceArtifact(dir, "alias/f.json").verdict, "READ_REJECTED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  pxvi_traversal_rejected: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a03-mut-"));
    try {
      mkdirSync(join(dir, "inner"));
      writeFileSync(join(dir, "outside.json"), "{}");
      assert.equal(m.readEvidenceArtifact(join(dir, "inner"), "../outside.json").verdict, "READ_REJECTED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  pxvii_atomic_durable: (m) => {
    const dir = mkdtempSync(join(tmpdir(), "p1a03-mut-"));
    try {
      const target = join(dir, "e.json");
      const v = m.writeEvidenceAtomic(target, '{"x":1}');
      assert.equal(v.verdict, "WRITE_DURABLE");
      assert.equal(v.sha256, sha256('{"x":1}'));
      assert.equal(readFileSync(target, "utf8"), '{"x":1}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  pxxi_temporal_order: (m) => {
    assert.equal(m.verifyTemporalOrder({ evidenceCreatedAt: "2026-08-20T20:59:59Z", executionStartedAt: "2026-08-20T21:00:00Z" }).verdict, "TEMPORAL_CONTRADICTION");
  },
};

// --- mutants: property -> guard-weakening source transformations ------------
const MUTANTS = [
  { property: "P037_FORBIDDEN_ARTIFACT_REJECTED", find: "FORBIDDEN_ARTIFACT_KINDS.includes(u.kind)", replace: "false" },
  { property: "P037_CLEANUP_ALWAYS_REQUIRED", find: 'cleanup.condition !== "always"', replace: "false" },
  { property: "P038_EVERY_FIELD_REQUIRED", find: '"artifactDigest", "reviewerIdentity",', replace: '"artifactDigest",' },
  { property: "P038_EVERY_FIELD_REQUIRED", find: 'v === undefined || v === null || v === ""', replace: "v === undefined", all: true },
  { property: "P039_BLOB_MISMATCH_REJECTED", find: "resolved.blobSha !== c.blobSha", replace: "false" },
  { property: "P039_IMPOSSIBLE_RANGE_REJECTED", find: "end > resolved.lineCount", replace: "false" },
  { property: "P040_MATRIX_FAILS_CLOSED", find: 'statuses.some((s) => s === "FAIL" || s === "RED" || s === "BLOCK")', replace: "false" },
  { property: "P040_MATRIX_FAILS_CLOSED", find: 'statuses.some((s) => s !== "PASS")', replace: "false" },
  { property: "P040_MATRIX_FAILS_CLOSED", find: "!Array.isArray(anchors) || anchors.length === 0", replace: "false" },
  { property: "P040_UNSAFE_PATH_REJECTED", find: 'segments.some((s) => s === "" || s === "." || s === "..")', replace: "false" },
  { property: "P041_FULL_TUPLE_REQUIRED", find: 'field === "subjectSha" || field === "tree" || field === "workflowSha"', replace: 'field === "subjectSha" || field === "tree"' },
  { property: "P041_DIGEST_BINDS_CONTENT", find: "computeReceiptDigest(receipt) !== receipt.receiptDigest", replace: "false" },
  { property: "P041_FILENAME_NOT_IDENTITY", find: '("filename" in tuple || "path" in tuple)', replace: "false" },
  { property: "P042_REVOCATION_FIELDS_REQUIRED", find: '!("replacementId" in record)', replace: "false" },
  { property: "P042_CHAIN_DETECTS_MUTATION", find: "entry.entryDigest !== expectedEntry", replace: "false" },
  { property: "P042_CHAIN_DETECTS_MUTATION", find: "entry.chainDigest !== expectedChain", replace: "false" },
  { property: "P043_SUPERSESSION_EXPLICIT", find: 'if (!prior) return { verdict: "SUPERSESSION_REJECTED", findings: ["PRIOR_UNKNOWN"] };', replace: "" },
  { property: "P043_AMBIGUITY_BLOCKS", find: "candidates.length > 1", replace: "false", all: true },
  { property: "P044_ASSERTION_NEVER_PROOF", find: 'findings.push("EXECUTION_RECORD_MISSING");', replace: ";" },
  { property: "P045_EMPTY_DENOMINATOR_BLOCKS", find: 'if (denominator === 0) findings.push("EMPTY_DENOMINATOR");', replace: ";" },
  { property: "P045_EMPTY_DENOMINATOR_BLOCKS", find: "citations.length === 0", replace: "false" },
  { property: "P045_EMPTY_DENOMINATOR_BLOCKS", find: 'if (visited !== denominator) findings.push("VISITED_DENOMINATOR_MISMATCH");', replace: ";" },
  { property: "P046_UNPARSEABLE_EXCLUSION_BLOCKS", find: "!RECOGNIZED_EXCLUSION_KINDS.includes(e.kind)", replace: "false" },
  { property: "P047_HISTORICAL_SCOPE_ENFORCED", find: "evidence.workflowSha !== currentSubject.workflowSha\n    || evidence.candidateSha !== currentSubject.candidateSha", replace: "false" },
  { property: "P048_RUNTIME_NEEDS_EXECUTION", find: 'execution.verdict !== "EXECUTION_OBSERVED"', replace: "false" },
  { property: "P048_RUNTIME_NEEDS_EXECUTION", find: 'basis === "CONFIGURATION" || basis === "SPECIFICATION" || basis === undefined || basis === null', replace: "false" },
  { property: "P049_PRODUCTION_NEEDS_DEPLOYMENT", find: 'classifyExecutionEvidence(dep).verdict !== "EXECUTION_OBSERVED"', replace: "false" },
  { property: "P049_PRODUCTION_NEEDS_DEPLOYMENT", find: 'classifyExecutionEvidence(db).verdict !== "EXECUTION_OBSERVED"', replace: "false" },
  { property: "P050_ENVELOPE_EXACT_MATCH", find: "envelope[field] === undefined || envelope[field] !== trustRecord[field]", replace: "false" },
  { property: "P050_REJECTION_CLASSES_TOTAL", find: 'if (context.evaluationTime > vw.notAfter) findings.push("EXPIRED");', replace: ";" },
  { property: "P050_REJECTION_CLASSES_TOTAL", find: 'if (trustRecord.status === "REVOKED") findings.push("REVOKED");', replace: ";" },
  { property: "P050_REJECTION_CLASSES_TOTAL", find: 'if (envelope.issuedAt > context.evaluationTime) findings.push("FUTURE_DATED");', replace: ";" },
  { property: "P050_REJECTION_CLASSES_TOTAL", find: "context.consumedEnvelopeIds.has(envelope.envelopeId)", replace: "false" },
  { property: "P051_ENV_VAR_NOT_IDENTITY", find: "envCandidateSha !== observedHeadSha", replace: "false" },
  { property: "P051_ENV_VAR_NOT_IDENTITY", find: '!HEX40.test(observedHeadSha ?? "")', replace: "false" },
  { property: "P052_NO_SELF_PROMOTION", find: "approval.approver === artifact.producer", replace: "false" },
  { property: "P052_SCHEMA_IS_NOT_AUTHORITY", find: 'return { verdict: "STRUCTURALLY_VALID", findings: ["APPROVAL_ABSENT"] };', replace: 'return { verdict: "AUTHORIZED", findings: [] };' },
  { property: "P053_MISSING_EVIDENCE_BLOCKS", find: "const missing = required.filter((r) => !presentSet.has(r));", replace: "const missing = [];" },
  { property: "P054_SEALED_IMMUTABLE", find: "existing.sealed === true", replace: "false" },
  { property: "P054_DETERMINISTIC_ID", find: "return digestOf({ artifactClass, subjectSha, inputHash });", replace: "return digestOf({ artifactClass, subjectSha });" },
  { property: "P055_WORKSPACE_SCOPED", find: "artifact.workspace !== workspace", replace: "false" },
  { property: "P055_DEPTH_BOUNDED", find: "depth >= maxDepth", replace: "false" },
  { property: "P056_BASIS_CONFIDENCE_REQUIRED", find: "!REFERENCE_BASES.includes(ref.basis)", replace: "false" },
  { property: "P056_REPOSITORY_RESOLUTION_REQUIRED", find: '!isNonEmptyString(repo)) findings.push("REPOSITORY_UNRESOLVED");', replace: 'false) findings.push("REPOSITORY_UNRESOLVED");' },
  { property: "P056_REPOSITORY_RESOLUTION_REQUIRED", find: "isNonEmptyString(ref.repository) && ref.repository !== repo", replace: "false" },
  { property: "PXVI_SYMLINK_REJECTED", find: "constants.O_RDONLY | constants.O_NOFOLLOW", replace: "constants.O_RDONLY" },
  // NOTE (adjudicated-equivalent, removed): mutating the intermediate check
  // `st.isSymbolicLink() || !st.isDirectory()` to `!st.isDirectory()` is a
  // semantically EQUIVALENT mutant: lstat never reports a symlink as a
  // directory, so `!st.isDirectory()` alone still rejects intermediate
  // symlinks. The isSymbolicLink() term is retained in source for explicitness
  // of intent, not as an independent guard.
  { property: "PXVI_TRAVERSAL_REJECTED", find: "if (!isSafeRepoPath(relativePath)) {\n    return { verdict: \"READ_REJECTED\", findings: [\"UNSAFE_PATH\"], bytes: null, sha256: null };\n  }", replace: "" },
  { property: "PXVII_DIGEST_IS_DURABLE_BYTES", find: "renameSync(tempPath, targetPath);", replace: ";" },
  { property: "PXVII_DIGEST_IS_DURABLE_BYTES", find: "sha256: readBack.sha256", replace: 'sha256: "0".repeat(64)' },
  { property: "PXXI_TEMPORAL_ORDER_ENFORCED", find: "evidenceCreatedAt < executionStartedAt", replace: "false" },
];

// --- harness ----------------------------------------------------------------
const pristine = await importSource(SOURCE);

// Control: every probe must pass on the pristine module.
for (const [name, probe] of Object.entries(PROBES)) {
  probe(pristine);
  console.log(`CONTROL PASS ${name}`);
}

// Denominator law: every register property must have at least one mutant.
const registerIds = new Set(pristine.PROPERTY_REGISTER.map((p) => p.id));
const mutatedIds = new Set(MUTANTS.map((m) => m.property));
const uncovered = [...registerIds].filter((id) => !mutatedIds.has(id));
assert.deepEqual(uncovered, [], `properties without mutants: ${uncovered.join(",")}`);
const unknown = [...mutatedIds].filter((id) => !registerIds.has(id));
assert.deepEqual(unknown, [], `mutants for unregistered properties: ${unknown.join(",")}`);

let killed = 0;
const survivors = [];
for (const [i, mutant] of MUTANTS.entries()) {
  assert.ok(SOURCE.includes(mutant.find), `mutant ${i} (${mutant.property}) pattern absent — application failure`);
  const mutatedSource = mutant.all
    ? SOURCE.split(mutant.find).join(mutant.replace)
    : SOURCE.replace(mutant.find, mutant.replace);
  assert.notEqual(mutatedSource, SOURCE, `mutant ${i} produced identical source`);
  let module = null;
  let dead = false;
  try {
    module = await importSource(mutatedSource);
  } catch {
    dead = true; // failed to load = killed
  }
  if (!dead) {
    let anyProbeFailed = false;
    for (const probe of Object.values(PROBES)) {
      try {
        probe(module);
      } catch {
        anyProbeFailed = true;
        break;
      }
    }
    dead = anyProbeFailed;
  }
  if (dead) {
    killed += 1;
    console.log(`KILLED mutant ${i} [${mutant.property}]`);
  } else {
    survivors.push({ index: i, property: mutant.property, find: mutant.find });
    console.log(`SURVIVED mutant ${i} [${mutant.property}]`);
  }
}

console.log(JSON.stringify({
  suite: "test-p1a-evidence-mutation",
  propertyDenominator: registerIds.size,
  mutantDenominator: MUTANTS.length,
  probes: Object.keys(PROBES).length,
  killed,
  survivors: survivors.length,
  survivorDetail: survivors,
}));
assert.equal(survivors.length, 0, "unexplained mutation survivors present");
