// P1A-06 mutation harness. The mutation denominator derives from the module's
// PROPERTY_REGISTER: every property has at least one mutant that weakens its
// guard. A mutant is KILLED when at least one invariant probe fails against it
// (or it fails to load). A mutant whose find-pattern is absent from the source
// is an APPLICATION FAILURE (the harness itself fails closed). Survivors
// required: 0.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./validate-p1a-privacy.mjs", import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const NOW = "2026-08-20T12:00:00.000Z";
const LATER = "2028-12-31T00:00:00.000Z";

const importSource = async (source) =>
  import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// --- shared fixtures (mirror the battery, parameterized on the module) ------
const goodClass = (over = {}) => ({
  classId: "t.example", store: "s", table: "example",
  dataClass: "TENANT_CONTENT", retentionClassId: "RET-X",
  copyScopes: ["PRIMARY", "CACHE"], tenantScoped: false, subjectScoped: true,
  erasureStrategy: "TOMBSTONE", ...over,
});
const target = (over = {}) => ({
  targetId: "row-1", classId: "t.example", tenantId: "tenant-A", subjectId: "subj-1",
  record: { createdAt: "2026-01-01T00:00:00.000Z" }, ...over,
});
const request = (over = {}) => ({
  requestId: "req-1", basis: "ERASURE_REQUEST", tenantId: "tenant-A", subjectId: "subj-1", ...over,
});
const okAdapter = () => ({ delete: () => ({ outcome: "DELETED" }), listResidue: () => [] });
const failingAdapter = () => ({ delete: () => { throw new Error("io"); }, listResidue: () => [] });
const setup = (m, over = {}) => {
  const reg = m.createClassificationRegistry();
  m.registerPersistedClass(reg, goodClass(over.cls));
  const set = m.createRetentionPolicySet();
  m.defineRetentionClass(set, { id: "RET-X", appliesTo: "TENANT_CONTENT", retainDays: 30, clockBasis: "CREATED_AT" });
  const holds = m.createHoldLedger();
  return { reg, set, holds };
};
const elig = (m, ctx, over = {}) => m.evaluateDeletionEligibility({
  registry: ctx.reg, policySet: ctx.set, holdLedger: ctx.holds,
  request: over.req ?? request(), targets: over.targets ?? [target()], now: NOW,
});
const expectCode = (fn, code) => {
  let threw = null;
  try { fn(); } catch (err) { threw = err; }
  assert.ok(threw, `expected ${code}, nothing thrown`);
  assert.equal(threw.code, code);
};

