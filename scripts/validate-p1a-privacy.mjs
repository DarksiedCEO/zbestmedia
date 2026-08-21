// P1A-06 privacy / retention / deletion / data-lifecycle library.
// Lane P1A-06 (Claude) under frozen ledger f1010f1b (denominator 124),
// active-implementation Continuity V2 (ccfa4a46), release authority bf7cfcdd.
//
// Deterministic, dependency-free. Every consequential decision fails CLOSED:
// an undeclared class, an unproven scope, a missing authority, or a forged
// receipt degrades the result — it never upgrades it. Partial deletion is
// never promoted to complete. Status vocabulary UNKNOWN / PARTIAL / NOT_RUN /
// BLOCKED_EXTERNALLY is preserved verbatim and is load-bearing.
//
// Historical failure classes this module exists to defeat:
//   PRIVACY_RETENTION_GAP     — persisted class with no explicit retention
//   PRIVACY_DELETION_GAP      — deletion that cannot prove every copy handled
//   PERSISTED_JSON_LIFECYCLE_GAP — JSON blobs escaping column-level governance
import { createHash } from "node:crypto";

export const POLICY_MODULE_VERSION = "P1A_06_PRIVACY_V1";

// ---------------------------------------------------------------------------
// canonical serialization + digests
// ---------------------------------------------------------------------------
export const canonicalJson = (value) => {
  const walk = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, walk(v[k])]));
  };
  return JSON.stringify(walk(value));
};
export const digestOf = (value) =>
  createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
export const subjectHash = (raw) => digestOf(`P1A06:SUBJECT:${raw}`);
export const tenantHash = (raw) => digestOf(`P1A06:TENANT:${raw}`);

export class PrivacyError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
const fail = (code, message) => { throw new PrivacyError(code, message); };

// ---------------------------------------------------------------------------
// vocabulary (frozen)
// ---------------------------------------------------------------------------
export const DATA_CLASSES = Object.freeze([
  "REGULATED_PERSONAL",   // data with legal erasure/retention obligations
  "OPERATIONAL_PERSONAL", // personal data held for operations
  "TENANT_CONTENT",       // tenant-owned business content
  "EVIDENCE_AUDIT",       // append-only audit/certification evidence
  "SECRET_CREDENTIAL",    // secrets, tokens, keys
  "DERIVED_CACHE",        // recomputable derived/cached data
  "TELEMETRY",            // operational telemetry
]);
export const ERASURE_STRATEGIES = Object.freeze([
  "PHYSICAL_DELETE", "TOMBSTONE", "CRYPTO_ERASE", "SCOPED_EXEMPTION",
]);
export const COPY_SCOPES = Object.freeze([
  "PRIMARY", "CACHE", "DERIVED", "REPLICA", "BACKUP", "OUTBOX",
]);
export const RETENTION_CLOCK_BASES = Object.freeze(["CREATED_AT", "SEALED_AT", "LAST_ACTIVITY"]);
// Scope outcomes that PROVE the copy was handled. Everything else does not.
export const PROVEN_SCOPE_OUTCOMES = Object.freeze([
  "DELETED", "TOMBSTONED", "CRYPTO_ERASED", "EXEMPT_DECLARED",
]);
export const SCOPE_OUTCOMES = Object.freeze([
  ...PROVEN_SCOPE_OUTCOMES, "FAILED", "UNSUPPORTED", "RETAINED", "NOT_RUN",
]);
// Aggregate deletion statuses. COMPLETE is only reachable through proof.
export const DELETION_STATUSES = Object.freeze([
  "COMPLETE", "PARTIAL", "UNKNOWN", "NOT_RUN", "BLOCKED_BY_HOLD", "BLOCKED_EXTERNALLY",
]);
export const REQUIREMENT_STATUSES = Object.freeze([
  "ACTIVE", "IMPLEMENTED_WITH_LOCAL_TESTS", "PARTIAL", "UNKNOWN", "NOT_RUN", "BLOCKED_EXTERNALLY",
]);
// Retention actions must name an accountable role (P1AF-078).
export const ACCOUNTABLE_RETENTION_ROLE = "DOCUMENT_RETENTION";
// A bounded ceiling for secret retention. Secrets may never be retained
// indefinitely and never enter audit payloads (improper-retention exclusion).
export const SECRET_MAX_RETENTION_DAYS = 366;

// ---------------------------------------------------------------------------
// classification registry (P1AF-077, P1AF-079, P1AF-081, P1AF-082, P1AF-083)
// ---------------------------------------------------------------------------
// A persisted-class descriptor declares, for one table/store surface:
//   classId, store, table, dataClass, retentionClassId, copyScopes,
//   tenantScoped(+deletionPath), subjectScoped, jsonFields[{field,dataClass}],
//   sealed(+erasureStrategy for sealed), erasureStrategy, appendOnly,
//   payloadFree, providerDependent
export const createClassificationRegistry = () => ({ classes: new Map() });

export const registerPersistedClass = (registry, desc) => {
  const d = desc ?? {};
  if (typeof d.classId !== "string" || d.classId.length === 0) {
    fail("CLASS_ID_MISSING", "persisted class must declare classId");
  }
  if (registry.classes.has(d.classId)) {
    fail("CLASS_DUPLICATE", `persisted class already registered: ${d.classId}`);
  }
  if (!DATA_CLASSES.includes(d.dataClass)) {
    fail("DATA_CLASS_INVALID", `unknown data class for ${d.classId}: ${d.dataClass}`);
  }
  // P1AF-079 — no unbounded implicit retention. Fail closed on absence.
  if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {
    fail("CLASS_WITHOUT_RETENTION", `persisted class ${d.classId} declares no retention class`);
  }
  if (!Array.isArray(d.copyScopes) || d.copyScopes.length === 0 ||
      d.copyScopes.some((s) => !COPY_SCOPES.includes(s))) {
    fail("COPY_SCOPES_INVALID", `persisted class ${d.classId} must declare its copy scopes`);
  }
  if (!d.copyScopes.includes("PRIMARY")) {
    fail("COPY_SCOPES_INVALID", `persisted class ${d.classId} must include PRIMARY scope`);
  }
  if (!ERASURE_STRATEGIES.includes(d.erasureStrategy)) {
    fail("ERASURE_STRATEGY_INVALID", `persisted class ${d.classId}: ${d.erasureStrategy}`);
  }
  // P1AF-082 — a tenant-scoped surface without a governed deletion path is a defect.
  if (d.tenantScoped === true && (typeof d.tenantDeletionPath !== "string" || d.tenantDeletionPath.length === 0)) {
    fail("TENANT_TABLE_WITHOUT_DELETION_PATH",
      `tenant-scoped class ${d.classId} declares no governed tenant deletion path`);
  }
  // P1AF-081 — persisted JSON is governed field-by-field, not waved through.
  for (const jf of d.jsonFields ?? []) {
    if (typeof jf.field !== "string" || !DATA_CLASSES.includes(jf.dataClass)) {
      fail("JSON_FIELD_UNCLASSIFIED",
        `persisted JSON field on ${d.classId} lacks a declared data class`);
    }
  }
  // P1AF-083 — sealed/immutable data must declare its erasure reconciliation.
  if (d.sealed === true && !["TOMBSTONE", "CRYPTO_ERASE", "SCOPED_EXEMPTION"].includes(d.erasureStrategy)) {
    fail("SEALED_WITHOUT_ERASURE_RECONCILIATION",
      `sealed class ${d.classId} must reconcile immutability vs erasure explicitly`);
  }
  if (d.erasureStrategy === "SCOPED_EXEMPTION" &&
      (typeof d.exemptionJustification !== "string" || d.exemptionJustification.length === 0)) {
    fail("EXEMPTION_UNJUSTIFIED", `scoped exemption on ${d.classId} requires a justification`);
  }
  // Secrets: bounded retention only, and never allowed into audit payloads.
  if (d.dataClass === "SECRET_CREDENTIAL" && d.retentionUnbounded === true) {
    fail("SECRET_IMPROPER_RETENTION", `secret class ${d.classId} may not be retained unbounded`);
  }
  // Evidence/audit surfaces must be payload-free and append-only so they can be
  // preserved under deletion without violating erasure (P1AF-084 precondition).
  if (d.dataClass === "EVIDENCE_AUDIT" && (d.appendOnly !== true || d.payloadFree !== true)) {
    fail("AUDIT_CLASS_MISDECLARED",
      `EVIDENCE_AUDIT class ${d.classId} must be appendOnly and payloadFree`);
  }
  registry.classes.set(d.classId, Object.freeze({ ...d }));
  return registry.classes.get(d.classId);
};

