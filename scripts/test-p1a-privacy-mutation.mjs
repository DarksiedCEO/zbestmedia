// P1A-06 mutation harness (V2). Every property has at least one mutant that
// weakens its guard. A mutant is KILLED when at least one invariant probe fails
// against it (or it fails to load). A mutant whose find-pattern is absent from
// the source is an APPLICATION FAILURE (the harness fails closed). Survivors
// required: 0. V2 adds mutants for the IR-001..008 remediations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./validate-p1a-privacy.mjs", import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const NOW = "2026-08-20T12:00:00.000Z";
const LATER = "2028-12-31T00:00:00.000Z";
const SECRET = "authority-secret-key-0001";

const importSource = async (source) =>
  import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// --- fixtures (parameterized on the module) ---------------------------------
const goodClass = (o = {}) => ({
  classId: "t.example", store: "s", table: "example", dataClass: "TENANT_CONTENT", retentionClassId: "RET-X",
  copyScopes: ["PRIMARY", "CACHE"], tenantScoped: false, subjectScoped: true, erasureStrategy: "TOMBSTONE", ...o,
});
const target = (o = {}) => ({
  targetId: "row-1", classId: "t.example", tenantId: "tenant-A", subjectId: "subj-1",
  record: { createdAt: "2026-01-01T00:00:00.000Z" }, registeredAnchor: "2026-01-01T00:00:00.000Z", ...o,
});
const request = (o = {}) => ({ requestId: "req-1", basis: "ERASURE_REQUEST", tenantId: "tenant-A", subjectId: "subj-1", ...o });
const okAdapter = () => ({ delete: () => ({ outcome: "DELETED" }), listResidue: () => [] });
const failingAdapter = () => ({ delete: () => { throw new Error("io"); }, listResidue: () => [] });
const setup = (m, over = {}) => {
  const reg = m.createClassificationRegistry();
  m.registerPersistedClass(reg, goodClass(over.cls));
  const set = m.createRetentionPolicySet();
  m.defineRetentionClass(set, { id: "RET-X", appliesTo: "TENANT_CONTENT", retainDays: 30, clockBasis: "CREATED_AT" });
  const holds = m.createHoldLedger();
  const authority = m.createDeletionAuthority({ authoritySecret: SECRET });
  return { reg, set, holds, authority };
};
const elig = (m, ctx, over = {}) => m.evaluateDeletionEligibility({
  authority: ctx.authority, registry: ctx.reg, policySet: ctx.set, holdLedger: over.holds ?? ctx.holds,
  request: over.req ?? request(), targets: over.targets ?? [target()], certBindings: over.certBindings, now: NOW,
});
const exec = (m, ctx, engine, e, over = {}) => m.executeDeletion(engine, e, { authority: ctx.authority, holdLedger: over.holds ?? ctx.holds, now: NOW });
const expectCode = (fn, code) => {
  let threw = null;
  try { fn(); } catch (err) { threw = err; }
  assert.ok(threw, `expected ${code}, nothing thrown`);
  assert.equal(threw.code, code);
};

