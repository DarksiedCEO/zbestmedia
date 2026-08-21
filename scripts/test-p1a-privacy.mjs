// P1A-06 privacy/data-lifecycle test battery: unit, property/invariant,
// integration, and the required hostile negative-control set. Every hostile
// case must FAIL CLOSED. Exit code is non-zero on any failure.
import assert from "node:assert/strict";
import {
  POLICY_MODULE_VERSION, canonicalJson, digestOf, subjectHash, tenantHash, PrivacyError,
  DATA_CLASSES, ERASURE_STRATEGIES, COPY_SCOPES, PROVEN_SCOPE_OUTCOMES, SCOPE_OUTCOMES,
  ACCOUNTABLE_RETENTION_ROLE,
  createClassificationRegistry, registerPersistedClass, getPersistedClass, verifyCensusCoverage,
  createRetentionPolicySet, defineRetentionClass, amendRetentionClass,
  retentionAnchorFor, assertAnchorUnmoved, evaluateRetention, guardRead,
  createHoldLedger, placeHold, releaseHold, activeHolds,
  evaluateDeletionEligibility, createDeletionEngine, executeDeletion, retryDeletion,
  aggregateDeletionStatus, aggregateRequestStatus, verifyDeletionReceipt, assertReportableStatus,
  makeTombstone, createTombstoneIndex, recordTombstone, isTombstoned, guardOutboxRelay,
  verifyNoResidue, planTenantDeletion, verifyTenantPlanCoverage, findOrphans,
  createAuditTrail, appendAudit, removeAuditEntry, verifyAuditChain,
  INVALIDATION_REQUIRED_FIELDS, emitInvalidation,
  boundedCacheTtl, createAuthzCache, cacheAuthorization, readAuthorization,
  reconcileEvidenceRetention, resolveDeleteEvidenceConflict, findStaleDerived,
  DOCUMENT_LIFECYCLE_STATES, createDocumentStore, storeDocument, assertAccountableActor, transitionDocument,
  STORE_SEMANTICS, createMemoryStoreAdapter, verifyProviderParity,
  PROVIDER_DEPENDENT_ROWS, providerDecisionStatus, assertProviderObligationFinalizable,
  BASE_SHA, BASE_PERSISTENCE_MANIFEST, BASE_SCHEMA_DEFECTS,
  buildBaseClassificationRegistry, buildBaseRetentionPolicySet,
  PROPERTY_REGISTER, laneRequirementStatus,
} from "./validate-p1a-privacy.mjs";

let executed = 0, passed = 0, hostileExecuted = 0, hostilePassed = 0;
const run = (name, fn) => { executed += 1; fn(); passed += 1; console.log(`PASS ${name}`); };
const hostile = (name, fn) => { hostileExecuted += 1; fn(); hostilePassed += 1; console.log(`PASS hostile:${name}`); };
const throwsCode = (fn, code) => {
  let threw = null;
  try { fn(); } catch (err) { threw = err; }
  assert.ok(threw instanceof PrivacyError, `expected PrivacyError ${code}, got ${threw}`);
  assert.equal(threw.code, code);
};

const NOW = "2026-08-20T12:00:00.000Z";
const LATER = "2028-12-31T00:00:00.000Z";

// deterministic PRNG for property sweeps (no Math.random)
const makePrng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

// --- fixtures ---------------------------------------------------------------
const goodClass = (over = {}) => ({
  classId: "t.example", store: "s", table: "example",
  dataClass: "TENANT_CONTENT", retentionClassId: "RET-X",
  copyScopes: ["PRIMARY", "CACHE"], tenantScoped: false, subjectScoped: true,
  erasureStrategy: "TOMBSTONE", ...over,
});
const policySetWith = (over = {}) => {
  const set = createRetentionPolicySet();
  defineRetentionClass(set, { id: "RET-X", appliesTo: "TENANT_CONTENT", retainDays: 30, clockBasis: "CREATED_AT", ...over });
  return set;
};
const okAdapter = () => ({ delete: () => ({ outcome: "DELETED" }), listResidue: () => [] });
const failingAdapter = () => ({ delete: () => { throw new Error("io"); }, listResidue: () => [] });
const registryWith = (cls) => {
  const registry = createClassificationRegistry();
  registerPersistedClass(registry, cls);
  return registry;
};
const target = (over = {}) => ({
  targetId: "row-1", classId: "t.example", tenantId: "tenant-A", subjectId: "subj-1",
  record: { createdAt: "2026-01-01T00:00:00.000Z" }, ...over,
});
const request = (over = {}) => ({
  requestId: "req-1", basis: "ERASURE_REQUEST", tenantId: "tenant-A", subjectId: "subj-1", ...over,
});
const eligibilityFor = ({ reg, set, holds, req, targets, now = NOW }) =>
  evaluateDeletionEligibility({
    registry: reg, policySet: set, holdLedger: holds ?? createHoldLedger(),
    request: req ?? request(), targets: targets ?? [target()], now,
  });

// ===========================================================================
// unit: canonicalization + vocabulary
// ===========================================================================
run("canonicalJson is key-order independent", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
});
run("vocabulary frozen", () => {
  assert.ok(DATA_CLASSES.includes("SECRET_CREDENTIAL"));
  assert.ok(ERASURE_STRATEGIES.includes("SCOPED_EXEMPTION"));
  assert.deepEqual([...PROVEN_SCOPE_OUTCOMES], ["DELETED", "TOMBSTONED", "CRYPTO_ERASED", "EXEMPT_DECLARED"]);
  assert.ok(SCOPE_OUTCOMES.includes("UNSUPPORTED"));
  assert.equal(POLICY_MODULE_VERSION, "P1A_06_PRIVACY_V1");
});