export const getPersistedClass = (registry, classId) =>
  registry.classes.get(classId) ?? fail("CLASS_UNREGISTERED", `no persisted class: ${classId}`);

// Census coverage: compare the registry against a store manifest (the list of
// tables/surfaces that actually exist). Unregistered persistence is UNGOVERNED.
// A manifest that declares itself partial yields COVERAGE_UNKNOWN, never a
// clean verdict (HS-REG-001: a truncated census is not an exhaustive negative).
export const verifyCensusCoverage = (registry, storeManifest) => {
  const findings = [];
  const registered = new Set([...registry.classes.values()].map((c) => `${c.store}:${c.table}`));
  for (const surface of storeManifest.surfaces ?? []) {
    if (!registered.has(`${surface.store}:${surface.table}`)) {
      findings.push(`UNGOVERNED_PERSISTENCE:${surface.store}:${surface.table}`);
    }
  }
  const coverage = storeManifest.exhaustive === true
    ? (findings.length === 0 ? "COVERED" : "GAPS_FOUND")
    : "COVERAGE_UNKNOWN";
  return { coverage, findings };
};

// ---------------------------------------------------------------------------
// retention policy (P1AF-079, downgrade + clock-reset defense)
// ---------------------------------------------------------------------------
export const createRetentionPolicySet = () => ({ versions: [], classes: new Map() });

const DAY_MS = 24 * 60 * 60 * 1000;

export const defineRetentionClass = (set, def) => {
  const d = def ?? {};
  if (typeof d.id !== "string" || d.id.length === 0) fail("RETENTION_ID_MISSING", "retention class id required");
  if (set.classes.has(d.id)) fail("RETENTION_DUPLICATE", `retention class exists: ${d.id}`);
  if (!RETENTION_CLOCK_BASES.includes(d.clockBasis)) {
    fail("CLOCK_BASIS_INVALID", `retention class ${d.id}: ${d.clockBasis}`);
  }
  const unbounded = d.retainDays === "UNBOUNDED_WITH_JUSTIFICATION";
  if (!unbounded && !(Number.isInteger(d.retainDays) && d.retainDays > 0)) {
    fail("RETENTION_DAYS_INVALID", `retention class ${d.id} needs positive retainDays`);
  }
  if (unbounded && (typeof d.unboundedJustification !== "string" || d.unboundedJustification.length === 0)) {
    fail("UNBOUNDED_UNJUSTIFIED", `unbounded retention on ${d.id} requires justification`);
  }
  const version = 1;
  const record = Object.freeze({ ...d, version });
  set.classes.set(d.id, record);
  set.versions.push(Object.freeze({ id: d.id, version, change: "DEFINE", record }));
  return record;
};

// Policy changes are append-only and versioned. A weakening change (longer
// retention of personal data, shorter retention of evidence, or a clock-basis
// change) is a DOWNGRADE and requires an explicit authority reference.
export const amendRetentionClass = (set, id, change, authorityRef) => {
  const prior = set.classes.get(id) ?? fail("RETENTION_UNKNOWN", `no retention class: ${id}`);
  const next = { ...prior, ...change, version: prior.version + 1 };
  const priorDays = prior.retainDays === "UNBOUNDED_WITH_JUSTIFICATION" ? Infinity : prior.retainDays;
  const nextDays = next.retainDays === "UNBOUNDED_WITH_JUSTIFICATION" ? Infinity : next.retainDays;
  const personal = ["REGULATED_PERSONAL", "OPERATIONAL_PERSONAL"].includes(prior.appliesTo);
  const evidence = prior.appliesTo === "EVIDENCE_AUDIT";
  const isDowngrade =
    (personal && nextDays > priorDays) ||
    (evidence && nextDays < priorDays) ||
    (change.clockBasis !== undefined && change.clockBasis !== prior.clockBasis);
  if (isDowngrade && (typeof authorityRef !== "string" || authorityRef.length === 0)) {
    fail("POLICY_DOWNGRADE_REJECTED",
      `amendment to ${id} weakens the policy and carries no authority reference`);
  }
  const record = Object.freeze(next);
  set.classes.set(id, record);
  set.versions.push(Object.freeze({
    id, version: record.version, change: "AMEND", authorityRef: authorityRef ?? null, record,
  }));
  return record;
};

// The retention clock anchor is fixed at first persistence. Rewriting a record
// may not move the anchor (retention-clock-reset attack).
export const retentionAnchorFor = (record, clockBasis) => {
  const source = clockBasis === "SEALED_AT" ? record.sealedAt
    : clockBasis === "LAST_ACTIVITY" ? record.lastActivityAt ?? record.createdAt
    : record.createdAt;
  if (typeof source !== "string" || Number.isNaN(Date.parse(source))) {
    fail("ANCHOR_UNAVAILABLE", "record lacks a valid retention clock anchor");
  }
  return source;
};

export const assertAnchorUnmoved = (registeredAnchor, observedAnchor) => {
  if (registeredAnchor !== observedAnchor) {
    fail("RETENTION_CLOCK_RESET",
      `retention anchor moved from ${registeredAnchor} to ${observedAnchor}`);
  }
  return true;
};

export const evaluateRetention = ({ policySet, retentionClassId, anchor, now }) => {
  const cls = policySet.classes.get(retentionClassId)
    ?? fail("RETENTION_UNKNOWN", `no retention class: ${retentionClassId}`);
  if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
    fail("NOW_REQUIRED", "evaluateRetention requires an explicit ISO now");
  }
  if (cls.retainDays === "UNBOUNDED_WITH_JUSTIFICATION") {
    return { state: "ACTIVE", expiresAt: null, retentionVersion: cls.version };
  }
  const expiresAtMs = Date.parse(anchor) + cls.retainDays * DAY_MS;
  const state = Date.parse(now) >= expiresAtMs ? "EXPIRED" : "ACTIVE";
  return { state, expiresAt: new Date(expiresAtMs).toISOString(), retentionVersion: cls.version };
};

// Expired data is not readable (expired-data-still-readable attack). Tombstoned
// data is not readable. Only ACTIVE passes.
export const guardRead = ({ retentionState, tombstoned }) => {
  if (tombstoned === true) fail("READ_DENIED_TOMBSTONED", "record is tombstoned");
  if (retentionState !== "ACTIVE") {
    fail("READ_DENIED_EXPIRED", `record retention state is ${retentionState}, not ACTIVE`);
  }
  return true;
};

// ---------------------------------------------------------------------------
// legal / operational holds (P1AF-084 adjacent; legal-hold-bypass defense)
// ---------------------------------------------------------------------------
export const createHoldLedger = () => ({ entries: [] });

