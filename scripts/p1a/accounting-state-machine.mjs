import { canonicalDigest, ContractError } from "./canonical-json.mjs";
import { REQUIRED_CONSUMER_CATALOG } from "./required-consumer-catalog.mjs";

export const ACCOUNTING_STATES = Object.freeze(["NOT_RUN", "RUNNING", "PASS", "FAIL", "SKIPPED", "CANCELLED", "TIMED_OUT", "NEUTRAL", "STALE", "NOT_VERIFIED", "EVIDENCE_MISSING", "ARTIFACT_UPLOAD_FAILED", "CLEANUP_FAILED", "INDETERMINATE"]);
const transitions = Object.freeze({
  NOT_RUN: ["RUNNING", "SKIPPED", "CANCELLED", "NEUTRAL", "STALE"], RUNNING: ["PASS", "FAIL", "CANCELLED", "TIMED_OUT", "NOT_VERIFIED", "EVIDENCE_MISSING", "ARTIFACT_UPLOAD_FAILED", "CLEANUP_FAILED", "INDETERMINATE"], PASS: ["STALE"], NEUTRAL: ["STALE"]
});
const fail = (code, message) => { throw new ContractError(code, message); };
const keyOf = (identity, checkId) => [identity.runId, identity.attempt, identity.candidateSha, identity.workflowSha, identity.contractDigest, checkId].join(":");
export function createAccounting(identity, requiredChecks) {
  if (!identity || !requiredChecks?.length || new Set(requiredChecks).size !== requiredChecks.length) fail("ACCOUNTING_IDENTITY_INVALID", "identity and unique required checks are required");
  return { identity: structuredClone(identity), requiredChecks: [...requiredChecks], records: Object.fromEntries(requiredChecks.map((id) => [id, { key: keyOf(identity, id), state: "NOT_RUN", events: [], contradictions: [] }])) };
}
export function createRequiredConsumerAccounting(identity, consumerIds) {
  const expected = REQUIRED_CONSUMER_CATALOG.consumerIds;
  if (!Array.isArray(consumerIds) || consumerIds.length !== expected.length || new Set(consumerIds).size !== consumerIds.length || JSON.stringify([...consumerIds].sort()) !== JSON.stringify(expected)) fail("ACCOUNTING_CONSUMER_SET_INVALID", "accounting records must equal the exact externally frozen consumer set");
  return createAccounting(identity, [...expected]);
}
export function applyAccountingEvent(accounting, event) {
  const record = accounting.records[event.checkId]; if (!record) fail("ACCOUNTING_UNKNOWN_CHECK", `unknown check ${event.checkId}`);
  if (!ACCOUNTING_STATES.includes(event.state)) fail("ACCOUNTING_STATE_UNKNOWN", `unknown state ${event.state}`);
  const eventDigest = canonicalDigest(event); const prior = record.events.at(-1);
  if (prior?.digest === eventDigest) return accounting;
  const conflicting = record.events.find((item) => item.eventId === event.eventId && item.digest !== eventDigest);
  if (conflicting) { record.contradictions.push(Object.freeze({ priorDigest: conflicting.digest, conflictingDigest: eventDigest, event: structuredClone(event) })); record.state = "INDETERMINATE"; return accounting; }
  if (!(transitions[record.state] ?? []).includes(event.state)) fail("ACCOUNTING_TRANSITION_INVALID", `${record.state} -> ${event.state} is forbidden`);
  record.events.push(Object.freeze({ ...structuredClone(event), digest: eventDigest })); record.state = event.state; return accounting;
}
export function aggregateAccounting(accounting, { cleanupCheckId, evidenceCheckId, uploadCheckId, revocationCheckId } = {}) {
  const states = Object.fromEntries(ACCOUNTING_STATES.map((state) => [state, 0]));
  for (const [id, record] of Object.entries(accounting.records)) { const derived = record.contradictions.length > 0 ? "INDETERMINATE" : record.events.length === 0 ? "NOT_RUN" : record.events.at(-1).state; if (record.state !== derived || record.key !== keyOf(accounting.identity, id)) fail("ACCOUNTING_TAMPERED", `record ${id} differs from append-only events`); states[derived] += 1; }
  const requiredPass = accounting.requiredChecks.every((id) => accounting.records[id].state === "PASS");
  const mandatory = [cleanupCheckId, evidenceCheckId, uploadCheckId, revocationCheckId].filter(Boolean);
  const closurePass = mandatory.every((id) => accounting.records[id]?.state === "PASS");
  const contradictionCount = Object.values(accounting.records).reduce((sum, record) => sum + record.contradictions.length, 0);
  return Object.freeze({ decision: requiredPass && closurePass && contradictionCount === 0 ? "GREEN" : "NON_GREEN", states, required: accounting.requiredChecks.length, passed: states.PASS, contradictionCount, recordsDigest: canonicalDigest(accounting.records), contradictionsPreserved: true });
}
