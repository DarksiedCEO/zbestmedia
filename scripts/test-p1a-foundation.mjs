import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { parseStrictJson, canonicalize, canonicalDigest, requireCanonicalBytes, ContractError } from "./p1a/canonical-json.mjs";
import { loadManifest, validateManifest } from "./p1a/certification-manifest.mjs";
import { classifySubject, SUBJECT_CLASSES } from "./p1a/subject-classifier.mjs";
import { evaluateCompleteness } from "./p1a/completeness-oracle.mjs";
import { ACCOUNTING_STATES, createAccounting, createRequiredConsumerAccounting, applyAccountingEvent, aggregateAccounting } from "./p1a/accounting-state-machine.mjs";
import { createAdverseEnvelope, appendEvidenceEvent, reconcileEvidence, sealEvidence } from "./p1a/adverse-evidence.mjs";
import { loadRequiredConsumerCatalog, REQUIRED_CONSUMER_CATALOG } from "./p1a/required-consumer-catalog.mjs";

const sha = (c) => c.repeat(40); const digest = (c) => c.repeat(64);
const tests = []; const test = (id, fn) => tests.push({ id, fn });
const rejects = (code, fn) => assert.throws(fn, (error) => error instanceof ContractError && error.code === code);

test("canonical_key_order_and_digest", () => { assert.equal(canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}'); assert.equal(canonicalDigest({ b: 2, a: 1 }), canonicalDigest({ a: 1, b: 2 })); });
test("canonical_input_bytes", () => assert.deepEqual(requireCanonicalBytes(Buffer.from('{"a":1}')), { a: 1 }));
test("noncanonical_bytes_rejected", () => rejects("JSON_NONCANONICAL", () => requireCanonicalBytes(Buffer.from('{ "a": 1 }'))));
test("duplicate_key_rejected", () => rejects("JSON_DUPLICATE_KEY", () => parseStrictJson('{"a":1,"a":2}')));
test("bom_rejected", () => rejects("UTF8_BOM_FORBIDDEN", () => parseStrictJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))));
test("fraction_rejected", () => rejects("NUMBER_NON_INTEGER", () => parseStrictJson('{"a":1.2}')));
test("unsafe_integer_rejected", () => rejects("NUMBER_UNSAFE", () => parseStrictJson('{"a":9007199254740992}')));
test("non_nfc_rejected", () => rejects("UNICODE_NOT_NFC", () => parseStrictJson('{"a":"e\\u0301"}')));
test("astral_unicode_accepted", () => assert.equal(parseStrictJson('{"a":"😀"}').a, "😀"));
test("non_json_whitespace_rejected", () => rejects("JSON_TRAILING_DATA", () => parseStrictJson('{"a":1}\u00a0')));
test("comments_rejected", () => rejects("JSON_MALFORMED", () => parseStrictJson('{/*x*/"a":1}')));
test("trailing_comma_rejected", () => rejects("JSON_MALFORMED", () => parseStrictJson('{"a":1,}')));