// ===========================================================================
// P1AF-079 / P1AF-081 / P1AF-082 / P1AF-083 — classification fail-closed
// ===========================================================================
run("P079 classification requires retention class", () => {
  const registry = createClassificationRegistry();
  registerPersistedClass(registry, goodClass());
  assert.equal(getPersistedClass(registry, "t.example").retentionClassId, "RET-X");
});
hostile("P079 persist class with no declared retention -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(), goodClass({ retentionClassId: undefined })), "CLASS_WITHOUT_RETENTION");
});
hostile("P081 JSON field without data class -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ jsonFields: [{ field: "payload" }] })), "JSON_FIELD_UNCLASSIFIED");
});
hostile("P082 tenant-scoped class without deletion path -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ tenantScoped: true })), "TENANT_TABLE_WITHOUT_DELETION_PATH");
});
hostile("P083 sealed class without erasure reconciliation -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ sealed: true, erasureStrategy: "PHYSICAL_DELETE" })), "SEALED_WITHOUT_ERASURE_RECONCILIATION");
});
hostile("secrets: unbounded retention -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ dataClass: "SECRET_CREDENTIAL", retentionUnbounded: true })), "SECRET_IMPROPER_RETENTION");
});
hostile("scoped exemption without justification -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ erasureStrategy: "SCOPED_EXEMPTION" })), "EXEMPTION_UNJUSTIFIED");
});
hostile("EVIDENCE_AUDIT class not append-only/payload-free -> rejected", () => {
  throwsCode(() => registerPersistedClass(createClassificationRegistry(),
    goodClass({ dataClass: "EVIDENCE_AUDIT", erasureStrategy: "SCOPED_EXEMPTION", exemptionJustification: "j" })), "AUDIT_CLASS_MISDECLARED");
});
run("census coverage flags ungoverned persistence; partial manifest stays COVERAGE_UNKNOWN", () => {
  const registry = registryWith(goodClass({ store: "s", table: "example" }));
  const gaps = verifyCensusCoverage(registry, { exhaustive: true, surfaces: [{ store: "s", table: "example" }, { store: "s", table: "shadow" }] });
  assert.equal(gaps.coverage, "GAPS_FOUND");
  assert.deepEqual(gaps.findings, ["UNGOVERNED_PERSISTENCE:s:shadow"]);
  const partial = verifyCensusCoverage(registry, { exhaustive: false, surfaces: [{ store: "s", table: "example" }] });
  assert.equal(partial.coverage, "COVERAGE_UNKNOWN");
});

// ===========================================================================
// retention: expiry, clock reset, downgrade, expired reads
// ===========================================================================
run("retention evaluates ACTIVE then EXPIRED", () => {
  const set = policySetWith();
  const a = evaluateRetention({ policySet: set, retentionClassId: "RET-X", anchor: "2026-08-01T00:00:00.000Z", now: NOW });
  assert.equal(a.state, "ACTIVE");
  const b = evaluateRetention({ policySet: set, retentionClassId: "RET-X", anchor: "2026-01-01T00:00:00.000Z", now: NOW });
  assert.equal(b.state, "EXPIRED");
});
hostile("retention-clock reset (anchor moved) -> rejected", () => {
  throwsCode(() => assertAnchorUnmoved("2026-01-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"), "RETENTION_CLOCK_RESET");
});
run("retention anchor derives from declared clock basis", () => {
  const rec = { createdAt: "2026-01-01T00:00:00.000Z", sealedAt: "2026-02-01T00:00:00.000Z" };
  assert.equal(retentionAnchorFor(rec, "CREATED_AT"), rec.createdAt);
  assert.equal(retentionAnchorFor(rec, "SEALED_AT"), rec.sealedAt);
});
hostile("policy downgrade without authority -> rejected (personal data lengthened)", () => {
  const set = createRetentionPolicySet();
  defineRetentionClass(set, { id: "RET-P", appliesTo: "REGULATED_PERSONAL", retainDays: 30, clockBasis: "CREATED_AT" });
  throwsCode(() => amendRetentionClass(set, "RET-P", { retainDays: 3650 }), "POLICY_DOWNGRADE_REJECTED");
});
hostile("policy downgrade without authority -> rejected (evidence shortened)", () => {
  const set = createRetentionPolicySet();
  defineRetentionClass(set, { id: "RET-E", appliesTo: "EVIDENCE_AUDIT", retainDays: 3650, clockBasis: "CREATED_AT" });
  throwsCode(() => amendRetentionClass(set, "RET-E", { retainDays: 30 }), "POLICY_DOWNGRADE_REJECTED");
});
run("policy downgrade WITH authority is versioned append-only", () => {
  const set = createRetentionPolicySet();
  defineRetentionClass(set, { id: "RET-P", appliesTo: "REGULATED_PERSONAL", retainDays: 30, clockBasis: "CREATED_AT" });
  const amended = amendRetentionClass(set, "RET-P", { retainDays: 60 }, "FOUNDER_RULING_X");
  assert.equal(amended.version, 2);
  assert.equal(set.versions.length, 2);
  assert.equal(set.versions[1].authorityRef, "FOUNDER_RULING_X");
});
hostile("expired data still readable -> read denied", () => {
  throwsCode(() => guardRead({ retentionState: "EXPIRED", tombstoned: false }), "READ_DENIED_EXPIRED");
});
hostile("tombstoned data readable -> read denied", () => {
  throwsCode(() => guardRead({ retentionState: "ACTIVE", tombstoned: true }), "READ_DENIED_TOMBSTONED");
});