export const placeHold = (ledger, hold) => {
  const h = hold ?? {};
  if (!["LEGAL", "OPERATIONAL"].includes(h.kind)) fail("HOLD_KIND_INVALID", String(h.kind));
  if (typeof h.holdId !== "string" || h.holdId.length === 0) fail("HOLD_ID_MISSING", "holdId required");
  if (!h.scope || !["TENANT", "SUBJECT", "CLASS", "TARGET"].includes(h.scope.kind)) {
    fail("HOLD_SCOPE_INVALID", "hold scope kind required");
  }
  if (typeof h.reason !== "string" || h.reason.length === 0) fail("HOLD_REASON_MISSING", "reason required");
  const entry = Object.freeze({ ...h, action: "PLACE" });
  ledger.entries.push(entry);
  return entry;
};

export const releaseHold = (ledger, holdId, authorityRef) => {
  if (typeof authorityRef !== "string" || authorityRef.length === 0) {
    fail("HOLD_RELEASE_UNAUTHORIZED", "hold release requires an authority reference");
  }
  const placed = ledger.entries.some((e) => e.action === "PLACE" && e.holdId === holdId);
  if (!placed) fail("HOLD_UNKNOWN", `no such hold: ${holdId}`);
  const entry = Object.freeze({ holdId, action: "RELEASE", authorityRef });
  ledger.entries.push(entry);
  return entry;
};

export const activeHolds = (ledger, { tenantId, subjectId, classId, targetId }) => {
  const released = new Set(ledger.entries.filter((e) => e.action === "RELEASE").map((e) => e.holdId));
  return ledger.entries.filter((e) => {
    if (e.action !== "PLACE" || released.has(e.holdId)) return false;
    const s = e.scope;
    return (s.kind === "TENANT" && s.tenantId === tenantId)
      || (s.kind === "SUBJECT" && s.subjectId === subjectId)
      || (s.kind === "CLASS" && s.classId === classId)
      || (s.kind === "TARGET" && s.targetId === targetId);
  });
};

// ---------------------------------------------------------------------------
// deletion eligibility (wrong-tenant / wrong-subject / not-expired / hold)
// ---------------------------------------------------------------------------
export const DELETION_BASES = Object.freeze(["RETENTION_EXPIRY", "ERASURE_REQUEST", "TENANT_OFFBOARD"]);

// Eligibility is the ONLY place holds and scope identity are judged, and the
// executor refuses to run without the digest-bound decision this produces —
// so calling the executor directly cannot bypass a hold (legal-hold-bypass).
export const evaluateDeletionEligibility = ({ registry, policySet, holdLedger, request, targets, now }) => {
  const r = request ?? {};
  if (!DELETION_BASES.includes(r.basis)) fail("DELETION_BASIS_INVALID", String(r.basis));
  if (typeof r.requestId !== "string" || r.requestId.length === 0) fail("REQUEST_ID_MISSING", "requestId required");
  if (typeof r.tenantId !== "string" || r.tenantId.length === 0) fail("TENANT_ID_MISSING", "tenantId required");
  const decisions = [];
  for (const t of targets) {
    const cls = getPersistedClass(registry, t.classId);
    const holds = activeHolds(holdLedger, {
      tenantId: t.tenantId, subjectId: t.subjectId, classId: t.classId, targetId: t.targetId,
    });
    let verdict = "ELIGIBLE";
    let reason = r.basis;
    if (t.tenantId !== r.tenantId) {
      verdict = "REFUSED"; reason = "TENANT_MISMATCH"; // cross-tenant delete defense
    } else if (r.basis === "ERASURE_REQUEST" && (r.subjectId ?? null) !== (t.subjectId ?? null)) {
      verdict = "REFUSED"; reason = "SUBJECT_MISMATCH"; // wrong-subject delete defense
    } else if (holds.length > 0) {
      verdict = "BLOCKED_BY_HOLD"; reason = holds.map((h) => h.holdId).join(",");
    } else if (r.basis === "RETENTION_EXPIRY") {
      const anchor = retentionAnchorFor(t.record, policySet.classes.get(cls.retentionClassId)?.clockBasis ?? "CREATED_AT");
      const { state } = evaluateRetention({ policySet, retentionClassId: cls.retentionClassId, anchor, now });
      if (state !== "EXPIRED") { verdict = "REFUSED"; reason = "RETENTION_ACTIVE"; }
    }
    decisions.push({
      targetId: t.targetId, classId: t.classId, tenantId: t.tenantId,
      subjectId: t.subjectId ?? null, verdict, reason,
      declaredScopes: cls.copyScopes, erasureStrategy: cls.erasureStrategy,
      exemptionJustification: cls.exemptionJustification ?? null,
    });
  }
  const decision = {
    requestId: r.requestId, basis: r.basis, tenantId: r.tenantId,
    subjectId: r.subjectId ?? null, evaluatedAt: now, decisions,
  };
  decision.eligibilityToken = digestOf({ kind: "P1A06_ELIGIBILITY", decision });
  return decision;
};

// ---------------------------------------------------------------------------
// deletion engine (P1AF-080; idempotency, retries, receipts, attestation)
// ---------------------------------------------------------------------------
// Adapters: Map(scope -> { delete(target) -> outcome record }). An adapter's
// delete() returns { outcome, holdRef?, exemptionRef? } or throws (=> FAILED).
export const createDeletionEngine = ({ adapters, engineSeed }) => {
  if (typeof engineSeed !== "string" || engineSeed.length < 8) {
    fail("ENGINE_SEED_INVALID", "deletion engine requires a private seed for attestations");
  }
  return {
    adapters: new Map(adapters),
    engineSeed,
    executions: new Map(), // opKey -> frozen op result (idempotency ledger)
    sideEffects: [],       // observable effect log; retries must not grow it per-op
  };
};

const attest = (engine, op) =>
  digestOf({ kind: "P1A06_ATTESTATION", seed: engine.engineSeed, op });

const verifyEligibilityToken = (eligibility) => {
  const { eligibilityToken, ...decision } = eligibility ?? {};
  if (typeof eligibilityToken !== "string" ||
      eligibilityToken !== digestOf({ kind: "P1A06_ELIGIBILITY", decision })) {
    fail("EXECUTION_REFUSED_NO_ELIGIBILITY",
      "deletion execution requires a digest-bound eligibility decision");
  }
};

export const executeDeletion = (engine, eligibility) => {
  verifyEligibilityToken(eligibility);
  const scopeResults = [];
  for (const d of eligibility.decisions) {
    if (d.verdict !== "ELIGIBLE") {
      scopeResults.push({
        targetId: d.targetId, status: d.verdict === "BLOCKED_BY_HOLD" ? "BLOCKED_BY_HOLD" : "NOT_RUN",
        reason: d.reason, scopes: [],
      });
      continue;
    }
    const scopes = [];
    for (const scope of d.declaredScopes) {
      const opKey = `${eligibility.requestId}:${scope}:${d.targetId}`;
      if (engine.executions.has(opKey)) {
        scopes.push(engine.executions.get(opKey)); // idempotent replay, no new side effect
        continue;
      }
      const adapter = engine.adapters.get(scope);
      let op;
      if (!adapter) {
        // A declared copy scope with no executor is UNSUPPORTED — surfaced,
        // never silently skipped, and it blocks COMPLETE (P1AF-080).
        op = { opKey, scope, targetId: d.targetId, outcome: "UNSUPPORTED", attestation: null };
      } else {
        try {
          const res = adapter.delete({
            targetId: d.targetId, classId: d.classId, tenantId: d.tenantId,
            subjectId: d.subjectId, erasureStrategy: d.erasureStrategy,
          });
          const outcome = res?.outcome;
          if (!SCOPE_OUTCOMES.includes(outcome)) {
            fail("SCOPE_OUTCOME_INVALID", `adapter for ${scope} returned ${outcome}`);
          }
          // No silent fallback from delete to retain: RETAINED must carry an
          // explicit hold or exemption reference or it is a violation.
          if (outcome === "RETAINED" && !res.holdRef && !res.exemptionRef) {
            fail("SILENT_RETAIN_REJECTED",
              `adapter for ${scope} retained ${d.targetId} without hold/exemption`);
          }
          if (outcome === "EXEMPT_DECLARED" && d.erasureStrategy !== "SCOPED_EXEMPTION") {
            fail("EXEMPTION_UNDECLARED",
              `adapter for ${scope} claimed exemption but class strategy is ${d.erasureStrategy}`);
          }
          engine.sideEffects.push(opKey);
          op = { opKey, scope, targetId: d.targetId, outcome, holdRef: res.holdRef ?? null, exemptionRef: res.exemptionRef ?? null };
          op.attestation = attest(engine, { opKey, scope, targetId: d.targetId, outcome });
        } catch (err) {
          if (err instanceof PrivacyError) throw err;
          op = { opKey, scope, targetId: d.targetId, outcome: "FAILED", error: String(err?.message ?? err), attestation: null };
        }
      }
      op = Object.freeze(op);
      engine.executions.set(opKey, op);
      scopes.push(op);
    }
    scopeResults.push({
      targetId: d.targetId,
      status: aggregateDeletionStatus(scopes, d.declaredScopes),
      scopes,
    });
  }
  const receipt = {
    receiptKind: "P1A06_DELETION_RECEIPT",
    requestId: eligibility.requestId,
    basis: eligibility.basis,
    tenantId: eligibility.tenantId,
    subjectId: eligibility.subjectId,
    executedAt: eligibility.evaluatedAt,
    results: scopeResults,
    status: aggregateRequestStatus(scopeResults),
  };
  receipt.receiptDigest = digestOf({ ...receipt, receiptDigest: undefined });
  return receipt;
};