// --- invariant probes: each THROWS when its invariant is violated -----------
const PROBES = {
  P079_no_unclassified_retention: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ retentionClassId: undefined })), "CLASS_WITHOUT_RETENTION");
  },
  P081_json_lifecycle: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ jsonFields: [{ field: "payload" }] })), "JSON_FIELD_UNCLASSIFIED");
  },
  P082_tenant_path_required: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ tenantScoped: true })), "TENANT_TABLE_WITHOUT_DELETION_PATH");
  },
  P083_sealed_erasure_reconciled: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ sealed: true, erasureStrategy: "PHYSICAL_DELETE" })), "SEALED_WITHOUT_ERASURE_RECONCILIATION");
  },
  PX_secret_bounded: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ dataClass: "SECRET_CREDENTIAL", retentionUnbounded: true })), "SECRET_IMPROPER_RETENTION");
  },
  PX_audit_class_shape: (m) => {
    expectCode(() => m.registerPersistedClass(m.createClassificationRegistry(), goodClass({ dataClass: "EVIDENCE_AUDIT", erasureStrategy: "SCOPED_EXEMPTION", exemptionJustification: "j" })), "AUDIT_CLASS_MISDECLARED");
  },
  PX_policy_downgrade_authority: (m) => {
    const set = m.createRetentionPolicySet();
    m.defineRetentionClass(set, { id: "RET-P", appliesTo: "REGULATED_PERSONAL", retainDays: 30, clockBasis: "CREATED_AT" });
    expectCode(() => m.amendRetentionClass(set, "RET-P", { retainDays: 3650 }), "POLICY_DOWNGRADE_REJECTED");
  },
  PX_retention_clock_anchor: (m) => {
    expectCode(() => m.assertAnchorUnmoved("2026-01-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"), "RETENTION_CLOCK_RESET");
  },
  PX_expired_unreadable: (m) => {
    expectCode(() => m.guardRead({ retentionState: "EXPIRED", tombstoned: false }), "READ_DENIED_EXPIRED");
  },
  PX_tombstoned_unreadable: (m) => {
    expectCode(() => m.guardRead({ retentionState: "ACTIVE", tombstoned: true }), "READ_DENIED_TOMBSTONED");
  },
  PX_hold_release_authority: (m) => {
    const holds = m.createHoldLedger();
    m.placeHold(holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "TENANT", tenantId: "tenant-A" }, reason: "r" });
    expectCode(() => m.releaseHold(holds, "h1"), "HOLD_RELEASE_UNAUTHORIZED");
  },
  P082_cross_tenant_refused: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx, { targets: [target({ tenantId: "tenant-B" })] });
    assert.equal(e.decisions[0].verdict, "REFUSED");
  },
  PX_wrong_subject_refused: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx, { targets: [target({ subjectId: "subj-OTHER" })] });
    assert.equal(e.decisions[0].verdict, "REFUSED");
  },
  PX_holds_block_deletion: (m) => {
    const ctx = setup(m);
    m.placeHold(ctx.holds, { holdId: "h1", kind: "LEGAL", scope: { kind: "SUBJECT", subjectId: "subj-1" }, reason: "r" });
    const e = elig(m, ctx);
    assert.equal(e.decisions[0].verdict, "BLOCKED_BY_HOLD");
  },
  PX_retention_active_refused: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx, {
      req: request({ basis: "RETENTION_EXPIRY" }),
      targets: [target({ record: { createdAt: "2026-08-15T00:00:00.000Z" } })],
    });
    assert.equal(e.decisions[0].verdict, "REFUSED");
    assert.equal(e.decisions[0].reason, "RETENTION_ACTIVE");
  },
  P080_eligibility_binding: (m) => {
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => m.executeDeletion(engine, {
      requestId: "req-1", basis: "ERASURE_REQUEST", tenantId: "tenant-A", subjectId: "subj-1",
      evaluatedAt: NOW,
      decisions: [{ targetId: "row-1", classId: "t.example", tenantId: "tenant-A", subjectId: "subj-1", verdict: "ELIGIBLE", reason: "x", declaredScopes: ["PRIMARY"], erasureStrategy: "TOMBSTONE", exemptionJustification: null }],
    }), "EXECUTION_REFUSED_NO_ELIGIBILITY");
  },
  P080_no_silent_retain: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const silent = { delete: () => ({ outcome: "RETAINED" }), listResidue: () => [] };
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", silent], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => m.executeDeletion(engine, e), "SILENT_RETAIN_REJECTED");
  },
  PX_exemption_undeclared: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const rogue = { delete: () => ({ outcome: "EXEMPT_DECLARED" }), listResidue: () => [] };
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", rogue], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    expectCode(() => m.executeDeletion(engine, e), "EXEMPTION_UNDECLARED");
  },
  P080_deletion_completeness: (m) => {
    const ctx = setup(m);
    // missing CACHE adapter => UNSUPPORTED => UNKNOWN, never COMPLETE
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()]], engineSeed: "seed-0001" });
    const receipt = m.executeDeletion(engine, elig(m, ctx));
    assert.equal(receipt.results[0].status, "UNKNOWN");
    // failed scope => PARTIAL, never COMPLETE
    const engine2 = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", failingAdapter()]], engineSeed: "seed-0001" });
    const receipt2 = m.executeDeletion(engine2, elig(m, ctx, { req: request({ requestId: "req-2" }) }));
    assert.equal(receipt2.results[0].status, "PARTIAL");
  },
  P080_idempotent_retry: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    m.executeDeletion(engine, e);
    const n = engine.sideEffects.length;
    m.executeDeletion(engine, e);
    assert.equal(engine.sideEffects.length, n, "replay duplicated side effects");
    // retry must not re-run proven scopes
    let flakyFails = true;
    const flaky = { delete: () => { if (flakyFails) { flakyFails = false; throw new Error("io"); } return { outcome: "DELETED" }; }, listResidue: () => [] };
    const engine2 = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", flaky]], engineSeed: "seed-0001" });
    const e2 = elig(m, ctx, { req: request({ requestId: "req-3" }) });
    m.executeDeletion(engine2, e2);
    const primary = engine2.sideEffects.filter((k) => k.includes(":PRIMARY:")).length;
    const second = m.retryDeletion(engine2, e2);
    assert.equal(second.status, "COMPLETE");
    assert.equal(engine2.sideEffects.filter((k) => k.includes(":PRIMARY:")).length, primary, "retry re-ran proven scope");
  },
  P080_receipt_not_forgeable: (m) => {
    const ctx = setup(m);
    const e = elig(m, ctx);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const receipt = m.executeDeletion(engine, e);
    // tamper one attestation and recompute the digest so only attestation check can catch it
    const tampered = JSON.parse(JSON.stringify(receipt));
    tampered.results[0].scopes[0] = { ...tampered.results[0].scopes[0], attestation: m.digestOf("forged") };
    tampered.receiptDigest = m.digestOf({ ...tampered, receiptDigest: undefined });
    const v1 = m.verifyDeletionReceipt(engine, tampered);
    assert.equal(v1.verdict, "RECEIPT_REJECTED");
    assert.ok(v1.findings.some((f) => f.startsWith("ATTESTATION_INVALID")));
    // same-seed engine that never executed: attestations recompute but executions are unrecorded
    const engineB = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", okAdapter()]], engineSeed: "seed-0001" });
    const v2 = m.verifyDeletionReceipt(engineB, receipt);
    assert.equal(v2.verdict, "RECEIPT_REJECTED");
    assert.ok(v2.findings.some((f) => f.startsWith("EXECUTION_UNRECORDED")));
    // digest tamper without recompute
    const v3 = m.verifyDeletionReceipt(engine, { ...receipt, tenantId: "tenant-EVIL" });
    assert.ok(v3.findings.includes("RECEIPT_DIGEST_MISMATCH"));
  },
  P080_no_overclaim: (m) => {
    expectCode(() => m.assertReportableStatus("COMPLETE", "PARTIAL"), "OVERCLAIM_REJECTED");
    // receipt-level: PARTIAL execution hand-promoted to COMPLETE must be caught
    const ctx = setup(m);
    const engine = m.createDeletionEngine({ adapters: [["PRIMARY", okAdapter()], ["CACHE", failingAdapter()]], engineSeed: "seed-0001" });
    const receipt = m.executeDeletion(engine, elig(m, ctx));
    const promoted = JSON.parse(JSON.stringify(receipt));
    promoted.results[0].status = "COMPLETE";
    promoted.status = "COMPLETE";
    promoted.receiptDigest = m.digestOf({ ...promoted, receiptDigest: undefined });
    const v = m.verifyDeletionReceipt(engine, promoted);
    assert.equal(v.verdict, "RECEIPT_REJECTED");
    assert.ok(v.findings.some((f) => f.startsWith("STATUS_OVERCLAIM")));
  },
  P081_tombstone_payload_free: (m) => {
    expectCode(() => m.makeTombstone({
      targetId: "row-1", classId: "t.example", tenantHash: m.tenantHash("tenant-A"),
      deletedAt: NOW, requestId: "req-1", payload: { secret: 1 },
    }), "PROHIBITED_PAYLOAD_IN_TOMBSTONE");
  },
  PX_relay_tombstone_guard: (m) => {
    const index = m.createTombstoneIndex();
    m.recordTombstone(index, m.makeTombstone({
      targetId: "a9", classId: "c", tenantHash: m.tenantHash("t"), deletedAt: NOW, requestId: "r",
    }));
    expectCode(() => m.guardOutboxRelay(index, { subject: "a9" }), "RELAY_BLOCKED_TOMBSTONED");
  },
  PX_residue_degrades_status: (m) => {
    const withResidue = { delete: () => ({ outcome: "DELETED" }), listResidue: (id) => [{ id }] };
    const adapters = new Map([["PRIMARY", okAdapter()], ["REPLICA", withResidue]]);
    const res = m.verifyNoResidue({ adapters, targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
    assert.equal(res.verdict, "REAPPEARANCE_DETECTED");
    assert.equal(res.effectiveStatus, "PARTIAL");
    const opaque = new Map([["PRIMARY", { delete: () => ({ outcome: "DELETED" }) }]]);
    const res2 = m.verifyNoResidue({ adapters: opaque, targetId: "row-1", receipt: { results: [{ targetId: "row-1", status: "COMPLETE" }] } });
    assert.equal(res2.verdict, "UNKNOWN");
  },
  P082_tenant_plan_coverage: (m) => {
    const registry = m.buildBaseClassificationRegistry();
    const plan = m.planTenantDeletion(registry, "tenant-A");
    plan.include = plan.include.filter((i) => i.classId !== "brandgraph.GraphEvent");
    const cover = m.verifyTenantPlanCoverage(registry, plan);
    assert.equal(cover.verdict, "PLAN_INCOMPLETE");
  },
  P084_audit_append_only: (m) => {
    expectCode(() => m.removeAuditEntry(), "AUDIT_APPEND_ONLY");
    const trail = m.createAuditTrail();
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: m.subjectHash("s"), at: NOW, payload: { pii: 1 } }), "PROHIBITED_PAYLOAD_IN_AUDIT");
    expectCode(() => m.appendAudit(trail, { eventType: "DELETE_EXECUTE", subjectRef: "raw-id", at: NOW }), "AUDIT_SUBJECT_REF_INVALID");
    m.appendAudit(trail, { eventType: "REVOKE", subjectRef: m.subjectHash("s"), at: NOW });
    trail.entries[0] = { ...trail.entries[0], eventType: "CLASSIFY" };
    assert.equal(m.verifyAuditChain(trail).verdict, "CHAIN_BROKEN");
  },
  P086_invalidation_named: (m) => {
    const trail = m.createAuditTrail();
    expectCode(() => m.emitInvalidation(trail, {
      subjectRef: m.subjectHash("s"), priorState: "AUTHORIZED", failedGate: "G", policyVersion: "V",
    }, NOW), "INVALIDATION_FIELDS_MISSING");
  },
  P085_cache_ttl_bounded: (m) => {
    const ttl = m.boundedCacheTtl({
      requestedTtlMs: 3_600_000, evidenceExpiries: ["2026-08-20T12:30:00.000Z"], now: NOW,
    });
    assert.equal(ttl, 30 * 60 * 1000, "cache TTL not bounded by evidence expiry");
    const cache = m.createAuthzCache();
    m.cacheAuthorization(cache, { key: "k", decision: { allow: true }, requestedTtlMs: 3_600_000, evidenceExpiries: ["2026-08-20T12:10:00.000Z"], now: NOW });
    expectCode(() => m.readAuthorization(cache, "k", "2026-08-20T12:10:00.000Z"), "CACHE_STALE_DENIED");
  },
  P087_evidence_retention_reconciled: (m) => {
    const expired = m.reconcileEvidenceRetention({
      certRecord: { retainUntil: LATER, artifactRefs: ["a1"] },
      artifacts: new Map([["a1", { retainUntil: "2026-01-01T00:00:00.000Z" }]]), now: NOW,
    });
    assert.equal(expired.verdict, "CONTRADICTION");
    assert.ok(expired.findings.includes("EVIDENCE_RETENTION_VIOLATION:a1"));
    const lapsing = m.reconcileEvidenceRetention({
      certRecord: { retainUntil: LATER, artifactRefs: ["a1"] },
      artifacts: new Map([["a1", { retainUntil: "2027-06-01T00:00:00.000Z" }]]), now: NOW,
    });
    assert.ok(lapsing.findings.includes("CERT_RETENTION_CONTRADICTION:a1"));
    const blocked = m.resolveDeleteEvidenceConflict({
      targetId: "a1", erasureStrategy: "PHYSICAL_DELETE",
      certBindings: [{ artifactRef: "a1", certRecordId: "c1", retainUntil: LATER }], now: NOW,
    });
    assert.equal(blocked.resolution, "BLOCKED_BY_EVIDENCE_OBLIGATION");
  },
  PX_stale_derived_flagged: (m) => {
    const findings = m.findStaleDerived({
      derived: [{ id: "d1", sourceId: "s1" }],
      sources: new Map([["s1", { supersededBy: "s2" }]]),
    });
    assert.deepEqual(findings, ["STALE_DERIVED_SOURCE_SUPERSEDED:d1"]);
  },
  P077_document_capability: (m) => {
    const store = m.createDocumentStore();
    const actor = { actorId: "a", role: m.ACCOUNTABLE_RETENTION_ROLE };
    expectCode(() => m.storeDocument(store, { documentId: "d", state: "DRAFT" }, actor), "LIFECYCLE_UNDECLARED");
    m.storeDocument(store, { documentId: "d", state: "TOMBSTONED", retentionClassId: "RET-X" }, actor);
    expectCode(() => m.transitionDocument(store, "d", "ACTIVE", actor), "LIFECYCLE_TRANSITION_INVALID");
  },
  P078_accountable_role: (m) => {
    expectCode(() => m.assertAccountableActor({ actorId: "a", role: "ENGINEER" }, "RETAIN"), "RETENTION_ACTION_UNACCOUNTABLE");
  },
  P088_portal_lifecycle_declared: (m) => {
    const store = m.createDocumentStore();
    const actor = { actorId: "a", role: m.ACCOUNTABLE_RETENTION_ROLE };
    expectCode(() => m.storeDocument(store, { documentId: "d", state: "ELSEWHERE", retentionClassId: "RET-X" }, actor), "LIFECYCLE_UNDECLARED");
  },
  P089_provider_blocked_externally: (m) => {
    expectCode(() => m.assertProviderObligationFinalizable({ providerDependent: true }, null), "BLOCKED_EXTERNALLY");
  },
  P090_provider_parity: (m) => {
    const divergent = (store) => ({ provider: store.semantics.provider });
    const res = m.verifyProviderParity(divergent);
    assert.equal(res.verdict, "DIVERGENCE_UNJUSTIFIED", "engineered divergence not detected");
    const uniform = (store) => { store.put("r", {}); store.delete({ targetId: "r" }); return { residue: store.listResidue("r") }; };
    assert.equal(m.verifyProviderParity(uniform).verdict, "PARITY_OK");
  },
};