// --- invariant probes -------------------------------------------------------
const PROBES = {
  P079_no_unclassified_retention: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ retentionClassId: undefined })), "CLASS_WITHOUT_RETENTION"),
  P081_json_lifecycle: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ jsonFields: [{ field: "payload" }] })), "JSON_FIELD_UNCLASSIFIED"),
  P082_tenant_path_required: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ tenantScoped: true })), "TENANT_TABLE_WITHOUT_DELETION_PATH"),
  P083_sealed_erasure_reconciled: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ sealed: true, erasureStrategy: "PHYSICAL_DELETE" })), "SEALED_WITHOUT_ERASURE_RECONCILIATION"),
  PX_secret_bounded: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ dataClass: "SECRET_CREDENTIAL", retentionUnbounded: true })), "SECRET_IMPROPER_RETENTION"),
  PX_audit_class_shape: (m) => expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ dataClass: "EVIDENCE_AUDIT", erasureStrategy: "SCOPED_EXEMPTION", exemptionJustification: "j" })), "AUDIT_CLASS_MISDECLARED"),
  PX_policy_downgrade_authority: (m) => {
    const set = m.createRetentionPolicySet();
    m.defineRetentionClass(set, { id: "RET-P", appliesTo: "REGULATED_PERSONAL", retainDays: 30, clockBasis: "CREATED_AT" });
    expectCode(() => m.amendRetentionClass(set, "RET-P", { retainDays: 3650 }), "POLICY_DOWNGRADE_REJECTED");
  },
  PX_retention_clock_anchor: (m) => expectCode(() => m.assertAnchorUnmoved("2026-01-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"), "RETENTION_CLOCK_RESET"),
  PX_expired_unreadable: (m) => expectCode(() => m.guardRead({ retentionState: "EXPIRED", tombstoned: false }), "READ_DENIED_EXPIRED"),
  PX_tombstoned_unreadable: (m) => expectCode(() => m.guardRead({ retentionState: "ACTIVE", tombstoned: true }), "READ_DENIED_TOMBSTONED"),
  PX_hold_release_authority: (m) => {
    const holds = m.createHoldLedger();
    m.placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "TENANT", tenantId: "tenant-A" }, reason: "r" });
    expectCode(() => m.releaseHold(holds, "h1"), "HOLD_RELEASE_UNAUTHORIZED");
  },
  P082_cross_tenant_refused: (m) => {
    const ctx = setup(m);
    assert.equal(elig(m, ctx, { targets: [target({ tenantId: "tenant-B" })] }).decisions[0].verdict, "REFUSED");
  },
  PX_wrong_subject_refused: (m) => {
    const ctx = setup(m);
    assert.equal(elig(m, ctx, { targets: [target({ subjectId: "subj-OTHER" })] }).decisions[0].verdict, "REFUSED");
  },
  PX_holds_block_deletion: (m) => {
    const ctx = setup(m);
    m.placeHold(ctx.holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
    assert.equal(elig(m, ctx).decisions[0].verdict, "BLOCKED_BY_HOLD");
  },
  PX_retention_active_refused: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx, { req: request({ basis: "RETENTION_EXPIRY" }), targets: [target({ record: { createdAt: "2026-08-15T00:00:00.000Z" }, registeredAnchor: "2026-08-15T00:00:00.000Z" })] });
    assert.equal(e.decisions[0].verdict, "REFUSED");
    assert.equal(e.decisions[0].reason, "RETENTION_ACTIVE");
  },
  IR001_eligibility_keyed: (m) => {
    // forged: flip a hold->ELIGIBLE and recompute with PUBLIC digestOf
    const ctx = setup(m);
    m.placeHold(ctx.holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
    const e = elig(m, ctx);
    e.decisions[0].verdict = "ELIGIBLE"; e.decisions[0].reason = "ERASURE_REQUEST";
    const { eligibilityMac, eligibilityToken, ...decision } = e;
    e.eligibilityMac = m.digestOf({ kind: "P1A06_ELIGIBILITY", decision }); e.eligibilityToken = e.eligibilityMac;
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => exec(m, ctx, engine, e), "EXECUTION_REFUSED_UNAUTHENTICATED");
    // and a different authority key cannot authenticate
    const attacker = m.createDeletionAuthority({ authoritySecret: "attacker-secret-key-9999" });
    const e2 = elig(m, ctx, { targets: [target()] });
    const engine2 = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => m.executeDeletion(engine2, e2, { authority: attacker, holdLedger: ctx.holds, now: NOW }), "EXECUTION_REFUSED_UNAUTHENTICATED");
  },
  IR002_hold_revalidated: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    m.placeHold(ctx.holds, { holdId: "late", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const r = exec(m, ctx, engine, e); // hold placed after eligibility
    assert.equal(r.status, "BLOCKED_BY_HOLD");
    assert.equal(engine.sideEffects.length, 0);
    // and execution without the hold ledger is refused
    const e2 = elig(m, setup(m));
    const engine2 = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => m.executeDeletion(engine2, e2, { authority: ctx.authority, now: NOW }), "HOLD_LEDGER_REQUIRED");
  },
  IR003_receipt_vs_eligibility: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const forged = { receiptKind: "P1A06_DELETION_RECEIPT", requestId: e.requestId, basis: e.basis, tenantId: e.tenantId, subjectId: e.subjectId, eligibilityMac: e.eligibilityMac, executedAt: NOW, results: [{ targetId: "row-1", status: "COMPLETE", scopes: [] }], status: "COMPLETE" };
    forged.receiptDigest = m.digestOf({ ...forged, receiptDigest: undefined });
    const v = m.verifyDeletionReceipt(engine, forged, { authority: ctx.authority, eligibility: e });
    assert.equal(v.verdict, "RECEIPT_REJECTED");
    assert.ok(v.findings.some((f) => f.startsWith("RECEIPT_MISSING_SCOPE")));
    // empty aggregate is UNKNOWN not COMPLETE
    assert.equal(m.aggregateDeletionStatus([], []), "UNKNOWN");
    // verify WITHOUT eligibility must reject, not pass
    const v2 = m.verifyDeletionReceipt(engine, forged);
    assert.equal(v2.verdict, "RECEIPT_REJECTED");
    assert.ok(v2.findings.includes("ELIGIBILITY_REQUIRED"));
  },
  IR004_opkey_identity_bound: (m) => {
    const invoked = [];
    const mk = (t) => ({ delete: () => { invoked.push(t); return { outcome: "DELETED" }; }, listResidue: () => [] });
    const ctx = setup(m);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", mk("A")], ["CACHE", mk("A")]], engineSeed: "seed-0001" });
    const eA = elig(m, ctx, { req: request({ requestId: "REQ", tenantId: "tenant-A" }), targets: [target({ targetId: "ROW", tenantId: "tenant-A" })] });
    exec(m, ctx, engine, eA, { holds: ctx.holds });
    invoked.length = 0;
    const engineB = { ...engine, adapters: new Map([["PRIMARY", mk("B")], ["CACHE", mk("B")]]) };
    const eB = elig(m, ctx, { req: request({ requestId: "REQ", tenantId: "tenant-B", subjectId: "subj-1" }), targets: [target({ targetId: "ROW", tenantId: "tenant-B" })] });
    m.executeDeletion(engineB, eB, { authority: ctx.authority, holdLedger: m.createHoldLedger(), now: NOW });
    assert.ok(invoked.includes("B"), "tenant B adapter must run (no cross-tenant replay)");
  },
  IR005_evidence_gate_enforced: (m) => {
    const ctx = setup(m, { cls: { erasureStrategy: "PHYSICAL_DELETE", copyScopes: ["PRIMARY"] } });
    const certBindings = [{ artifactRef: "row-1", certRecordId: "c1", retainUntil: LATER }];
    const e = elig(m, ctx, { certBindings });
    assert.equal(e.decisions[0].verdict, "BLOCKED_BY_EVIDENCE");
    let deleted = 0;
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", { delete: () => { deleted += 1; return { outcome: "DELETED" }; }, listResidue: () => [] }]], engineSeed: "seed-0001" });
    const r = exec(m, ctx, engine, e);
    assert.equal(r.status, "BLOCKED_BY_EVIDENCE");
    assert.equal(deleted, 0);
  },
  IR006_founder_artifact_validated: (m) => {
    const decisions = { esignature: { provider: "A" }, payment: { provider: "B" }, transactionalEmail: { provider: "C" }, documentStorage: { provider: "D" } };
    assert.equal(m.providerDecisionStatus({ decisionRef: "not-a-founder-artifact" })["P1AF-089"], "BLOCKED_EXTERNALLY");
    const good = m.buildFounderProviderDecision({ subjectSha: m.P1A06_SUBJECT_SHA, decisions });
    assert.equal(m.providerDecisionStatus(good)["P1AF-089"], "DECIDED");
    // bad digest
    assert.equal(m.providerDecisionStatus({ ...good, artifactDigest: "0".repeat(64) })["P1AF-089"], "BLOCKED_EXTERNALLY");
    // wrong authority WITH matching digest -> isolates the authority-id check
    const wrongAuth = { authorityId: "WRONG", subjectSha: m.P1A06_SUBJECT_SHA, decisions };
    wrongAuth.artifactDigest = m.digestOf({ authorityId: "WRONG", subjectSha: m.P1A06_SUBJECT_SHA, decisions });
    assert.equal(m.providerDecisionStatus(wrongAuth)["P1AF-089"], "BLOCKED_EXTERNALLY");
    // missing capability WITH matching digest -> isolates the capability check
    const reduced = { esignature: { provider: "A" }, payment: { provider: "B" }, transactionalEmail: { provider: "C" } };
    const missingCap = { authorityId: m.FOUNDER_PROVIDER_AUTHORITY_ID, subjectSha: m.P1A06_SUBJECT_SHA, decisions: reduced };
    missingCap.artifactDigest = m.digestOf({ authorityId: m.FOUNDER_PROVIDER_AUTHORITY_ID, subjectSha: m.P1A06_SUBJECT_SHA, decisions: reduced });
    assert.equal(m.providerDecisionStatus(missingCap)["P1AF-089"], "BLOCKED_EXTERNALLY");
  },
  IR007_registered_anchor_enforced: (m) => {
    expectCode(() => m.evaluateRetention({ policySet: (() => { const s = m.createRetentionPolicySet(); m.defineRetentionClass(s, { id: "RET-X", appliesTo: "TENANT_CONTENT", retainDays: 30, clockBasis: "CREATED_AT" }); return s; })(), retentionClassId: "RET-X", registeredAnchor: "2026-01-01T00:00:00.000Z", record: { createdAt: "2036-01-01T00:00:00.000Z" }, now: NOW }), "RETENTION_CLOCK_RESET");
    expectCode(() => m.defineRetentionClass(m.createRetentionPolicySet(), { id: "X", appliesTo: "OPERATIONAL_PERSONAL", retainDays: 365, clockBasis: "LAST_ACTIVITY" }), "CLOCK_BASIS_INVALID");
  },
  IR008_recursive_payload_free: (m) => {
    const trail = m.createAuditTrail();
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: m.subjectHash("s"), at: NOW, metadata: { payload: { email: "v@x" } } }), "AUDIT_FIELD_NOT_ALLOWED");
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: m.subjectHash("s"), at: NOW, note: { nested: 1 } }), "PROHIBITED_PAYLOAD_IN_AUDIT");
    expectCode(() => m.makeTombstone({ targetId: "t", classId: "c", tenantHash: "raw-tenant-id", deletedAt: NOW, requestId: "r" }), "TOMBSTONE_HASH_INVALID");
  },
  P080_no_silent_retain: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const silent = { delete: () => ({ outcome: "RETAINED" }), listResidue: () => [] };
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", silent], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => exec(m, ctx, engine, e), "SILENT_RETAIN_REJECTED");
  },
  PX_exemption_undeclared: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const rogue = { delete: () => ({ outcome: "EXEMPT_DECLARED" }), listResidue: () => [] };
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", rogue], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => exec(m, ctx, engine, e), "EXEMPTION_UNDECLARED");
  },
  P080_deletion_completeness: (m) => {
    const ctx = setup(m);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()]], engineSeed: "seed-0001" });
    assert.equal(exec(m, ctx, engine, elig(m, ctx)).results[0].status, "UNKNOWN");
    const engine2 = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", failingAdapter()]], engineSeed: "seed-0001" });
    assert.equal(exec(m, ctx, engine2, elig(m, ctx, { req: request({ requestId: "req-2" }) })).results[0].status, "PARTIAL");
  },
  P080_idempotent_retry: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    exec(m, ctx, engine, e);
    const n = engine.sideEffects.length;
    exec(m, ctx, engine, e);
    assert.equal(engine.sideEffects.length, n, "replay duplicated side effects");
  },
  P080_receipt_not_forgeable: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const receipt = exec(m, ctx, engine, e);
    const tampered = JSON.parse(JSON.stringify(receipt));
    tampered.results[0].scopes[0] = { ...tampered.results[0].scopes[0], attestation: m.digestOf("forged") };
    tampered.receiptDigest = m.digestOf({ ...tampered, receiptDigest: undefined });
    const v1 = m.verifyDeletionReceipt(engine, tampered, { authority: ctx.authority, eligibility: e });
    assert.equal(v1.verdict, "RECEIPT_REJECTED");
    assert.ok(v1.findings.some((f) => f.startsWith("ATTESTATION_INVALID")));
    const engineB = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const v2 = m.verifyDeletionReceipt(engineB, receipt, { authority: ctx.authority, eligibility: e });
    assert.ok(v2.findings.some((f) => f.startsWith("EXECUTION_UNRECORDED")));
    const v3 = m.verifyDeletionReceipt(engine, { ...receipt, tenantId: "EVIL" }, { authority: ctx.authority, eligibility: e });
    assert.ok(v3.findings.includes("RECEIPT_DIGEST_MISMATCH"));
  },
  P080_no_overclaim: (m) => {
    expectCode(() => m.assertReportableStatus("COMPLETE", "PARTIAL"), "OVERCLAIM_REJECTED");
    const ctx = setup(m);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", failingAdapter()]], engineSeed: "seed-0001" });
    const e = elig(m, ctx);
    const receipt = exec(m, ctx, engine, e);
    const promoted = JSON.parse(JSON.stringify(receipt));
    promoted.results[0].status = "COMPLETE"; promoted.status = "COMPLETE";
    promoted.receiptDigest = m.digestOf({ ...promoted, receiptDigest: undefined });
    const v = m.verifyDeletionReceipt(engine, promoted, { authority: ctx.authority, eligibility: e });
    assert.ok(v.findings.some((f) => f.startsWith("STATUS_OVERCLAIM")));
  },
  P081_tombstone_payload_free: (m) => expectCode(() => m.makeTombstone({ targetId: "row-1", classId: "t.example", tenantHash: m.tenantHash("tenant-A"), deletedAt: NOW, requestId: "req-1", payload: { secret: 1 } }), "PROHIBITED_PAYLOAD_IN_TOMBSTONE"),
  PX_relay_tombstone_guard: (m) => {
    const index = m.createTombstoneIndex();
    m.recordTombstone(index, m.makeTombstone({ targetId: "a9", classId: "c", tenantHash: m.tenantHash("t"), deletedAt: NOW, requestId: "r" }));
    expectCode(() => m.guardOutboxRelay(index, { subject: "a9" }), "RELAY_BLOCKED_TOMBSTONED");
  },
  PX_residue_degrades_status: (m) => {
    const withResidue = { delete: () => ({ outcome: "DELETED" }), listResidue: (id) => [{ id }] };
    const res = m.verifyNoResidue({ adapters: new Map([["PRIMARY", okAdapter()], ["REPLICA", withResidue]]), targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
    assert.equal(res.verdict, "REAPPEARANCE_DETECTED");
    assert.equal(res.effectiveStatus, "PARTIAL");
    const res2 = m.verifyNoResidue({ adapters: new Map([["PRIMARY", { delete: () => ({ outcome: "DELETED" }) }]]), targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
    assert.equal(res2.verdict, "UNKNOWN");
  },
  P082_tenant_plan_coverage: (m) => {
    const registry = m.buildBaseClassificationRegistry();
    const plan = m.planTenantDeletion(registry, "tenant-A");
    plan.include = plan.include.filter((i) => i.classId !== "brandgraph.GraphEvent");
    assert.equal(m.verifyTenantPlanCoverage(registry, plan).verdict, "PLAN_INCOMPLETE");
  },
  P084_audit_append_only: (m) => {
    expectCode(() => m.removeAuditEntry(), "AUDIT_APPEND_ONLY");
    const trail = m.createAuditTrail();
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: m.subjectHash("s"), at: NOW, token: "x" }), "PROHIBITED_PAYLOAD_IN_AUDIT");
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: "raw-id", at: NOW }), "AUDIT_SUBJECT_REF_INVALID");
    m.appendAudit(trail, { eventType: "REVOKE", subjectRef: m.subjectHash("s"), at: NOW });
    trail.entries[0] = { ...trail.entries[0], eventType: "CLASSIFY" };
    assert.equal(m.verifyAuditChain(trail).verdict, "CHAIN_BROKEN");
  },
  P086_invalidation_named: (m) => {
    const trail = m.createAuditTrail();
    expectCode(() => m.emitInvalidation(trail, { subjectRef: m.subjectHash("s"), priorState: "A", failedGate: "G", policyVersion: "V" }, NOW), "INVALIDATION_FIELDS_MISSING");
  },
  P085_cache_ttl_bounded: (m) => {
    assert.equal(m.boundedCacheTtl({ requestedTtlMs: 3_600_000, evidenceExpiries: ["2026-08-20T12:30:00.000Z"], now: NOW }), 30 * 60 * 1000);
    const cache = m.createAuthzCache();
    m.cacheAuthorization(cache, { key: "k", decision: { allow: true }, requestedTtlMs: 3_600_000, evidenceExpiries: ["2026-08-20T12:10:00.000Z"], now: NOW });
    expectCode(() => m.readAuthorization(cache, "k", "2026-08-20T12:10:00.000Z"), "CACHE_STALE_DENIED");
  },
  P087_evidence_retention_reconciled: (m) => {
    const expired = m.reconcileEvidenceRetention({ certRecord: { retainUntil: LATER, artifactRefs: ["a1"] }, artifacts: new Map([["a1", { retainUntil: "2026-01-01T00:00:00.000Z" }]]), now: NOW });
    assert.ok(expired.findings.includes("EVIDENCE_RETENTION_VIOLATION:a1"));
    const lapsing = m.reconcileEvidenceRetention({ certRecord: { retainUntil: LATER, artifactRefs: ["a1"] }, artifacts: new Map([["a1", { retainUntil: "2027-06-01T00:00:00.000Z" }]]), now: NOW });
    assert.ok(lapsing.findings.includes("CERT_RETENTION_CONTRADICTION:a1"));
  },
  PX_stale_derived_flagged: (m) => assert.deepEqual(m.findStaleDerived({ derived: [{ id: "d1", sourceId: "s1" }], sources: new Map([["s1", { supersededBy: "s2" }]]) }), ["STALE_DERIVED_SOURCE_SUPERSEDED:d1"]),
  P077_document_capability: (m) => {
    const store = m.createDocumentStore();
    const actor = { actorId: "a", role: m.ACCOUNTABLE_RETENTION_ROLE };
    expectCode(() => m.storeDocument(store, { documentId: "d", state: "DRAFT" }, actor), "LIFECYCLE_UNDECLARED");
    m.storeDocument(store, { documentId: "d", state: "TOMBSTONED", retentionClassId: "RET-X" }, actor);
    expectCode(() => m.transitionDocument(store, "d", "ACTIVE", actor), "LIFECYCLE_TRANSITION_INVALID");
  },
  P078_accountable_role: (m) => expectCode(() => m.assertAccountableActor({ actorId: "a", role: "ENGINEER" }, "RETAIN"), "RETENTION_ACTION_UNACCOUNTABLE"),
  P088_portal_lifecycle_declared: (m) => {
    const store = m.createDocumentStore();
    expectCode(() => m.storeDocument(store, { documentId: "d", state: "ELSEWHERE", retentionClassId: "RET-X" }, { actorId: "a", role: m.ACCOUNTABLE_RETENTION_ROLE }), "LIFECYCLE_UNDECLARED");
  },
  P089_provider_blocked_externally: (m) => expectCode(() => m.assertProviderObligationFinalizable({ providerDependent: true }, null), "BLOCKED_EXTERNALLY"),
  P090_provider_parity: (m) => {
    assert.equal(m.verifyProviderParity((store) => ({ provider: store.semantics.provider })).verdict, "DIVERGENCE_UNJUSTIFIED");
    assert.equal(m.verifyProviderParity((store) => { store.put("r", {}); store.delete({ targetId: "r" }); return { residue: store.listResidue("r") }; }).verdict, "PARITY_OK");
  },
};