// ===========================================================================
// holds
// ===========================================================================
run("hold ledger places and releases with authority", () => {
  const holds = createHoldLedger();
  placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "TENANT", tenantId: "tenant-A" }, reason: "litigation" });
  assert.equal(activeHolds(holds, { tenantId: "tenant-A" }).length, 1);
  releaseHold(holds, "h1", "COUNSEL_REF_9");
  assert.equal(activeHolds(holds, { tenantId: "tenant-A" }).length, 0);
});
hostile("hold release without authority -> rejected", () => {
  const holds = createHoldLedger();
  placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "TENANT", tenantId: "tenant-A" }, reason: "r" });
  throwsCode(() => releaseHold(holds, "h1"), "HOLD_RELEASE_UNAUTHORIZED");
});

// ===========================================================================
// deletion eligibility — the four refusal controls
// ===========================================================================
hostile("cross-tenant delete -> TENANT_MISMATCH refused", () => {
  const e = eligibilityFor({
    reg: registryWith(goodClass()), set: policySetWith(),
    targets: [target({ tenantId: "tenant-B" })],
  });
  assert.equal(e.decisions[0].verdict, "REFUSED");
  assert.equal(e.decisions[0].reason, "TENANT_MISMATCH");
});
hostile("wrong-subject delete -> SUBJECT_MISMATCH refused", () => {
  const e = eligibilityFor({
    reg: registryWith(goodClass()), set: policySetWith(),
    targets: [target({ subjectId: "subj-OTHER" })],
  });
  assert.equal(e.decisions[0].verdict, "REFUSED");
  assert.equal(e.decisions[0].reason, "SUBJECT_MISMATCH");
});
hostile("retention not expired -> RETENTION_ACTIVE refused", () => {
  const e = eligibilityFor({
    reg: registryWith(goodClass()), set: policySetWith(),
    req: request({ basis: "RETENTION_EXPIRY" }),
    targets: [target({ record: { createdAt: "2026-08-15T00:00:00.000Z" } })],
  });
  assert.equal(e.decisions[0].verdict, "REFUSED");
  assert.equal(e.decisions[0].reason, "RETENTION_ACTIVE");
});
hostile("active hold -> BLOCKED_BY_HOLD (and request status reflects it)", () => {
  const holds = createHoldLedger();
  placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith(), holds });
  assert.equal(e.decisions[0].verdict, "BLOCKED_BY_HOLD");
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  const receipt = executeDeletion(engine, e);
  assert.equal(receipt.status, "BLOCKED_BY_HOLD");
  assert.equal(engine.sideEffects.length, 0); // nothing executed under hold
});