const manifestBytes = await readFile(new URL("../.github/p1a/certification-contract.v1.json", import.meta.url));
const loaded = loadManifest(manifestBytes);
test("manifest_canonical_and_stable", () => { assert.deepEqual(requireCanonicalBytes(manifestBytes), loaded.manifest); assert.equal(loaded.digest.length, 64); });
const manifestSchemaBytes = await readFile(new URL("../.github/p1a/certification-contract.v1.schema.json", import.meta.url));
test("manifest_runtime_schema_parity", () => { const schema = parseStrictJson(manifestSchemaBytes); const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema); assert.equal(validate(loaded.manifest), true, JSON.stringify(validate.errors)); });
const mutatedManifest = () => structuredClone(loaded.manifest);
test("manifest_unknown_field", () => { const x = mutatedManifest(); x.unknown = true; rejects("CONTRACT_SCHEMA_INVALID", () => validateManifest(x)); });
test("manifest_candidate_custody", () => { const x = mutatedManifest(); x.repositoryIdentity.selectedBy = "candidate"; rejects("CANDIDATE_AUTHORITY_SELECTED", () => validateManifest(x)); });
test("manifest_mutable_ref", () => { const x = mutatedManifest(); x.authorities[0].immutable_ref = "main"; rejects("MUTABLE_REF_FORBIDDEN", () => validateManifest(x)); });
test("manifest_duplicate_role", () => { const x = mutatedManifest(); const copy = structuredClone(x.authorities[0]); copy.authority_id = "z_duplicate"; x.authorities.push(copy); rejects("ROLE_DUPLICATE", () => validateManifest(x)); });
test("manifest_path_traversal", () => { const x = mutatedManifest(); x.authorities[0].required_paths = [{ path: "../x", blob_sha: sha("a") }]; rejects("CONTRACT_PATH_INVALID", () => validateManifest(x)); });
test("manifest_root_alias", () => { const x = mutatedManifest(); x.authorities[1].materialization_path = x.authorities[0].materialization_path; rejects("ROOT_ALIAS", () => validateManifest(x)); });
test("manifest_version_mismatch", () => { const x = mutatedManifest(); x.contractVersion = "P1A-CONTRACT-2"; rejects("CONTRACT_VERSION_UNSUPPORTED", () => validateManifest(x)); });
test("manifest_attacker_custody", () => { const x = mutatedManifest(); x.repositoryIdentity.selectedBy = "attacker"; rejects("CANDIDATE_AUTHORITY_SELECTED", () => validateManifest(x)); });
test("manifest_wrong_repository", () => { const x = mutatedManifest(); x.repositoryIdentity.repository = "Evil/repo"; rejects("CONTRACT_IDENTITY_INVALID", () => validateManifest(x)); });
test("manifest_nested_unknown_object_field", () => { const x = mutatedManifest(); x.authorities[0].required_objects[0].unknown = true; rejects("CONTRACT_SCHEMA_INVALID", () => validateManifest(x)); });
test("manifest_nested_unknown_consumer_field", () => { const x = mutatedManifest(); x.consumers[0].unknown = true; rejects("CONTRACT_SCHEMA_INVALID", () => validateManifest(x)); });
test("manifest_empty_verification_rejected", () => { const x = mutatedManifest(); x.authorities[0].verification_contract = []; rejects("CONTRACT_BINDING_EMPTY", () => validateManifest(x)); });
test("manifest_external_catalog_digest_rejected", () => { const x = mutatedManifest(); x.requiredConsumerCatalog.catalogSha256 = digest("0"); rejects("CATALOG_BINDING_INVALID", () => validateManifest(x)); });
test("manifest_exact_consumer_set_required", () => { const x = mutatedManifest(); x.consumers.pop(); rejects("CATALOG_CONSUMER_SET_INVALID", () => validateManifest(x)); });