// --- mutants ----------------------------------------------------------------
const MUTANTS = [
  { id: "M01", property: "P079_no_unclassified_retention", find: `if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {\n    fail("CLASS_WITHOUT_RETENTION"`, replace: `if (false) {\n    fail("CLASS_WITHOUT_RETENTION"` },
  { id: "M02", property: "P081_json_lifecycle", find: `if (typeof jf.field !== "string" || !DATA_CLASSES.includes(jf.dataClass)) {`, replace: `if (false) {` },
  { id: "M03", property: "P082_tenant_path_required", find: `if (d.tenantScoped === true && (typeof d.tenantDeletionPath !== "string" || d.tenantDeletionPath.length === 0)) {`, replace: `if (false) {` },
  { id: "M04", property: "P083_sealed_erasure_reconciled", find: `if (d.sealed === true && !["TOMBSTONE", "CRYPTO_ERASE", "SCOPED_EXEMPTION"].includes(d.erasureStrategy)) {`, replace: `if (false) {` },
  { id: "M05", property: "PX_secret_bounded", find: `if (d.dataClass === "SECRET_CREDENTIAL" && d.retentionUnbounded === true) {`, replace: `if (false) {` },
  { id: "M06", property: "PX_audit_class_shape", find: `if (d.dataClass === "EVIDENCE_AUDIT" && (d.appendOnly !== true || d.payloadFree !== true)) {`, replace: `if (false) {` },
  { id: "M07", property: "PX_policy_downgrade_authority", find: `if (isDowngrade && (typeof authorityRef !== "string" || authorityRef.length === 0)) {`, replace: `if (false) {` },
  { id: "M08", property: "PX_retention_clock_anchor", find: `if (registeredAnchor !== observedAnchor) {`, replace: `if (false) {` },
  { id: "M09", property: "PX_expired_unreadable", find: `if (retentionState !== "ACTIVE") {`, replace: `if (false) {` },
  { id: "M10", property: "PX_tombstoned_unreadable", find: `if (tombstoned === true) fail("READ_DENIED_TOMBSTONED", "record is tombstoned");`, replace: `;` },
  { id: "M11", property: "PX_hold_release_authority", find: `if (typeof authorityRef !== "string" || authorityRef.length === 0) {\n    fail("HOLD_RELEASE_UNAUTHORIZED", "hold release requires an authority reference");\n  }`, replace: `` },
  { id: "M12", property: "P082_cross_tenant_refused", find: `verdict = "REFUSED"; reason = "TENANT_MISMATCH";`, replace: `reason = "TENANT_MISMATCH";` },
  { id: "M13", property: "PX_wrong_subject_refused", find: `verdict = "REFUSED"; reason = "SUBJECT_MISMATCH";`, replace: `reason = "SUBJECT_MISMATCH";` },
  { id: "M14", property: "PX_holds_block_deletion", find: `verdict = "BLOCKED_BY_HOLD"; reason = holds.map((h) => h.holdId).join(",");`, replace: `reason = holds.map((h) => h.holdId).join(",");` },
  { id: "M15", property: "PX_retention_active_refused", find: `if (state !== "EXPIRED") { verdict = "REFUSED"; reason = "RETENTION_ACTIVE"; }`, replace: `if (false) { verdict = "REFUSED"; reason = "RETENTION_ACTIVE"; }` },
  // IR-001
  { id: "M16", property: "IR001_eligibility_keyed", find: `if (!authority.verify({ kind: "P1A06_ELIGIBILITY", decision }, tag)) {`, replace: `if (false) {` },
  { id: "M17", property: "IR001_eligibility_keyed", find: `const mac = (value) => createHmac("sha256", secret).update(\`\${authorityId}:\${canonicalJson(value)}\`).digest("hex");`, replace: `const mac = (value) => digestOf(value);` },
  // IR-002 — per-target hold re-check at execution is the single load-bearing guard
  { id: "M18", property: "IR002_hold_revalidated", find: `if (holdsNow.length > 0) {\n      scopeResults.push({ targetId: d.targetId, status: "BLOCKED_BY_HOLD", reason: holdsNow.map((h) => h.holdId).join(","), scopes: [] });\n      continue;\n    }`, replace: `` },
  { id: "M19", property: "IR002_hold_revalidated", find: `if (holdLedger === undefined) {\n    fail("HOLD_LEDGER_REQUIRED", "execution requires the authoritative hold ledger");\n  }`, replace: `` },
  // IR-003
  { id: "M20", property: "IR003_receipt_vs_eligibility", find: `if (!Array.isArray(declaredScopes) || declaredScopes.length === 0) return "UNKNOWN";`, replace: `if (false) return "UNKNOWN";` },
  { id: "M21", property: "IR003_receipt_vs_eligibility", find: `if (!op) { findings.push(\`RECEIPT_MISSING_SCOPE:\${d.targetId}:\${scope}\`); continue; }`, replace: `if (!op) { continue; }` },
  { id: "M22", property: "IR003_receipt_vs_eligibility", find: `if (!authority || !eligibility) {\n    return { verdict: "RECEIPT_REJECTED", findings: [...findings, "ELIGIBILITY_REQUIRED"] };\n  }`, replace: `if (!authority || !eligibility) { return { verdict: "RECEIPT_VERIFIED", findings }; }` },
  // IR-004
  { id: "M23", property: "IR004_opkey_identity_bound", find: `kind: "P1A06_OPKEY", mac, requestId: decision.requestId, basis: decision.basis,\n    tenantId: d.tenantId, subjectId: d.subjectId ?? null, classId: d.classId, targetId: d.targetId, scope,`, replace: `kind: "P1A06_OPKEY", requestId: decision.requestId, targetId: d.targetId, scope,` },
  // IR-005
  { id: "M24", property: "IR005_evidence_gate_enforced", find: `} else if (evidence.resolution === "BLOCKED_BY_EVIDENCE_OBLIGATION") {`, replace: `} else if (false) {` },
  // IR-006
  { id: "M25", property: "IR006_founder_artifact_validated", find: `if (!isSha256Hex(fd.artifactDigest) || !constantTimeEqualHex(fd.artifactDigest, expected)) {`, replace: `if (false) {` },
  { id: "M26", property: "IR006_founder_artifact_validated", find: `if (fd.authorityId !== FOUNDER_PROVIDER_AUTHORITY_ID) return { valid: false, reason: "WRONG_AUTHORITY" };`, replace: `if (false) return { valid: false, reason: "WRONG_AUTHORITY" };` },
  { id: "M27", property: "IR006_founder_artifact_validated", find: `if (!c || typeof c.provider !== "string" || c.provider.length === 0) {\n      return { valid: false, reason: \`CAPABILITY_MISSING:\${cap}\` };\n    }`, replace: `` },
  // IR-007
  { id: "M28", property: "IR007_registered_anchor_enforced", find: `if (record !== undefined) {\n    // detect an attempt to move the anchor since registration\n    assertAnchorUnmoved(registeredAnchor, retentionAnchorFor(record, cls.clockBasis));\n  }`, replace: `` },
  { id: "M29", property: "IR007_registered_anchor_enforced", find: `export const RETENTION_CLOCK_BASES = Object.freeze(["CREATED_AT", "SEALED_AT"]);`, replace: `export const RETENTION_CLOCK_BASES = Object.freeze(["CREATED_AT", "SEALED_AT", "LAST_ACTIVITY"]);` },
  // IR-008
  { id: "M30", property: "IR008_recursive_payload_free", find: `if (!AUDIT_ALLOWED_KEYS.has(key)) {\n      fail("AUDIT_FIELD_NOT_ALLOWED", \`audit entry has non-schema field: \${key}\`);\n    }`, replace: `` },
  { id: "M31", property: "IR008_recursive_payload_free", find: `if (value === null || typeof value !== "object") return;\n  fail("PROHIBITED_PAYLOAD_IN_AUDIT", \`audit entry carries nested structure at \${path || "<root>"}\`);`, replace: `return;` },
  { id: "M32", property: "IR008_recursive_payload_free", find: `if (t[hf] !== undefined && t[hf] !== null && !isSha256Hex(t[hf])) {`, replace: `if (false) {` },
  // deletion core
  { id: "M33", property: "P080_no_silent_retain", find: `if (outcome === "RETAINED" && !res.holdRef && !res.exemptionRef) {`, replace: `if (false) {` },
  { id: "M34", property: "PX_exemption_undeclared", find: `if (outcome === "EXEMPT_DECLARED" && d.erasureStrategy !== "SCOPED_EXEMPTION") {`, replace: `if (false) {` },
  { id: "M35", property: "P080_deletion_completeness", find: `op = { opKey, scope, targetId: d.targetId, outcome: "UNSUPPORTED", attestation: null };`, replace: `op = { opKey, scope, targetId: d.targetId, outcome: "DELETED", attestation: null };` },
  { id: "M36", property: "P080_deletion_completeness", find: `if (sawUnproven) return "UNKNOWN";`, replace: `if (false) return "UNKNOWN";` },
  { id: "M37", property: "P080_deletion_completeness", find: `if (sawFailed) return "PARTIAL";`, replace: `if (false) return "PARTIAL";` },
  { id: "M38", property: "P080_idempotent_retry", find: `if (engine.executions.has(opKey)) {\n        scopes.push(engine.executions.get(opKey)); // idempotent replay, no new side effect\n        continue;\n      }`, replace: `` },
  { id: "M39", property: "P080_receipt_not_forgeable", find: `if (op.attestation !== expectedAtt) findings.push(\`ATTESTATION_INVALID:\${op.opKey}\`);`, replace: `;` },
  { id: "M40", property: "P080_receipt_not_forgeable", find: `if (!engine.executions.has(op.opKey)) findings.push(\`EXECUTION_UNRECORDED:\${op.opKey}\`);`, replace: `;` },
  { id: "M41", property: "P080_receipt_not_forgeable", find: `if (receipt.receiptDigest !== recomputed) findings.push("RECEIPT_DIGEST_MISMATCH");`, replace: `;` },
  { id: "M42", property: "P080_no_overclaim", find: `if (STATUS_STRENGTH[claimed] > STATUS_STRENGTH[computed]) {`, replace: `if (false) {` },
  { id: "M43", property: "P080_no_overclaim", find: `if (result.status === "COMPLETE" && computed !== "COMPLETE") findings.push(\`STATUS_OVERCLAIM:\${d.targetId}\`);`, replace: `;` },
  { id: "M44", property: "P081_tombstone_payload_free", find: `if (!TOMBSTONE_ALLOWED_KEYS.has(key)) {`, replace: `if (false) {` },
  { id: "M45", property: "PX_relay_tombstone_guard", find: `if (isTombstoned(index, event.subject)) {`, replace: `if (false) {` },
  { id: "M46", property: "PX_residue_degrades_status", find: `if (Array.isArray(residue) && residue.length > 0) findings.push(\`RESIDUE:\${scope}\`);`, replace: `;` },
  { id: "M47", property: "PX_residue_degrades_status", find: `findings.push(\`RESIDUE_UNVERIFIABLE:\${scope}\`);`, replace: `;` },
  { id: "M48", property: "P082_tenant_plan_coverage", find: `findings.push(\`TENANT_PLAN_GAP:\${cls.classId}\`);`, replace: `;` },
  { id: "M49", property: "P084_audit_append_only", find: `fail("AUDIT_APPEND_ONLY", "audit/revocation history is append-only and preserved");`, replace: `return true;` },
  { id: "M50", property: "P084_audit_append_only", find: `if (AUDIT_PROHIBITED_KEYS.has(lower)) {`, replace: `if (false) {` },
  { id: "M51", property: "P084_audit_append_only", find: `if (!isSha256Hex(e.subjectRef)) {`, replace: `if (false) {` },
  { id: "M52", property: "P086_invalidation_named", find: `if (typeof e[f] !== "string" || e[f].length === 0) {\n      fail("INVALIDATION_FIELDS_MISSING", \`invalidation event missing \${f}\`);\n    }`, replace: `` },
  { id: "M53", property: "P085_cache_ttl_bounded", find: `return Math.min(requestedTtlMs, cap);`, replace: `return requestedTtlMs;` },
  { id: "M54", property: "P085_cache_ttl_bounded", find: `if (nowMs >= entry.expiresAtMs || nowMs >= earliestEvidence) {`, replace: `if (false) {` },
  { id: "M55", property: "P087_evidence_retention_reconciled", find: `findings.push(\`EVIDENCE_RETENTION_VIOLATION:\${ref}\`); // record alive, artifact already expired`, replace: `;` },
  { id: "M56", property: "P087_evidence_retention_reconciled", find: `findings.push(\`CERT_RETENTION_CONTRADICTION:\${ref}\`); // contradiction, fix before it bites`, replace: `;` },
  { id: "M57", property: "PX_stale_derived_flagged", find: `else if (src.supersededBy) findings.push(\`STALE_DERIVED_SOURCE_SUPERSEDED:\${d.id}\`);`, replace: `;` },
  { id: "M58", property: "P078_accountable_role", find: `if (actor?.role !== ACCOUNTABLE_RETENTION_ROLE || typeof actor?.actorId !== "string" || actor.actorId.length === 0) {`, replace: `if (false) {` },
  { id: "M59", property: "P077_document_capability", find: `if (!DOCUMENT_LIFECYCLE_STATES.includes(d.state)) {`, replace: `if (false) {` },
  { id: "M60", property: "P077_document_capability", find: `if (!allowed.includes(nextState)) {`, replace: `if (false) {` },
  { id: "M61", property: "P088_portal_lifecycle_declared", find: `if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {\n    fail("LIFECYCLE_UNDECLARED", \`document \${d.documentId} has no declared retention class\`);\n  }`, replace: `` },
  { id: "M62", property: "P089_provider_blocked_externally", find: `if (status["P1AF-089"] !== "DECIDED") {`, replace: `if (false) {` },
  { id: "M63", property: "P090_provider_parity", find: `if (canonicalJson(a[key]) !== canonicalJson(b[key])) findings.push(\`PARITY_DIVERGENCE:\${key}\`);`, replace: `;` },
];

