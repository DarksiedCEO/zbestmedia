import assert from "node:assert/strict";

export const AUTHORIZED_BASE = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";
export const AUTHORIZED_REPOSITORY = "https://github.com/DarksiedCEO/zbestmedia.git";
export const LEDGER_SHA256 = "f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf";
export const OWNED_REQUIREMENTS = Object.freeze(["P1AF-091", "P1AF-092", "P1AF-093", "P1AF-094", "P1AF-095", "P1AF-096", "P1AF-097", "P1AF-098", "P1AF-124"]);
export const HISTORICAL_REGRESSION_CLASSES = Object.freeze([
  "AUTHORITY_ROOT_COORDINATED_REWRITE", "REVIEWER_REGISTRY_REPLACEMENT", "FABRICATED_EXECUTION", "POLICY_ROOT_SUBSTITUTION", "VACUOUS_TRAVERSAL", "UNPARSED_EXCLUSIONS", "RECEIPT_UNDER_BINDING", "SUPERSESSION_WEAKNESS", "HERMETIC_GIT_BYPASS", "AMBIENT_GIT_CONFIG_AUTHORITY", "OIDC_VERIFICATION_BYPASS", "PROTECTED_CERTIFICATION_ORCHESTRATION_DRIFT", "ACQUISITION_INVENTORY_DRIFT", "TRANSACTION_OUTBOX_STRANDING", "TRANSACTION_OUTBOX_DUPLICATION", "CREDENTIAL_EXPIRY_WEAKNESS", "CREDENTIAL_ROTATION_WEAKNESS", "CREDENTIAL_REVOCATION_WEAKNESS", "PRIVACY_RETENTION_GAP", "PRIVACY_DELETION_GAP", "PERSISTED_JSON_LIFECYCLE_GAP", "MONEY_Z_FLAMING_Z_SEMANTIC_CONFLICT", "FOUNDING_DATE_SEMANTIC_CONFLICT", "MUTATION_DENOMINATOR_INCOMPLETENESS", "RUNTIME_OVERCLAIM", "PRODUCTION_OVERCLAIM", "HISTORICAL_EVIDENCE_FABRICATION",
]);

// This register, never a caller-supplied target, is the mutation denominator.
const PROPERTY_ROWS = [
  ["P01_NON_EMPTY_EXECUTION", "empty suite marked green"], ["P02_SKIPS_ARE_NOT_PASS", "all tests skipped"],
  ["P03_FIXTURE_IS_NOT_LIVE", "fixture result presented as live execution"], ["P04_HARNESS_CRASH_IS_NOT_KILL", "mutation harness crash"],
  ["P05_MUTANT_MUST_EXECUTE", "mutant not executed"], ["P06_DENOMINATOR_IS_REGISTER_DERIVED", "caller reduces denominator"],
  ["P07_EQUIVALENCE_IS_ADJUDICATED", "equivalent mutant mislabeled killed"], ["P08_NO_HIDDEN_SURVIVORS", "survivor omitted from summary"],
  ["P09_EXACT_SUBJECT_BINDING", "wrong subject"], ["P10_FRESH_EVIDENCE", "stale receipt"],
  ["P11_HISTORICAL_RED_PRESERVED", "historical RED deleted"], ["P12_NO_SELF_CERTIFICATION", "builder self-certifies"],
  ["P13_PARTIAL_IS_NOT_EXHAUSTIVE", "partial search labeled exhaustive"], ["P14_NOT_RUN_IS_NOT_PASS", "NOT_RUN promoted to PASS"],
  ["P15_REAL_REVIEWER_INDEPENDENCE", "fake independent reviewer"], ["P16_COMPLETE_HISTORICAL_DENOMINATOR", "historical class omitted"],
  ["P17_NEGATIVE_CONTROLS_GO_RED", "vacuous negative control"], ["P18_UNKNOWN_REMAINS_UNKNOWN", "UNKNOWN promoted to PASS"],
  ["P19_COVERAGE_UNKNOWN_REMAINS_UNKNOWN", "COVERAGE_UNKNOWN labeled exhaustive"], ["P20_BUILDER_TESTS_ARE_NOT_CERTIFICATION", "builder tests labeled certification"],
  ["P21_THREAT_DENOMINATORS_FROZEN", "threat denominator changed"], ["P22_TENANT_OPERATION_DENOMINATOR_FROZEN", "tenant operation denominator changed"],
];
export const SECURITY_PROPERTIES = Object.freeze(PROPERTY_ROWS.map(([id, negativeControl]) => Object.freeze({ id, negativeControl, mutantId: `M_${id}` })));