// COMPLETE only when EVERY declared scope carries a PROVEN outcome. Any FAILED
// scope => PARTIAL. Any UNSUPPORTED / NOT_RUN / missing scope => UNKNOWN floor.
// Nothing here can promote; it can only degrade (P1AF-080).
export const aggregateDeletionStatus = (scopeOps, declaredScopes) => {
  const byScope = new Map(scopeOps.map((s) => [s.scope, s]));
  let sawFailed = false;
  let sawUnproven = false;
  for (const scope of declaredScopes) {
    const op = byScope.get(scope);
    if (!op) { sawUnproven = true; continue; }
    if (op.outcome === "FAILED") sawFailed = true;
    else if (!PROVEN_SCOPE_OUTCOMES.includes(op.outcome)) sawUnproven = true;
  }
  if (sawUnproven) return "UNKNOWN";
  if (sawFailed) return "PARTIAL";
  return "COMPLETE";
};

export const aggregateRequestStatus = (targetResults) => {
  if (targetResults.length === 0) return "NOT_RUN";
  if (targetResults.some((t) => t.status === "BLOCKED_BY_HOLD")) return "BLOCKED_BY_HOLD";
  if (targetResults.every((t) => t.status === "COMPLETE")) return "COMPLETE";
  if (targetResults.some((t) => t.status === "UNKNOWN" || t.status === "NOT_RUN")) return "UNKNOWN";
  return "PARTIAL";
};

// Retry: re-runs ONLY ops that FAILED (or scopes never run); proven ops replay
// idempotently from the execution ledger (retry-duplicates defense).
export const retryDeletion = (engine, eligibility) => {
  verifyEligibilityToken(eligibility);
  for (const d of eligibility.decisions) {
    if (d.verdict !== "ELIGIBLE") continue;
    for (const scope of d.declaredScopes) {
      const opKey = `${eligibility.requestId}:${scope}:${d.targetId}`;
      const prior = engine.executions.get(opKey);
      if (prior && prior.outcome === "FAILED") engine.executions.delete(opKey);
    }
  }
  return executeDeletion(engine, eligibility);
};

// A receipt is only as good as its execution. Verification recomputes each
// attestation from the engine seed; a receipt whose proven ops carry missing
// or wrong attestations is FORGED (deletion-receipt-without-execution defense).
export const verifyDeletionReceipt = (engine, receipt) => {
  const findings = [];
  const recomputed = digestOf({ ...receipt, receiptDigest: undefined });
  if (receipt.receiptDigest !== recomputed) findings.push("RECEIPT_DIGEST_MISMATCH");
  for (const t of receipt.results ?? []) {
    for (const op of t.scopes ?? []) {
      if (PROVEN_SCOPE_OUTCOMES.includes(op.outcome)) {
        const expected = attest(engine, {
          opKey: op.opKey, scope: op.scope, targetId: op.targetId, outcome: op.outcome,
        });
        if (op.attestation !== expected) findings.push(`ATTESTATION_INVALID:${op.opKey}`);
        if (!engine.executions.has(op.opKey)) findings.push(`EXECUTION_UNRECORDED:${op.opKey}`);
      }
    }
    // A claimed status stronger than what the ops support is an overclaim.
    const computed = aggregateDeletionStatus(t.scopes ?? [], (t.scopes ?? []).map((s) => s.scope));
    if (t.status === "COMPLETE" && computed !== "COMPLETE") {
      findings.push(`STATUS_OVERCLAIM:${t.targetId}`);
    }
  }
  return { verdict: findings.length === 0 ? "RECEIPT_VERIFIED" : "RECEIPT_REJECTED", findings };
};

// Claiming a stronger status than computed is rejected outright (unsupported
// COMPLETE deletion claim). Claims may be equal or weaker, never stronger.
const STATUS_STRENGTH = { COMPLETE: 3, PARTIAL: 2, BLOCKED_BY_HOLD: 2, UNKNOWN: 1, NOT_RUN: 0, BLOCKED_EXTERNALLY: 0 };
export const assertReportableStatus = (claimed, computed) => {
  if (!(claimed in STATUS_STRENGTH) || !(computed in STATUS_STRENGTH)) {
    fail("STATUS_UNKNOWN_VOCABULARY", `${claimed} / ${computed}`);
  }
  if (STATUS_STRENGTH[claimed] > STATUS_STRENGTH[computed]) {
    fail("OVERCLAIM_REJECTED", `claimed ${claimed} but computed ${computed}`);
  }
  return true;
};

// ---------------------------------------------------------------------------
// tombstones + resurrection guards (P1AF-080, P1AF-081; 05/06 outbox seam)
// ---------------------------------------------------------------------------
const TOMBSTONE_ALLOWED_KEYS = new Set([
  "targetId", "classId", "tenantHash", "subjectHash", "payloadDigest", "deletedAt", "requestId",
]);

// Tombstones prove deletion state without preserving prohibited payloads.
export const makeTombstone = (input) => {
  const t = input ?? {};
  for (const key of Object.keys(t)) {
    if (!TOMBSTONE_ALLOWED_KEYS.has(key)) {
      fail("PROHIBITED_PAYLOAD_IN_TOMBSTONE", `tombstone may not carry field: ${key}`);
    }
  }
  for (const req of ["targetId", "classId", "tenantHash", "deletedAt", "requestId"]) {
    if (typeof t[req] !== "string" || t[req].length === 0) {
      fail("TOMBSTONE_FIELD_MISSING", `tombstone requires ${req}`);
    }
  }
  return Object.freeze({ ...t });
};

export const createTombstoneIndex = () => ({ byTarget: new Map() });
export const recordTombstone = (index, tombstone) => {
  index.byTarget.set(tombstone.targetId, tombstone);
  return tombstone;
};
export const isTombstoned = (index, targetId) => index.byTarget.has(targetId);

// The outbox relay must consult the tombstone index: a relay of a tombstoned
// subject would resurrect deleted data (05/06 KNOWN_COLLISION; the enforcing
// integration into services/artifact-registry is routed via P1A-08 — this is
// the lane-owned reference semantics both sides bind to).
export const guardOutboxRelay = (index, event) => {
  if (isTombstoned(index, event.subject)) {
    fail("RELAY_BLOCKED_TOMBSTONED", `outbox relay would resurrect ${event.subject}`);
  }
  return true;
};