const authority = (value, source = "trusted_external") => ({ digest: value, source });
const policy = { repository: "DarksiedCEO/zbestmedia", contractDigest: digest("a"), originalCandidateSha: sha("1"), selectingAuthorities: { historical_registry: authority(digest("1")), founder_bootstrap: authority(digest("2")), founder_workflow: authority(digest("3")), founder_merge: authority(digest("4")), event_remediation: authority(digest("5")), founder_reconciliation: authority(digest("6")), founder_final_freeze: authority(digest("7")), github_event: authority(digest("8"), "github_event") }, gitObservationDigests: {}, historicalFixtures: { [sha("9")]: { tree: sha("a"), parents: [sha("b")] } } };
const envelope = (kind, extra = {}) => { const value = { repository: policy.repository, subjectSha: sha("c"), subjectTree: sha("d"), orderedParents: [sha("e")], eventKind: "push", eventBaseSha: sha("e"), reviewedHeadSha: sha("c"), authorizedBaseSha: sha("e"), authorizedFileScope: ["scripts/x.mjs"], observedScope: ["scripts/x.mjs"], trustedWorkflowSha: sha("f"), contractDigest: policy.contractDigest, selectingAuthority: { kind, ...policy.selectingAuthorities[kind] }, ...extra }; value.gitObservation = { subjectSha: value.subjectSha, subjectTree: value.subjectTree, orderedParents: value.orderedParents }; value.gitObservation.digest = canonicalDigest(value.gitObservation); policy.gitObservationDigests[`${value.subjectSha}:${value.subjectTree}:${value.orderedParents.join(",")}`] = value.gitObservation.digest; return value; };
const classFixtures = {
  HISTORICAL_FIXTURE: envelope("historical_registry", { subjectSha: sha("9"), subjectTree: sha("a"), orderedParents: [sha("b")], requestsCurrentCertification: false }),
  TRUSTED_BOOTSTRAP_AMENDMENT: envelope("founder_bootstrap", { externalAuthorizationValid: true, bootstrapBytesUnchanged: true }),
  TRUSTED_WORKFLOW_AMENDMENT: envelope("founder_workflow", { externalAuthorizationValid: true, foundationBoundaryOnly: true }),
  TRUSTED_FOUNDATION_MERGE: envelope("founder_merge", { eventKind: "target_push", orderedParents: [sha("e"), sha("c")], approvedMergeTree: sha("d"), foundationBlobsMatch: true }),
  GENERATION2_REMEDIATION_DESCENDANT: envelope("event_remediation", { directBoundedPath: true, noPostAnchorMerge: true, governedBlobsAuthorized: true }),
  DISPOSABLE_RECONCILIATION: envelope("founder_reconciliation", { orderedParents: [sha("1"), sha("2")], currentTrustedMergeSha: sha("2"), dualAncestryVerified: true, allPathsClassified: true, freezeFinal: false }),
  FINAL_RECONCILIATION_CANDIDATE: envelope("founder_final_freeze", { orderedParents: [sha("1"), sha("2")], currentTrustedMergeSha: sha("2"), dualAncestryVerified: true, allPathsClassified: true, freezeFinal: true, originalEvidenceBlobsMatch: true, trustedFoundationBlobsMatch: true }),
  ORDINARY_CANDIDATE: envelope("github_event", { eventHeadSha: sha("c"), unprivileged: true, certificationClaim: false })
};
const classify = (value) => classifySubject(value, policy, canonicalDigest(value));
for (const name of SUBJECT_CLASSES) test(`class_${name}`, () => assert.equal(classify(classFixtures[name]).classification, name));
test("classifier_zero_match", () => rejects("SUBJECT_CLASS_ZERO_MATCH", () => classify(envelope("github_event", { eventHeadSha: sha("c"), unprivileged: false, certificationClaim: false }))));
test("classifier_candidate_authority", () => { const x = envelope("github_event", { eventHeadSha: sha("c"), unprivileged: true, certificationClaim: false }); x.selectingAuthority.source = "candidate"; rejects("CANDIDATE_AUTHORITY_SELECTED", () => classify(x)); });
test("classifier_external_digest", () => rejects("SUBJECT_ENVELOPE_DIGEST_MISMATCH", () => classifySubject(classFixtures.ORDINARY_CANDIDATE, policy, digest("0"))));
test("classifier_attacker_source", () => { const x = structuredClone(classFixtures.TRUSTED_FOUNDATION_MERGE); x.selectingAuthority.source = "attacker"; rejects("CANDIDATE_AUTHORITY_SELECTED", () => classifySubject(x, policy, canonicalDigest(x))); });
test("classifier_git_observation_required", () => { const x = structuredClone(classFixtures.TRUSTED_FOUNDATION_MERGE); delete x.gitObservation; rejects("SUBJECT_GIT_OBSERVATION_INVALID", () => classifySubject(x, policy, canonicalDigest(x))); });
test("disposable_requires_two_parents", () => { const x = structuredClone(classFixtures.DISPOSABLE_RECONCILIATION); x.orderedParents = [sha("1")]; rejects("SUBJECT_GIT_OBSERVATION_INVALID", () => classify(x)); });
test("workflow_amendment_wrong_parent", () => { const x = structuredClone(classFixtures.TRUSTED_WORKFLOW_AMENDMENT); x.orderedParents = [sha("9")]; rejects("SUBJECT_GIT_OBSERVATION_INVALID", () => classify(x)); });

