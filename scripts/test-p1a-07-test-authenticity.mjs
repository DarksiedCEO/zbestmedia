import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORIZED_BASE, AUTHORIZED_REPOSITORY, HISTORICAL_REGRESSION_CLASSES, LEDGER_SHA256, OWNED_REQUIREMENTS, SECURITY_PROPERTIES, validateTestAuthenticityReport } from "./p1a-07-test-authenticity.mjs";

const NOW = Date.parse("2026-08-20T20:00:00Z");
const exactSubject = () => ({ repository: AUTHORIZED_REPOSITORY, baseSha: AUTHORIZED_BASE, headSha: AUTHORIZED_BASE, treeSha: "c8fe6f31288bffcf1b8c35a825c60c6a5d31703d", parents: ["03eeb8b7687643d483478771070dc543eafd0e8c"] });
const valid = () => ({
  schemaVersion: "1.0.0", ledger: { sha256: LEDGER_SHA256, denominator: 124, ownedRequirements: [...OWNED_REQUIREMENTS] }, subject: exactSubject(),
  continuity: { phase: "ACTIVE_IMPLEMENTATION", result: "CONTINUITY_READY", drift: "ON_TASK", hallucination: "ACCEPT", verificationGateSatisfied: true },
  certification: { builderIdentity: "CODEX_P1A_07_BUILDER", reviewerIdentity: "CLAUDE_INDEPENDENT_REVIEWER", trustedReviewerRegistry: ["CLAUDE_INDEPENDENT_REVIEWER"], builderMayCertifyOwnOutput: false, builderTestsAreCertification: false, certified: false },
  historicalRegressionClasses: [...HISTORICAL_REGRESSION_CLASSES],
  attacks: HISTORICAL_REGRESSION_CLASSES.map((classId) => ({ classId, executable: true, command: `node --test --test-name-pattern=${classId}`, negativeControlObserved: "RED", controlOutcome: "REJECTED", evidenceId: `RED_${classId}` })),
  historicalRedEvidence: HISTORICAL_REGRESSION_CLASSES.map((classId) => ({ classId, observed: "RED", evidenceId: `RED_${classId}` })),
  suites: [{ id: "BUILDER_HOSTILE", executionKind: "LIVE", liveExecution: true, result: "PASS", passed: true, discovered: 49, executed: 49, skipped: 0, coverage: "COMPLETE", exhaustive: true }, { id: "FROZEN_CANDIDATE_INTEGRATION_21", executionKind: "LIVE", liveExecution: true, result: "NOT_RUN", passed: false, discovered: 21, executed: 0, skipped: 21, coverage: "UNKNOWN", exhaustive: false }],
  reviewEvidence: { subject: exactSubject(), executionKind: "INDEPENDENT_REVIEW", reviewerIdentity: "CLAUDE_INDEPENDENT_REVIEWER", issuedAt: "2026-08-20T19:59:00Z", maxAgeSeconds: 3600 },
  propertyRegister: [...SECURITY_PROPERTIES],
  mutation: { denominatorSource: "SECURITY_PROPERTY_REGISTER", denominator: SECURITY_PROPERTIES.length, killed: SECURITY_PROPERTIES.length, equivalent: 0, survivors: [], results: SECURITY_PROPERTIES.map((p) => ({ propertyId: p.id, mutantId: p.mutantId, result: "KILLED", executed: true, countedAsKilled: true, negativeControlObserved: "RED", reproducer: `node --test --test-name-pattern=${p.id}` })) },
  frozenDenominators: { threats: 31, actors: 22, actions: 28, actorActionCells: 616, tenantOperations: 18 },
});
const reject = (mutate, pattern) => { const report = valid(); mutate(report); assert.throws(() => validateTestAuthenticityReport(report, { now: NOW }), pattern); };

test("static authority and property-derived denominator", () => { assert.equal(HISTORICAL_REGRESSION_CLASSES.length, 27); assert.equal(new Set(HISTORICAL_REGRESSION_CLASSES).size, 27); assert.equal(SECURITY_PROPERTIES.length, 22); });
test("valid builder evidence is explicitly uncertified", () => assert.deepEqual(validateTestAuthenticityReport(valid(), { now: NOW }), { outcome: "VALID_BUILDER_EVIDENCE", certified: false, historicalAttackDenominator: 27, mutationDenominator: 22 }));
test("every historical class is a standing obligation", () => { for (let i = 0; i < 27; i += 1) reject((r) => r.attacks.splice(i, 1), /27|identities/); });
for (const [index, classId] of HISTORICAL_REGRESSION_CLASSES.entries()) {
  test(classId, () => reject((r) => { r.attacks[index].negativeControlObserved = "GREEN"; }, /did not go RED/));
}

test("required hostile and failure-injection controls reject false green", async (t) => {
  const cases = [
    ["empty suite marked green", (r) => { r.suites[0].discovered = r.suites[0].executed = 0; }],
    ["all tests skipped", (r) => { r.suites[0].executed = 0; r.suites[0].skipped = r.suites[0].discovered; }],
    ["fixture result presented as live execution", (r) => { r.suites[0].executionKind = "FIXTURE"; }],
    ["mutation harness crash", (r) => { r.mutation.results[0].result = "HARNESS_ERROR"; }],
    ["mutant not executed", (r) => { r.mutation.results[0].executed = false; r.mutation.results[0].result = "NOT_EXECUTED"; }],
    ["caller reduces denominator", (r) => { r.mutation.denominator -= 1; }],
    ["equivalent mutant mislabeled killed", (r) => { r.mutation.results[0].result = "EQUIVALENT"; }],
    ["survivor omitted from summary", (r) => { r.mutation.results[0].result = "SURVIVED"; }],
    ["wrong subject", (r) => { r.reviewEvidence.subject.treeSha = "a".repeat(40); }],
    ["stale receipt", (r) => { r.reviewEvidence.issuedAt = "2020-01-01T00:00:00Z"; }],
    ["historical RED deleted", (r) => { r.historicalRedEvidence.pop(); }],
    ["builder self-certifies", (r) => { r.certification.reviewerIdentity = r.certification.builderIdentity; }],
    ["partial search labeled exhaustive", (r) => { r.suites[0].coverage = "PARTIAL"; }],
    ["NOT_RUN promoted to PASS", (r) => { r.suites[1].passed = true; }],
    ["fake independent reviewer", (r) => { r.certification.trustedReviewerRegistry = []; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => reject(mutate));
});
test("UNKNOWN and COVERAGE_UNKNOWN remain non-pass", () => { for (const result of ["UNKNOWN", "COVERAGE_UNKNOWN"]) reject((r) => { r.suites[1].result = result; r.suites[1].passed = true; }); });
test("every property mutant must actually execute", () => { for (let i = 0; i < SECURITY_PROPERTIES.length; i += 1) reject((r) => { r.mutation.results[i].executed = false; }); });
test("equivalent mutant requires adjudication and is not counted killed", () => {
  const r = valid(); Object.assign(r.mutation.results[0], { result: "EQUIVALENT", countedAsKilled: false, adjudication: { reason: "semantic identity proved", reviewer: "CLAUDE_INDEPENDENT_REVIEWER", reproducer: "node --test --test-name-pattern=P01" } }); r.mutation.killed -= 1; r.mutation.equivalent = 1;
  assert.equal(validateTestAuthenticityReport(r, { now: NOW }).outcome, "VALID_BUILDER_EVIDENCE");
});
test("frozen threat and tenant denominators reject reduction", () => { for (const key of Object.keys(valid().frozenDenominators)) reject((r) => { r.frozenDenominators[key] -= 1; }); });