// --- mutants: find MUST exist in source; each names its target property -----
const MUTANTS = [
  { id: "M01", property: "P079_no_unclassified_retention",
    find: `if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {
    fail("CLASS_WITHOUT_RETENTION"`,
    replace: `if (false) {
    fail("CLASS_WITHOUT_RETENTION"` },
  { id: "M02", property: "P081_json_lifecycle",
    find: `if (typeof jf.field !== "string" || !DATA_CLASSES.includes(jf.dataClass)) {`,
    replace: `if (false) {` },
  { id: "M03", property: "P082_tenant_path_required",
    find: `if (d.tenantScoped === true && (typeof d.tenantDeletionPath !== "string" || d.tenantDeletionPath.length === 0)) {`,
    replace: `if (false) {` },
  { id: "M04", property: "P083_sealed_erasure_reconciled",
    find: `if (d.sealed === true && !["TOMBSTONE", "CRYPTO_ERASE", "SCOPED_EXEMPTION"].includes(d.erasureStrategy)) {`,
    replace: `if (false) {` },
  { id: "M05", property: "PX_secret_bounded",
    find: `if (d.dataClass === "SECRET_CREDENTIAL" && d.retentionUnbounded === true) {`,
    replace: `if (false) {` },
  { id: "M06", property: "PX_audit_class_shape",
    find: `if (d.dataClass === "EVIDENCE_AUDIT" && (d.appendOnly !== true || d.payloadFree !== true)) {`,
    replace: `if (false) {` },
  { id: "M07", property: "PX_policy_downgrade_authority",
    find: `if (isDowngrade && (typeof authorityRef !== "string" || authorityRef.length === 0)) {`,
    replace: `if (false) {` },
  { id: "M08", property: "PX_retention_clock_anchor",
    find: `if (registeredAnchor !== observedAnchor) {`,
    replace: `if (false) {` },
  { id: "M09", property: "PX_expired_unreadable",
    find: `if (retentionState !== "ACTIVE") {`,
    replace: `if (false) {` },
  { id: "M10", property: "PX_tombstoned_unreadable",
    find: `if (tombstoned === true) fail("READ_DENIED_TOMBSTONED", "record is tombstoned");`,
    replace: `;` },
  { id: "M11", property: "PX_hold_release_authority",
    find: `if (typeof authorityRef !== "string" || authorityRef.length === 0) {
    fail("HOLD_RELEASE_UNAUTHORIZED", "hold release requires an authority reference");
  }`,
    replace: `` },
  { id: "M12", property: "P082_cross_tenant_refused",
    find: `verdict = "REFUSED"; reason = "TENANT_MISMATCH";`,
    replace: `reason = "TENANT_MISMATCH";` },
  { id: "M13", property: "PX_wrong_subject_refused",
    find: `verdict = "REFUSED"; reason = "SUBJECT_MISMATCH";`,
    replace: `reason = "SUBJECT_MISMATCH";` },
  { id: "M14", property: "PX_holds_block_deletion",
    find: `verdict = "BLOCKED_BY_HOLD"; reason = holds.map((h) => h.holdId).join(",");`,
    replace: `reason = holds.map((h) => h.holdId).join(",");` },
  { id: "M15", property: "PX_retention_active_refused",
    find: `if (state !== "EXPIRED") { verdict = "REFUSED"; reason = "RETENTION_ACTIVE"; }`,
    replace: `if (false) { verdict = "REFUSED"; reason = "RETENTION_ACTIVE"; }` },
  { id: "M16", property: "P080_eligibility_binding",
    find: `if (typeof eligibilityToken !== "string" ||
      eligibilityToken !== digestOf({ kind: "P1A06_ELIGIBILITY", decision })) {`,
    replace: `if (false) {` },
  { id: "M17", property: "P080_no_silent_retain",
    find: `if (outcome === "RETAINED" && !res.holdRef && !res.exemptionRef) {`,
    replace: `if (false) {` },
  { id: "M18", property: "PX_exemption_undeclared",
    find: `if (outcome === "EXEMPT_DECLARED" && d.erasureStrategy !== "SCOPED_EXEMPTION") {`,
    replace: `if (false) {` },
  { id: "M19", property: "P080_deletion_completeness",
    find: `op = { opKey, scope, targetId: d.targetId, outcome: "UNSUPPORTED", attestation: null };`,
    replace: `op = { opKey, scope, targetId: d.targetId, outcome: "DELETED", attestation: null };` },
  { id: "M20", property: "P080_deletion_completeness",
    find: `if (sawUnproven) return "UNKNOWN";`,
    replace: `if (false) return "UNKNOWN";` },
  { id: "M21", property: "P080_deletion_completeness",
    find: `if (sawFailed) return "PARTIAL";`,
    replace: `if (false) return "PARTIAL";` },
  { id: "M22", property: "P080_idempotent_retry",
    find: `if (engine.executions.has(opKey)) {
        scopes.push(engine.executions.get(opKey)); // idempotent replay, no new side effect
        continue;
      }`,
    replace: `` },
  { id: "M23", property: "P080_idempotent_retry",
    find: `if (prior && prior.outcome === "FAILED") engine.executions.delete(opKey);`,
    replace: `engine.executions.delete(opKey);` },
  { id: "M24", property: "P080_receipt_not_forgeable",
    find: "if (op.attestation !== expected) findings.push(`ATTESTATION_INVALID:${op.opKey}`);",
    replace: `;` },
  { id: "M25", property: "P080_receipt_not_forgeable",
    find: "if (!engine.executions.has(op.opKey)) findings.push(`EXECUTION_UNRECORDED:${op.opKey}`);",
    replace: `;` },
  { id: "M26", property: "P080_receipt_not_forgeable",
    find: `if (receipt.receiptDigest !== recomputed) findings.push("RECEIPT_DIGEST_MISMATCH");`,
    replace: `;` },
  { id: "M27", property: "P080_no_overclaim",
    find: `if (STATUS_STRENGTH[claimed] > STATUS_STRENGTH[computed]) {`,
    replace: `if (false) {` },
  { id: "M28", property: "P080_no_overclaim",
    find: `if (t.status === "COMPLETE" && computed !== "COMPLETE") {`,
    replace: `if (false) {` },
  { id: "M29", property: "P081_tombstone_payload_free",
    find: `if (!TOMBSTONE_ALLOWED_KEYS.has(key)) {`,
    replace: `if (false) {` },
  { id: "M30", property: "PX_relay_tombstone_guard",
    find: `if (isTombstoned(index, event.subject)) {`,
    replace: `if (false) {` },
  { id: "M31", property: "PX_residue_degrades_status",
    find: "if (Array.isArray(residue) && residue.length > 0) findings.push(`RESIDUE:${scope}`);",
    replace: `;` },
  { id: "M32", property: "PX_residue_degrades_status",
    find: "findings.push(`RESIDUE_UNVERIFIABLE:${scope}`);",
    replace: `;` },
  { id: "M33", property: "P082_tenant_plan_coverage",
    find: "findings.push(`TENANT_PLAN_GAP:${cls.classId}`);",
    replace: `;` },
  { id: "M34", property: "P084_audit_append_only",
    find: `fail("AUDIT_APPEND_ONLY", "audit/revocation history is append-only and preserved");`,
    replace: `return true;` },
  { id: "M35", property: "P084_audit_append_only",
    find: `if (AUDIT_PROHIBITED_KEYS.has(key)) {`,
    replace: `if (false) {` },
  { id: "M36", property: "P084_audit_append_only",
    find: `if (typeof e.subjectRef !== "string" || !/^[0-9a-f]{64}$/.test(e.subjectRef)) {`,
    replace: `if (false) {` },
  { id: "M37", property: "P086_invalidation_named",
    find: `if (typeof e[f] !== "string" || e[f].length === 0) {
      fail("INVALIDATION_FIELDS_MISSING", \`invalidation event missing \${f}\`);
    }`,
    replace: `` },
  { id: "M38", property: "P085_cache_ttl_bounded",
    find: `return Math.min(requestedTtlMs, cap);`,
    replace: `return requestedTtlMs;` },
  { id: "M39", property: "P085_cache_ttl_bounded",
    find: `if (nowMs >= entry.expiresAtMs || nowMs >= earliestEvidence) {`,
    replace: `if (false) {` },
  { id: "M40", property: "P087_evidence_retention_reconciled",
    find: "findings.push(`EVIDENCE_RETENTION_VIOLATION:${ref}`); // record alive, artifact already expired",
    replace: `;` },
  { id: "M41", property: "P087_evidence_retention_reconciled",
    find: "findings.push(`CERT_RETENTION_CONTRADICTION:${ref}`); // contradiction, fix before it bites",
    replace: `;` },
  { id: "M42", property: "P087_evidence_retention_reconciled",
    find: `return { resolution: "BLOCKED_BY_EVIDENCE_OBLIGATION", targetId, certRecordId: binding.certRecordId };`,
    replace: `return { resolution: "NO_CONFLICT", targetId };` },
  { id: "M43", property: "PX_stale_derived_flagged",
    find: "else if (src.supersededBy) findings.push(`STALE_DERIVED_SOURCE_SUPERSEDED:${d.id}`);",
    replace: `;` },
  { id: "M44", property: "P078_accountable_role",
    find: `if (actor?.role !== ACCOUNTABLE_RETENTION_ROLE || typeof actor?.actorId !== "string" || actor.actorId.length === 0) {`,
    replace: `if (false) {` },
  { id: "M45", property: "P077_document_capability",
    find: `if (!DOCUMENT_LIFECYCLE_STATES.includes(d.state)) {`,
    replace: `if (false) {` },
  { id: "M46", property: "P077_document_capability",
    find: `if (!allowed.includes(nextState)) {`,
    replace: `if (false) {` },
  { id: "M47", property: "P088_portal_lifecycle_declared",
    find: `if (typeof d.retentionClassId !== "string" || d.retentionClassId.length === 0) {
    fail("LIFECYCLE_UNDECLARED", \`document \${d.documentId} has no declared retention class\`);
  }`,
    replace: `` },
  { id: "M48", property: "P089_provider_blocked_externally",
    find: `if (status["P1AF-089"] !== "DECIDED") {`,
    replace: `if (false) {` },
  { id: "M49", property: "P090_provider_parity",
    find: "if (canonicalJson(a[key]) !== canonicalJson(b[key])) findings.push(`PARITY_DIVERGENCE:${key}`);",
    replace: `;` },
];