const externalCatalogPath = process.env.P1A_REQUIRED_CONSUMER_CATALOG_PATH;
const externalCatalogSchemaPath = process.env.P1A_REQUIRED_CONSUMER_CATALOG_SCHEMA_PATH;
const externalCatalogFreezePath = process.env.P1A_REQUIRED_CONSUMER_CATALOG_FREEZE_PATH;
assert.ok(externalCatalogPath && externalCatalogSchemaPath && externalCatalogFreezePath, "trusted harness must externally select Packet-2 catalog, schema, and freeze paths");
const catalogBytes = await readFile(externalCatalogPath); const catalogSchemaBytes = await readFile(externalCatalogSchemaPath); const catalogFreezeBytes = await readFile(externalCatalogFreezePath);
const catalogAuthority = { producer: "packet_2_evidence_custodian", selectionAuthority: "external_bootstrap_authorization", candidateSelectable: false, catalogSha256: REQUIRED_CONSUMER_CATALOG.catalogSha256, schemaSha256: REQUIRED_CONSUMER_CATALOG.schemaSha256, freezeSha256: REQUIRED_CONSUMER_CATALOG.freezeSha256 };
const loadedCatalog = loadRequiredConsumerCatalog({ catalogBytes, schemaBytes: catalogSchemaBytes, freezeBytes: catalogFreezeBytes, authority: catalogAuthority });
const catalog = loadedCatalog.catalog;
test("external_catalog_exact_digest_schema_and_canonical_bytes", () => { assert.equal(loadedCatalog.catalogDigest, REQUIRED_CONSUMER_CATALOG.catalogSha256); assert.equal(loadedCatalog.schemaDigest, REQUIRED_CONSUMER_CATALOG.schemaSha256); assert.deepEqual(loadedCatalog.consumerIds, REQUIRED_CONSUMER_CATALOG.consumerIds); });
test("external_catalog_wrong_bytes_rejected", () => { const bytes = Buffer.from(catalogBytes); bytes[bytes.length - 1] ^= 1; rejects("CATALOG_DIGEST_MISMATCH", () => loadRequiredConsumerCatalog({ catalogBytes: bytes, schemaBytes: catalogSchemaBytes, freezeBytes: catalogFreezeBytes, authority: catalogAuthority })); });
test("external_catalog_candidate_authority_rejected", () => rejects("CATALOG_AUTHORITY_INVALID", () => loadRequiredConsumerCatalog({ catalogBytes, schemaBytes: catalogSchemaBytes, freezeBytes: catalogFreezeBytes, authority: { ...catalogAuthority, producer: "candidate" } })));
const registry = {
  authorityProducers: loaded.manifest.authorities.map((authority) => ({ authority_id: authority.authority_id })),
  producers: loaded.manifest.consumers.flatMap((consumer) => consumer.required_roles.map((producer_role) => ({ producer_role, consumer_ids: [consumer.consumer_id] }))),
  consumers: loaded.manifest.consumers.map((consumer) => ({ consumer_id: consumer.consumer_id, manifest_binding: "required_consumer_exact_set" })),
  accountingRecords: loaded.manifest.consumers.map((consumer) => ({ consumer_id: consumer.consumer_id })),
  cleanupRegistry: loaded.manifest.consumers.map((consumer) => ({ consumer_id: consumer.consumer_id, cleanup_obligations: consumer.cleanup_obligations })),
  objectStores: []
};
const oracle = (m = loaded.manifest, r = registry, c = catalog, overrides = {}) => evaluateCompleteness({ manifest: m, executableRegistry: r, frozenCatalog: c, bindings: { executableRegistryDigest: canonicalDigest(r), frozenCatalogDigest: REQUIRED_CONSUMER_CATALOG.catalogSha256, frozenCatalogSchemaDigest: REQUIRED_CONSUMER_CATALOG.schemaSha256, selectionAuthority: "external_bootstrap_authorization", candidateSelectable: false, ...overrides } });
test("oracle_complete", () => assert.equal(oracle().status, "COMPLETE"));
for (const [name, mutate, expected] of [
  ["missing_producer", (r) => r.authorityProducers.pop(), "MISSING_PRODUCER"], ["unknown_consumer", (r) => r.consumers.push({ consumer_id: "unknown", manifest_binding: "required_consumer_exact_set" }), "CATALOG_CONSUMER_SET_INVALID"], ["object_alias", (r) => r.objectStores.push({ left: "a", right: "b", leftRealpath: "/x", rightRealpath: "/x" }), "OBJECT_STORE_ALIAS"]
]) test(`oracle_${name}`, () => { const r = structuredClone(registry); mutate(r); assert(oracle(loaded.manifest, r).findings.some((x) => x.code === expected)); });
test("oracle_candidate_owner", () => { const m = mutatedManifest(); m.authorities[0].owner = "candidate"; assert(oracle(m).findings.some((x) => x.code === "CANDIDATE_SELECTED_AUTHORITY")); });
test("oracle_missing_cleanup_accounting", () => { const m = mutatedManifest(); m.consumers[0].cleanup_obligations = []; m.consumers[0].accounting_obligations = []; const codes = oracle(m).findings.map((x) => x.code); assert(codes.includes("MISSING_CLEANUP") && codes.includes("MISSING_ACCOUNTING")); });
test("oracle_external_catalog_binding", () => { const report = oracle(loaded.manifest, registry, catalog, { frozenCatalogDigest: digest("0") }); assert(report.findings.some((x) => x.semanticId === "external_catalog_binding")); });
test("oracle_unloaded_catalog_rejected", () => { const report = oracle(loaded.manifest, registry, structuredClone(catalog)); assert(report.findings.some((x) => x.semanticId === "external_catalog_binding")); });
test("oracle_extra_producer_rejected", () => { const r = structuredClone(registry); r.producers.push({ producer_role: "unauthorized_producer", consumer_ids: ["accounting"] }); assert(oracle(loaded.manifest, r).findings.some((x) => x.semanticId === "semantic_producer_set")); });
test("oracle_accounting_set_exact", () => { const r = structuredClone(registry); r.accountingRecords.pop(); assert(oracle(loaded.manifest, r).findings.some((x) => x.semanticId === "accounting")); });
test("oracle_cleanup_set_exact", () => { const r = structuredClone(registry); r.cleanupRegistry.pop(); assert(oracle(loaded.manifest, r).findings.some((x) => x.semanticId === "cleanup")); });
test("oracle_cleanup_obligation_exact", () => { const r = structuredClone(registry); r.cleanupRegistry[0].cleanup_obligations = ["wrong_cleanup"]; assert(oracle(loaded.manifest, r).findings.some((x) => x.code === "CATALOG_OBLIGATION_MISMATCH")); });

