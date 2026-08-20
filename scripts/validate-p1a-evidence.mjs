// P1A-03 — Evidence / Provenance / Execution Receipts.
// Frozen requirements: P1AF-037..056 (ledger f1010f1b…, denominator 124).
// Governing law: a receipt is not proof because it exists. Every consequential
// claim must bind to actual, subject-bound, execution-bound evidence. Every
// verdict here fails closed: missing, unknown, malformed, or caller-asserted
// evidence is rejected or downgraded, never defaulted to success.

import { createHash } from "node:crypto";
import {
  openSync, readSync, writeSync, fsyncSync, closeSync, fstatSync, lstatSync,
  renameSync, mkdtempSync, constants,
} from "node:fs";
import { dirname, basename, join, sep, isAbsolute } from "node:path";

export const POLICY_VERSION = "P1A_EVIDENCE_POLICY_V1";
export const RECEIPT_SCHEMA_VERSION = "P1A_RECEIPT_V1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

export const CANONICAL_AUTHORITY_ANCHORS = Object.freeze({
  frozenLedgerSha256: "f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf",
  founderFreezeSha256: "f684817a9f01875a04967c93410c265f033b774bdfd98e192616ffa1303f247a",
  releaseAuthoritySha256: "bf7cfcddcd5e78f07658461f5a32cc3e641049dbf5b06b54f34d99f91ff7e50e",
  activeStateSha256: "ccfa4a460800612c9d7347b327e52edbc83f8190850ce8e4509f902404c294d9",
  baseSha: "b0c1b2129123b941c6a350c16dae0ae3a8e076ca",
  baseTree: "c8fe6f31288bffcf1b8c35a825c60c6a5d31703d",
  requirementDenominator: 124,
});

// Canonical deterministic serialization: sorted object keys, no whitespace.
// Digest identity for every evidence object derives from these bytes only.
export function canonicalJson(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  // undefined, functions, symbols have no canonical evidence form: fail closed.
  throw new Error(`NON_CANONICALIZABLE_VALUE:${typeof value}`);
}

export const digestOf = (value) => sha256(canonicalJson(value));

// ---------------------------------------------------------------------------
// P1AF-041 — receipt identity tuple. Filename-only or partial binding is
// prohibited; identity is the full tuple plus the content digest.
// ---------------------------------------------------------------------------
export const IDENTITY_TUPLE_FIELDS = Object.freeze([
  "repository", "subjectSha", "tree", "parents", "workflowSha",
  "verifierDigest", "artifactDigest",
]);

export function computeReceiptDigest(receipt) {
  const { receiptDigest: _omit, ...rest } = receipt;
  return digestOf(rest);
}

export function validateReceiptIdentity(receipt) {
  const findings = [];
  if (typeof receipt !== "object" || receipt === null) {
    return { verdict: "RECEIPT_REJECTED", findings: ["RECEIPT_NOT_OBJECT"] };
  }
  if (receipt.receiptVersion !== RECEIPT_SCHEMA_VERSION) findings.push("RECEIPT_VERSION_INVALID");
  const tuple = receipt.identityTuple;
  if (typeof tuple !== "object" || tuple === null) {
    findings.push("IDENTITY_TUPLE_MISSING");
  } else {
    for (const field of IDENTITY_TUPLE_FIELDS) {
      const v = tuple[field];
      if (field === "parents") {
        if (!Array.isArray(v) || v.some((p) => !HEX40.test(p ?? ""))) {
          findings.push("IDENTITY_FIELD_INVALID:parents");
        }
      } else if (field === "subjectSha" || field === "tree" || field === "workflowSha") {
        if (!HEX40.test(v ?? "")) findings.push(`IDENTITY_FIELD_INVALID:${field}`);
      } else if (field === "verifierDigest" || field === "artifactDigest") {
        if (!HEX64.test(v ?? "")) findings.push(`IDENTITY_FIELD_INVALID:${field}`);
      } else if (!isNonEmptyString(v)) {
        findings.push(`IDENTITY_FIELD_INVALID:${field}`);
      }
    }
  }
  // Filename is presentation metadata, never identity: its presence inside the
  // identity tuple is itself a binding defect.
  if (tuple && ("filename" in tuple || "path" in tuple)) findings.push("FILENAME_IN_IDENTITY_TUPLE");
  if (!HEX64.test(receipt.receiptDigest ?? "")) {
    findings.push("RECEIPT_DIGEST_MISSING");
  } else if (computeReceiptDigest(receipt) !== receipt.receiptDigest) {
    findings.push("RECEIPT_DIGEST_MISMATCH");
  }
  return findings.length === 0
    ? { verdict: "RECEIPT_BOUND", findings }
    : { verdict: "RECEIPT_REJECTED", findings };
}

