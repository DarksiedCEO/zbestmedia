import { canonicalDigest, ContractError } from "./canonical-json.mjs";

const SHA = /^[0-9a-f]{40}$/; const DIGEST = /^[0-9a-f]{64}$/;
const EVIDENCE_STATES = new Set(["NOT_RUN", "RUNNING", "PASS", "FAIL", "SKIPPED", "CANCELLED", "TIMED_OUT", "NOT_VERIFIED", "EVIDENCE_MISSING", "ARTIFACT_UPLOAD_FAILED", "CLEANUP_FAILED", "INDETERMINATE"]);
const PRODUCERS = new Set(["trusted_evidence", "protected_workflow"]);
const fail = (code, message) => { throw new ContractError(code, message); };
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
function validateEnvelope(envelope) {
  if (!PRODUCERS.has(envelope.producer) || !timestamp(envelope.createdAt)) fail("EVIDENCE_PRODUCER_INVALID", "producer or timestamp invalid");
  for (const field of ["accountingState", "tokenMintState", "tokenRevocationState", "cleanupState"]) if (!EVIDENCE_STATES.has(envelope[field])) fail("EVIDENCE_STATE_INVALID", `${field} invalid`);
  if (!Array.isArray(envelope.runner?.events) || !["AVAILABLE", "UNAVAILABLE"].includes(envelope.runner?.state)) fail("EVIDENCE_RUNNER_INVALID", "runner invalid");
  let prior = "0".repeat(64); for (const event of envelope.runner.events) { const copy = { ...event }; delete copy.digest; if (copy.priorDigest !== prior || canonicalDigest(copy) !== event.digest) fail("EVIDENCE_CHAIN_INVALID", "event chain invalid"); prior = event.digest; }
  if (envelope.runner.state === "UNAVAILABLE" && envelope.accountingState !== "INDETERMINATE") fail("EVIDENCE_CONTRADICTION", "runner loss must be indeterminate");
  if (envelope.contradictions.length > 0 && envelope.accountingState !== "INDETERMINATE") fail("EVIDENCE_CONTRADICTION", "contradictions must be indeterminate");
}
export function createAdverseEnvelope(input, { now, producer }) {
  if (typeof now !== "function" || !PRODUCERS.has(producer)) fail("EVIDENCE_PRODUCER_INVALID", "injectable time and trusted producer are required");
  for (const field of ["candidateSha", "candidateTree", "workflowSha", "workflowBlob"]) if (!SHA.test(input[field] ?? "")) fail("EVIDENCE_IDENTITY_INVALID", `${field} invalid`);
  if (!DIGEST.test(input.manifestDigest ?? "")) fail("EVIDENCE_IDENTITY_INVALID", "manifest digest invalid");
  const result = { schemaVersion: "p1a-adverse-evidence/v1", candidateSha: input.candidateSha, candidateTree: input.candidateTree, orderedParents: [...input.orderedParents], workflowSha: input.workflowSha, workflowBlob: input.workflowBlob, manifestDigest: input.manifestDigest, platform: structuredClone(input.platform), runner: { state: "AVAILABLE", events: [] }, git: structuredClone(input.git), failedStage: null, accountingState: "NOT_RUN", tokenMintState: "NOT_RUN", tokenRevocationState: "NOT_RUN", cleanupState: "NOT_RUN", producer, createdAt: now(), contradictions: [], unavailableEvidence: [] }; validateEnvelope(result); return result;
}
export function appendEvidenceEvent(envelope, event) {
  const prior = envelope.runner.events.at(-1)?.digest ?? "0".repeat(64); const record = { ...structuredClone(event), priorDigest: prior }; record.digest = canonicalDigest(record); envelope.runner.events.push(Object.freeze(record)); return envelope;
}
export function reconcileEvidence(envelope, { runnerAvailable, platform, git, contradictions = [], unavailable = [] }) {
  envelope.platform = { ...envelope.platform, ...structuredClone(platform) }; envelope.git = { ...envelope.git, ...structuredClone(git) };
  envelope.contradictions.push(...contradictions); envelope.unavailableEvidence.push(...unavailable);
  if (!runnerAvailable) { envelope.runner.state = "UNAVAILABLE"; envelope.accountingState = "INDETERMINATE"; }
  if (contradictions.length > 0) envelope.accountingState = "INDETERMINATE";
  return envelope;
}
export function sealEvidence(envelope, { externalAuthority, expectedAuthorityDigest } = {}) {
  validateEnvelope(envelope); const externallyBound = externalAuthority?.producer === "frozen_bootstrap_verifier" && canonicalDigest(externalAuthority) === expectedAuthorityDigest && externalAuthority.platformDigest === canonicalDigest(envelope.platform) && externalAuthority.gitDigest === canonicalDigest(envelope.git);
  const copy = structuredClone(envelope); if (!externallyBound) { copy.accountingState = "INDETERMINATE"; copy.unavailableEvidence.push("external_authority_binding"); }
  const assuranceDomains = Object.freeze({ claimed: ["git", "platform"], observed: envelope.runner.events.length > 0 ? ["runner_events"] : [], corroborated: externallyBound ? ["git", "platform"] : [], independentlyVerified: externallyBound ? ["git", "platform"] : [] });
  const digest = canonicalDigest({ envelope: copy, assuranceDomains }); return Object.freeze({ envelope: Object.freeze(copy), assuranceDomains, digest, decision: externallyBound ? "SEALED_CORROBORATED" : "INDETERMINATE", identifier: `urn:zbestmedia:p1a:adverse-evidence:1:sha256:${digest}` });
}