const identity = { runId: "r", attempt: 1, candidateSha: sha("a"), workflowSha: sha("b"), contractDigest: digest("c") };
test("accounting_all_states_closed", () => assert.deepEqual(ACCOUNTING_STATES, ["NOT_RUN", "RUNNING", "PASS", "FAIL", "SKIPPED", "CANCELLED", "TIMED_OUT", "NEUTRAL", "STALE", "NOT_VERIFIED", "EVIDENCE_MISSING", "ARTIFACT_UPLOAD_FAILED", "CLEANUP_FAILED", "INDETERMINATE"]));
test("accounting_exact_external_consumer_set", () => assert.deepEqual(createRequiredConsumerAccounting(identity, loadedCatalog.consumerIds).requiredChecks, REQUIRED_CONSUMER_CATALOG.consumerIds));
test("accounting_consumer_omission_rejected", () => rejects("ACCOUNTING_CONSUMER_SET_INVALID", () => createRequiredConsumerAccounting(identity, loadedCatalog.consumerIds.slice(1))));
test("accounting_transition_table_exhaustive", () => { const allowed = { NOT_RUN: ["RUNNING", "SKIPPED", "CANCELLED", "NEUTRAL", "STALE"], RUNNING: ["PASS", "FAIL", "CANCELLED", "TIMED_OUT", "NOT_VERIFIED", "EVIDENCE_MISSING", "ARTIFACT_UPLOAD_FAILED", "CLEANUP_FAILED", "INDETERMINATE"], PASS: ["STALE"], NEUTRAL: ["STALE"] }; for (const from of ACCOUNTING_STATES) for (const to of ACCOUNTING_STATES) { const a = createAccounting(identity, ["check"]); a.records.check.state = from; const action = () => applyAccountingEvent(a, { eventId: `${from}-${to}`, checkId: "check", state: to }); if ((allowed[from] ?? []).includes(to)) action(); else rejects("ACCOUNTING_TRANSITION_INVALID", action); } });
test("accounting_green_requires_cleanup", () => { const a = createAccounting(identity, ["check", "cleanup"]); applyAccountingEvent(a, { eventId: "1", checkId: "check", state: "RUNNING" }); applyAccountingEvent(a, { eventId: "2", checkId: "check", state: "PASS" }); applyAccountingEvent(a, { eventId: "3", checkId: "cleanup", state: "RUNNING" }); assert.equal(aggregateAccounting(a, { cleanupCheckId: "cleanup" }).decision, "NON_GREEN"); applyAccountingEvent(a, { eventId: "4", checkId: "cleanup", state: "PASS" }); assert.equal(aggregateAccounting(a, { cleanupCheckId: "cleanup" }).decision, "GREEN"); });
test("accounting_skip_never_green", () => { const a = createAccounting(identity, ["check"]); applyAccountingEvent(a, { eventId: "1", checkId: "check", state: "SKIPPED" }); assert.equal(aggregateAccounting(a).decision, "NON_GREEN"); });
test("accounting_invalid_transition", () => { const a = createAccounting(identity, ["check"]); rejects("ACCOUNTING_TRANSITION_INVALID", () => applyAccountingEvent(a, { eventId: "1", checkId: "check", state: "PASS" })); });
test("accounting_idempotent_replay", () => { const a = createAccounting(identity, ["check"]); const event = { eventId: "1", checkId: "check", state: "RUNNING" }; applyAccountingEvent(a, event); applyAccountingEvent(a, event); assert.equal(a.records.check.events.length, 1); });
test("accounting_contradiction", () => { const a = createAccounting(identity, ["check"]); applyAccountingEvent(a, { eventId: "1", checkId: "check", state: "RUNNING" }); applyAccountingEvent(a, { eventId: "1", checkId: "check", state: "FAIL" }); assert.equal(a.records.check.state, "INDETERMINATE"); assert.equal(aggregateAccounting(a).contradictionCount, 1); });
test("accounting_direct_green_tamper_rejected", () => { const a = createAccounting(identity, ["check"]); a.records.check.state = "PASS"; rejects("ACCOUNTING_TAMPERED", () => aggregateAccounting(a)); });