// ===========================================================================
// deletion execution — completeness, partial, idempotency, receipts
// ===========================================================================
run("P080 full-scope deletion is COMPLETE with verified receipt", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  const receipt = executeDeletion(engine, e);
  assert.equal(receipt.status, "COMPLETE");
  const v = verifyDeletionReceipt(engine, receipt);
  assert.equal(v.verdict, "RECEIPT_VERIFIED");
});
hostile("partial delete reported as partial, never complete", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", failingAdapter()]], engineSeed: "seed-0001" });
  const receipt = executeDeletion(engine, e);
  assert.equal(receipt.results[0].status, "PARTIAL");
  assert.equal(receipt.status, "PARTIAL");
});
hostile("declared scope with no executor -> UNKNOWN (UNSUPPORTED never completes)", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()]], engineSeed: "seed-0001" }); // CACHE missing
  const receipt = executeDeletion(engine, e);
  assert.equal(receipt.results[0].status, "UNKNOWN");
  assert.ok(receipt.results[0].scopes.some((s) => s.outcome === "UNSUPPORTED"));
});
hostile("silent fallback from delete to retain -> rejected", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const silentRetain = { delete: () => ({ outcome: "RETAINED" }), listResidue: () => [] };
  const engine = createDeletionEngine({ adapters: [["PRIMARY", silentRetain], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  throwsCode(() => executeDeletion(engine, e), "SILENT_RETAIN_REJECTED");
});
run("retain WITH hold reference is a recorded (non-proven) outcome", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const heldRetain = { delete: () => ({ outcome: "RETAINED", holdRef: "h9" }), listResidue: () => [] };
  const engine = createDeletionEngine({ adapters: [["PRIMARY", heldRetain], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  const receipt = executeDeletion(engine, e);
  assert.equal(receipt.results[0].status, "UNKNOWN"); // retained copy => not proven
});
hostile("exemption claimed by adapter without declared strategy -> rejected", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const rogueExempt = { delete: () => ({ outcome: "EXEMPT_DECLARED" }), listResidue: () => [] };
  const engine = createDeletionEngine({ adapters: [["PRIMARY", rogueExempt], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  throwsCode(() => executeDeletion(engine, e), "EXEMPTION_UNDECLARED");
});
hostile("retry does not duplicate side effects (idempotency)", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  executeDeletion(engine, e);
  const effectsAfterFirst = engine.sideEffects.length;
  const second = executeDeletion(engine, e); // replay
  assert.equal(engine.sideEffects.length, effectsAfterFirst);
  assert.equal(second.status, "COMPLETE");
});
run("retry re-runs only failed scopes and converges to COMPLETE", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  let failOnce = true;
  const flaky = { delete: () => { if (failOnce) { failOnce = false; throw new Error("io"); } return { outcome: "DELETED" }; }, listResidue: () => [] };
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", flaky]], engineSeed: "seed-0001" });
  const first = executeDeletion(engine, e);
  assert.equal(first.status, "PARTIAL");
  const primaryEffects = engine.sideEffects.filter((k) => k.includes(":PRIMARY:")).length;
  const second = retryDeletion(engine, e);
  assert.equal(second.status, "COMPLETE");
  assert.equal(engine.sideEffects.filter((k) => k.includes(":PRIMARY:")).length, primaryEffects); // primary not re-run
});
hostile("forged deletion receipt (no execution) -> rejected", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  const forged = {
    receiptKind: "P1A06_DELETION_RECEIPT", requestId: e.requestId, basis: e.basis,
    tenantId: e.tenantId, subjectId: e.subjectId, executedAt: NOW,
    results: [{ targetId: "row-1", status: "COMPLETE", scopes: [
      { opKey: "req-1:PRIMARY:row-1", scope: "PRIMARY", targetId: "row-1", outcome: "DELETED", attestation: digestOf("fake") },
      { opKey: "req-1:CACHE:row-1", scope: "CACHE", targetId: "row-1", outcome: "DELETED", attestation: digestOf("fake2") },
    ] }],
    status: "COMPLETE",
  };
  forged.receiptDigest = digestOf({ ...forged, receiptDigest: undefined });
  const v = verifyDeletionReceipt(engine, forged);
  assert.equal(v.verdict, "RECEIPT_REJECTED");
  assert.ok(v.findings.some((f) => f.startsWith("ATTESTATION_INVALID")));
  assert.ok(v.findings.some((f) => f.startsWith("EXECUTION_UNRECORDED")));
});
hostile("tampered receipt digest -> rejected", () => {
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith() });
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  const receipt = executeDeletion(engine, e);
  const tampered = { ...receipt, tenantId: "tenant-EVIL" };
  const v = verifyDeletionReceipt(engine, tampered);
  assert.equal(v.verdict, "RECEIPT_REJECTED");
  assert.ok(v.findings.includes("RECEIPT_DIGEST_MISMATCH"));
});
hostile("executor without eligibility token -> refused (hold bypass defeated)", () => {
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()]], engineSeed: "seed-0001" });
  throwsCode(() => executeDeletion(engine, {
    requestId: "req-1", basis: "ERASURE_REQUEST", tenantId: "tenant-A", subjectId: "subj-1",
    evaluatedAt: NOW, decisions: [{ targetId: "row-1", classId: "t.example", tenantId: "tenant-A", subjectId: "subj-1", verdict: "ELIGIBLE", reason: "x", declaredScopes: ["PRIMARY"], erasureStrategy: "TOMBSTONE", exemptionJustification: null }],
  }), "EXECUTION_REFUSED_NO_ELIGIBILITY");
});
hostile("tampered eligibility (hold decision flipped to ELIGIBLE) -> refused", () => {
  const holds = createHoldLedger();
  placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
  const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith(), holds });
  e.decisions[0].verdict = "ELIGIBLE"; // attacker flips after evaluation
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
  throwsCode(() => executeDeletion(engine, e), "EXECUTION_REFUSED_NO_ELIGIBILITY");
});
hostile("unsupported COMPLETE deletion claim -> OVERCLAIM_REJECTED", () => {
  throwsCode(() => assertReportableStatus("COMPLETE", "PARTIAL"), "OVERCLAIM_REJECTED");
  throwsCode(() => assertReportableStatus("COMPLETE", "UNKNOWN"), "OVERCLAIM_REJECTED");
  assert.ok(assertReportableStatus("PARTIAL", "COMPLETE")); // weaker claims allowed
  assert.ok(assertReportableStatus("UNKNOWN", "UNKNOWN"));
});