// Two receipts are the same evidence object iff their content digests match;
// they are distinct evidence objects iff their identity tuples or content
// differ. A filename difference alone distinguishes nothing.
export function receiptsDistinct(a, b) {
  const va = validateReceiptIdentity(a);
  const vb = validateReceiptIdentity(b);
  if (va.verdict !== "RECEIPT_BOUND" || vb.verdict !== "RECEIPT_BOUND") {
    return { verdict: "RECEIPT_REJECTED", distinct: null, findings: [...va.findings, ...vb.findings] };
  }
  return {
    verdict: "COMPARED",
    distinct: computeReceiptDigest(a) !== computeReceiptDigest(b),
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// P1AF-038 — certification-record completeness.
// ---------------------------------------------------------------------------
export const CERTIFICATION_RECORD_REQUIRED_FIELDS = Object.freeze([
  "environmentApproval", "runId", "jobId", "workflowSha", "candidateSha",
  "artifactDigest", "reviewerIdentity",
]);

export function verifyCertificationRecordCompleteness(record) {
  const findings = [];
  if (typeof record !== "object" || record === null) {
    return { verdict: "RECORD_INCOMPLETE", findings: ["RECORD_NOT_OBJECT"] };
  }
  for (const field of CERTIFICATION_RECORD_REQUIRED_FIELDS) {
    const v = record[field];
    if (v === undefined || v === null || v === "") findings.push(`FIELD_MISSING:${field}`);
  }
  return findings.length === 0
    ? { verdict: "RECORD_COMPLETE", findings }
    : { verdict: "RECORD_INCOMPLETE", findings };
}

// ---------------------------------------------------------------------------
// P1AF-040 / §XVI — safe repository paths. Lexical law: relative, normalized,
// no traversal, no alternate separators, no NUL, no empty segments.
// ---------------------------------------------------------------------------
export function isSafeRepoPath(path) {
  if (!isNonEmptyString(path)) return false;
  if (path.includes("\0") || path.includes("\\")) return false;
  if (isAbsolute(path)) return false;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// P1AF-039 — citation ↔ immutable git object binding. The resolver answers for
// exact (subjectSha, path): { exists, blobSha, lineCount } from git objects
// only. Caller-supplied blob/line values are claims to verify, never truth.
// ---------------------------------------------------------------------------
export function verifyCitations(citations, resolveObject) {
  if (!Array.isArray(citations)) {
    return { verdict: "CITATIONS_REJECTED", findings: ["CITATIONS_NOT_ARRAY"], denominator: 0 };
  }
  if (typeof resolveObject !== "function") {
    return { verdict: "CITATIONS_REJECTED", findings: ["RESOLVER_MISSING"], denominator: 0 };
  }
  if (citations.length === 0) {
    // P1AF-045: an empty check set can never report pass.
    return { verdict: "VACUOUS_TRAVERSAL", findings: ["EMPTY_DENOMINATOR"], denominator: 0 };
  }
  const findings = [];
  citations.forEach((c, i) => {
    const tag = (f) => findings.push(`${f}:${i}`);
    if (typeof c !== "object" || c === null) return tag("CITATION_NOT_OBJECT");
    if (!isSafeRepoPath(c.path)) tag("UNSAFE_PATH");
    if (!HEX40.test(c.blobSha ?? "")) tag("BLOB_SHA_INVALID");
    const start = c.lineStart, end = c.lineEnd;
    const validInt = (n) => Number.isInteger(n) && n >= 1;
    if (!validInt(start) || !validInt(end) || start > end) tag("RANGE_INVALID");
    let resolved;
    try {
      resolved = resolveObject({ path: c.path, subjectSha: c.subjectSha });
    } catch {
      resolved = null;
    }
    if (!resolved || resolved.exists !== true) return tag("OBJECT_MISSING");
    if (resolved.blobSha !== c.blobSha) tag("BLOB_MISMATCH");
    if (!Number.isInteger(resolved.lineCount)) tag("LINECOUNT_UNRESOLVED");
    else if (validInt(start) && validInt(end) && end > resolved.lineCount) tag("RANGE_IMPOSSIBLE");
    if (Number.isInteger(c.lineCount) && c.lineCount !== resolved.lineCount) tag("LINECOUNT_MISMATCH");
  });
  return findings.length === 0
    ? { verdict: "CITATIONS_BOUND", findings, denominator: citations.length }
    : { verdict: "CITATIONS_REJECTED", findings, denominator: citations.length };
}

// ---------------------------------------------------------------------------
// P1AF-045 — vacuous traversal law. P1AF-046 — exclusions fail closed.
// ---------------------------------------------------------------------------
export function verifyTraversal({ denominator, visited, claimedResult }) {
  const findings = [];
  if (!Number.isInteger(denominator) || denominator < 0) findings.push("DENOMINATOR_INVALID");
  if (!Number.isInteger(visited) || visited < 0) findings.push("VISITED_INVALID");
  if (findings.length === 0) {
    if (denominator === 0) findings.push("EMPTY_DENOMINATOR");
    if (visited !== denominator) findings.push("VISITED_DENOMINATOR_MISMATCH");
  }
  if (findings.length > 0) return { verdict: "VACUOUS_TRAVERSAL", findings };
  if (claimedResult !== "PASS") return { verdict: "NON_PASS_PRESERVED", findings: [] };
  return { verdict: "TRAVERSAL_ACCOUNTED", findings: [] };
}

export const RECOGNIZED_EXCLUSION_KINDS = Object.freeze(["EXACT_PATH", "DIRECTORY_PREFIX"]);

export function parseExclusions(entries) {
  if (!Array.isArray(entries)) {
    return { verdict: "EXCLUSIONS_REJECTED", findings: ["EXCLUSIONS_NOT_ARRAY"], accepted: [] };
  }
  const findings = [];
  const accepted = [];
  entries.forEach((e, i) => {
    if (typeof e !== "object" || e === null
      || !RECOGNIZED_EXCLUSION_KINDS.includes(e.kind)
      || !isSafeRepoPath(e.path)
      || !isNonEmptyString(e.reason)) {
      findings.push(`EXCLUSION_UNPARSEABLE:${i}`);
      return;
    }
    accepted.push(Object.freeze({ kind: e.kind, path: e.path, reason: e.reason }));
  });
  // One unparseable entry poisons the whole exclusion set: silently skipping an
  // unknown exclusion is exactly the failure class this lane exists to defeat.
  return findings.length === 0
    ? { verdict: "EXCLUSIONS_PARSED", findings, accepted }
    : { verdict: "EXCLUSIONS_REJECTED", findings, accepted: [] };
}

// ---------------------------------------------------------------------------
// P1AF-040 — fail-closed accounting matrix.
// ---------------------------------------------------------------------------
export function evaluateAccounting(state) {
  const findings = [];
  if (typeof state !== "object" || state === null) {
    return { verdict: "BLOCKED", findings: ["ACCOUNTING_STATE_MISSING"] };
  }
  const anchors = state.anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) findings.push("MISSING_ANCHORS");
  else if (anchors.some((a) => !HEX64.test(a ?? ""))) findings.push("MISSING_ANCHORS");
  const citation = verifyCitations(state.citations, state.resolveObject);
  if (citation.verdict !== "CITATIONS_BOUND") findings.push(`CITATION_LAYER:${citation.verdict}`);
  const exclusions = parseExclusions(state.exclusions ?? []);
  if (exclusions.verdict !== "EXCLUSIONS_PARSED") findings.push("EXCLUSIONS_REJECTED");
  if (state.declaredScope !== undefined && state.observedScope !== undefined
    && digestOf(state.declaredScope) !== digestOf(state.observedScope)) {
    findings.push("EXPANDED_SCOPE");
  }
  const statuses = Array.isArray(state.statuses) ? state.statuses : null;
  if (!statuses) findings.push("STATUSES_MISSING");
  else {
    if (statuses.includes("PASS") && statuses.some((s) => s === "FAIL" || s === "RED" || s === "BLOCK")) {
      findings.push("CONTRADICTORY_STATUS");
    }
    if (statuses.some((s) => s !== "PASS")) findings.push("NON_PASS_ACCOUNTING");
  }
  return findings.length === 0
    ? { verdict: "ACCOUNTING_PASS", findings }
    : { verdict: "BLOCKED", findings };
}

// ---------------------------------------------------------------------------
// P1AF-044 / P1AF-048 / P1AF-049 / §XI — execution proof and overclaim law.
// Declared execution is not observed execution. Caller-asserted flags are
// inert; only an execution record with binding fields proves execution.
// ---------------------------------------------------------------------------
export const EXECUTION_RECORD_REQUIRED_FIELDS = Object.freeze([
  "command", "workingDirectory", "environmentIdentity", "toolchainIdentity",
  "startedAt", "completedAt", "exitCode", "outputDigest",
]);

export const ASSERTED_ONLY_FLAGS = Object.freeze([
  "executed", "fresh", "independent", "tests_passed", "all_passed", "mutation_survivors",
]);

export function classifyExecutionEvidence(claim) {
  if (typeof claim !== "object" || claim === null) {
    return { verdict: "EXECUTION_UNPROVEN", findings: ["CLAIM_MISSING"] };
  }
  const record = claim.executionRecord;
  const findings = [];
  if (typeof record !== "object" || record === null) {
    findings.push("EXECUTION_RECORD_MISSING");
  } else {
    for (const field of EXECUTION_RECORD_REQUIRED_FIELDS) {
      const v = record[field];
      if (v === undefined || v === null || v === "") findings.push(`EXECUTION_FIELD_MISSING:${field}`);
    }
    if (record && typeof record.startedAt === "string" && typeof record.completedAt === "string"
      && record.completedAt < record.startedAt) {
      findings.push("EXECUTION_TIME_INVERTED");
    }
    if (record && record.outputDigest !== undefined && !HEX64.test(record.outputDigest ?? "")) {
      findings.push("OUTPUT_DIGEST_INVALID");
    }
  }
  // Asserted flags never substitute for the record — their presence without a
  // complete record is itself a finding (fabricated-execution signature).
  const asserted = claim.asserted;
  if (findings.length > 0 && typeof asserted === "object" && asserted !== null
    && ASSERTED_ONLY_FLAGS.some((f) => f in asserted)) {
    findings.push("ASSERTED_WITHOUT_EXECUTION");
  }
  return findings.length === 0
    ? { verdict: "EXECUTION_OBSERVED", findings }
    : { verdict: "EXECUTION_UNPROVEN", findings };
}

// §XXI — evidence emitted before claimed execution is a temporal contradiction.
export function verifyTemporalOrder({ evidenceCreatedAt, executionStartedAt }) {
  if (!isNonEmptyString(evidenceCreatedAt) || !isNonEmptyString(executionStartedAt)) {
    return { verdict: "TEMPORAL_UNPROVEN", findings: ["TIMESTAMP_MISSING"] };
  }
  if (evidenceCreatedAt < executionStartedAt) {
    return { verdict: "TEMPORAL_CONTRADICTION", findings: ["EVIDENCE_BEFORE_EXECUTION"] };
  }
  return { verdict: "TEMPORAL_CONSISTENT", findings: [] };
}

export function assessRuntimeClaim(claim) {
  if (typeof claim !== "object" || claim === null || claim.kind !== "RUNTIME") {
    return { verdict: "RUNTIME_OVERCLAIM_REJECTED", findings: ["CLAIM_KIND_INVALID"] };
  }
  const basis = claim.evidenceBasis;
  if (basis === "CONFIGURATION" || basis === "SPECIFICATION" || basis === undefined || basis === null) {
    return { verdict: "RUNTIME_OVERCLAIM_REJECTED", findings: ["NON_EXECUTION_BASIS"] };
  }
  if (basis !== "RUNTIME_EXECUTION") {
    return { verdict: "RUNTIME_OVERCLAIM_REJECTED", findings: [`UNRECOGNIZED_BASIS:${String(basis)}`] };
  }
  const execution = classifyExecutionEvidence(claim);
  if (execution.verdict !== "EXECUTION_OBSERVED") {
    return { verdict: "RUNTIME_OVERCLAIM_REJECTED", findings: execution.findings };
  }
  return { verdict: "RUNTIME_CLAIM_SUPPORTED", findings: [] };
}

export function assessProductionClaim(claim) {
  if (typeof claim !== "object" || claim === null) {
    return { verdict: "PRODUCTION_OVERCLAIM_REJECTED", findings: ["CLAIM_MISSING"] };
  }
  const findings = [];
  if (claim.kind === "PRODUCTION_HEALTH") {
    const dep = claim.deploymentEvidence;
    if (classifyExecutionEvidence(dep).verdict !== "EXECUTION_OBSERVED") findings.push("DEPLOYMENT_EVIDENCE_MISSING");
  } else if (claim.kind === "LIVE_DATA") {
    const db = claim.databaseEvidence;
    if (classifyExecutionEvidence(db).verdict !== "EXECUTION_OBSERVED") findings.push("DATABASE_EVIDENCE_MISSING");
  } else {
    findings.push("CLAIM_KIND_INVALID");
  }
  return findings.length === 0
    ? { verdict: "PRODUCTION_CLAIM_SUPPORTED", findings }
    : { verdict: "PRODUCTION_OVERCLAIM_REJECTED", findings };
}

// ---------------------------------------------------------------------------
// P1AF-051 — identity source law: an environment variable is never identity
// evidence by itself; the checked-out HEAD is observed independently.
// ---------------------------------------------------------------------------
export function verifyIdentitySource({ envCandidateSha, observedHeadSha }) {
  if (!HEX40.test(observedHeadSha ?? "")) {
    return { verdict: "IDENTITY_UNPROVEN", findings: ["OBSERVED_HEAD_MISSING"] };
  }
  if (!HEX40.test(envCandidateSha ?? "")) {
    return { verdict: "IDENTITY_REJECTED", findings: ["ENV_CANDIDATE_INVALID"] };
  }
  if (envCandidateSha !== observedHeadSha) {
    return { verdict: "IDENTITY_REJECTED", findings: ["ENV_HEAD_MISMATCH"] };
  }
  return { verdict: "IDENTITY_VERIFIED", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-037 — artifact upload allowlist + always() cleanup.
// ---------------------------------------------------------------------------
export const FORBIDDEN_ARTIFACT_KINDS = Object.freeze([
  "RAW_LOG", "ASKPASS_HELPER", "RUNTIME_OBJECT_STORE",
]);
export const ALLOWED_ARTIFACT_KINDS = Object.freeze(["SUMMARY_JSON", "SUMMARY_DIGEST"]);

export function verifyArtifactUploadPolicy({ uploaded, cleanup }) {
  const findings = [];
  if (!Array.isArray(uploaded)) findings.push("UPLOAD_SET_MISSING");
  else {
    uploaded.forEach((u, i) => {
      if (typeof u !== "object" || u === null) return findings.push(`UPLOAD_ENTRY_INVALID:${i}`);
      if (FORBIDDEN_ARTIFACT_KINDS.includes(u.kind)) findings.push(`FORBIDDEN_ARTIFACT:${u.kind}`);
      else if (!ALLOWED_ARTIFACT_KINDS.includes(u.kind)) findings.push(`UNRECOGNIZED_ARTIFACT_KIND:${String(u.kind)}`);
      if (!isSafeRepoPath(u.path ?? "")) findings.push(`UPLOAD_PATH_UNSAFE:${i}`);
      if (u.kind === "SUMMARY_JSON" && !HEX64.test(u.sha256 ?? "")) findings.push("SUMMARY_DIGEST_MISSING");
    });
  }
  if (typeof cleanup !== "object" || cleanup === null || cleanup.condition !== "always") {
    findings.push("CLEANUP_NOT_ALWAYS");
  } else {
    const removes = Array.isArray(cleanup.removesKinds) ? cleanup.removesKinds : [];
    for (const kind of FORBIDDEN_ARTIFACT_KINDS) {
      if (!removes.includes(kind)) findings.push(`CLEANUP_MISSING_KIND:${kind}`);
    }
    if (classifyExecutionEvidence(cleanup).verdict !== "EXECUTION_OBSERVED") {
      findings.push("CLEANUP_EXECUTION_UNPROVEN");
    }
  }
  return findings.length === 0
    ? { verdict: "ARTIFACT_POLICY_OK", findings }
    : { verdict: "ARTIFACT_POLICY_VIOLATION", findings };
}

// ---------------------------------------------------------------------------
// P1AF-047 — historical evidence is evidence only for its exact workflow and
// candidate SHAs.
// ---------------------------------------------------------------------------
export function assessHistoricalEvidence(evidence, currentSubject) {
  if (typeof evidence !== "object" || evidence === null
    || !HEX40.test(evidence.workflowSha ?? "") || !HEX40.test(evidence.candidateSha ?? "")) {
    return { verdict: "EVIDENCE_REJECTED", findings: ["HISTORICAL_BINDING_MISSING"] };
  }
  if (typeof currentSubject !== "object" || currentSubject === null
    || !HEX40.test(currentSubject.workflowSha ?? "") || !HEX40.test(currentSubject.candidateSha ?? "")) {
    return { verdict: "EVIDENCE_REJECTED", findings: ["CURRENT_SUBJECT_MISSING"] };
  }
  if (evidence.workflowSha !== currentSubject.workflowSha
    || evidence.candidateSha !== currentSubject.candidateSha) {
    return { verdict: "HISTORICAL_ONLY", findings: ["SUBJECT_MISMATCH"] };
  }
  return { verdict: "SUBJECT_CURRENT", findings: [] };
}

// ---------------------------------------------------------------------------
// P1AF-050 — evidence envelope ↔ trust-store record exact-match matrix.
// ---------------------------------------------------------------------------
export const ENVELOPE_BOUND_FIELDS = Object.freeze([
  "subjectSha", "agent", "tenant", "workspace", "artifact", "issuer", "system",
]);

export function verifyEvidenceEnvelope(envelope, trustRecord, context) {
  const findings = [];
  if (typeof envelope !== "object" || envelope === null) {
    return { verdict: "ENVELOPE_REJECTED", findings: ["ENVELOPE_MISSING"] };
  }
  if (typeof trustRecord !== "object" || trustRecord === null) {
    return { verdict: "ENVELOPE_REJECTED", findings: ["TRUST_RECORD_MISSING"] };
  }
  if (typeof context !== "object" || context === null
    || !isNonEmptyString(context.evaluationTime) || !isNonEmptyString(context.workspace)) {
    return { verdict: "ENVELOPE_REJECTED", findings: ["CONTEXT_MISSING"] };
  }
  for (const field of ENVELOPE_BOUND_FIELDS) {
    if (envelope[field] === undefined || envelope[field] !== trustRecord[field]) {
      findings.push(`FIELD_MISMATCH:${field}`);
    }
  }
  const vw = trustRecord.validityWindow;
  if (typeof vw !== "object" || vw === null
    || !isNonEmptyString(vw.notBefore) || !isNonEmptyString(vw.notAfter)) {
    findings.push("VALIDITY_WINDOW_MISSING");
  } else {
    if (context.evaluationTime > vw.notAfter) findings.push("EXPIRED");
    if (context.evaluationTime < vw.notBefore) findings.push("NOT_YET_VALID");
  }
  if (trustRecord.status === "REVOKED") findings.push("REVOKED");
  if (trustRecord.status === "FAILED") findings.push("FAILED");
  if (trustRecord.status !== undefined
    && !["ACTIVE", "REVOKED", "FAILED"].includes(trustRecord.status)) {
    findings.push(`STATUS_UNRECOGNIZED:${String(trustRecord.status)}`);
  }
  if (trustRecord.status === undefined) findings.push("STATUS_MISSING");
  if (envelope.workspace !== context.workspace) findings.push("FOREIGN_WORKSPACE");
  if (!isNonEmptyString(envelope.issuedAt)) findings.push("ISSUED_AT_MISSING");
  else {
    if (envelope.issuedAt > context.evaluationTime) findings.push("FUTURE_DATED");
    if (isNonEmptyString(context.subjectCreatedAt) && envelope.issuedAt < context.subjectCreatedAt) {
      findings.push("PRE_SUBJECT");
    }
  }
  if (context.consumedEnvelopeIds instanceof Set && context.consumedEnvelopeIds.has(envelope.envelopeId)) {
    findings.push("DUPLICATE");
  }
  return findings.length === 0
    ? { verdict: "ENVELOPE_VERIFIED", findings }
    : { verdict: "ENVELOPE_REJECTED", findings };
}

// ---------------------------------------------------------------------------
// P1AF-052 / P1AF-053 — authorization law. Schema validity is structural, not
// authority. The producer never approves its own artifact. Missing evidence is
// BLOCKED, never inferred success.
// ---------------------------------------------------------------------------
export function evaluateAuthorization({ artifact, approval, structurallyValid }) {
  if (structurallyValid !== true) {
    return { verdict: "BLOCKED", findings: ["STRUCTURE_INVALID"] };
  }
  if (typeof approval !== "object" || approval === null) {
    return { verdict: "STRUCTURALLY_VALID", findings: ["APPROVAL_ABSENT"] };
  }
  if (typeof artifact !== "object" || artifact === null || !isNonEmptyString(artifact.producer)) {
    return { verdict: "BLOCKED", findings: ["PRODUCER_MISSING"] };
  }
  if (!isNonEmptyString(approval.approver)) {
    return { verdict: "STRUCTURALLY_VALID", findings: ["APPROVER_MISSING"] };
  }
  if (approval.approver === artifact.producer) {
    return { verdict: "SELF_PROMOTION_REJECTED", findings: ["PRODUCER_IS_APPROVER"] };
  }
  if (classifyExecutionEvidence(approval).verdict !== "EXECUTION_OBSERVED") {
    return { verdict: "STRUCTURALLY_VALID", findings: ["APPROVAL_EXECUTION_UNPROVEN"] };
  }
  return { verdict: "AUTHORIZED", findings: [] };
}

export function decideOnEvidence({ required, present }) {
  if (!Array.isArray(required) || required.length === 0) {
    return { verdict: "BLOCKED", findings: ["REQUIRED_SET_EMPTY"] };
  }
  const presentSet = new Set(Array.isArray(present) ? present : []);
  const missing = required.filter((r) => !presentSet.has(r));
  return missing.length === 0
    ? { verdict: "EVIDENCE_COMPLETE", findings: [] }
    : { verdict: "BLOCKED", findings: missing.map((m) => `EVIDENCE_MISSING:${m}`) };
}

// ---------------------------------------------------------------------------
// Evidence store: sealed artifacts (P1AF-054), append-only revocations
// (P1AF-042), explicit supersession (P1AF-043), workspace-scoped depth-bounded
// lineage (P1AF-055).
// ---------------------------------------------------------------------------
export function createEvidenceStore() {
  return {
    artifacts: new Map(),
    revocations: [],
    revocationChain: "0".repeat(64),
    supersessions: new Map(), // priorId -> [candidate records]
  };
}

export function deterministicArtifactId({ artifactClass, subjectSha, inputHash }) {
  if (!isNonEmptyString(artifactClass) || !HEX40.test(subjectSha ?? "") || !HEX64.test(inputHash ?? "")) {
    return null;
  }
  return digestOf({ artifactClass, subjectSha, inputHash });
}

export function sealArtifact(store, { artifactClass, subjectSha, inputHash, workspace, body }) {
  const id = deterministicArtifactId({ artifactClass, subjectSha, inputHash });
  if (id === null || !isNonEmptyString(workspace)) {
    return { verdict: "SEAL_REJECTED", findings: ["ARTIFACT_IDENTITY_INVALID"], id: null };
  }
  if (store.artifacts.has(id)) {
    return { verdict: "SEAL_REJECTED", findings: ["ARTIFACT_ALREADY_SEALED"], id };
  }
  const record = Object.freeze({
    id, artifactClass, subjectSha, inputHash, workspace,
    bodyDigest: digestOf(body ?? null),
    sealed: true,
    supersededBy: null,
  });
  store.artifacts.set(id, record);
  return { verdict: "SEALED", findings: [], id };
}

export function updateArtifact(store, id) {
  const existing = store.artifacts.get(id);
  if (!existing) return { verdict: "ARTIFACT_UNKNOWN", findings: ["NO_SUCH_ARTIFACT"] };
  if (existing.sealed === true) {
    return { verdict: "SEALED_IMMUTABLE", findings: ["UPDATE_ON_SEALED_REJECTED"] };
  }
  return { verdict: "ARTIFACT_UNKNOWN", findings: ["UNSEALED_ARTIFACTS_UNSUPPORTED"] };
}

export const REVOCATION_REQUIRED_FIELDS = Object.freeze([
  "revokedId", "subjectSha", "artifactIds", "issuer", "revokingAuthority",
  "reason", "timestamp",
]);

export function appendRevocation(store, record) {
  const findings = [];
  if (typeof record !== "object" || record === null) {
    return { verdict: "REVOCATION_REJECTED", findings: ["RECORD_MISSING"] };
  }
  for (const field of REVOCATION_REQUIRED_FIELDS) {
    const v = record[field];
    if (v === undefined || v === null || v === "") findings.push(`FIELD_MISSING:${field}`);
  }
  if (!Array.isArray(record.artifactIds) || record.artifactIds.length === 0) {
    findings.push("ARTIFACT_IDS_EMPTY");
  }
  if (!("replacementId" in record)) findings.push("REPLACEMENT_FIELD_ABSENT"); // null is valid, absent is not
  if (findings.length > 0) return { verdict: "REVOCATION_REJECTED", findings };
  const entryDigest = digestOf(record);
  const chainDigest = sha256(store.revocationChain + entryDigest);
  store.revocations.push(Object.freeze({ record: Object.freeze({ ...record }), entryDigest, chainDigest }));
  store.revocationChain = chainDigest;
  return { verdict: "REVOCATION_APPENDED", findings: [], chainDigest };
}

// Internal consistency alone cannot detect a full delete-and-recompute rewrite
// (an attacker who rewrites every chainDigest AND the head produces a chain
// that is internally coherent). Detection of that attack requires the caller
// to hold the head digest OUTSIDE the store (each appendRevocation returns it)
// and pass it as expectedHead.
export function verifyRevocationChain(store, expectedHead) {
  let chain = "0".repeat(64);
  for (const [i, entry] of store.revocations.entries()) {
    const expectedEntry = digestOf(entry.record);
    if (entry.entryDigest !== expectedEntry) {
      return { verdict: "CHAIN_BROKEN", findings: [`ENTRY_MUTATED:${i}`] };
    }
    const expectedChain = sha256(chain + expectedEntry);
    if (entry.chainDigest !== expectedChain) {
      return { verdict: "CHAIN_BROKEN", findings: [`CHAIN_MUTATED:${i}`] };
    }
    chain = expectedChain;
  }
  if (chain !== store.revocationChain) {
    return { verdict: "CHAIN_BROKEN", findings: ["HEAD_MISMATCH"] };
  }
  if (expectedHead !== undefined && chain !== expectedHead) {
    return { verdict: "CHAIN_BROKEN", findings: ["EXTERNAL_HEAD_MISMATCH"] };
  }
  return { verdict: "CHAIN_INTACT", findings: [], length: store.revocations.length };
}

export const SUPERSESSION_REQUIRED_FIELDS = Object.freeze([
  "priorId", "newId", "reason", "authority", "subjectRelationship",
  "claimsReplaced", "claimsHistorical",
]);

export function recordSupersession(store, record) {
  const findings = [];
  if (typeof record !== "object" || record === null) {
    return { verdict: "SUPERSESSION_REJECTED", findings: ["RECORD_MISSING"] };
  }
  for (const field of SUPERSESSION_REQUIRED_FIELDS) {
    const v = record[field];
    if (v === undefined || v === null || v === "") findings.push(`FIELD_MISSING:${field}`);
  }
  if (findings.length > 0) return { verdict: "SUPERSESSION_REJECTED", findings };
  const prior = store.artifacts.get(record.priorId);
  const next = store.artifacts.get(record.newId);
  if (!prior) return { verdict: "SUPERSESSION_REJECTED", findings: ["PRIOR_UNKNOWN"] };
  if (!next) return { verdict: "SUPERSESSION_REJECTED", findings: ["NEW_UNKNOWN"] };
  if (prior.workspace !== next.workspace) {
    return { verdict: "SUPERSESSION_REJECTED", findings: ["CROSS_WORKSPACE_SUPERSESSION"] };
  }
  const candidates = store.supersessions.get(record.priorId) ?? [];
  candidates.push(Object.freeze({ ...record }));
  store.supersessions.set(record.priorId, candidates);
  if (candidates.length > 1) {
    // Two candidates claiming the same predecessor: ambiguity blocks BOTH from
    // controlling; the prior record remains preserved and no new decision may
    // cite either claimant until adjudicated.
    return { verdict: "SUPERSESSION_AMBIGUOUS", findings: ["MULTIPLE_CLAIMANTS"], claimants: candidates.length };
  }
  store.artifacts.set(record.priorId, Object.freeze({ ...prior, supersededBy: record.newId }));
  return { verdict: "SUPERSEDED", findings: [] };
}

// Eligibility for NEW decisions: superseded or ambiguous records are ineligible;
// the historical record itself is preserved either way.
export function decisionEligibility(store, id) {
  const artifact = store.artifacts.get(id);
  if (!artifact) return { verdict: "INELIGIBLE", findings: ["UNKNOWN_ARTIFACT"] };
  const claimants = store.supersessions.get(id) ?? [];
  if (claimants.length > 1) return { verdict: "INELIGIBLE", findings: ["SUPERSESSION_AMBIGUOUS"] };
  if (artifact.supersededBy !== null) return { verdict: "INELIGIBLE", findings: ["SUPERSEDED"] };
  return { verdict: "ELIGIBLE", findings: [] };
}

export function traverseLineage(store, { startId, workspace, maxDepth }) {
  if (!isNonEmptyString(workspace) || !Number.isInteger(maxDepth) || maxDepth < 1) {
    return { verdict: "LINEAGE_REJECTED", findings: ["TRAVERSAL_PARAMS_INVALID"], chain: [] };
  }
  const chain = [];
  const seen = new Set();
  let currentId = startId;
  for (let depth = 0; currentId !== null && currentId !== undefined; depth += 1) {
    if (depth >= maxDepth) {
      return { verdict: "LINEAGE_REJECTED", findings: ["DEPTH_EXCEEDED"], chain };
    }
    if (seen.has(currentId)) {
      return { verdict: "LINEAGE_REJECTED", findings: ["LINEAGE_CYCLE"], chain };
    }
    seen.add(currentId);
    const artifact = store.artifacts.get(currentId);
    if (!artifact) {
      return { verdict: "LINEAGE_REJECTED", findings: [`LINEAGE_ID_UNKNOWN:${currentId}`], chain };
    }
    // Re-verify EVERY traversed id against the workspace before it enters the
    // response — a foreign link anywhere poisons the whole traversal.
    if (artifact.workspace !== workspace) {
      return { verdict: "LINEAGE_REJECTED", findings: ["LINEAGE_SCOPE_VIOLATION"], chain };
    }
    chain.push(currentId);
    currentId = artifact.supersededBy;
  }
  return { verdict: "LINEAGE_BOUND", findings: [], chain };
}

// ---------------------------------------------------------------------------
// P1AF-056 — evidence references declare basis and confidence and resolve to a
// known repository for their SHA.
// ---------------------------------------------------------------------------
export const REFERENCE_BASES = Object.freeze(["DIRECT", "INFERRED", "UNRESOLVED"]);
export const REFERENCE_CONFIDENCES = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

export function validateEvidenceReference(ref, resolveRepositoryForSha) {
  const findings = [];
  if (typeof ref !== "object" || ref === null) {
    return { verdict: "REFERENCE_REJECTED", findings: ["REFERENCE_MISSING"] };
  }
  if (!REFERENCE_BASES.includes(ref.basis)) findings.push("BASIS_INVALID");
  if (!REFERENCE_CONFIDENCES.includes(ref.confidence)) findings.push("CONFIDENCE_INVALID");
  if (!HEX40.test(ref.sha ?? "")) findings.push("SHA_INVALID");
  if (typeof resolveRepositoryForSha !== "function") findings.push("RESOLVER_MISSING");
  if (findings.length === 0) {
    let repo;
    try {
      repo = resolveRepositoryForSha(ref.sha);
    } catch {
      repo = null;
    }
    if (!isNonEmptyString(repo)) findings.push("REPOSITORY_UNRESOLVED");
    else if (isNonEmptyString(ref.repository) && ref.repository !== repo) {
      findings.push("REPOSITORY_MISMATCH");
    }
  }
  return findings.length === 0
    ? { verdict: "REFERENCE_BOUND", findings }
    : { verdict: "REFERENCE_REJECTED", findings };
}

// ---------------------------------------------------------------------------
// §XV/§XVI/§XVII — hardened byte identity: open-once reads that refuse
// symlinks (terminal and intermediate) and traversal, and atomic evidence
// writes whose digest is computed over the exact bytes durably placed.
// ---------------------------------------------------------------------------
export function readEvidenceArtifact(rootDir, relativePath) {
  if (!isSafeRepoPath(relativePath)) {
    return { verdict: "READ_REJECTED", findings: ["UNSAFE_PATH"], bytes: null, sha256: null };
  }
  const segments = relativePath.split("/");
  let walked = rootDir;
  for (const segment of segments.slice(0, -1)) {
    walked = join(walked, segment);
    let st;
    try {
      st = lstatSync(walked);
    } catch {
      return { verdict: "READ_REJECTED", findings: ["PATH_COMPONENT_MISSING"], bytes: null, sha256: null };
    }
    if (st.isSymbolicLink() || !st.isDirectory()) {
      return { verdict: "READ_REJECTED", findings: ["INTERMEDIATE_NOT_DIRECTORY"], bytes: null, sha256: null };
    }
  }
  const fullPath = join(rootDir, ...segments);
  let fd;
  try {
    fd = openSync(fullPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { verdict: "READ_REJECTED", findings: ["OPEN_FAILED_OR_SYMLINK"], bytes: null, sha256: null };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      return { verdict: "READ_REJECTED", findings: ["NOT_REGULAR_FILE"], bytes: null, sha256: null };
    }
    // Single read on the already-open descriptor: the digested bytes ARE the
    // consumed bytes; no re-open, no TOCTOU window.
    const size = st.size;
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const n = readSync(fd, buffer, offset, size - offset, offset);
      if (n <= 0) return { verdict: "READ_REJECTED", findings: ["SHORT_READ"], bytes: null, sha256: null };
      offset += n;
    }
    return { verdict: "READ_BOUND", findings: [], bytes: buffer, sha256: sha256(buffer) };
  } finally {
    closeSync(fd);
  }
}

export function writeEvidenceAtomic(targetPath, bytes) {
  if (!Buffer.isBuffer(bytes) && typeof bytes !== "string") {
    return { verdict: "WRITE_REJECTED", findings: ["BYTES_INVALID"], sha256: null };
  }
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  const dir = dirname(targetPath);
  const tempPath = join(dir, `.${basename(targetPath)}.tmp-${process.pid}-${sha256(data).slice(0, 8)}`);
  let fd;
  try {
    fd = openSync(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
  } catch {
    return { verdict: "WRITE_REJECTED", findings: ["TEMP_CREATE_FAILED"], sha256: null };
  }
  try {
    let offset = 0;
    while (offset < data.length) {
      offset += writeSync(fd, data, offset, data.length - offset, offset);
    }
    fsyncSync(fd);
  } catch {
    closeSync(fd);
    return { verdict: "WRITE_REJECTED", findings: ["WRITE_FAILED"], sha256: null };
  }
  closeSync(fd);
  try {
    renameSync(tempPath, targetPath);
  } catch {
    return { verdict: "WRITE_REJECTED", findings: ["RENAME_FAILED"], sha256: null };
  }
  // Digest is recomputed from the durable artifact via the hardened reader so
  // the reported digest can never describe bytes other than those on disk.
  const readBack = readEvidenceArtifact(dirname(targetPath), basename(targetPath));
  if (readBack.verdict !== "READ_BOUND" || readBack.sha256 !== sha256(data)) {
    return { verdict: "WRITE_REJECTED", findings: ["DURABILITY_UNVERIFIED"], sha256: null };
  }
  return { verdict: "WRITE_DURABLE", findings: [], sha256: readBack.sha256 };
}

// ---------------------------------------------------------------------------
// §XIII property register — the mutation denominator derives from this list.
// ---------------------------------------------------------------------------
export const PROPERTY_REGISTER = Object.freeze([
  { id: "P037_FORBIDDEN_ARTIFACT_REJECTED", requirement: "P1AF-037" },
  { id: "P037_CLEANUP_ALWAYS_REQUIRED", requirement: "P1AF-037" },
  { id: "P038_EVERY_FIELD_REQUIRED", requirement: "P1AF-038" },
  { id: "P039_BLOB_MISMATCH_REJECTED", requirement: "P1AF-039" },
  { id: "P039_IMPOSSIBLE_RANGE_REJECTED", requirement: "P1AF-039" },
  { id: "P040_MATRIX_FAILS_CLOSED", requirement: "P1AF-040" },
  { id: "P040_UNSAFE_PATH_REJECTED", requirement: "P1AF-040" },
  { id: "P041_FULL_TUPLE_REQUIRED", requirement: "P1AF-041" },
  { id: "P041_DIGEST_BINDS_CONTENT", requirement: "P1AF-041" },
  { id: "P041_FILENAME_NOT_IDENTITY", requirement: "P1AF-041" },
  { id: "P042_REVOCATION_FIELDS_REQUIRED", requirement: "P1AF-042" },
  { id: "P042_CHAIN_DETECTS_MUTATION", requirement: "P1AF-042" },
  { id: "P043_SUPERSESSION_EXPLICIT", requirement: "P1AF-043" },
  { id: "P043_AMBIGUITY_BLOCKS", requirement: "P1AF-043" },
  { id: "P044_ASSERTION_NEVER_PROOF", requirement: "P1AF-044" },
  { id: "P045_EMPTY_DENOMINATOR_BLOCKS", requirement: "P1AF-045" },
  { id: "P046_UNPARSEABLE_EXCLUSION_BLOCKS", requirement: "P1AF-046" },
  { id: "P047_HISTORICAL_SCOPE_ENFORCED", requirement: "P1AF-047" },
  { id: "P048_RUNTIME_NEEDS_EXECUTION", requirement: "P1AF-048" },
  { id: "P049_PRODUCTION_NEEDS_DEPLOYMENT", requirement: "P1AF-049" },
  { id: "P050_ENVELOPE_EXACT_MATCH", requirement: "P1AF-050" },
  { id: "P050_REJECTION_CLASSES_TOTAL", requirement: "P1AF-050" },
  { id: "P051_ENV_VAR_NOT_IDENTITY", requirement: "P1AF-051" },
  { id: "P052_NO_SELF_PROMOTION", requirement: "P1AF-052" },
  { id: "P052_SCHEMA_IS_NOT_AUTHORITY", requirement: "P1AF-052" },
  { id: "P053_MISSING_EVIDENCE_BLOCKS", requirement: "P1AF-053" },
  { id: "P054_SEALED_IMMUTABLE", requirement: "P1AF-054" },
  { id: "P054_DETERMINISTIC_ID", requirement: "P1AF-054" },
  { id: "P055_WORKSPACE_SCOPED", requirement: "P1AF-055" },
  { id: "P055_DEPTH_BOUNDED", requirement: "P1AF-055" },
  { id: "P056_BASIS_CONFIDENCE_REQUIRED", requirement: "P1AF-056" },
  { id: "P056_REPOSITORY_RESOLUTION_REQUIRED", requirement: "P1AF-056" },
  { id: "PXVI_SYMLINK_REJECTED", requirement: "§XVI" },
  { id: "PXVI_TRAVERSAL_REJECTED", requirement: "§XVI" },
  { id: "PXVII_DIGEST_IS_DURABLE_BYTES", requirement: "§XVII" },
  { id: "PXXI_TEMPORAL_ORDER_ENFORCED", requirement: "§XXI" },
]);

export function laneEvidenceStatus() {
  return Object.freeze({
    lane: "P1A-03",
    policyVersion: POLICY_VERSION,
    receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
    requirements: Object.freeze([
      "P1AF-037", "P1AF-038", "P1AF-039", "P1AF-040", "P1AF-041", "P1AF-042",
      "P1AF-043", "P1AF-044", "P1AF-045", "P1AF-046", "P1AF-047", "P1AF-048",
      "P1AF-049", "P1AF-050", "P1AF-051", "P1AF-052", "P1AF-053", "P1AF-054",
      "P1AF-055", "P1AF-056",
    ]),
    propertyCount: PROPERTY_REGISTER.length,
    executionStatus: "LOCAL_IMPLEMENTATION_ONLY",
    runtimeClaim: "NOT_RUN",
    productionClaim: "NOT_RUN",
  });
}