const RESULTS = new Set(["PASS", "FAIL", "NOT_RUN", "UNKNOWN", "COVERAGE_UNKNOWN"]);
const MUTANT_RESULTS = new Set(["KILLED", "SURVIVED", "EQUIVALENT", "NOT_EXECUTED", "HARNESS_ERROR"]);
const exactSha = (value, label) => assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label}: exact SHA required`);
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicates forbidden`);

export function validateTestAuthenticityReport(report, { now = Date.now() } = {}) {
  assert.equal(report?.schemaVersion, "1.0.0", "unsupported report schema");
  assert.deepEqual(report.ledger, { sha256: LEDGER_SHA256, denominator: 124, ownedRequirements: OWNED_REQUIREMENTS }, "frozen requirement ledger drift");
  const subject = report.subject;
  assert.equal(subject?.repository, AUTHORIZED_REPOSITORY, "wrong repository subject");
  assert.equal(subject?.baseSha, AUTHORIZED_BASE, "wrong base subject");
  exactSha(subject?.headSha, "head"); exactSha(subject?.treeSha, "tree");
  assert.ok(Array.isArray(subject.parents), "parents required"); subject.parents.forEach((p) => exactSha(p, "parent"));
  assert.deepEqual(report.continuity, { phase: "ACTIVE_IMPLEMENTATION", result: "CONTINUITY_READY", drift: "ON_TASK", hallucination: "ACCEPT", verificationGateSatisfied: true }, "Continuity V2 gate failed");

  const cert = report.certification;
  assert.equal(cert?.builderMayCertifyOwnOutput, false, "builder cannot certify its own output");
  assert.equal(cert?.builderTestsAreCertification, false, "builder tests are not certification");
  assert.equal(cert?.certified, false, "builder report cannot certify");
  assert.notEqual(cert?.builderIdentity, cert?.reviewerIdentity, "self-certification");
  assert.ok(cert?.trustedReviewerRegistry?.includes(cert.reviewerIdentity), "fake independent reviewer");

  assert.deepEqual(report.historicalRegressionClasses, HISTORICAL_REGRESSION_CLASSES, "historical denominator changed");
  unique(report.historicalRegressionClasses, "historical classes");
  assert.equal(report.attacks?.length, 27, "all 27 executable attacks required");
  assert.deepEqual(report.attacks.map((a) => a.classId), HISTORICAL_REGRESSION_CLASSES, "historical attack identities changed");
  for (const attack of report.attacks) {
    assert.equal(attack.executable, true, `${attack.classId}: executable attack required`);
    assert.match(attack.command ?? "", /^node\s+/, `${attack.classId}: command required`);
    assert.equal(attack.negativeControlObserved, "RED", `${attack.classId}: negative control did not go RED`);
    assert.equal(attack.controlOutcome, "REJECTED", `${attack.classId}: attack not rejected`);
    assert.ok(attack.evidenceId, `${attack.classId}: evidence required`);
  }
  assert.equal(report.historicalRedEvidence?.length, 27, "historical RED evidence deleted");
  assert.deepEqual(report.historicalRedEvidence.map((e) => e.classId), HISTORICAL_REGRESSION_CLASSES, "historical RED identities changed");
  report.historicalRedEvidence.forEach((e) => assert.equal(e.observed, "RED", `${e.classId}: RED not preserved`));

  assert.ok(report.suites?.length > 0, "empty suite inventory");
  for (const suite of report.suites) {
    assert.ok(RESULTS.has(suite.result), `${suite.id}: invalid result`);
    assert.ok(Number.isInteger(suite.discovered) && Number.isInteger(suite.executed) && Number.isInteger(suite.skipped), `${suite.id}: counts required`);
    assert.ok(suite.discovered > 0, `${suite.id}: empty suite cannot be green`);
    assert.equal(suite.executed + suite.skipped, suite.discovered, `${suite.id}: dishonest execution accounting`);
    if (suite.result === "PASS") assert.ok(suite.executed > 0 && suite.skipped < suite.discovered, `${suite.id}: skipped suite cannot pass`);
    else assert.equal(suite.passed, false, `${suite.id}: ${suite.result} cannot pass`);
    if (suite.executionKind === "FIXTURE") assert.equal(suite.liveExecution, false, `${suite.id}: fixture presented as live`);
    if (suite.coverage === "PARTIAL" || suite.result === "COVERAGE_UNKNOWN") assert.equal(suite.exhaustive, false, `${suite.id}: partial/unknown coverage labeled exhaustive`);
  }

  const review = report.reviewEvidence;
  assert.deepEqual(review?.subject, subject, "review evidence: wrong subject");
  assert.equal(review?.executionKind, "INDEPENDENT_REVIEW", "builder evidence masquerades as independent review");
  assert.equal(review?.reviewerIdentity, cert.reviewerIdentity, "reviewer identity mismatch");
  const issued = Date.parse(review?.issuedAt);
  assert.ok(Number.isFinite(issued) && issued <= now && Number.isInteger(review.maxAgeSeconds) && now - issued <= review.maxAgeSeconds * 1000, "stale review evidence");

  assert.deepEqual(report.propertyRegister, SECURITY_PROPERTIES, "security property register changed");
  const mutation = report.mutation;
  assert.equal(mutation?.denominatorSource, "SECURITY_PROPERTY_REGISTER", "arbitrary mutation denominator");
  assert.equal(mutation?.denominator, SECURITY_PROPERTIES.length, "mutation denominator reduction");
  assert.equal(mutation?.results?.length, SECURITY_PROPERTIES.length, "mutation results incomplete");
  assert.deepEqual(mutation.results.map((m) => m.propertyId), SECURITY_PROPERTIES.map((p) => p.id), "mutation/property binding changed");
  unique(mutation.results.map((m) => m.mutantId), "mutants");
  mutation.results.forEach((mutant, index) => {
    const property = SECURITY_PROPERTIES[index];
    assert.equal(mutant.mutantId, property.mutantId, `${property.id}: wrong mutant`);
    assert.ok(MUTANT_RESULTS.has(mutant.result), `${property.id}: invalid mutant result`);
    assert.equal(mutant.executed, true, `${property.id}: mutant not executed`);
    assert.notEqual(mutant.result, "HARNESS_ERROR", `${property.id}: harness crash is not killed`);
    assert.notEqual(mutant.result, "NOT_EXECUTED", `${property.id}: mutant not executed`);
    assert.notEqual(mutant.result, "SURVIVED", `${property.id}: surviving mutant`);
    if (mutant.result === "KILLED") assert.equal(mutant.negativeControlObserved, "RED", `${property.id}: kill lacks RED`);
    if (mutant.result === "EQUIVALENT") {
      assert.equal(mutant.countedAsKilled, false, `${property.id}: equivalent mislabeled killed`);
      assert.ok(mutant.adjudication?.reason && mutant.adjudication?.reviewer && mutant.adjudication?.reproducer, `${property.id}: equivalent adjudication incomplete`);
    }
  });
  const killed = mutation.results.filter((m) => m.result === "KILLED").length;
  const equivalent = mutation.results.filter((m) => m.result === "EQUIVALENT").length;
  assert.equal(mutation.killed, killed, "killed count mismatch"); assert.equal(mutation.equivalent, equivalent, "equivalent count mismatch");
  assert.deepEqual(mutation.survivors, [], "hidden or surviving mutant");
  assert.equal(killed + equivalent, mutation.denominator, "mutation accounting incomplete");
  assert.deepEqual(report.frozenDenominators, { threats: 31, actors: 22, actions: 28, actorActionCells: 616, tenantOperations: 18 }, "frozen denominator drift");
  return { outcome: "VALID_BUILDER_EVIDENCE", certified: false, historicalAttackDenominator: 27, mutationDenominator: SECURITY_PROPERTIES.length };
}