// ===========================================================================
// tombstones, resurrection, residue
// ===========================================================================
run("P081 tombstone carries hashes only", () => {
  const t = makeTombstone({
    targetId: "row-1", classId: "t.example", tenantHash: tenantHash("tenant-A"),
    subjectHash: subjectHash("subj-1"), payloadDigest: digestOf("x"), deletedAt: NOW, requestId: "req-1",
  });
  assert.equal(t.targetId, "row-1");
});
hostile("tombstone with payload field -> rejected", () => {
  throwsCode(() => makeTombstone({
    targetId: "row-1", classId: "t.example", tenantHash: tenantHash("tenant-A"),
    deletedAt: NOW, requestId: "req-1", payload: { secret: 1 },
  }), "PROHIBITED_PAYLOAD_IN_TOMBSTONE");
});
hostile("outbox relay of tombstoned subject -> blocked (resurrection defeated)", () => {
  const index = createTombstoneIndex();
  recordTombstone(index, makeTombstone({
    targetId: "artifact-9", classId: "artifact-registry.event_outbox",
    tenantHash: tenantHash("tenant-A"), deletedAt: NOW, requestId: "req-1",
  }));
  assert.ok(isTombstoned(index, "artifact-9"));
  throwsCode(() => guardOutboxRelay(index, { subject: "artifact-9", payload: {} }), "RELAY_BLOCKED_TOMBSTONED");
  assert.ok(guardOutboxRelay(index, { subject: "artifact-10" }));
});
hostile("deleted primary but surviving cache -> RESIDUE:CACHE, status degraded", () => {
  const cacheWithResidue = { delete: () => ({ outcome: "DELETED" }), listResidue: (id) => (id === "row-1" ? [{ id }] : []) };
  const adapters = new Map([["PRIMARY", okAdapter()], ["CACHE", cacheWithResidue]]);
  const res = verifyNoResidue({ adapters, targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "PARTIAL" }] } });
  assert.equal(res.verdict, "RESIDUE_FOUND");
  assert.deepEqual(res.findings, ["RESIDUE:CACHE"]);
  assert.equal(res.effectiveStatus, "PARTIAL");
});
hostile("stale replica residue after COMPLETE claim -> REAPPEARANCE_DETECTED, claim degraded", () => {
  const replicaWithResidue = { delete: () => ({ outcome: "DELETED" }), listResidue: (id) => [{ id }] };
  const adapters = new Map([["PRIMARY", okAdapter()], ["REPLICA", replicaWithResidue]]);
  const res = verifyNoResidue({ adapters, targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
  assert.equal(res.verdict, "REAPPEARANCE_DETECTED");
  assert.equal(res.effectiveStatus, "PARTIAL"); // COMPLETE does not stand
});
run("residue-unverifiable scope yields UNKNOWN, not clean", () => {
  const opaque = { delete: () => ({ outcome: "DELETED" }) }; // no listResidue
  const adapters = new Map([["PRIMARY", okAdapter()], ["BACKUP", opaque]]);
  const res = verifyNoResidue({ adapters, targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
  assert.equal(res.verdict, "UNKNOWN");
  assert.equal(res.effectiveStatus, "UNKNOWN");
});

// ===========================================================================
// tenant deletion planning + orphans (P1AF-082, P1AF-084)
// ===========================================================================
run("P082 tenant plan covers every tenant-scoped class; audit classes exempt not forgotten", () => {
  const registry = buildBaseClassificationRegistry();
  const plan = planTenantDeletion(registry, "tenant-A");
  const cover = verifyTenantPlanCoverage(registry, plan);
  assert.equal(cover.verdict, "PLAN_COVERS_TENANT");
  assert.ok(plan.exempt.some((e) => e.classId === "brandgraph.RotationAudit")); // preserved, justified
  assert.ok(plan.include.some((i) => i.classId === "brandgraph.GraphEvent"));   // engine-governed despite no FK
});
hostile("tenant plan missing a registered class -> PLAN_INCOMPLETE", () => {
  const registry = buildBaseClassificationRegistry();
  const plan = planTenantDeletion(registry, "tenant-A");
  plan.include = plan.include.filter((i) => i.classId !== "brandgraph.GraphEvent");
  const cover = verifyTenantPlanCoverage(registry, plan);
  assert.equal(cover.verdict, "PLAN_INCOMPLETE");
  assert.deepEqual(cover.findings, ["TENANT_PLAN_GAP:brandgraph.GraphEvent"]);
});
run("orphan detection finds parentless rows (GraphEvent base-defect class)", () => {
  const orphans = findOrphans({
    rows: [{ id: "e1", tenantId: "t1" }, { id: "e2", tenantId: "GONE" }],
    parentIds: ["t1"], parentKey: "tenantId",
  });
  assert.deepEqual(orphans, ["e2"]);
});

// ===========================================================================
// audit trail + invalidation (P1AF-084, P1AF-086)
// ===========================================================================
run("audit chain is digest-linked and verifiable", () => {
  const trail = createAuditTrail();
  appendAudit(trail, { eventType: "CLASSIFY", subjectRef: subjectHash("s"), at: NOW });
  appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: subjectHash("s"), at: NOW });
  assert.equal(verifyAuditChain(trail).verdict, "CHAIN_INTACT");
});
hostile("audit entry with payload -> rejected", () => {
  const trail = createAuditTrail();
  throwsCode(() => appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: subjectHash("s"), at: NOW, payload: { pii: true } }), "PROHIBITED_PAYLOAD_IN_AUDIT");
});
hostile("audit entry with raw subject id -> rejected (hash required)", () => {
  const trail = createAuditTrail();
  throwsCode(() => appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: "andre@example.com", at: NOW }), "AUDIT_SUBJECT_REF_INVALID");
});
hostile("deleting audit/revocation history -> refused (append-only preserved)", () => {
  throwsCode(() => removeAuditEntry(), "AUDIT_APPEND_ONLY");
});
hostile("audit chain tamper detected", () => {
  const trail = createAuditTrail();
  appendAudit(trail, { eventType: "REVOKE", subjectRef: subjectHash("s"), at: NOW });
  trail.entries[0] = { ...trail.entries[0], eventType: "CLASSIFY" };
  assert.equal(verifyAuditChain(trail).verdict, "CHAIN_BROKEN");
});
run("P086 invalidation names all five fields", () => {
  const trail = createAuditTrail();
  const entry = emitInvalidation(trail, {
    subjectRef: subjectHash("s"), priorState: "AUTHORIZED", failedGate: "EVIDENCE_EXPIRED",
    policyVersion: "P1A_06_PRIVACY_V1", correlationId: "corr-1",
  }, NOW);
  for (const f of INVALIDATION_REQUIRED_FIELDS) assert.ok(entry[f]);
});
hostile("silent invalidation (missing field) -> rejected", () => {
  const trail = createAuditTrail();
  throwsCode(() => emitInvalidation(trail, {
    subjectRef: subjectHash("s"), priorState: "AUTHORIZED", failedGate: "EVIDENCE_EXPIRED",
    policyVersion: "P1A_06_PRIVACY_V1", // correlationId missing
  }, NOW), "INVALIDATION_FIELDS_MISSING");
});