const evidenceInput = { candidateSha: sha("a"), candidateTree: sha("b"), orderedParents: [sha("c")], workflowSha: sha("d"), workflowBlob: sha("e"), manifestDigest: digest("f"), platform: { runId: "1", jobId: "2" }, git: { repository: policy.repository } };
test("adverse_evidence_deterministic", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); appendEvidenceEvent(e, { stage: "identity", state: "PASS" }); const sealed = sealEvidence(e); assert.equal(sealed.digest, sealEvidence(e).digest); assert.equal(sealed.decision, "INDETERMINATE"); });
test("runner_loss_indeterminate", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); reconcileEvidence(e, { runnerAvailable: false, platform: { conclusion: "failure" }, git: {}, unavailable: ["runner"] }); assert.equal(e.accountingState, "INDETERMINATE"); });
test("contradiction_preserved", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); reconcileEvidence(e, { runnerAvailable: true, platform: {}, git: {}, contradictions: ["digest mismatch"] }); assert.deepEqual(e.contradictions, ["digest mismatch"]); assert.equal(e.accountingState, "INDETERMINATE"); });
test("candidate_evidence_producer_rejected", () => rejects("EVIDENCE_PRODUCER_INVALID", () => createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "candidate" })));
test("mutated_evidence_producer_rejected", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); e.producer = "candidate"; rejects("EVIDENCE_PRODUCER_INVALID", () => sealEvidence(e)); });
test("fabricated_evidence_state_rejected", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); e.accountingState = "GREENISH"; rejects("EVIDENCE_STATE_INVALID", () => sealEvidence(e)); });
test("invalid_evidence_timestamp_rejected", () => rejects("EVIDENCE_PRODUCER_INVALID", () => createAdverseEnvelope(evidenceInput, { now: () => "not-a-time", producer: "trusted_evidence" })));
test("self_sealed_evidence_indeterminate", () => { const e = createAdverseEnvelope(evidenceInput, { now: () => "2026-08-15T00:00:00Z", producer: "trusted_evidence" }); const authority = { producer: "candidate", platformDigest: canonicalDigest(e.platform), gitDigest: canonicalDigest(e.git) }; assert.equal(sealEvidence(e, { externalAuthority: authority, expectedAuthorityDigest: canonicalDigest(authority) }).decision, "INDETERMINATE"); });

let passed = 0;
for (const entry of tests) { try { await entry.fn(); passed += 1; console.log(`PASS ${entry.id}`); } catch (error) { console.error(`FAIL ${entry.id}`); throw error; } }
console.log(JSON.stringify({ suite: "p1a-foundation", required: tests.length, executed: tests.length, passed, failed: 0, skipped: 0, cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0 }));
