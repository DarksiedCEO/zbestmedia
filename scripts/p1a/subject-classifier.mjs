import { canonicalDigest, ContractError } from "./canonical-json.mjs";

export const SUBJECT_CLASSES = Object.freeze(["HISTORICAL_FIXTURE", "TRUSTED_BOOTSTRAP_AMENDMENT", "TRUSTED_WORKFLOW_AMENDMENT", "TRUSTED_FOUNDATION_MERGE", "GENERATION2_REMEDIATION_DESCENDANT", "DISPOSABLE_RECONCILIATION", "FINAL_RECONCILIATION_CANDIDATE", "ORDINARY_CANDIDATE"]);
const SHA = /^[0-9a-f]{40}$/;
const fail = (code, message, details) => { throw new ContractError(code, message, details); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exactScope = (actual, expected) => same([...actual].sort(), [...expected].sort());

function common(envelope, policy) {
  if (!envelope || envelope.repository !== policy.repository || !SHA.test(envelope.subjectSha ?? "") || !SHA.test(envelope.subjectTree ?? "") || !Array.isArray(envelope.orderedParents) || envelope.orderedParents.some((x) => !SHA.test(x))) fail("SUBJECT_ENVELOPE_INVALID", "subject envelope identity invalid");
  const expectedAuthority = policy.selectingAuthorities[envelope.selectingAuthority?.kind];
  if (!expectedAuthority || envelope.selectingAuthority?.source !== expectedAuthority.source || envelope.selectingAuthority?.digest !== expectedAuthority.digest) fail("CANDIDATE_AUTHORITY_SELECTED", "selecting authority is absent or not externally authenticated");
  const observationKey = `${envelope.subjectSha}:${envelope.subjectTree}:${envelope.orderedParents.join(",")}`;
  if (!envelope.gitObservation || envelope.gitObservation.subjectSha !== envelope.subjectSha || envelope.gitObservation.subjectTree !== envelope.subjectTree || !same(envelope.gitObservation.orderedParents, envelope.orderedParents) || envelope.gitObservation.digest !== policy.gitObservationDigests?.[observationKey]) fail("SUBJECT_GIT_OBSERVATION_INVALID", "subject Git objects are not externally corroborated");
  if (!exactScope(envelope.observedScope ?? [], envelope.authorizedFileScope ?? [])) fail("SUBJECT_SCOPE_MISMATCH", "observed and authorized scopes differ");
  if (envelope.contractDigest !== policy.contractDigest) fail("CONTRACT_DIGEST_MISMATCH", "subject contract differs from authority");
}

export function classifySubject(envelope, policy, expectedEnvelopeDigest) {
  common(envelope, policy); const authority = envelope.selectingAuthority.kind; const matches = [];
  if (!/^[0-9a-f]{64}$/.test(expectedEnvelopeDigest ?? "") || canonicalDigest(envelope) !== expectedEnvelopeDigest) fail("SUBJECT_ENVELOPE_DIGEST_MISMATCH", "subject envelope is not externally digest-bound");
  const match = (name, condition) => { if (condition) matches.push(name); };
  const historical = policy.historicalFixtures?.[envelope.subjectSha];
  match("HISTORICAL_FIXTURE", authority === "historical_registry" && historical && envelope.subjectTree === historical.tree && same(envelope.orderedParents, historical.parents) && envelope.requestsCurrentCertification !== true);
  match("TRUSTED_BOOTSTRAP_AMENDMENT", authority === "founder_bootstrap" && envelope.eventKind !== "merge" && envelope.orderedParents.length === 1 && envelope.orderedParents[0] === envelope.authorizedBaseSha && envelope.bootstrapBytesUnchanged === true && envelope.externalAuthorizationValid === true);
  match("TRUSTED_WORKFLOW_AMENDMENT", authority === "founder_workflow" && ["push", "pull_request"].includes(envelope.eventKind) && envelope.orderedParents.length === 1 && envelope.orderedParents[0] === envelope.authorizedBaseSha && envelope.externalAuthorizationValid === true && envelope.foundationBoundaryOnly === true);
  match("TRUSTED_FOUNDATION_MERGE", authority === "founder_merge" && envelope.eventKind === "target_push" && envelope.orderedParents.length === 2 && same(envelope.orderedParents, [envelope.authorizedBaseSha, envelope.reviewedHeadSha]) && envelope.subjectTree === envelope.approvedMergeTree && envelope.foundationBlobsMatch === true);
  match("GENERATION2_REMEDIATION_DESCENDANT", authority === "event_remediation" && envelope.orderedParents.length === 1 && envelope.directBoundedPath === true && envelope.noPostAnchorMerge === true && envelope.governedBlobsAuthorized === true);
  match("DISPOSABLE_RECONCILIATION", authority === "founder_reconciliation" && envelope.orderedParents.length === 2 && same(envelope.orderedParents, [policy.originalCandidateSha, envelope.currentTrustedMergeSha]) && envelope.dualAncestryVerified === true && envelope.allPathsClassified === true && envelope.freezeFinal !== true);
  match("FINAL_RECONCILIATION_CANDIDATE", authority === "founder_final_freeze" && envelope.orderedParents.length === 2 && same(envelope.orderedParents, [policy.originalCandidateSha, envelope.currentTrustedMergeSha]) && envelope.dualAncestryVerified === true && envelope.allPathsClassified === true && envelope.originalEvidenceBlobsMatch === true && envelope.trustedFoundationBlobsMatch === true && envelope.freezeFinal === true);
  match("ORDINARY_CANDIDATE", authority === "github_event" && ["push", "pull_request"].includes(envelope.eventKind) && envelope.eventHeadSha === envelope.subjectSha && envelope.unprivileged === true && envelope.certificationClaim === false);
  if (matches.length === 0) fail("SUBJECT_CLASS_ZERO_MATCH", "no canonical subject class matched");
  if (matches.length > 1) fail("SUBJECT_CLASS_MULTI_MATCH", "multiple canonical subject classes matched", { matches });
  return Object.freeze({ decision: "ACCEPT", classification: matches[0], matchedRuleId: `p1a-subject-v1/${matches[0]}`, verifiedTopology: true, verifiedScope: true, authorityEnvelopeDigest: canonicalDigest(envelope), reasons: [] });
}