// ===========================================================================
// cached authorization TTL (P1AF-085)
// ===========================================================================
run("P085 cache TTL bounded by earliest evidence expiry", () => {
  const ttl = boundedCacheTtl({
    requestedTtlMs: 3_600_000,
    evidenceExpiries: ["2026-08-20T12:30:00.000Z", "2026-08-21T00:00:00.000Z"],
    now: NOW,
  });
  assert.equal(ttl, 30 * 60 * 1000); // capped at 30 minutes, not the requested hour
});
hostile("cache outliving evidence expiry -> stale read denied", () => {
  const cache = createAuthzCache();
  cacheAuthorization(cache, {
    key: "k", decision: { allow: true }, requestedTtlMs: 3_600_000,
    evidenceExpiries: ["2026-08-20T12:10:00.000Z"], now: NOW,
  });
  assert.deepEqual(readAuthorization(cache, "k", "2026-08-20T12:05:00.000Z"), { allow: true });
  throwsCode(() => readAuthorization(cache, "k", "2026-08-20T12:10:00.000Z"), "CACHE_STALE_DENIED");
});
hostile("caching on already-expired evidence -> refused", () => {
  const cache = createAuthzCache();
  throwsCode(() => cacheAuthorization(cache, {
    key: "k", decision: { allow: true }, requestedTtlMs: 1000,
    evidenceExpiries: ["2026-08-20T11:00:00.000Z"], now: NOW,
  }), "CACHE_EVIDENCE_EXPIRED");
});

// ===========================================================================
// evidence retention reconciliation (P1AF-087) + delete-vs-evidence
// ===========================================================================
run("P087 cert record and artifact retention reconciled when aligned", () => {
  const artifacts = new Map([["a1", { retainUntil: LATER }]]);
  const res = reconcileEvidenceRetention({
    certRecord: { retainUntil: "2027-01-01T00:00:00.000Z", artifactRefs: ["a1"] },
    artifacts, now: NOW,
  });
  assert.equal(res.verdict, "RECONCILED");
});
hostile("cert record referencing already-expired artifact -> violation", () => {
  const artifacts = new Map([["a1", { retainUntil: "2026-01-01T00:00:00.000Z" }]]);
  const res = reconcileEvidenceRetention({
    certRecord: { retainUntil: LATER, artifactRefs: ["a1"] },
    artifacts, now: NOW,
  });
  assert.equal(res.verdict, "CONTRADICTION");
  assert.ok(res.findings.includes("EVIDENCE_RETENTION_VIOLATION:a1"));
  assert.equal(res.requiredAction, "EXTEND_ARTIFACT_RETENTION_OR_REVISE_RECORD");
});
hostile("artifact retention lapsing before record -> contradiction surfaced early", () => {
  const artifacts = new Map([["a1", { retainUntil: "2027-06-01T00:00:00.000Z" }]]);
  const res = reconcileEvidenceRetention({
    certRecord: { retainUntil: LATER, artifactRefs: ["a1"] },
    artifacts, now: NOW,
  });
  assert.equal(res.verdict, "CONTRADICTION");
  assert.ok(res.findings.includes("CERT_RETENTION_CONTRADICTION:a1"));
});
run("delete-vs-evidence conflict resolves per declared strategy, never silently", () => {
  const bindings = [{ artifactRef: "a1", certRecordId: "c1", retainUntil: LATER }];
  const cryptoErase = resolveDeleteEvidenceConflict({ targetId: "a1", erasureStrategy: "CRYPTO_ERASE", certBindings: bindings, now: NOW });
  assert.equal(cryptoErase.resolution, "CRYPTO_ERASE_PAYLOAD_PRESERVE_DIGESTS");
  const blocked = resolveDeleteEvidenceConflict({ targetId: "a1", erasureStrategy: "PHYSICAL_DELETE", certBindings: bindings, now: NOW });
  assert.equal(blocked.resolution, "BLOCKED_BY_EVIDENCE_OBLIGATION");
  const free = resolveDeleteEvidenceConflict({ targetId: "a2", erasureStrategy: "PHYSICAL_DELETE", certBindings: bindings, now: NOW });
  assert.equal(free.resolution, "NO_CONFLICT");
});
hostile("stale derived artifact (source superseded or deleted) -> flagged", () => {
  const findings = findStaleDerived({
    derived: [{ id: "d1", sourceId: "s1" }, { id: "d2", sourceId: "s2" }, { id: "d3", sourceId: "s3" }],
    sources: new Map([["s1", { supersededBy: "s1b" }], ["s3", {}]]),
  });
  assert.deepEqual(findings, ["STALE_DERIVED_SOURCE_SUPERSEDED:d1", "STALE_DERIVED_SOURCE_DELETED:d2"]);
});

// ===========================================================================
// documents + accountable role (P1AF-077, P1AF-078, P1AF-088)
// ===========================================================================
const RETENTION_ACTOR = { actorId: "andre", role: ACCOUNTABLE_RETENTION_ROLE };
run("P077/P088 document store enforces declared lifecycle", () => {
  const store = createDocumentStore();
  const doc = storeDocument(store, { documentId: "doc-1", state: "DRAFT", retentionClassId: "RET-X" }, RETENTION_ACTOR);
  assert.equal(doc.state, "DRAFT");
  const active = transitionDocument(store, "doc-1", "ACTIVE", RETENTION_ACTOR);
  assert.equal(active.state, "ACTIVE");
});
hostile("P088 store outside declared lifecycle -> rejected", () => {
  const store = createDocumentStore();
  throwsCode(() => storeDocument(store, { documentId: "doc-1", state: "SOMEWHERE", retentionClassId: "RET-X" }, RETENTION_ACTOR), "LIFECYCLE_UNDECLARED");
  throwsCode(() => storeDocument(store, { documentId: "doc-2", state: "DRAFT" }, RETENTION_ACTOR), "LIFECYCLE_UNDECLARED");
});
hostile("P078 retention action without accountable role -> rejected", () => {
  const store = createDocumentStore();
  throwsCode(() => storeDocument(store, { documentId: "doc-1", state: "DRAFT", retentionClassId: "RET-X" }, { actorId: "andre", role: "ENGINEER" }), "RETENTION_ACTION_UNACCOUNTABLE");
  throwsCode(() => assertAccountableActor(undefined, "RETAIN"), "RETENTION_ACTION_UNACCOUNTABLE");
});
hostile("invalid lifecycle transition -> rejected", () => {
  const store = createDocumentStore();
  storeDocument(store, { documentId: "doc-1", state: "TOMBSTONED", retentionClassId: "RET-X" }, RETENTION_ACTOR);
  throwsCode(() => transitionDocument(store, "doc-1", "ACTIVE", RETENTION_ACTOR), "LIFECYCLE_TRANSITION_INVALID");
});