// Post-deletion residue scan across every registered adapter scope: finds the
// deleted-primary-but-surviving-cache / stale-replica / reappearance classes.
// listResidue(targetId) -> array of surviving copy descriptors.
export const verifyNoResidue = ({ adapters, targetId, receipt }) => {
  const findings = [];
  for (const [scope, adapter] of adapters) {
    if (typeof adapter.listResidue !== "function") {
      findings.push(`RESIDUE_UNVERIFIABLE:${scope}`);
      continue;
    }
    const residue = adapter.listResidue(targetId);
    if (Array.isArray(residue) && residue.length > 0) findings.push(`RESIDUE:${scope}`);
  }
  const targetResult = (receipt?.results ?? []).find((t) => t.targetId === targetId);
  const claimedComplete = targetResult?.status === "COMPLETE";
  const verdict = findings.some((f) => f.startsWith("RESIDUE:"))
    ? (claimedComplete ? "REAPPEARANCE_DETECTED" : "RESIDUE_FOUND")
    : (findings.length > 0 ? "UNKNOWN" : "NO_RESIDUE");
  // Residue after a COMPLETE claim degrades the effective status — the claim
  // does not stand (deleted-data-reappears defense).
  const effectiveStatus = verdict === "NO_RESIDUE"
    ? (targetResult?.status ?? "UNKNOWN")
    : verdict === "UNKNOWN" ? "UNKNOWN" : "PARTIAL";
  return { verdict, findings, effectiveStatus };
};

// ---------------------------------------------------------------------------
// tenant deletion planning (P1AF-082, P1AF-084)
// ---------------------------------------------------------------------------
// The plan must cover EVERY registered tenant-scoped class. Append-only
// evidence/audit classes are covered by declared SCOPED_EXEMPTION (preserving
// revocation/audit history) — exempt, not forgotten. A registered tenant-scoped
// class missing from the plan makes the plan itself invalid.
export const planTenantDeletion = (registry, tenantId) => {
  const include = [];
  const exempt = [];
  for (const cls of registry.classes.values()) {
    if (cls.tenantScoped !== true) continue;
    if (cls.dataClass === "EVIDENCE_AUDIT" && cls.erasureStrategy === "SCOPED_EXEMPTION") {
      exempt.push({ classId: cls.classId, justification: cls.exemptionJustification });
    } else {
      include.push({ classId: cls.classId, tenantDeletionPath: cls.tenantDeletionPath });
    }
  }
  return { tenantId, include, exempt };
};

export const verifyTenantPlanCoverage = (registry, plan) => {
  const covered = new Set([
    ...plan.include.map((i) => i.classId),
    ...plan.exempt.map((e) => e.classId),
  ]);
  const findings = [];
  for (const cls of registry.classes.values()) {
    if (cls.tenantScoped === true && !covered.has(cls.classId)) {
      findings.push(`TENANT_PLAN_GAP:${cls.classId}`);
    }
  }
  return { verdict: findings.length === 0 ? "PLAN_COVERS_TENANT" : "PLAN_INCOMPLETE", findings };
};

// Orphaned data: rows whose declared parent no longer exists. This is how the
// base-schema GraphEvent defect class (no FK to Tenant) is detected.
export const findOrphans = ({ rows, parentIds, parentKey }) => {
  const parents = new Set(parentIds);
  return rows.filter((r) => !parents.has(r[parentKey])).map((r) => r.id);
};

// ---------------------------------------------------------------------------
// audit trail + invalidation events (P1AF-084, P1AF-086)
// ---------------------------------------------------------------------------
const AUDIT_PROHIBITED_KEYS = new Set(["payload", "body", "content", "document", "secret", "credential", "token"]);
export const AUDIT_EVENT_TYPES = Object.freeze([
  "CLASSIFY", "RETENTION_DEFINE", "RETENTION_AMEND", "HOLD_PLACE", "HOLD_RELEASE",
  "DELETE_ELIGIBLE", "DELETE_EXECUTE", "DELETE_RETRY", "TOMBSTONE", "INVALIDATE", "REVOKE",
]);

export const createAuditTrail = () => ({ entries: [] });

export const appendAudit = (trail, event) => {
  const e = event ?? {};
  if (!AUDIT_EVENT_TYPES.includes(e.eventType)) fail("AUDIT_EVENT_INVALID", String(e.eventType));
  for (const key of Object.keys(e)) {
    if (AUDIT_PROHIBITED_KEYS.has(key)) {
      fail("PROHIBITED_PAYLOAD_IN_AUDIT", `audit entry may not carry field: ${key}`);
    }
  }
  if (typeof e.subjectRef !== "string" || !/^[0-9a-f]{64}$/.test(e.subjectRef)) {
    fail("AUDIT_SUBJECT_REF_INVALID", "audit subjectRef must be a hash, never raw identity");
  }
  if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) {
    fail("AUDIT_TIME_INVALID", "audit entry requires ISO timestamp");
  }
  const prev = trail.entries.length === 0 ? "GENESIS" : trail.entries[trail.entries.length - 1].entryDigest;
  const entry = { ...e, prevDigest: prev };
  entry.entryDigest = digestOf({ ...entry, entryDigest: undefined });
  trail.entries.push(Object.freeze(entry));
  return entry;
};

// The audit trail is append-only. There is deliberately no removal API; this
// guard is what a caller holding the raw structure must go through, and it
// always refuses. Deletion/retention may never destroy revocation history.
export const removeAuditEntry = () => {
  fail("AUDIT_APPEND_ONLY", "audit/revocation history is append-only and preserved");
};

export const verifyAuditChain = (trail) => {
  let prev = "GENESIS";
  for (const entry of trail.entries) {
    if (entry.prevDigest !== prev) return { verdict: "CHAIN_BROKEN", at: entry.entryDigest };
    const recomputed = digestOf({ ...entry, entryDigest: undefined });
    if (recomputed !== entry.entryDigest) return { verdict: "CHAIN_BROKEN", at: entry.entryDigest };
    prev = entry.entryDigest;
  }
  return { verdict: "CHAIN_INTACT", length: trail.entries.length };
};

// P1AF-086 — invalidation is never silent: the event must name subject, prior
// state, failed gate, policy version and correlation ID. All five, always.
export const INVALIDATION_REQUIRED_FIELDS = Object.freeze([
  "subjectRef", "priorState", "failedGate", "policyVersion", "correlationId",
]);
export const emitInvalidation = (trail, event, at) => {
  const e = event ?? {};
  for (const f of INVALIDATION_REQUIRED_FIELDS) {
    if (typeof e[f] !== "string" || e[f].length === 0) {
      fail("INVALIDATION_FIELDS_MISSING", `invalidation event missing ${f}`);
    }
  }
  return appendAudit(trail, { eventType: "INVALIDATE", at, ...e });
};

// ---------------------------------------------------------------------------
// cached authorization TTL (P1AF-085)
// ---------------------------------------------------------------------------
// A cached authorization may not outlive the earliest evidence or approval
// expiry backing it.
export const boundedCacheTtl = ({ requestedTtlMs, evidenceExpiries, now }) => {
  if (!Array.isArray(evidenceExpiries) || evidenceExpiries.length === 0) {
    fail("CACHE_NO_EVIDENCE", "cached authorization requires backing evidence expiries");
  }
  const nowMs = Date.parse(now);
  const earliest = Math.min(...evidenceExpiries.map((e) => Date.parse(e)));
  if (Number.isNaN(nowMs) || Number.isNaN(earliest)) fail("CACHE_TIME_INVALID", "invalid timestamps");
  const cap = earliest - nowMs;
  if (cap <= 0) return 0;
  return Math.min(requestedTtlMs, cap);
};