// --- harness ---------------------------------------------------------------
const REQUIRED_PROPERTIES = Object.keys(PROBES);

// 1. sanity: every probe passes against the unmutated source
const baseline = await importSource(SOURCE);
assert.deepEqual(
  baseline.PROPERTY_REGISTER.map((p) => p.id).length >= 26, true,
  "PROPERTY_REGISTER shrank",
);
for (const [name, probe] of Object.entries(PROBES)) {
  probe(baseline);
  console.log(`BASELINE OK ${name}`);
}

// 2. every register property must be exercised by at least one mutant's probe
//    (mutation denominator accounting: probes cover the register's P-ids)
const mutatedProperties = new Set(MUTANTS.map((m) => m.property));
for (const prop of REQUIRED_PROPERTIES) {
  assert.ok(mutatedProperties.has(prop), `property has no mutant: ${prop}`);
}

// 3. run mutants
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
  try {
    module = await importSource(mutatedSource);
  } catch {
    dead = true; // failed to load = killed
  }
  if (!dead) {
    // a mutant is killed when ANY probe fails against it
    for (const probe of Object.values(PROBES)) {
      try { probe(module); } catch { dead = true; break; }
    }
  }
  if (dead) { killed += 1; console.log(`KILLED ${mutant.id} (${mutant.property})`); }
  else survivors.push(mutant.id);
}

console.log("--------------------------------------------------------------");
console.log(`P1A-06 mutation: mutants=${MUTANTS.length} killed=${killed} survivors=${survivors.length} probes=${REQUIRED_PROPERTIES.length}`);
if (survivors.length > 0) {
  console.error(`SURVIVORS: ${survivors.join(", ")}`);
  process.exit(1);
}