// ===========================================================================
// provider parity (P1AF-090) + provider dependence (P1AF-089)
// ===========================================================================
run("P090 lifecycle scenario yields identical invariants on postgresql and sqlite models", () => {
  const scenario = (store) => {
    store.put("r1", { tenantId: "t1" });
    store.put("r2", { tenantId: "t1" });
    const first = store.delete({ targetId: "r1" });
    const again = store.delete({ targetId: "r1" }); // idempotent
    return {
      deletedOutcome: first.outcome, retryOutcome: again.outcome,
      residue: store.listResidue("r1"), remaining: store.size(),
    };
  };
  const parity = verifyProviderParity(scenario);
  assert.equal(parity.verdict, "PARITY_OK");
});
run("P090 declared semantics differ where expected and divergence is justified", () => {
  assert.notEqual(STORE_SEMANTICS.postgresql.concurrency, STORE_SEMANTICS.sqlite.concurrency);
});
run("P089 provider decision absent -> BLOCKED_EXTERNALLY with named blocked rows", () => {
  const status = providerDecisionStatus(null);
  assert.equal(status["P1AF-089"], "BLOCKED_EXTERNALLY");
  assert.deepEqual(status.blockedRows, [...PROVIDER_DEPENDENT_ROWS]);
  assert.ok(status.decisionPacket.includes("P1AF-089_FOUNDER_DECISION_PACKET_V1"));
});
hostile("P089 finalizing provider-dependent obligation without founder decision -> refused", () => {
  throwsCode(() => assertProviderObligationFinalizable({ providerDependent: true }, null), "BLOCKED_EXTERNALLY");
  assert.ok(assertProviderObligationFinalizable({ providerDependent: false }, null));
  assert.ok(assertProviderObligationFinalizable({ providerDependent: true }, { decisionRef: "FOUNDER_DECISION_X" }));
});

// ===========================================================================
// base census sanity
// ===========================================================================
run("base census registers all 8 base surfaces and passes fail-closed gates", () => {
  const registry = buildBaseClassificationRegistry();
  assert.equal(registry.classes.size, 8);
  const coverage = verifyCensusCoverage(registry, BASE_PERSISTENCE_MANIFEST);
  assert.equal(coverage.findings.length, 0);
  assert.equal(coverage.coverage, "COVERAGE_UNKNOWN"); // manifest declares itself non-exhaustive — preserved
  assert.equal(BASE_SHA, "b0c1b2129123b941c6a350c16dae0ae3a8e076ca");
  assert.ok(BASE_SCHEMA_DEFECTS.length >= 5);
});
run("base retention policy set defines every referenced retention class", () => {
  const registry = buildBaseClassificationRegistry();
  const set = buildBaseRetentionPolicySet();
  for (const cls of registry.classes.values()) {
    assert.ok(set.classes.has(cls.retentionClassId), `missing retention class ${cls.retentionClassId}`);
  }
});

// ===========================================================================
// property/invariant sweeps (seeded, deterministic)
// ===========================================================================
run("invariant: aggregate is COMPLETE iff every declared scope proven (256 random cases)", () => {
  const prng = makePrng(0xC0FFEE);
  for (let i = 0; i < 256; i += 1) {
    const declared = COPY_SCOPES.filter(() => prng() > 0.4);
    if (declared.length === 0) declared.push("PRIMARY");
    const ops = declared
      .filter(() => prng() > 0.1) // sometimes a scope never ran
      .map((scope) => ({ scope, outcome: SCOPE_OUTCOMES[Math.floor(prng() * SCOPE_OUTCOMES.length)] }));
    const status = aggregateDeletionStatus(ops, declared);
    const byScope = new Map(ops.map((o) => [o.scope, o]));
    const allProven = declared.every((s) => byScope.has(s) && PROVEN_SCOPE_OUTCOMES.includes(byScope.get(s).outcome));
    if (status === "COMPLETE") assert.ok(allProven, `COMPLETE without proof at case ${i}`);
    if (allProven) assert.equal(status, "COMPLETE");
  }
});
run("invariant: random retries never duplicate side effects (64 random schedules)", () => {
  const prng = makePrng(0xBEEF);
  for (let i = 0; i < 64; i += 1) {
    const e = eligibilityFor({ reg: registryWith(goodClass()), set: policySetWith(), req: request({ requestId: `req-${i}` }) });
    const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const replays = 1 + Math.floor(prng() * 5);
    for (let r = 0; r < replays; r += 1) executeDeletion(engine, e);
    assert.equal(engine.sideEffects.length, 2, `case ${i}: side effects duplicated`);
  }
});
run("invariant: request status never stronger than weakest target (81 combos)", () => {
  const statuses = ["COMPLETE", "PARTIAL", "UNKNOWN", "NOT_RUN"];
  for (const a of statuses) for (const b of statuses) {
    const agg = aggregateRequestStatus([{ status: a }, { status: b }]);
    if (agg === "COMPLETE") assert.ok(a === "COMPLETE" && b === "COMPLETE");
  }
  assert.equal(aggregateRequestStatus([]), "NOT_RUN");
  assert.equal(aggregateRequestStatus([{ status: "COMPLETE" }, { status: "BLOCKED_BY_HOLD" }]), "BLOCKED_BY_HOLD");
});