export const createAuthzCache = () => ({ entries: new Map() });
export const cacheAuthorization = (cache, { key, decision, requestedTtlMs, evidenceExpiries, now }) => {
  const ttl = boundedCacheTtl({ requestedTtlMs, evidenceExpiries, now });
  if (ttl <= 0) fail("CACHE_EVIDENCE_EXPIRED", "backing evidence already expired");
  const expiresAtMs = Date.parse(now) + ttl;
  cache.entries.set(key, Object.freeze({ decision, expiresAtMs, evidenceExpiries: [...evidenceExpiries] }));
};
export const readAuthorization = (cache, key, now) => {
  const entry = cache.entries.get(key) ?? fail("CACHE_MISS", key);
  const nowMs = Date.parse(now);
  const earliestEvidence = Math.min(...entry.evidenceExpiries.map((e) => Date.parse(e)));
  if (nowMs >= entry.expiresAtMs || nowMs >= earliestEvidence) {
    cache.entries.delete(key);
    fail("CACHE_STALE_DENIED", "cached authorization expired or evidence lapsed");
  }
  return entry.decision;
};

// ---------------------------------------------------------------------------
// certification-evidence retention reconciliation (P1AF-087) and the
// delete-vs-evidence conflict
// ---------------------------------------------------------------------------
// The artifact retention window and the certification-record retention
// obligation must not contradict: an unexpired certification record may not
// reference an artifact whose retention lapses before the record's.
export const reconcileEvidenceRetention = ({ certRecord, artifacts, now }) => {
  const findings = [];
  const recordExpiry = Date.parse(certRecord.retainUntil);
  if (Number.isNaN(recordExpiry)) fail("CERT_RETENTION_INVALID", "certRecord.retainUntil required");
  for (const ref of certRecord.artifactRefs ?? []) {
    const artifact = artifacts.get(ref);
    if (!artifact) { findings.push(`CERT_REF_MISSING_ARTIFACT:${ref}`); continue; }
    const artifactExpiry = artifact.retainUntil === null ? Infinity : Date.parse(artifact.retainUntil);
    if (Date.parse(now) >= artifactExpiry && Date.parse(now) < recordExpiry) {
      findings.push(`EVIDENCE_RETENTION_VIOLATION:${ref}`); // record alive, artifact already expired
    } else if (artifactExpiry < recordExpiry) {
      findings.push(`CERT_RETENTION_CONTRADICTION:${ref}`); // contradiction, fix before it bites
    }
  }
  return {
    verdict: findings.length === 0 ? "RECONCILED" : "CONTRADICTION",
    findings,
    requiredAction: findings.length === 0 ? null : "EXTEND_ARTIFACT_RETENTION_OR_REVISE_RECORD",
  };
};

// A deletion that would destroy evidence bound to an unexpired certification
// record is a declared conflict, resolved per class strategy — CRYPTO_ERASE
// removes payload while digests survive; otherwise the deletion is blocked.
// It is never silently dropped and never silently executed.
export const resolveDeleteEvidenceConflict = ({ targetId, erasureStrategy, certBindings, now }) => {
  const binding = (certBindings ?? []).find(
    (b) => b.artifactRef === targetId && Date.parse(b.retainUntil) > Date.parse(now),
  );
  if (!binding) return { resolution: "NO_CONFLICT", targetId };
  if (erasureStrategy === "CRYPTO_ERASE") {
    return { resolution: "CRYPTO_ERASE_PAYLOAD_PRESERVE_DIGESTS", targetId, certRecordId: binding.certRecordId };
  }
  return { resolution: "BLOCKED_BY_EVIDENCE_OBLIGATION", targetId, certRecordId: binding.certRecordId };
};

// Stale derived artifacts: a derived copy whose source was superseded or
// deleted must be flagged, never served as current.
export const findStaleDerived = ({ derived, sources }) => {
  const findings = [];
  for (const d of derived) {
    const src = sources.get(d.sourceId);
    if (!src) findings.push(`STALE_DERIVED_SOURCE_DELETED:${d.id}`);
    else if (src.supersededBy) findings.push(`STALE_DERIVED_SOURCE_SUPERSEDED:${d.id}`);
  }
  return findings;
};

// ---------------------------------------------------------------------------
// document lifecycle + accountable retention role (P1AF-077, P1AF-078, P1AF-088)
// ---------------------------------------------------------------------------
export const DOCUMENT_LIFECYCLE_STATES = Object.freeze([
  "DRAFT", "ACTIVE", "RETAINED", "DELETION_PENDING", "TOMBSTONED", "DELETED",
]);
const DOCUMENT_TRANSITIONS = Object.freeze({
  DRAFT: ["ACTIVE", "DELETED"],
  ACTIVE: ["RETAINED", "DELETION_PENDING"],
  RETAINED: ["DELETION_PENDING"],
  DELETION_PENDING: ["TOMBSTONED", "DELETED", "RETAINED"],
  TOMBSTONED: [],
  DELETED: [],
});
const RETENTION_ACTIONS = new Set(["RETAIN", "RELEASE", "TRANSITION", "STORE"]);

export const createDocumentStore = () => ({ documents: new Map() });

// Every stored document declares lifecycle + retention up front (P1AF-088);
// every retention action names the accountable retention role (P1AF-078).
export const storeDocument = (store, doc, actor) => {
  const d = doc ?? {};
  assertAccountableActor(actor, "STORE");
  if (typeof d.documentId !== "string" || d.documentId.length === 0) fail("DOCUMENT_ID_MISSING", "documentId");
  if (!DOCUMENT_LIFECYCLE_STATES.includes(d.state)) {
    fail("LIFECYCLE_UNDECLARED", `document ${d.documentId} has no declared lifecycle state`);
  }
  if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {
    fail("LIFECYCLE_UNDECLARED", `document ${d.documentId} has no declared retention class`);
  }
  if (store.documents.has(d.documentId)) fail("DOCUMENT_DUPLICATE", d.documentId);
  const record = Object.freeze({ ...d, history: [{ state: d.state, actorRole: actor.role }] });
  store.documents.set(d.documentId, record);
  return record;
};

export const assertAccountableActor = (actor, action) => {
  if (!RETENTION_ACTIONS.has(action)) fail("RETENTION_ACTION_UNKNOWN", String(action));
  if (actor?.role !== ACCOUNTABLE_RETENTION_ROLE || typeof actor?.actorId !== "string" || actor.actorId.length === 0) {
    fail("RETENTION_ACTION_UNACCOUNTABLE",
      `retention action ${action} requires the accountable ${ACCOUNTABLE_RETENTION_ROLE} role`);
  }
  return true;
};

export const transitionDocument = (store, documentId, nextState, actor) => {
  assertAccountableActor(actor, "TRANSITION");
  const doc = store.documents.get(documentId) ?? fail("DOCUMENT_UNKNOWN", documentId);
  const allowed = DOCUMENT_TRANSITIONS[doc.state] ?? [];
  if (!allowed.includes(nextState)) {
    fail("LIFECYCLE_TRANSITION_INVALID", `${doc.state} -> ${nextState} for ${documentId}`);
  }
  const record = Object.freeze({
    ...doc, state: nextState,
    history: [...doc.history, { state: nextState, actorRole: actor.role }],
  });
  store.documents.set(documentId, record);
  return record;
};

// ---------------------------------------------------------------------------
// provider parity (P1AF-090): postgresql (artifact-registry) vs sqlite
// (brandgraph) divergence is declared and lifecycle invariants are proven
// against BOTH semantic models, or the divergence is explicitly justified.
// ---------------------------------------------------------------------------
export const STORE_SEMANTICS = Object.freeze({
  postgresql: Object.freeze({
    provider: "postgresql", durability: "SERVER_WAL", concurrency: "MVCC_ROW_LOCK",
    deleteVisibility: "IMMEDIATE_COMMITTED", cascadeSupport: true,
  }),
  sqlite: Object.freeze({
    provider: "sqlite", durability: "SINGLE_FILE_WAL", concurrency: "SINGLE_WRITER",
    deleteVisibility: "IMMEDIATE_COMMITTED", cascadeSupport: true,
  }),
});
export const JUSTIFIED_DIVERGENCES = Object.freeze([
  { field: "durability", justification: "deployment-profile difference; lifecycle guarantees must not depend on it" },
  { field: "concurrency", justification: "single-writer vs MVCC; deletion idempotency must hold under both" },
]);