// --- harness ----------------------------------------------------------------
const REQUIRED_PROPERTIES = Object.keys(PROBES);
const baseline = await importSource(SOURCE);
for (const [name, probe] of Object.entries(PROBES)) { probe(baseline); console.log(`BASELINE OK ${name}`); }

const mutatedProperties = new Set(MUTANTS.map((m) => m.property));
for (const prop of REQUIRED_PROPERTIES) assert.ok(mutatedProperties.has(prop), `property has no mutant: ${prop}`);

let killed = 0;
const survivors = [];
for (const mutant of MUTANTS) {
  if (!SOURCE.includes(mutant.find)) {
    console.error(`APPLICATION FAILURE: ${mutant.id} pattern not found in source`);
    process.exit(1);
  }
  const mutatedSource = SOURCE.replace(mutant.find, mutant.replace);
  assert.notEqual(mutatedSource, SOURCE, `mutant ${mutant.id} produced identical source`);
  let dead = false;
  let module;
  try { module = await importSource(mutatedSource); } catch { dead = true; }
  if (!dead) {
    for (const probe of Object.values(PROBES)) {
      try { probe(module); } catch { dead = true; break; }
    }
  }
  if (dead) { killed += 1; console.log(`KILLED ${mutant.id} (${mutant.property})`); }
  else survivors.push(mutant.id);
}

console.log("--------------------------------------------------------------");
console.log(`P1A-06 mutation: mutants=${MUTANTS.length} killed=${killed} survivors=${survivors.length} probes=${REQUIRED_PROPERTIES.length}`);
if (survivors.length > 0) { console.error(`SURVIVORS: ${survivors.join(", ")}`); process.exit(1); }