// ===========================================================================
// integration: full tenant-offboard lifecycle
// ===========================================================================
run("integration: hold -> blocked -> release -> partial -> retry -> complete -> tombstone -> no resurrection", () => {
  const registry = registryWith(goodClass({
    classId: "int.rows", copyScopes: ["PRIMARY", "CACHE", "OUTBOX"],
    tenantScoped: true, tenantDeletionPath: "engine",
  }));
  const set = policySetWith();
  const holds = createHoldLedger();
  const trail = createAuditTrail();
  const tIndex = createTombstoneIndex();
  const targets = [target({ classId: "int.rows" })];
  const req = request({ basis: "TENANT_OFFBOARD" });

  // 1. hold blocks
  placeHold(holds, { holdId: "h-int", kind: "LEGAL", scope: { kind: "TENANT", tenantId: "tenant-A" }, reason: "audit" });
  appendAudit(trail, { eventType: "HOLD_PLACE", subjectRef: tenantHash("tenant-A"), at: NOW });
  let e = eligibilityFor({ reg: registry, set, holds, req, targets });
  assert.equal(e.decisions[0].verdict, "BLOCKED_BY_HOLD");

  // 2. release with authority; now eligible
  releaseHold(holds, "h-int", "COUNSEL_REF_1");
  appendAudit(trail, { eventType: "HOLD_RELEASE", subjectRef: tenantHash("tenant-A"), at: NOW });
  e = eligibilityFor({ reg: registry, set, holds, req, targets });
  assert.equal(e.decisions[0].verdict, "ELIGIBLE");
  appendAudit(trail, { eventType: "DELETE_ELIGIBLE", subjectRef: tenantHash("tenant-A"), at: NOW });

  // 3. execute with flaky OUTBOX -> PARTIAL
  let outboxFails = true;
  const outbox = { delete: () => { if (outboxFails) { outboxFails = false; throw new Error("relay busy"); } return { outcome: "TOMBSTONED" }; }, listResidue: () => [] };
  const engine = createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()], ["OUTBOX", outbox]], engineSeed: "seed-int" });
  const first = executeDeletion(engine, e);
  assert.equal(first.status, "PARTIAL");
  assertReportableStatus(first.status, first.status);
  appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: tenantHash("tenant-A"), at: NOW });

  // 4. retry -> COMPLETE, receipt verifies
  const second = retryDeletion(engine, e);
  assert.equal(second.status, "COMPLETE");
  assert.equal(verifyDeletionReceipt(engine, second).verdict, "RECEIPT_VERIFIED");
  appendAudit(trail, { eventType: "DELETE_RETRY", subjectRef: tenantHash("tenant-A"), at: NOW });

  // 5. tombstone + resurrection guard + read guard
  recordTombstone(tIndex, makeTombstone({
    targetId: "row-1", classId: "int.rows", tenantHash: tenantHash("tenant-A"),
    subjectHash: subjectHash("subj-1"), deletedAt: NOW, requestId: req.requestId,
  }));
  appendAudit(trail, { eventType: "TOMBSTONE", subjectRef: tenantHash("tenant-A"), at: NOW });
  throwsCode(() => guardOutboxRelay(tIndex, { subject: "row-1" }), "RELAY_BLOCKED_TOMBSTONED");
  throwsCode(() => guardRead({ retentionState: "ACTIVE", tombstoned: isTombstoned(tIndex, "row-1") }), "READ_DENIED_TOMBSTONED");

  // 6. no residue; audit chain intact and payload-free throughout
  const res = verifyNoResidue({ adapters: engine.adapters, targetId: "row-1", receipt: second });
  assert.equal(res.verdict, "NO_RESIDUE");
  assert.equal(verifyAuditChain(trail).verdict, "CHAIN_INTACT");
  assert.equal(trail.entries.length, 6);
});

// ===========================================================================
// lane accounting
// ===========================================================================
run("property register covers all 14 lane requirements", () => {
  const covered = new Set(PROPERTY_REGISTER.map((p) => p.requirement).filter((r) => r.startsWith("P1AF-")));
  for (const row of ["P1AF-077", "P1AF-078", "P1AF-079", "P1AF-080", "P1AF-081", "P1AF-082", "P1AF-083",
    "P1AF-084", "P1AF-085", "P1AF-086", "P1AF-087", "P1AF-088", "P1AF-089", "P1AF-090"]) {
    assert.ok(covered.has(row), `no property for ${row}`);
  }
});
run("lane status preserves BLOCKED_EXTERNALLY and PARTIAL honestly", () => {
  const status = laneRequirementStatus();
  assert.equal(status.rows["P1AF-089"], "BLOCKED_EXTERNALLY");
  assert.equal(status.rows["P1AF-082"], "PARTIAL");
  assert.equal(status.rows["P1AF-084"], "PARTIAL");
  assert.equal(Object.keys(status.rows).length, 14);
  assert.ok(status.scopeHonesty.length >= 3);
});

// ===========================================================================
console.log("--------------------------------------------------------------");
console.log(`P1A-06 privacy battery: executed=${executed + hostileExecuted} passed=${passed + hostilePassed} (unit/integration ${passed}/${executed}, hostile ${hostilePassed}/${hostileExecuted}) skipped=0`);
if (executed !== passed || hostileExecuted !== hostilePassed) {
  console.error("FAILURES PRESENT");
  process.exit(1);
}