export const createMemoryStoreAdapter = (semantics) => {
  const rows = new Map();
  return {
    semantics,
    put: (id, row) => rows.set(id, row),
    get: (id) => rows.get(id),
    size: () => rows.size,
    delete: ({ targetId }) => {
      if (!rows.has(targetId)) return { outcome: "DELETED" }; // idempotent by content
      rows.delete(targetId);
      return { outcome: "DELETED" };
    },
    listResidue: (targetId) => (rows.has(targetId) ? [{ id: targetId }] : []),
  };
};

// Runs the same lifecycle scenario against both semantic models and compares
// the invariant-relevant outcomes. Divergence on a field outside the justified
// register is a defect.
export const verifyProviderParity = (scenario) => {
  const a = scenario(createMemoryStoreAdapter(STORE_SEMANTICS.postgresql));
  const b = scenario(createMemoryStoreAdapter(STORE_SEMANTICS.sqlite));
  const findings = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (canonicalJson(a[key]) !== canonicalJson(b[key])) findings.push(`PARITY_DIVERGENCE:${key}`);
  }
  return { verdict: findings.length === 0 ? "PARITY_OK" : "DIVERGENCE_UNJUSTIFIED", findings };
};

// ---------------------------------------------------------------------------
// provider-dependent obligations (P1AF-089 — BLOCKED_EXTERNALLY)
// ---------------------------------------------------------------------------
export const PROVIDER_DEPENDENT_ROWS = Object.freeze(["P1AF-070", "P1AF-071", "P1AF-072", "P1AF-073", "P1AF-074"]);
export const providerDecisionStatus = (founderDecision) => {
  if (founderDecision && typeof founderDecision.decisionRef === "string" && founderDecision.decisionRef.length > 0) {
    return { "P1AF-089": "DECIDED", decisionRef: founderDecision.decisionRef, unblocks: [...PROVIDER_DEPENDENT_ROWS] };
  }
  return {
    "P1AF-089": "BLOCKED_EXTERNALLY",
    decisionRef: null,
    blockedRows: [...PROVIDER_DEPENDENT_ROWS],
    decisionPacket: "docs/security/p1-a/P1AF-089_FOUNDER_DECISION_PACKET_V1.md",
  };
};
// Finalizing a provider-dependent retention/deletion obligation without the
// founder decision is refused — providers are never guessed.
export const assertProviderObligationFinalizable = (obligation, founderDecision) => {
  if (obligation?.providerDependent !== true) return true;
  const status = providerDecisionStatus(founderDecision);
  if (status["P1AF-089"] !== "DECIDED") {
    fail("BLOCKED_EXTERNALLY",
      "provider-dependent obligation cannot be finalized before founder decision P1AF-089");
  }
  return true;
};

// ---------------------------------------------------------------------------
// base census (the persisted-data surfaces that exist at authorized base
// b0c1b212, read from both Prisma schemas). This is DATA about the base, used
// by the census document and tests; defects found at base are recorded, not
// silently fixed (schema files are routed via P1A-08).
// ---------------------------------------------------------------------------
export const BASE_SHA = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";
export const BASE_PERSISTENCE_MANIFEST = Object.freeze({
  exhaustive: false, // Prisma schemas only; caches/files/logs not yet censused
  surfaces: [
    { store: "artifact-registry:postgresql", table: "artifacts" },
    { store: "artifact-registry:postgresql", table: "artifact_lineage_edges" },
    { store: "artifact-registry:postgresql", table: "event_outbox" },
    { store: "brandgraph:sqlite", table: "Tenant" },
    { store: "brandgraph:sqlite", table: "Brand" },
    { store: "brandgraph:sqlite", table: "GraphEvent" },
    { store: "brandgraph:sqlite", table: "AgentManifest" },
    { store: "brandgraph:sqlite", table: "RotationAudit" },
  ],
});
export const BASE_SCHEMA_DEFECTS = Object.freeze([
  {
    id: "BD-06-001", surface: "brandgraph:sqlite:GraphEvent",
    defect: "No relation/FK to Tenant: tenant cascade deletion cannot reach GraphEvent rows (tenant-delete residue).",
    requirement: "P1AF-082", routing: "schema change routed via P1A-08 (04/06 seam)",
  },
  {
    id: "BD-06-002", surface: "brandgraph:sqlite:RotationAudit",
    defect: "onDelete: Cascade destroys rotation/revocation audit history on tenant delete, contradicting append-only preservation.",
    requirement: "P1AF-084", routing: "schema change routed via P1A-08 (04/06 seam)",
  },
  {
    id: "BD-06-003", surface: "artifact-registry:postgresql:event_outbox",
    defect: "payload Json rows have no retention class and no tombstone consultation on relay (deleted data can be resurrected).",
    requirement: "P1AF-079/P1AF-081", routing: "schema+relay change routed via P1A-08 (03/05/06 seam); RC-05-A pending",
  },
  {
    id: "BD-06-004", surface: "artifact-registry:postgresql:artifacts",
    defect: "payload/meta/evalReport Json unclassified; immutableAt sealing has no declared erasure reconciliation.",
    requirement: "P1AF-081/P1AF-083", routing: "schema change routed via P1A-08 (03/05/06 seam)",
  },
  {
    id: "BD-06-005", surface: "brandgraph:sqlite:GraphEvent.payload",
    defect: "payload persisted as opaque String (JSON) with no field-level classification.",
    requirement: "P1AF-081", routing: "classification enforced by this module; schema notes via P1A-08",
  },
]);

// The canonical lane-06 classification of the base surfaces. Registering this
// census through registerPersistedClass proves the declarations are complete
// (each entry passes the fail-closed gates above).
export const buildBaseClassificationRegistry = () => {
  const registry = createClassificationRegistry();
  const rows = [
    {
      classId: "artifact-registry.artifacts", store: "artifact-registry:postgresql", table: "artifacts",
      dataClass: "TENANT_CONTENT", retentionClassId: "RET-TENANT-CONTENT",
      copyScopes: ["PRIMARY", "DERIVED", "REPLICA", "BACKUP"],
      tenantScoped: true, tenantDeletionPath: "workspaceId/brandId scoped delete via lifecycle engine",
      subjectScoped: false, sealed: true, erasureStrategy: "CRYPTO_ERASE",
      jsonFields: [
        { field: "payload", dataClass: "TENANT_CONTENT" },
        { field: "meta", dataClass: "TELEMETRY" },
        { field: "evalReport", dataClass: "EVIDENCE_AUDIT" },
      ],
    },
    {
      classId: "artifact-registry.artifact_lineage_edges", store: "artifact-registry:postgresql", table: "artifact_lineage_edges",
      dataClass: "EVIDENCE_AUDIT", retentionClassId: "RET-EVIDENCE",
      copyScopes: ["PRIMARY", "REPLICA", "BACKUP"],
      tenantScoped: false, subjectScoped: false, erasureStrategy: "SCOPED_EXEMPTION",
      exemptionJustification: "lineage is payload-free evidence required for rollback/invalidation (P1AF-084)",
      appendOnly: true, payloadFree: true,
    },
    {
      classId: "artifact-registry.event_outbox", store: "artifact-registry:postgresql", table: "event_outbox",
      dataClass: "TENANT_CONTENT", retentionClassId: "RET-OUTBOX",
      copyScopes: ["PRIMARY", "OUTBOX", "REPLICA", "BACKUP"],
      tenantScoped: false, subjectScoped: true, erasureStrategy: "TOMBSTONE",
      jsonFields: [{ field: "payload", dataClass: "TENANT_CONTENT" }],
    },
    {
      classId: "brandgraph.Tenant", store: "brandgraph:sqlite", table: "Tenant",
      dataClass: "OPERATIONAL_PERSONAL", retentionClassId: "RET-TENANT-IDENTITY",
      copyScopes: ["PRIMARY", "BACKUP"],
      tenantScoped: true, tenantDeletionPath: "root of cascade; engine-planned",
      subjectScoped: false, erasureStrategy: "TOMBSTONE",
    },
    {
      classId: "brandgraph.Brand", store: "brandgraph:sqlite", table: "Brand",
      dataClass: "TENANT_CONTENT", retentionClassId: "RET-TENANT-CONTENT",
      copyScopes: ["PRIMARY", "BACKUP"],
      tenantScoped: true, tenantDeletionPath: "FK cascade from Tenant (declared in schema)",
      subjectScoped: false, erasureStrategy: "PHYSICAL_DELETE",
    },
    {
      classId: "brandgraph.GraphEvent", store: "brandgraph:sqlite", table: "GraphEvent",
      dataClass: "TENANT_CONTENT", retentionClassId: "RET-EVENTS",
      copyScopes: ["PRIMARY", "BACKUP"],
      tenantScoped: true,
      tenantDeletionPath: "engine-governed scan by tenantId (NO FK at base — defect BD-06-001, fix routed via P1A-08)",
      subjectScoped: false, erasureStrategy: "PHYSICAL_DELETE",
      jsonFields: [{ field: "payload", dataClass: "TENANT_CONTENT" }],
    },
    {
      classId: "brandgraph.AgentManifest", store: "brandgraph:sqlite", table: "AgentManifest",
      dataClass: "OPERATIONAL_PERSONAL", retentionClassId: "RET-AGENT-MANIFEST",
      copyScopes: ["PRIMARY", "BACKUP"],
      tenantScoped: true, tenantDeletionPath: "FK cascade from Tenant (declared in schema)",
      subjectScoped: true, erasureStrategy: "PHYSICAL_DELETE",
    },
    {
      classId: "brandgraph.RotationAudit", store: "brandgraph:sqlite", table: "RotationAudit",
      dataClass: "EVIDENCE_AUDIT", retentionClassId: "RET-EVIDENCE",
      copyScopes: ["PRIMARY", "BACKUP"],
      tenantScoped: true,
      tenantDeletionPath: "SCOPED_EXEMPTION — preserved, pseudonymized (base cascade is defect BD-06-002, fix routed via P1A-08)",
      subjectScoped: false, erasureStrategy: "SCOPED_EXEMPTION",
      exemptionJustification: "rotation/revocation history is append-only evidence (P1AF-084)",
      appendOnly: true, payloadFree: true,
    },
  ];
  for (const row of rows) registerPersistedClass(registry, row);
  return registry;
};

export const buildBaseRetentionPolicySet = () => {
  const set = createRetentionPolicySet();
  defineRetentionClass(set, { id: "RET-TENANT-CONTENT", appliesTo: "TENANT_CONTENT", retainDays: 730, clockBasis: "CREATED_AT" });
  defineRetentionClass(set, {
    id: "RET-EVIDENCE", appliesTo: "EVIDENCE_AUDIT", retainDays: "UNBOUNDED_WITH_JUSTIFICATION",
    unboundedJustification: "certification/rollback evidence; payload-free; preserved under P1AF-084",
    clockBasis: "CREATED_AT",
  });
  defineRetentionClass(set, { id: "RET-OUTBOX", appliesTo: "TENANT_CONTENT", retainDays: 30, clockBasis: "CREATED_AT" });
  defineRetentionClass(set, { id: "RET-TENANT-IDENTITY", appliesTo: "OPERATIONAL_PERSONAL", retainDays: 1095, clockBasis: "LAST_ACTIVITY" });
  defineRetentionClass(set, { id: "RET-EVENTS", appliesTo: "TENANT_CONTENT", retainDays: 365, clockBasis: "CREATED_AT" });
  defineRetentionClass(set, { id: "RET-AGENT-MANIFEST", appliesTo: "OPERATIONAL_PERSONAL", retainDays: 400, clockBasis: "CREATED_AT" });
  return set;
};

// ---------------------------------------------------------------------------
// property register (mutation denominator) + lane requirement status
// ---------------------------------------------------------------------------
export const PROPERTY_REGISTER = Object.freeze([
  { id: "P077_document_capability", requirement: "P1AF-077" },
  { id: "P078_accountable_role", requirement: "P1AF-078" },
  { id: "P079_no_unclassified_retention", requirement: "P1AF-079" },
  { id: "P080_deletion_completeness", requirement: "P1AF-080" },
  { id: "P080_no_silent_retain", requirement: "P1AF-080" },
  { id: "P080_receipt_not_forgeable", requirement: "P1AF-080" },
  { id: "P080_idempotent_retry", requirement: "P1AF-080" },
  { id: "P080_no_overclaim", requirement: "P1AF-080" },
  { id: "P081_json_lifecycle", requirement: "P1AF-081" },
  { id: "P081_tombstone_payload_free", requirement: "P1AF-081" },
  { id: "P082_tenant_plan_coverage", requirement: "P1AF-082" },
  { id: "P082_cross_tenant_refused", requirement: "P1AF-082" },
  { id: "P083_sealed_erasure_reconciled", requirement: "P1AF-083" },
  { id: "P084_audit_append_only", requirement: "P1AF-084" },
  { id: "P085_cache_ttl_bounded", requirement: "P1AF-085" },
  { id: "P086_invalidation_named", requirement: "P1AF-086" },
  { id: "P087_evidence_retention_reconciled", requirement: "P1AF-087" },
  { id: "P088_portal_lifecycle_declared", requirement: "P1AF-088" },
  { id: "P089_provider_blocked_externally", requirement: "P1AF-089" },
  { id: "P090_provider_parity", requirement: "P1AF-090" },
  { id: "PX_holds_block_deletion", requirement: "attack:legal-hold-bypass" },
  { id: "PX_retention_clock_anchor", requirement: "attack:retention-clock-reset" },
  { id: "PX_policy_downgrade_authority", requirement: "attack:policy-downgrade" },
  { id: "PX_expired_unreadable", requirement: "attack:expired-data-readable" },
  { id: "PX_relay_tombstone_guard", requirement: "attack:outbox-resurrection" },
  { id: "PX_residue_degrades_status", requirement: "attack:deleted-data-reappears" },
]);

export const laneRequirementStatus = () => ({
  lane: "P1A-06",
  baseSha: BASE_SHA,
  rows: {
    "P1AF-077": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-078": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-079": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-080": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-081": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-082": "PARTIAL", // engine + plan implemented; base FK defect BD-06-001 fix routed via P1A-08
    "P1AF-083": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-084": "PARTIAL", // module enforces; base cascade defect BD-06-002 fix routed via P1A-08
    "P1AF-085": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-086": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-087": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-088": "IMPLEMENTED_WITH_LOCAL_TESTS",
    "P1AF-089": "BLOCKED_EXTERNALLY",
    "P1AF-090": "IMPLEMENTED_WITH_LOCAL_TESTS",
  },
  scopeHonesty: [
    "Local deterministic library + tests only. No runtime claim, no production claim.",
    "Schema/shared-surface changes are NOT made here; they are routed via P1A-08 (03/05/06 and 04/06 seams).",
    "Real backup/replica erasure is environment-owned; this module models and verifies the CONTRACT (scope outcomes, UNSUPPORTED never promotes to COMPLETE).",
  ],
});
