import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = process.env.P1A_PACKAGE_ROOT
  ? path.resolve(process.env.P1A_PACKAGE_ROOT)
  : moduleRoot;
const load = (file) =>
  JSON.parse(readFileSync(path.join(candidateRoot, file), "utf8"));
const unique = (items, label) =>
  assert.equal(new Set(items).size, items.length, `${label}: duplicate`);
const exists = (items, id, label) =>
  assert.ok(items.some((item) => item.id === id), `${label}: ${id}`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const AUTHORIZED_BASE =
  "7056ea4ce24379c93549f0ac9b45ddd7a2600dd6";
export const TRUSTED_RECONCILIATION_BASE =
  "5056fb0df6e1ef739231cd2273a453fb1c644273";
export const COMPOSED_CI_BASE =
  "06e6497ac3420998671f255a42a20d8cb8b9ca50";
export const COMPOSED_CI_BASE_BLOB =
  "9a3f1a04f99e83d9dad84cf384d86117a7d282f1";
export const ORIGINAL_CANDIDATE =
  "365c59757756f3f91480d3bfeb841b543010201f";
export const PRE_BASE_PARENT =
  "816c3a7c199e3c6bc4e482435eed60c1fcf0a11c";
export const AUTHORIZED_ANCESTRY_CHAIN = Object.freeze([
  AUTHORIZED_BASE,
  "c9c6198e9dc3018bfdbcf98dd3e63335dd2c0e6e",
  "bf3b0478afcab9cb5b58e8af904b98ea53ae3f3e",
  "fec9d68fc142a122c3568a7e8b73e5503081cc28",
  "73227f2bde0f3b70e8a126eaaa16cb1ee0946b71",
  "06545d264030199f87df1558b414aa7f051871cd",
  "f3f2966ec511b64b2d46f38c0363be269bb4246a",
  "36d5b1f2fadddbb60a80f7cac601455c51286240",
  "aa7014e691a6222a0b93e61d6aa2ffa12aa4ced1",
  "e10b602c31b8a3838fdfd76a86b022b7abceb12c",
  ORIGINAL_CANDIDATE,
]);
export const TRUSTED_RECONCILIATION_DAG = Object.freeze([
  { sha: AUTHORIZED_BASE, tree: "a929da05a15a0c37644a224697dddec9762b00a0", parents: [] },
  { sha: "8bd4e384609d526d45bb503bf8bfa78b584a4bd9", tree: "99e4c51b072ee4629a37514b6c99e6b24cd958a1", parents: [AUTHORIZED_BASE] },
  { sha: "a87ad2e383d59fa0c0f0bf60d1ae794ea695693d", tree: "67370b02c35a007942dbc133e939f674c79c4925", parents: ["8bd4e384609d526d45bb503bf8bfa78b584a4bd9"] },
  { sha: "82fd3dee5ad2ac35f5d75336f1280a07b0e3b034", tree: "e427086b13f984abb0e7f8dcdff7995bbe966a9b", parents: ["a87ad2e383d59fa0c0f0bf60d1ae794ea695693d"] },
  { sha: "16d990e82f944dd111743f3f09168402da69ff04", tree: "eeb8e94168dfb9372c4d8e33d7f217f9d3b1e8e5", parents: ["82fd3dee5ad2ac35f5d75336f1280a07b0e3b034"] },
  { sha: "30c157e589f97b5009853ce8612f8af09db203cc", tree: "23de0a9929e69e6d298f34bfbcbdd218eed9dc22", parents: ["16d990e82f944dd111743f3f09168402da69ff04"] },
  { sha: "1ab3a7796cc587e4634c8cc36d2e5defa6c871e0", tree: "23de0a9929e69e6d298f34bfbcbdd218eed9dc22", parents: [AUTHORIZED_BASE, "30c157e589f97b5009853ce8612f8af09db203cc"] },
  { sha: "6001e13f9359bc6c454d42154d9816409457388c", tree: "140dc6c715fd7d6182531560a06b645637db7c3e", parents: ["1ab3a7796cc587e4634c8cc36d2e5defa6c871e0"] },
  { sha: "a227202ddf63fdae6dc4c2ff6e51cec24e2bc429", tree: "37345329da7051a818eb2e5b02f1f06f74d667a7", parents: ["6001e13f9359bc6c454d42154d9816409457388c"] },
  { sha: TRUSTED_RECONCILIATION_BASE, tree: "37345329da7051a818eb2e5b02f1f06f74d667a7", parents: ["1ab3a7796cc587e4634c8cc36d2e5defa6c871e0", "a227202ddf63fdae6dc4c2ff6e51cec24e2bc429"] },
]);
export const AUTHORIZED_RUNTIME =
  "94376718e07df2e9d44864ed0394d58219224e61";
export const AUTHORIZED_REPOSITORIES = {
  base: "DarksiedCEO/zbestmedia",
  runtime: "DarksiedCEO/zbestmedia-ui",
};
export const AUTHORIZED_CANDIDATE_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/evidence-register.json",
  "docs/security/p1-a/known-limitations.md",
  "docs/security/p1-a/model.json",
  "docs/security/p1-a/threat-model.md",
  "docs/security/p1-a/validation-manifest.json",
  "package.json",
  "scripts/test-p1a-threat-model.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const REQUIRED_CANDIDATE_FILES = [...AUTHORIZED_CANDIDATE_FILES];
export const TRUSTED_INFRASTRUCTURE_FILES = [
  ".github/CODEOWNERS",
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/detect-p1a-ordinary-ci-secrets.mjs",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-ci-secret-detector.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const CANDIDATE_OWNED_FILES = [
  ".github/workflows/ci.yml",
  "docs/security/p1-a/evidence-register.json",
  "docs/security/p1-a/known-limitations.md",
  "docs/security/p1-a/model.json",
  "docs/security/p1-a/threat-model.md",
  "docs/security/p1-a/validation-manifest.json",
  "package.json",
  "scripts/test-p1a-threat-model.mjs",
];
export const EXACT_CANDIDATE_OWNED_FILES = CANDIDATE_OWNED_FILES.filter(
  (file) => file !== ".github/workflows/ci.yml",
);
export const AMENDMENT_CONTROLLED_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/p1a-certify.yml",
  "docs/security/p1-a/trusted-certification-bootstrap.md",
  "scripts/test-p1a-certification-accounting.mjs",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-certification-accounting.mjs",
  "scripts/validate-p1a-threat-model.mjs",
];
export const REQUIRED_CHECKS = [
  "manifest_identity",
  "trust_anchor",
  "file_scope",
  "evidence_integrity",
  "evidence_binding",
  "required_coverage",
  "id_uniqueness",
  "cross_references",
  "authority_completeness",
  "separation_rules",
  "tenant_operations",
  "credential_custody",
  "escalation_completeness",
  "documentation_consistency",
  "negative_controls",
];
export const REQUIRED_ACTORS = [
  "founder", "authorized human operator", "authenticated client user",
  "tenant administrator", "workspace member", "builder", "reviewer",
  "Security Reviewer", "Reliability Reviewer", "Test Verification Reviewer",
  "Release Guardian", "AEGIS", "Embedded Red Team", "Embedded Sentinel",
  "external Master Sentinel", "application service", "background worker",
  "database service role", "credential custodian", "emergency responder",
  "agent", "tool executor",
];
export const REQUIRED_THREATS = [
  "SSRF", "DNS rebinding", "metadata-service access", "tenant spoofing",
  "workspace spoofing", "cross-tenant access", "horizontal privilege escalation",
  "vertical privilege escalation", "confused deputy", "service-account misuse",
  "background-job context forgery", "artifact enumeration", "artifact substitution",
  "evidence forgery", "stale evidence reuse", "approval forgery", "approval replay",
  "reviewer impersonation", "self-certification", "CI bypass", "credential leakage",
  "credential misuse", "SHA substitution", "malicious pull request",
  "tool privilege escalation", "prompt injection or poisoned tool result",
  "duplicate execution", "race condition",
  "rollback failure audit-log tampering or Sentinel suppression",
  "emergency-access abuse", "retry amplification exhaustion or permanent-failure loop",
];

export class NotVerifiedError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotVerifiedError";
    this.notVerified = true;
  }
}

export function assertAuthenticationStatus(declared, observed) {
  assert.ok(
    ["VERIFIED", "NOT_PROVEN"].includes(declared),
    `unsupported declared authentication status ${JSON.stringify(declared)}`,
  );
  assert.ok(
    ["VERIFIED", "NOT_VERIFIED"].includes(observed),
    `unsupported observed authentication status ${JSON.stringify(observed)}`,
  );
  const expected = observed === "VERIFIED" ? "VERIFIED" : "NOT_PROVEN";
  assert.equal(
    declared,
    expected,
    `stale authentication status: declared ${declared}, observed ${observed}`,
  );
  return observed;
}

export function repoForSha(sha, manifest) {
  if (sha === manifest.authorizedBaseSha) return AUTHORIZED_REPOSITORIES.base;
  if (sha === manifest.runtimeEvidenceSha) return AUTHORIZED_REPOSITORIES.runtime;
  return null;
}

// Legacy data-validation contract, retained as a strict adapter into the
// canonical identities and separation rules owned by this trusted module.
export function validateData(model, evidence, manifest, markdown) {
  assert.ok(model && evidence && manifest && typeof markdown === "string");
  assert.equal(model.sources?.specification?.revision, manifest.authorizedBaseSha, "wrong base SHA");
  assert.equal(model.sources?.runtime?.revision, manifest.runtimeEvidenceSha, "wrong runtime evidence pin");
  assert.deepEqual(manifest.requiredTests, REQUIRED_CHECKS, "required tests changed or skipped");
  assert.deepEqual(model.gate, {
    runtimeChanged: false, productionClaimed: false,
    p1bAuthorized: false, selfCertified: false,
  });
  const collections = {
    actors: model.actors, attackers: model.attackerProfiles, actions: model.actions,
    assets: model.assets, boundaries: model.boundaries, flows: model.flows,
    paths: model.sourceToSinkPaths, propagation: model.tenantPropagation,
    controls: model.controls, threats: model.threats,
    tenantOperations: model.tenantOperations, credentialClasses: model.credentialClasses,
    escalations: model.escalationChains, founderDecisions: model.founderDecisions,
    assumptions: model.assumptions, evidence: evidence.references,
  };
  for (const [label, rows] of Object.entries(collections)) {
    assert.ok(Array.isArray(rows), `${label}: missing collection`);
    unique(rows.map((row) => row.id), label);
  }
  assert.deepEqual(model.actors.map((row) => row.name), REQUIRED_ACTORS, "missing actor coverage");
  assert.deepEqual(model.threats.map((row) => row.name), REQUIRED_THREATS, "missing required threat or duplicate semantics");
  assert.equal(model.actions.length, 28);
  assert.equal(model.actors.length * model.actions.length, 616);
  assert.equal(model.tenantOperations.length, 18);
  assert.equal(model.credentialClasses.length, 10);

  for (const reference of evidence.references) {
    assert.match(reference.sha ?? "", /^[0-9a-f]{40}$/);
    assert.ok(["DIRECT", "INFERRED", "UNRESOLVED"].includes(reference.basis));
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(reference.confidence));
    assert.ok(reference.path && reference.claim && reference.category);
    parseLineRange(reference.lines, reference.id);
    assertSafeRepoPath(reference.path, reference.id);
    assert.match(reference.blobSha ?? "", /^[0-9a-f]{40}$/);
    const repository = repoForSha(reference.sha, manifest);
    assert.ok(repository, `${reference.id}: stale evidence SHA`);
    assert.equal(reference.repository, repository, `${reference.id}: repository/SHA mismatch`);
  }
  const ids = (rows) => new Set(rows.map((row) => row.id));
  const evidenceIds = ids(evidence.references);
  const actorIds = ids(model.actors);
  const boundaryIds = ids(model.boundaries);
  const flowIds = ids(model.flows);
  const assetIds = ids(model.assets);
  const attackerIds = ids(model.attackerProfiles);
  const controlIds = ids(model.controls);
  const threatIds = ids(model.threats);
  for (const pathItem of model.sourceToSinkPaths) {
    assert.ok(pathItem.source && pathItem.hops.length && pathItem.sink && pathItem.consequence, `${pathItem.id}: incomplete source-to-sink path`);
    assert.ok(boundaryIds.has(pathItem.entryBoundaryId) && flowIds.has(pathItem.flowId));
    for (const id of pathItem.threatIds) assert.ok(threatIds.has(id));
    for (const id of pathItem.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  assert.equal(model.tenantPropagation.length, 7);
  for (const propagation of model.tenantPropagation) {
    assert.ok(propagation.stage && propagation.trustedSource && propagation.tenantDerivation && propagation.workspaceDerivation && propagation.status && propagation.next, `${propagation.id}: incomplete tenant propagation`);
    for (const id of propagation.threatIds) assert.ok(threatIds.has(id));
    for (const id of propagation.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  for (const row of [...model.boundaries, ...model.flows]) {
    for (const id of row.evidenceRefs) assert.ok(evidenceIds.has(id), `${row.id}: invalid evidence ref ${id}`);
  }
  for (const threat of model.threats) {
    assert.ok(threat.assets.length && threat.attackers.length && threat.boundaries.length && threat.flows.length && threat.evidenceRefs.length && threat.controlIds.length && threat.escalationId === `ESC-${threat.id}`, `${threat.id}: orphan threat`);
    for (const id of threat.assets) assert.ok(assetIds.has(id));
    for (const id of threat.attackers) assert.ok(attackerIds.has(id));
    for (const id of threat.boundaries) assert.ok(boundaryIds.has(id));
    for (const id of threat.flows) assert.ok(flowIds.has(id));
    for (const id of threat.evidenceRefs) assert.ok(evidenceIds.has(id));
    for (const id of threat.controlIds) assert.ok(controlIds.has(id));
  }
  for (const control of model.controls) {
    assert.ok(control.threatIds.length, `${control.id}: orphan control`);
    for (const id of control.threatIds) {
      assert.ok(threatIds.has(id));
      assert.ok(model.threats.find((threat) => threat.id === id).controlIds.includes(control.id), `${control.id}: reverse mapping missing`);
    }
  }
  assert.equal(model.authorityPolicy.actorOverrides.length, model.actors.length);
  for (const override of model.authorityPolicy.actorOverrides) {
    assert.ok(actorIds.has(override.actorId));
    const actions = [...override.allow, ...override.scoped, ...override.human];
    unique(actions, `${override.actorId} authority actions`);
    for (const id of actions) exists(model.actions, id, "action");
  }
  assert.equal(model.authorityPolicy.rules.length, 616);
  unique(model.authorityPolicy.rules.map((rule) => rule.id), "authority rules");
  unique(model.authorityPolicy.rules.map((rule) => `${rule.actorId}:${rule.actionId}`), "authority pairs");
  for (const actor of model.actors) for (const action of model.actions) {
    assert.ok(model.authorityPolicy.rules.some((rule) => rule.actorId === actor.id && rule.actionId === action.id), `missing authority pair ${actor.id}/${action.id}`);
  }
  const ownerKeys = ["actorId", "approvalOwnerActorId", "executionOwnerActorId", "reviewOwnerActorId", "certificationOwnerActorId", "credentialAuthorityActorId", "escalationOwnerActorId", "evidenceOwnerActorId"];
  for (const rule of model.authorityPolicy.rules) {
    for (const key of ownerKeys) assert.ok(actorIds.has(rule[key]), `${rule.id}: invalid authority owner`);
    exists(model.actions, rule.actionId, "action");
    assert.ok(model.authorityPolicy.decisions.includes(rule.decision));
  }
  const decision = (actor, action) => model.authorityPolicy.rules.find((rule) => rule.actorId === actor && rule.actionId === action)?.decision;
  const denied = (actor, action) => assert.equal(decision(actor, action), "DENY", `${actor} must deny ${action}`);
  for (const action of ["AXN-008", "AXN-010", "AXN-011"]) denied("ACT-006", action);
  for (const actor of ["ACT-007", "ACT-008", "ACT-009", "ACT-010", "ACT-011", "ACT-012"]) for (const action of ["AXN-002", "AXN-003"]) denied(actor, action);
  for (const action of ["AXN-002", "AXN-003"]) denied("ACT-013", action);
  for (const actor of ["ACT-014", "ACT-015"]) denied(actor, "AXN-011");
  for (const action of ["AXN-007", "AXN-008", "AXN-010", "AXN-011"]) denied("ACT-021", action);
  for (const actor of model.actors) denied(actor.id, "AXN-006");
  denied("ACT-018", "AXN-028"); denied("ACT-019", "AXN-025");
  for (const rule of model.authorityPolicy.rules.filter((item) => ["AXN-002", "AXN-003"].includes(item.actionId) && item.decision !== "DENY")) {
    assert.notEqual(rule.executionOwnerActorId, rule.approvalOwnerActorId);
    assert.notEqual(rule.executionOwnerActorId, rule.reviewOwnerActorId);
    assert.notEqual(rule.executionOwnerActorId, rule.certificationOwnerActorId);
  }
  assert.equal(model.tenantOperationPolicy.status, "FOUNDER_DECISION_REQUIRED");
  assert.equal(model.tenantOperationPolicy.denialBehavior, "DENY_AND_LOG");
  const credentialKeys = ["custodianActorId", "creatorActorIds", "authorizedReaderActorIds", "authorizedUserActorIds", "rotationAuthorityActorIds", "revocationAuthorityActorIds", "storageBoundary", "deliveryMechanism", "lifetime", "auditEvent", "emergencyProcedure", "evidenceRefs", "founderDecisionId"];
  for (const credential of model.credentialClasses) {
    for (const key of credentialKeys) assert.notEqual(credential[key], undefined, `${credential.id}: missing credential field ${key}`);
    assert.ok(actorIds.has(credential.custodianActorId));
    for (const id of [...credential.creatorActorIds, ...credential.authorizedReaderActorIds, ...credential.authorizedUserActorIds, ...credential.rotationAuthorityActorIds, ...credential.revocationAuthorityActorIds]) assert.ok(actorIds.has(id));
    for (const id of credential.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  for (const credential of model.credentialClasses.slice(2)) assert.equal(credential.status, "FOUNDER_DECISION_REQUIRED");
  assert.equal(model.credentialPolicy.readerActorIds.length, 0);
  const escalationOwners = ["detectionOwnerActorId", "triageOwnerActorId", "remediationOwnerActorId", "approvalOwnerActorId", "certificationOwnerActorId", "closureAuthorityActorId"];
  for (const key of escalationOwners) assert.ok(actorIds.has(model.escalationPolicy[key]), `missing escalation owner ${key}`);
  assert.equal(model.escalationChains.length, model.threats.length);
  for (const threat of model.threats) {
    const escalation = model.escalationChains.find((item) => item.id === threat.escalationId && item.threatId === threat.id);
    assert.ok(escalation, `${threat.id}: dangling escalation`);
    assert.ok(escalation.detectionSignal && escalation.recoveryOrRollback && escalation.founderEscalationCondition && escalation.closureEvidenceRequired.length, `${escalation.id}: incomplete escalation`);
    assert.ok(escalation.requiredDetectionTokens.length >= 2 && escalation.requiredDetectionTokens.every((token) => escalation.detectionSignal.includes(token)), `${escalation.id}: generic detection signal`);
  }
  unique(model.escalationChains.map((item) => item.detectionSignal), "escalation detection signals");
  assert.equal(model.retryPolicy.status, "PROPOSED_CONTROL_NOT_IMPLEMENTED");
  assert.deepEqual(model.retryPolicy.classes.map((item) => item.class), ["PERMANENT", "TRANSIENT", "THROTTLED", "UNKNOWN"]);
  assert.equal(model.retryPolicy.implementationClaim, false);
  const summaryMatch = markdown.match(/```json p1a-summary\n([^\n]+)\n```/);
  assert.ok(summaryMatch, "documentation summary absent");
  const summary = JSON.parse(summaryMatch[1]);
  assert.deepEqual(summary, {
    actors: model.actors.length, actions: model.actions.length,
    authorityRules: model.authorityPolicy.rules.length, assets: model.assets.length,
    trustBoundaries: model.boundaries.length, dataFlows: model.flows.length,
    sourceToSinkPaths: model.sourceToSinkPaths.length,
    tenantPropagationStages: model.tenantPropagation.length,
    threats: model.threats.length, controls: model.controls.length,
    tenantOperations: model.tenantOperations.length,
    credentialClasses: model.credentialClasses.length,
    escalationChains: model.escalationChains.length,
    founderDecisions: model.founderDecisions.length,
    sourceEvidenceReferences: evidence.references.length,
  });
  const markdownThreats = [...markdown.matchAll(/\| (THR-\d{3}) \|/g)].map((match) => match[1]);
  assert.deepEqual(markdownThreats, model.threats.map((threat) => threat.id));
  for (const boundary of model.boundaries) assert.ok(markdown.includes(boundary.id));
  for (const decisionItem of model.founderDecisions) assert.ok(markdown.includes(decisionItem.id));
  for (const ref of [...markdown.matchAll(/\[(EV-[A-Z0-9-]+)\]/g)].map((match) => match[1])) assert.ok(evidenceIds.has(ref));
  return { authorityRules: 616, decision };
}

// Compatibility boundary for the exact PR #8 test contract. The caller may
// supply only the two historical external anchors; every policy identity is
// resolved and enforced by this trusted module.
export function assertTrustAnchor(model, evidence, manifest, anchor) {
  if (!anchor || typeof anchor !== "object") {
    throw new NotVerifiedError("trust anchor absent (fail-closed)");
  }
  assert.deepEqual(
    Object.keys(anchor).sort(),
    ["baseSha", "runtimePin"],
    "trust anchor contains candidate-controlled policy declarations",
  );
  assert.match(anchor.baseSha ?? "", /^[0-9a-f]{40}$/, "anchor base malformed");
  assert.match(
    anchor.runtimePin ?? "",
    /^[0-9a-f]{40}$/,
    "anchor runtime malformed",
  );
  assert.equal(anchor.baseSha, AUTHORIZED_BASE, "unauthorized evidence/model base");
  assert.equal(anchor.runtimePin, AUTHORIZED_RUNTIME, "unauthorized runtime pin");
  assert.equal(manifest.authorizedBaseSha, AUTHORIZED_BASE, "manifest base mismatch");
  assert.equal(
    manifest.runtimeEvidenceSha,
    AUTHORIZED_RUNTIME,
    "manifest runtime mismatch",
  );
  assert.equal(
    model.sources?.specification?.revision,
    AUTHORIZED_BASE,
    "model base mismatch",
  );
  assert.equal(
    model.sources?.runtime?.revision,
    AUTHORIZED_RUNTIME,
    "model runtime mismatch",
  );
  assert.ok(Array.isArray(evidence?.references), "evidence references absent");
  for (const reference of evidence.references) {
    const expected =
      reference.repository === AUTHORIZED_REPOSITORIES.base
        ? AUTHORIZED_BASE
        : reference.repository === AUTHORIZED_REPOSITORIES.runtime
          ? AUTHORIZED_RUNTIME
          : null;
    assert.ok(expected, `${reference.id ?? "evidence"}: unauthorized repository`);
    assert.equal(reference.sha, expected, `${reference.id}: evidence anchor mismatch`);
  }
  return Object.freeze({
    baseSha: AUTHORIZED_BASE,
    runtimePin: AUTHORIZED_RUNTIME,
    reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
    originalCandidateSha: ORIGINAL_CANDIDATE,
  });
}

export function parseLineRange(spec, label) {
  const match = /^(\d+)-(\d+)$/.exec(spec);
  assert.ok(match, `${label}: malformed line range ${JSON.stringify(spec)}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  assert.ok(start >= 1, `${label}: line range start must be >= 1`);
  assert.ok(end >= start, `${label}: inverted line range ${start}-${end}`);
  return { start, end };
}

export function assertSafeRepoPath(value, label) {
  assert.ok(typeof value === "string" && value, `${label}: empty path`);
  assert.ok(!value.includes("\0"), `${label}: NUL byte in path`);
  assert.ok(
    /^[\x20-\x7e]+$/.test(value),
    `${label}: non-ASCII or control character in path`,
  );
  assert.ok(
    !/%[0-9a-fA-F]{2}/.test(value),
    `${label}: percent-encoded sequence in path`,
  );
  assert.ok(!value.includes("\\"), `${label}: backslash in path`);
  assert.ok(!value.startsWith("/"), `${label}: absolute path`);
  assert.ok(!/^[A-Za-z]:/.test(value), `${label}: drive-absolute path`);
  const segments = value.split("/");
  assert.ok(
    !segments.includes(".") && !segments.includes(".."),
    `${label}: traversal segment`,
  );
  assert.ok(!segments.some((segment) => !segment), `${label}: empty segment`);
  assert.equal(path.posix.normalize(value), value, `${label}: non-normal path`);
  return value;
}

function exactSha(value, label) {
  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label}: exact SHA required`);
  return value;
}

function gitAt(repoRoot, ...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeRepository(value) {
  return value
    ?.replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

// Canonical evidence-base -> original-candidate ancestry primitive. Authority
// comes from exact identities and the independently verified in-scope chain;
// shallow metadata only bounds native Git traversal after those checks pass.
export function verifyCanonicalBoundedAncestry({
  ancestryAuthorityRoot,
  evidenceBaseSha = AUTHORIZED_BASE,
  originalCandidateSha = ORIGINAL_CANDIDATE,
  authorizedBoundarySha = AUTHORIZED_BASE,
  chain = AUTHORIZED_ANCESTRY_CHAIN,
  dag,
  independentlyVerified = true,
  objectPresent,
  beforeNativeMergeBase,
} = {}) {
  assert.ok(independentlyVerified, "bounded ancestry: independent chain verification required");
  assert.equal(evidenceBaseSha, AUTHORIZED_BASE, "bounded ancestry: wrong evidence base");
  const expectedHead = dag ? TRUSTED_RECONCILIATION_BASE : ORIGINAL_CANDIDATE;
  const expectedEntries = dag ?? chain.map((sha, index) => ({
    sha,
    tree: null,
    parents: index === 0 ? [] : [chain[index - 1]],
  }));
  assert.equal(originalCandidateSha, expectedHead, "bounded ancestry: wrong descendant head");
  assert.equal(authorizedBoundarySha, AUTHORIZED_BASE, "bounded ancestry: wrong boundary");
  if (dag) assert.deepEqual(dag, TRUSTED_RECONCILIATION_DAG, "bounded ancestry: exact trusted DAG required");
  else assert.deepEqual(chain, AUTHORIZED_ANCESTRY_CHAIN, "bounded ancestry: exact chain required");
  assert.ok(ancestryAuthorityRoot, "bounded ancestry: authority root absent");
  assert.ok(!lstatSync(path.resolve(ancestryAuthorityRoot)).isSymbolicLink(),
    "bounded ancestry: symlink authority forbidden");
  const authorityRoot = realpathSync(path.resolve(ancestryAuthorityRoot));
  assert.notEqual(authorityRoot, realpathSync(candidateRoot),
    "bounded ancestry: primary candidate checkout forbidden");
  assert.equal(
    normalizeRepository(gitAt(authorityRoot, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia",
    "bounded ancestry: repository identity mismatch",
  );
  assert.equal(gitAt(authorityRoot, "status", "--porcelain=v1"), "",
    "bounded ancestry: authority checkout modified");
  const authorityConfig = readFileSync(path.join(authorityRoot, ".git/config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(authorityConfig),
    "bounded ancestry: persisted credentials detected");
  const actualChain = gitAt(authorityRoot, "rev-list", "--reverse", expectedHead)
    .split("\n").filter(Boolean);
  if (dag) assert.deepEqual(new Set(actualChain), new Set(expectedEntries.map(({ sha }) => sha)),
    "bounded ancestry: independently verified DAG inventory mismatch");
  else assert.deepEqual(actualChain, AUTHORIZED_ANCESTRY_CHAIN,
    "bounded ancestry: independently verified chain mismatch");
  for (const entry of expectedEntries) {
    const { sha } = entry;
    exactSha(sha, "bounded ancestry commit");
    assert.equal(gitAt(authorityRoot, "cat-file", "-t", sha), "commit",
      "bounded ancestry: commit absent");
    const tree = gitAt(authorityRoot, "cat-file", "-p", sha).split("\n")
      .find((line) => line.startsWith("tree "))?.slice(5);
    exactSha(tree, "bounded ancestry tree");
    assert.equal(gitAt(authorityRoot, "cat-file", "-t", tree), "tree",
      "bounded ancestry: tree absent");
    if (entry.tree) assert.equal(tree, entry.tree, "bounded ancestry: tree identity mismatch");
    const parents = gitAt(authorityRoot, "cat-file", "-p", sha).split("\n")
      .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
    if (sha === AUTHORIZED_BASE) {
      assert.ok(parents.includes(PRE_BASE_PARENT), "bounded ancestry: boundary parent identity changed");
    } else {
      assert.deepEqual(parents, entry.parents, "bounded ancestry: in-scope parent mismatch");
    }
  }

  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "p1a-canonical-bounded-"));
  const boundedRoot = path.join(temporaryRoot, "repository");
  try {
    execFileSync("git", ["init", "-q", boundedRoot], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    for (const { sha } of expectedEntries) {
      const rawCommit = execFileSync("git", ["cat-file", "commit", sha], {
        cwd: authorityRoot, stdio: ["ignore", "pipe", "pipe"],
      });
      const importedSha = execFileSync("git", ["hash-object", "-w", "-t", "commit", "--stdin"], {
        cwd: boundedRoot, input: rawCommit, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      assert.equal(importedSha, sha, "bounded ancestry: commit identity changed during import");
    }
    const present = objectPresent
      ? objectPresent(PRE_BASE_PARENT, boundedRoot)
      : (() => {
          try { gitAt(boundedRoot, "cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`); return true; }
          catch { return false; }
        })();
    assert.equal(present, false, "bounded ancestry: pre-base parent present");
    assert.equal(gitAt(boundedRoot, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
      "bounded ancestry: replace refs forbidden");
    assert.ok(!existsSync(path.join(boundedRoot, ".git/info/grafts")),
      "bounded ancestry: grafts forbidden");
    const shallowPath = path.join(boundedRoot, ".git/shallow");
    writeFileSync(shallowPath, `${AUTHORIZED_BASE}\n`, { flag: "wx" });
    assert.equal(readFileSync(shallowPath, "utf8"), `${AUTHORIZED_BASE}\n`,
      "bounded ancestry: exact sole boundary required");
    if (beforeNativeMergeBase) beforeNativeMergeBase({ boundedRoot, shallowPath });
    assert.equal(readFileSync(shallowPath, "utf8"), `${AUTHORIZED_BASE}\n`,
      "bounded ancestry: boundary changed before native validation");
    assert.equal(gitAt(boundedRoot, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
      "bounded ancestry: replace refs enabled before native validation");
    assert.ok(!existsSync(path.join(boundedRoot, ".git/info/grafts")),
      "bounded ancestry: graft installed before native validation");
    const preBasePresentBeforeNative = objectPresent
      ? objectPresent(PRE_BASE_PARENT, boundedRoot)
      : (() => {
          try { gitAt(boundedRoot, "cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`); return true; }
          catch { return false; }
        })();
    assert.equal(preBasePresentBeforeNative, false,
      "bounded ancestry: pre-base parent appeared before native validation");
    gitAt(boundedRoot, "merge-base", "--is-ancestor", AUTHORIZED_BASE, expectedHead);
    return Object.freeze({
      evidenceBaseSha: AUTHORIZED_BASE,
      descendantSha: expectedHead,
      boundarySha: AUTHORIZED_BASE,
      chainLength: expectedEntries.length,
      nativeMergeBase: true,
      preBaseParentAbsent: true,
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    assert.ok(!existsSync(temporaryRoot), "bounded ancestry: cleanup failed");
  }
}

export function verifyCanonicalTrustedReconciliationAncestry({
  trustedReconciliationAuthorityRoot,
  ...overrides
} = {}) {
  return verifyCanonicalBoundedAncestry({
    ancestryAuthorityRoot: trustedReconciliationAuthorityRoot,
    originalCandidateSha: TRUSTED_RECONCILIATION_BASE,
    chain: undefined,
    dag: TRUSTED_RECONCILIATION_DAG,
    ...overrides,
  });
}

// Copy the already-verified trusted reconciliation DAG into a disposable
// reconciliation repository without sharing object stores or importing the
// transport checkout's unrelated history. This is the only supported bridge
// between trusted-DAG custody and native ancestry checks in generated fixtures.
export function propagateTrustedReconciliationDag({
  trustedReconciliationAuthorityRoot,
  reconciliationFixtureRoot,
  dag = TRUSTED_RECONCILIATION_DAG,
  independentlyVerified = true,
  authorizedGeneratedCommits = [],
} = {}) {
  assert.equal(independentlyVerified, true,
    "reconciliation fixture: independent trusted-DAG verification required");
  assert.deepEqual(dag, TRUSTED_RECONCILIATION_DAG,
    "reconciliation fixture: exact trusted DAG required");
  assert.ok(trustedReconciliationAuthorityRoot,
    "reconciliation fixture: trusted authority root absent");
  assert.ok(reconciliationFixtureRoot,
    "reconciliation fixture: destination root absent");
  assert.ok(!lstatSync(path.resolve(reconciliationFixtureRoot)).isSymbolicLink(),
    "reconciliation fixture: symlink destination forbidden");
  const sourceRoot = realpathSync(path.resolve(trustedReconciliationAuthorityRoot));
  const destinationRoot = realpathSync(path.resolve(reconciliationFixtureRoot));
  assert.ok(process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
    "reconciliation fixture: trusted authority environment binding absent");
  assert.equal(sourceRoot, realpathSync(path.resolve(
    process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
  )), "reconciliation fixture: candidate-selected trusted authority root");
  assert.notEqual(sourceRoot, destinationRoot,
    "reconciliation fixture: shared authority object store forbidden");
  assert.notEqual(destinationRoot, realpathSync(candidateRoot),
    "reconciliation fixture: primary checkout forbidden");
  verifyCanonicalTrustedReconciliationAncestry({
    trustedReconciliationAuthorityRoot: sourceRoot,
  });
  const destinationGitDir = realpathSync(path.resolve(
    destinationRoot,
    gitAt(destinationRoot, "rev-parse", "--git-dir"),
  ));
  const sourceGitDir = realpathSync(path.resolve(
    sourceRoot,
    gitAt(sourceRoot, "rev-parse", "--git-dir"),
  ));
  assert.notEqual(destinationGitDir, sourceGitDir,
    "reconciliation fixture: shared Git directory forbidden");
  assert.ok(!existsSync(path.join(destinationGitDir, "objects/info/alternates")),
    "reconciliation fixture: alternates forbidden");
  assert.equal(gitAt(destinationRoot, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "reconciliation fixture: replace refs forbidden");
  assert.ok(!existsSync(path.join(destinationGitDir, "info/grafts")),
    "reconciliation fixture: grafts forbidden");
  const allowedExistingCommits = new Set([
    ...AUTHORIZED_ANCESTRY_CHAIN,
    COMPOSED_CI_BASE,
    AUTHORIZED_BASE,
    TRUSTED_RECONCILIATION_BASE,
  ]);
  assert.ok(Array.isArray(authorizedGeneratedCommits),
    "reconciliation fixture: generated commit allowlist malformed");
  for (const sha of authorizedGeneratedCommits) {
    exactSha(sha, "reconciliation fixture generated commit");
    assert.equal(gitAt(destinationRoot, "cat-file", "-t", sha), "commit",
      "reconciliation fixture: generated object is not a commit");
    allowedExistingCommits.add(sha);
  }
  const existingCommits = gitAt(
    destinationRoot,
    "cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)",
  ).split("\n").filter((line) => line.endsWith(" commit")).map((line) => line.slice(0, 40));
  for (const sha of existingCommits) {
    assert.ok(allowedExistingCommits.has(sha),
      `reconciliation fixture: unauthorized preexisting commit ${sha}`);
  }

  for (const entry of dag) {
    const rawTree = execFileSync("git", ["cat-file", "tree", entry.tree], {
      cwd: sourceRoot, stdio: ["ignore", "pipe", "pipe"],
    });
    const importedTree = execFileSync(
      "git", ["hash-object", "-w", "-t", "tree", "--stdin"],
      { cwd: destinationRoot, input: rawTree, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    assert.equal(importedTree, entry.tree,
      `reconciliation fixture: tree identity changed for ${entry.sha}`);
    const rawCommit = execFileSync("git", ["cat-file", "commit", entry.sha], {
      cwd: sourceRoot, stdio: ["ignore", "pipe", "pipe"],
    });
    const importedCommit = execFileSync(
      "git", ["hash-object", "-w", "-t", "commit", "--stdin"],
      { cwd: destinationRoot, input: rawCommit, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    assert.equal(importedCommit, entry.sha,
      `reconciliation fixture: commit identity changed for ${entry.sha}`);
    assert.equal(gitAt(destinationRoot, "rev-parse", `${entry.sha}^{tree}`), entry.tree,
      `reconciliation fixture: imported tree mismatch for ${entry.sha}`);
    const parents = gitAt(destinationRoot, "cat-file", "-p", entry.sha).split("\n")
      .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
    if (entry.sha === AUTHORIZED_BASE) {
      assert.ok(parents.includes(PRE_BASE_PARENT),
        "reconciliation fixture: boundary parent identity changed");
    } else {
      assert.deepEqual(parents, entry.parents,
        `reconciliation fixture: parent topology changed for ${entry.sha}`);
    }
  }
  assert.throws(() => gitAt(destinationRoot, "cat-file", "-e", `${PRE_BASE_PARENT}^{commit}`),
    "reconciliation fixture: forbidden pre-boundary commit imported");
  const shallowPath = path.join(destinationGitDir, "shallow");
  if (existsSync(shallowPath)) {
    assert.equal(readFileSync(shallowPath, "utf8"), `${AUTHORIZED_BASE}\n`,
      "reconciliation fixture: conflicting shallow boundary");
  } else {
    writeFileSync(shallowPath, `${AUTHORIZED_BASE}\n`, { flag: "wx" });
  }
  assert.equal(readFileSync(shallowPath, "utf8"), `${AUTHORIZED_BASE}\n`,
    "reconciliation fixture: exact sole boundary required");
  gitAt(destinationRoot, "merge-base", "--is-ancestor", AUTHORIZED_BASE,
    TRUSTED_RECONCILIATION_BASE);
  return Object.freeze({
    sourceRoot,
    destinationRoot,
    boundarySha: AUTHORIZED_BASE,
    trustedHeadSha: TRUSTED_RECONCILIATION_BASE,
    importedCommits: dag.length,
    importedTrees: new Set(dag.map(({ tree }) => tree)).size,
  });
}

// Compatibility Git gate. The production path receives its allowlist from the
// trusted caller; arbitrary manifests are accepted only for explicit temporary
// fixture repositories used by the negative-control suite.
export function validateGit(manifest, candidateSha, repoRoot = candidateRoot, options = {}) {
  assert.ok(manifest && typeof manifest === "object", "manifest absent");
  exactSha(candidateSha, "candidate");
  exactSha(manifest.authorizedBaseSha, "authorized base");
  const headBefore = gitAt(repoRoot, "rev-parse", "HEAD");
  assert.equal(candidateSha, headBefore, "candidate SHA does not equal checked-out HEAD");
  assert.equal(gitAt(repoRoot, "cat-file", "-t", candidateSha), "commit");
  assert.equal(gitAt(repoRoot, "cat-file", "-t", manifest.authorizedBaseSha), "commit");
  gitAt(repoRoot, "merge-base", "--is-ancestor", manifest.authorizedBaseSha, candidateSha);
  if (options.repository) {
    assert.equal(
      normalizeRepository(gitAt(repoRoot, "remote", "get-url", "origin")),
      normalizeRepository(`https://github.com/${options.repository}`),
      "repository identity mismatch",
    );
  }
  const trustedAllowed = options.trustedAllowedFiles ?? manifest.allowedRemediationFiles;
  const trustedRequired = options.trustedRequiredFiles ?? manifest.requiredFiles;
  assert.ok(Array.isArray(trustedAllowed) && Array.isArray(trustedRequired));
  if (options.trustedAllowedFiles) {
    assert.deepEqual(
      [...manifest.allowedRemediationFiles].sort(),
      [...trustedAllowed].sort(),
      "candidate manifest changed trusted allowlist",
    );
    assert.deepEqual(
      [...manifest.requiredFiles].sort(),
      [...trustedRequired].sort(),
      "candidate manifest changed trusted required files",
    );
  }
  for (const file of [...trustedAllowed, ...trustedRequired]) assertSafeRepoPath(file, "scope path");
  unique([...trustedAllowed].map((file) => path.posix.normalize(file)), "normalized allowed paths");
  const raw = execFileSync(
    "git",
    ["diff", "--name-status", "-z", "--find-renames", `${manifest.authorizedBaseSha}..${candidateSha}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const tokens = raw.split("\0").filter(Boolean);
  const changed = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    assert.match(status, /^[ACDMT][0-9]*$/, `unsupported or renamed status ${status}`);
    const file = tokens[index++];
    assertSafeRepoPath(file, `changed ${status}`);
    changed.push(file);
  }
  unique(changed.map((file) => path.posix.normalize(file)), "normalized changed paths");
  assert.deepEqual([...changed].sort(), [...trustedAllowed].sort(), "unauthorized, omitted, deleted, renamed, or unclassified path");
  for (const file of trustedRequired) {
    const stat = lstatSync(path.join(repoRoot, file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `${file}: missing or unsafe`);
  }
  assert.equal(gitAt(repoRoot, "status", "--porcelain"), "", "dirty worktree");
  assert.equal(gitAt(repoRoot, "rev-parse", "HEAD"), headBefore, "HEAD moved during validation");
  return headBefore;
}

// Deterministic legacy entrypoint. It composes canonical controls and never
// emits a certification verdict. All trust identities and object stores are
// explicit; absence is a blocking error.
export function runPackage(options = {}) {
  const {
    candidateSha,
    repoRoot = candidateRoot,
    anchor,
    specGitDir,
    runtimeGitDir,
    workflowSha,
    evidenceBaseSha,
    reconciliationBaseSha,
    originalCandidateSha,
    trustedAllowedFiles,
    trustedRequiredFiles,
    ancestryAuthorityRoot = process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
    trustedReconciliationAuthorityRoot = process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
    repository = AUTHORIZED_REPOSITORIES.base,
  } = options;
  exactSha(candidateSha, "candidate");
  const packageLoad = (file) => JSON.parse(readFileSync(path.join(repoRoot, file), "utf8"));
  const model = packageLoad("docs/security/p1-a/model.json");
  const evidence = packageLoad("docs/security/p1-a/evidence-register.json");
  const manifest = packageLoad("docs/security/p1-a/validation-manifest.json");
  const markdown = readFileSync(path.join(repoRoot, "docs/security/p1-a/threat-model.md"), "utf8");
  const dualIdentities = [
    workflowSha, evidenceBaseSha, reconciliationBaseSha, originalCandidateSha,
  ];
  const usesDualBase = dualIdentities.some(Boolean);
  assert.ok(
    !usesDualBase || dualIdentities.every(Boolean),
    "partial dual-base identity set",
  );
  const head = usesDualBase
    ? candidateSha
    : validateGit(manifest, candidateSha, repoRoot, {
        trustedAllowedFiles,
        trustedRequiredFiles,
        repository,
      });
  const trust = assertTrustAnchor(model, evidence, manifest, anchor);
  const data = validateData(model, evidence, manifest, markdown);
  validateEvidenceBinding(evidence, manifest, { specGitDir, runtimeGitDir });
  if (usesDualBase) {
    for (const [label, value] of [
      ["workflow", workflowSha], ["evidence base", evidenceBaseSha],
      ["reconciliation base", reconciliationBaseSha],
      ["original candidate", originalCandidateSha],
    ]) exactSha(value, label);
    validateDualBaseScope({
      git: (...args) => gitAt(repoRoot, ...args),
      candidateSha, workflowSha, evidenceBaseSha,
      reconciliationBaseSha, originalCandidateSha, ancestryAuthorityRoot,
      trustedReconciliationAuthorityRoot,
    });
  }
  return Object.freeze({
    status: "VALIDATED_NOT_CERTIFIED",
    candidateSha: head,
    trust,
    authorityRules: data.authorityRules,
    evidenceReferences: evidence.references.length,
  });
}

function gitObject(gitDir, args) {
  try {
    return execFileSync("git", ["--git-dir", gitDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    throw new NotVerifiedError(
      `object query failed: ${String(error.message).split("\n")[0]}`,
    );
  }
}

export function validateEvidenceBinding(evidence, manifest, options = {}) {
  const { specGitDir, runtimeGitDir } = options;
  if (!specGitDir || !runtimeGitDir) {
    throw new NotVerifiedError(
      "specification/runtime object sources absent (fail-closed)",
    );
  }
  for (const [gitDir, sha, label] of [
    [specGitDir, manifest.authorizedBaseSha, "base"],
    [runtimeGitDir, manifest.runtimeEvidenceSha, "runtime"],
  ]) {
    const type = gitObject(gitDir, ["cat-file", "-t", sha]).trim();
    assert.equal(type, "commit", `${label} pin is not a commit`);
  }
  for (const reference of evidence.references) {
    const runtime =
      reference.repository === AUTHORIZED_REPOSITORIES.runtime;
    const gitDir = runtime ? runtimeGitDir : specGitDir;
    const safePath = assertSafeRepoPath(reference.path, reference.id);
    const { start, end } = parseLineRange(reference.lines, reference.id);
    const tree = gitObject(gitDir, [
      "ls-tree",
      reference.sha,
      "--",
      safePath,
    ]).trim();
    assert.ok(tree, `${reference.id}: cited path absent`);
    const [mode, type, objectId] = tree.split(/\s+/);
    assert.equal(type, "blob", `${reference.id}: cited object is not a blob`);
    assert.ok(
      mode === "100644" || mode === "100755",
      `${reference.id}: unsafe object mode ${mode}`,
    );
    assert.equal(
      objectId,
      reference.blobSha,
      `${reference.id}: blob identity mismatch`,
    );
    const blob = gitObject(gitDir, ["cat-file", "blob", objectId]);
    const newlines = (blob.match(/\n/g) || []).length;
    const lineCount =
      blob.length === 0 ? 0 : blob.endsWith("\n") ? newlines : newlines + 1;
    assert.ok(
      end <= lineCount,
      `${reference.id}: range ${start}-${end} exceeds ${lineCount} lines`,
    );
  }
}

function validateTrustedIdentity() {
  const workflowSha = process.env.P1A_WORKFLOW_SHA;
  const verifierSha = process.env.P1A_VERIFIER_SHA;
  assert.match(workflowSha ?? "", /^[0-9a-f]{40}$/, "workflow SHA absent");
  assert.match(verifierSha ?? "", /^[0-9a-f]{40}$/, "verifier SHA absent");
  assert.equal(verifierSha, workflowSha, "workflow/verifier SHA mismatch");
  const trustedHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: moduleRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(trustedHead, verifierSha, "trusted checkout SHA mismatch");
  const verifierPath = "scripts/validate-p1a-threat-model.mjs";
  const verifierBlobSha = execFileSync(
    "git",
    ["rev-parse", `${verifierSha}:${verifierPath}`],
    { cwd: moduleRoot, encoding: "utf8" },
  ).trim();
  const workingBlobSha = execFileSync("git", ["hash-object", verifierPath], {
    cwd: moduleRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(workingBlobSha, verifierBlobSha, "verifier blob/commit mismatch");
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: moduleRoot,
      encoding: "utf8",
    }).trim(),
    "",
    "trusted verifier checkout dirty",
  );
  return { workflowSha, verifierSha, verifierBlobSha };
}

function validateManifest(model, evidence, manifest) {
  assert.equal(manifest.authorizedBaseSha, AUTHORIZED_BASE);
  assert.equal(manifest.runtimeEvidenceSha, AUTHORIZED_RUNTIME);
  assert.equal(model.sources.specification.revision, AUTHORIZED_BASE);
  assert.equal(model.sources.runtime.revision, AUTHORIZED_RUNTIME);
  assert.deepEqual(manifest.requiredTests, REQUIRED_CHECKS);
  assert.deepEqual(
    [...manifest.allowedRemediationFiles].sort(),
    [...AUTHORIZED_CANDIDATE_FILES].sort(),
    "candidate-controlled allowed file scope changed",
  );
  assert.deepEqual(
    [...manifest.requiredFiles].sort(),
    [...REQUIRED_CANDIDATE_FILES].sort(),
    "candidate-controlled required file inventory changed",
  );
  assert.equal(manifest.crossRepositoryCiAuthentication, "VERIFIED");
  assert.deepEqual(model.gate, {
    runtimeChanged: false,
    productionClaimed: false,
    p1bAuthorized: false,
    selfCertified: false,
  });
  unique(evidence.references.map((item) => item.id), "evidence IDs");
  for (const reference of evidence.references) {
    assert.match(reference.sha, /^[0-9a-f]{40}$/);
    assert.match(reference.blobSha ?? "", /^[0-9a-f]{40}$/);
    assertSafeRepoPath(reference.path, reference.id);
    parseLineRange(reference.lines, reference.id);
    const expectedRepository =
      reference.sha === AUTHORIZED_BASE
        ? AUTHORIZED_REPOSITORIES.base
        : reference.sha === AUTHORIZED_RUNTIME
          ? AUTHORIZED_REPOSITORIES.runtime
          : null;
    assert.ok(expectedRepository, `${reference.id}: unauthorized evidence SHA`);
    assert.equal(reference.repository, expectedRepository);
  }
}

function gitLines(git, ...args) {
  return git(...args).split("\n").filter(Boolean).sort();
}

function blobAt(git, commit, file) {
  try {
    return git("rev-parse", `${commit}:${file}`);
  } catch {
    return null;
  }
}

export const REQUIRED_CI_ADDITION = [
  "      - name: P1-A candidate-data validation",
  "        env:",
  "          P1A_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority",
  "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority",
  "          P1A_PR16_CHAIN_AUTHORITY_ROOT: .p1a-pr16-remediation-chain-authority",
  "        run: node scripts/validate-p1a-threat-model.mjs --candidate-data-only",
  "",
  "",
].join("\n");

const CI_CHECKOUT_REF =
  "          ref: ${{ github.event.pull_request.head.sha || github.sha }}\n";
const TRUSTED_CI_CHECKOUT =
  `${CI_CHECKOUT_REF}          persist-credentials: false\n`;
export const ORDINARY_CI_ACTION_PINS = Object.freeze({
  "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
  "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/cache": "0057852bfaa89a56745cba8c7296529d2fc39830",
  "raven-actions/actionlint": "3d39aea434753780c3b3d4a1a31c854b4dbf49d7",
});
const CURRENT_PREDECESSOR_AUTHORITY_V1_ACTION_COUNTS = Object.freeze({
  "actions/checkout": 11,
  "actions/setup-node": 1,
  "actions/cache": 1,
  "raven-actions/actionlint": 1,
});
const CURRENT_PREDECESSOR_AUTHORITY_V2_ACTION_COUNTS = Object.freeze({
  "actions/checkout": 12,
  "actions/setup-node": 1,
  "actions/cache": 1,
  "raven-actions/actionlint": 1,
});
const HISTORICAL_ORDINARY_CI_ACTION_COUNTS = Object.freeze({
  "actions/checkout": 7,
  "actions/setup-node": 1,
  "actions/cache": 1,
  "raven-actions/actionlint": 1,
});
const PINNED_ACTION_COMMENTS = Object.freeze({
  "actions/checkout": " # v4",
  "actions/setup-node": " # v4",
  "actions/cache": " # v4",
  "raven-actions/actionlint": " # v2.2.0",
});

function pinBaselineActions(source) {
  let pinned = source;
  for (const [repository, expected] of Object.entries(ORDINARY_CI_ACTION_PINS)) {
    if (repository === "raven-actions/actionlint") continue;
    const mutable = `uses: ${repository}@v4`;
    assert.equal(pinned.split(mutable).length - 1, 1,
      `${repository}: baseline mutable action count mismatch`);
    pinned = pinned.replace(
      mutable,
      `uses: ${repository}@${expected}${PINNED_ACTION_COMMENTS[repository]}`,
    );
  }
  return pinned;
}

export function parseOrdinaryCiActionInventory(source) {
  assert.ok(typeof source === "string" && source, "ordinary CI absent");
  assert.ok(!source.includes("\t"), "ordinary CI tabs are forbidden");
  assert.ok(!/(?:^|\s)[&*][A-Za-z0-9_-]+(?:\s|$)/m.test(source),
    "ordinary CI YAML anchors and aliases are forbidden in action inventory");
  const uses = [];
  let inJobs = false;
  let inJob = false;
  let inSteps = false;
  for (const rawLine of source.split("\n")) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent === 0) {
      inJobs = line === "jobs:";
      inJob = false;
      inSteps = false;
      continue;
    }
    if (!inJobs) continue;
    if (indent === 2 && /^[A-Za-z0-9_-]+:$/.test(line)) {
      inJob = true;
      inSteps = false;
      continue;
    }
    if (!inJob) continue;
    if (indent === 4 && line === "steps:") {
      inSteps = true;
      continue;
    }
    const jobUses = indent === 4 && line.startsWith("uses:") ? line.slice(5).trim() : null;
    const stepUses = inSteps && ((indent === 6 && line.startsWith("- uses:"))
      ? line.slice(7).trim()
      : (indent === 8 && line.startsWith("uses:") ? line.slice(5).trim() : null));
    const valueWithComment = jobUses ?? stepUses;
    if (!valueWithComment) continue;
    const value = valueWithComment.replace(/\s+#.*$/, "").replace(/^['\"]|['\"]$/g, "");
    assert.ok(!value.startsWith("./") && !value.startsWith("docker://"),
      `unclassified local or Docker action: ${value}`);
    const separator = value.lastIndexOf("@");
    assert.ok(separator > 0 && separator < value.length - 1,
      `ordinary CI action reference malformed: ${value}`);
    uses.push(Object.freeze({ repository: value.slice(0, separator), revision: value.slice(separator + 1) }));
  }
  return Object.freeze(uses);
}

export function validateOrdinaryCiActionPins(source, { profile = "CURRENT_PREDECESSOR_AUTHORITY_V2_15" } = {}) {
  const uses = parseOrdinaryCiActionInventory(source);
  const expectedCounts = profile === "CURRENT_PREDECESSOR_AUTHORITY_V2_15"
    ? CURRENT_PREDECESSOR_AUTHORITY_V2_ACTION_COUNTS
    : profile === "CURRENT_PREDECESSOR_AUTHORITY_V1_14"
      ? CURRENT_PREDECESSOR_AUTHORITY_V1_ACTION_COUNTS
    : profile === "HISTORICAL_10"
      ? HISTORICAL_ORDINARY_CI_ACTION_COUNTS
      : assert.fail("ordinary CI action profile unrecognized");
  const expectedTotal = Object.values(expectedCounts).reduce((total, count) => total + count, 0);
  assert.equal(uses.length, expectedTotal, "ordinary CI action inventory changed");
  const counts = new Map();
  for (const { repository, revision } of uses) {
    assert.ok(Object.hasOwn(ORDINARY_CI_ACTION_PINS, repository),
      `unclassified action repository: ${repository}`);
    assert.match(revision, /^[0-9a-f]{40}$/,
      `${repository}: immutable full action SHA required`);
    assert.equal(revision, ORDINARY_CI_ACTION_PINS[repository],
      `${repository}: unauthorized action SHA`);
    counts.set(repository, (counts.get(repository) ?? 0) + 1);
  }
  assert.deepEqual(
    Object.fromEntries([...counts].sort()),
    Object.fromEntries(Object.entries(expectedCounts).sort()),
    "ordinary CI action counts changed",
  );
  return Object.freeze({ profile, required: expectedTotal, executed: uses.length, passed: uses.length,
    unexpected: 0, missing: 0, mutable: 0, incorrectPins: 0 });
}

export function validateCurrentWorkflowShaCustody({
  git,
  workflowSha,
  expectedWorkflowSha,
  candidateSha,
  repository,
  trustedRoot,
  candidateRoot,
  verifierPath,
  workflowPath,
  expectedWorkflowBlob,
}) {
  exactSha(workflowSha, "workflow");
  exactSha(expectedWorkflowSha, "expected workflow");
  exactSha(candidateSha, "candidate");
  exactSha(expectedWorkflowBlob, "workflow blob");
  assert.equal(workflowSha, expectedWorkflowSha,
    "workflow SHA differs from trusted execution authority");
  assert.notEqual(workflowSha, candidateSha,
    "candidate cannot be trusted workflow authority");
  assert.notEqual(workflowSha, ORIGINAL_CANDIDATE,
    "historical candidate cannot be current workflow authority");
  assert.equal(repository, AUTHORIZED_REPOSITORIES.base,
    "workflow repository identity mismatch");
  assert.ok(trustedRoot && candidateRoot, "custody roots absent");
  assert.notEqual(path.resolve(trustedRoot), path.resolve(candidateRoot),
    "trusted verifier cannot execute from candidate root");
  assert.equal(
    path.resolve(verifierPath),
    path.resolve(trustedRoot, "scripts/validate-p1a-threat-model.mjs"),
    "verifier path is not trusted-checkout controlled",
  );
  assert.equal(
    path.resolve(workflowPath),
    path.resolve(trustedRoot, ".github/workflows/p1a-certify.yml"),
    "workflow path is not trusted-checkout controlled",
  );
  assert.equal(git("cat-file", "-t", workflowSha), "commit",
    "workflow authority is not a commit");
  assert.equal(git("cat-file", "-t", candidateSha), "commit",
    "candidate is not a commit");
  git("merge-base", "--is-ancestor", workflowSha, candidateSha);
  assert.equal(
    blobAt(git, workflowSha, ".github/workflows/p1a-certify.yml"),
    expectedWorkflowBlob,
    "trusted workflow blob mismatch",
  );
  return Object.freeze({
    status: "CURRENT_WORKFLOW_SHA_CUSTODY_VALIDATED",
    workflowSha,
    candidateSha,
    workflowBlob: expectedWorkflowBlob,
  });
}

export function validateExecutionCustody({
  role,
  executionRoot,
  trustedRoot,
  candidateRoot,
  operation,
  selectsTrustedAuthority = false,
  claimsCertification = false,
}) {
  assert.ok(executionRoot && trustedRoot && candidateRoot, "custody root absent");
  const execution = path.resolve(executionRoot);
  const trusted = path.resolve(trustedRoot);
  const candidate = path.resolve(candidateRoot);
  assert.notEqual(trusted, candidate, "trusted and candidate roots overlap");
  if (role === "TRUSTED_CHECKOUT") {
    assert.equal(execution, trusted, "trusted operation outside trusted checkout");
    assert.notEqual(execution, candidate, "candidate impersonates trusted checkout");
    return Object.freeze({ status: "TRUSTED_CHECKOUT_VALIDATED" });
  }
  assert.equal(role, "CANDIDATE_DATA", "unknown custody role");
  assert.equal(execution, candidate, "candidate validation outside candidate root");
  assert.notEqual(execution, trusted, "candidate validation executes as trusted authority");
  assert.equal(operation, "VALIDATE_CANDIDATE_DATA",
    "candidate root requested trusted operation");
  assert.equal(selectsTrustedAuthority, false,
    "candidate root cannot select trusted authority");
  assert.equal(claimsCertification, false,
    "candidate root cannot self-certify");
  return Object.freeze({ status: "CANDIDATE_DATA_VALIDATED" });
}
const TRUSTED_CI_ACQUISITION = `      - name: Acquire exact original P1-A candidate object
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 365c59757756f3f91480d3bfeb841b543010201f
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-original-candidate

      - name: Verify and materialize exact original P1-A candidate object
        env:
          P1A_ORIGINAL_CANDIDATE: 365c59757756f3f91480d3bfeb841b543010201f
          P1A_ORIGINAL_MODEL_BLOB: 0bb71b21e3532f9690226b6a504967f3b2504621
          P1A_ORIGINAL_EVIDENCE_BLOB: 205dc5451bfc639bdfcbd58d380e11439e6f9764
          P1A_ORIGINAL_MANIFEST_BLOB: d5e86d2445f750bc85a951c348ae52f76f2ce51a
          P1A_ORIGINAL_MARKDOWN_BLOB: b675f420e0e50c32e84bba37c13e0aade0cfd5e5
          P1A_ORIGINAL_TEST_BLOB: 1ad3be9777b6aaea530a07fbd0b183311d604be5
        run: |
          set -euo pipefail
          test "$GITHUB_REPOSITORY" = "DarksiedCEO/zbestmedia"
          [[ "$P1A_ORIGINAL_CANDIDATE" =~ ^[0-9a-f]{40}$ ]]
          test "$P1A_ORIGINAL_CANDIDATE" = "365c59757756f3f91480d3bfeb841b543010201f"
          test "$(git -C .p1a-original-candidate rev-parse HEAD)" = "$P1A_ORIGINAL_CANDIDATE"
          test "$(git -C .p1a-original-candidate cat-file -t "$P1A_ORIGINAL_CANDIDATE")" = "commit"
          test "$(git -C .p1a-original-candidate remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          if grep -Eiq 'x-access-token|authorization:' .p1a-original-candidate/.git/config; then
            echo "persisted credential material detected" >&2
            exit 1
          fi
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE^{commit}")" = "$P1A_ORIGINAL_CANDIDATE"
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/model.json")" = "$P1A_ORIGINAL_MODEL_BLOB"
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/evidence-register.json")" = "$P1A_ORIGINAL_EVIDENCE_BLOB"
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/validation-manifest.json")" = "$P1A_ORIGINAL_MANIFEST_BLOB"
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/threat-model.md")" = "$P1A_ORIGINAL_MARKDOWN_BLOB"
          test "$(git -C .p1a-original-candidate rev-parse "$P1A_ORIGINAL_CANDIDATE:scripts/test-p1a-threat-model.mjs")" = "$P1A_ORIGINAL_TEST_BLOB"

      - name: Acquire exact trusted CI baseline
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 06e6497ac3420998671f255a42a20d8cb8b9ca50
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-trusted-baseline

      - name: Verify exact trusted CI baseline
        env:
          P1A_TRUSTED_BASELINE: 06e6497ac3420998671f255a42a20d8cb8b9ca50
          P1A_TRUSTED_CI_BLOB: 9a3f1a04f99e83d9dad84cf384d86117a7d282f1
        run: |
          set -euo pipefail
          test "$GITHUB_REPOSITORY" = "DarksiedCEO/zbestmedia"
          [[ "$P1A_TRUSTED_BASELINE" =~ ^[0-9a-f]{40}$ ]]
          test "$P1A_TRUSTED_BASELINE" = "06e6497ac3420998671f255a42a20d8cb8b9ca50"
          test "$(git -C .p1a-trusted-baseline rev-parse HEAD)" = "$P1A_TRUSTED_BASELINE"
          test "$(git -C .p1a-trusted-baseline cat-file -t "$P1A_TRUSTED_BASELINE")" = "commit"
          test "$(git -C .p1a-trusted-baseline remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test -f .p1a-trusted-baseline/.github/workflows/ci.yml
          test "$(git -C .p1a-trusted-baseline rev-parse "$P1A_TRUSTED_BASELINE:.github/workflows/ci.yml")" = "$P1A_TRUSTED_CI_BLOB"
          if grep -Eiq 'x-access-token|authorization:' .p1a-trusted-baseline/.git/config; then
            echo "persisted baseline credential material detected" >&2
            exit 1
          fi

      - name: Acquire exact dual-base trusted authority
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 5056fb0df6e1ef739231cd2273a453fb1c644273
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-dual-base-authority

      - name: Verify exact dual-base trusted authority
        env:
          P1A_DUAL_BASE_AUTHORITY: 5056fb0df6e1ef739231cd2273a453fb1c644273
          P1A_DUAL_BASE_TREE: 37345329da7051a818eb2e5b02f1f06f74d667a7
          P1A_DUAL_BASE_CI_BLOB: 9a3f1a04f99e83d9dad84cf384d86117a7d282f1
        run: |
          set -euo pipefail
          test "$GITHUB_REPOSITORY" = "DarksiedCEO/zbestmedia"
          [[ "$P1A_DUAL_BASE_AUTHORITY" =~ ^[0-9a-f]{40}$ ]]
          test "$(git -C .p1a-dual-base-authority rev-parse HEAD)" = "$P1A_DUAL_BASE_AUTHORITY"
          test "$(git -C .p1a-dual-base-authority cat-file -t "$P1A_DUAL_BASE_AUTHORITY")" = "commit"
          test "$(git -C .p1a-dual-base-authority cat-file -t "$P1A_DUAL_BASE_AUTHORITY^{tree}")" = "tree"
          test "$(git -C .p1a-dual-base-authority rev-parse "$P1A_DUAL_BASE_AUTHORITY^{tree}")" = "$P1A_DUAL_BASE_TREE"
          test "$(git -C .p1a-dual-base-authority remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test "$(git -C .p1a-dual-base-authority rev-parse "$P1A_DUAL_BASE_AUTHORITY:.github/workflows/ci.yml")" = "$P1A_DUAL_BASE_CI_BLOB"
          test -z "$(git -C .p1a-dual-base-authority status --porcelain=v1)"
          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' .p1a-dual-base-authority/.git/config; then
            echo "persisted dual-base authority credential material detected" >&2
            exit 1
          fi

      - name: Acquire exact historical evidence-base authority
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 7056ea4ce24379c93549f0ac9b45ddd7a2600dd6
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-evidence-base-authority

      - name: Verify exact historical evidence-base authority
        env:
          P1A_EVIDENCE_BASE_AUTHORITY: 7056ea4ce24379c93549f0ac9b45ddd7a2600dd6
          P1A_EVIDENCE_BASE_TREE: a929da05a15a0c37644a224697dddec9762b00a0
          P1A_EVIDENCE_BASE_CI_BLOB: 92d0002609c084a280a582b5e1ab39476032ca71
        run: |
          set -euo pipefail
          test "$GITHUB_REPOSITORY" = "DarksiedCEO/zbestmedia"
          [[ "$P1A_EVIDENCE_BASE_AUTHORITY" =~ ^[0-9a-f]{40}$ ]]
          test "$(git -C .p1a-evidence-base-authority rev-parse HEAD)" = "$P1A_EVIDENCE_BASE_AUTHORITY"
          test "$(git -C .p1a-evidence-base-authority cat-file -t "$P1A_EVIDENCE_BASE_AUTHORITY")" = "commit"
          test "$(git -C .p1a-evidence-base-authority cat-file -t "$P1A_EVIDENCE_BASE_AUTHORITY^{tree}")" = "tree"
          test "$(git -C .p1a-evidence-base-authority rev-parse "$P1A_EVIDENCE_BASE_AUTHORITY^{tree}")" = "$P1A_EVIDENCE_BASE_TREE"
          test "$(git -C .p1a-evidence-base-authority remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test "$(git -C .p1a-evidence-base-authority rev-parse "$P1A_EVIDENCE_BASE_AUTHORITY:.github/workflows/ci.yml")" = "$P1A_EVIDENCE_BASE_CI_BLOB"
          test -z "$(git -C .p1a-evidence-base-authority status --porcelain=v1)"
          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' .p1a-evidence-base-authority/.git/config; then
            echo "persisted evidence-base authority credential material detected" >&2
            exit 1
          fi

      - name: Acquire exact immutable P1-A ancestry authority
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 365c59757756f3f91480d3bfeb841b543010201f
          fetch-depth: 11
          persist-credentials: false
          path: .p1a-ancestry-authority

      - name: Verify exact immutable P1-A ancestry authority
        run: |
          set -euo pipefail
          test "$GITHUB_REPOSITORY" = "DarksiedCEO/zbestmedia"
          expected=(
            7056ea4ce24379c93549f0ac9b45ddd7a2600dd6
            c9c6198e9dc3018bfdbcf98dd3e63335dd2c0e6e
            bf3b0478afcab9cb5b58e8af904b98ea53ae3f3e
            fec9d68fc142a122c3568a7e8b73e5503081cc28
            73227f2bde0f3b70e8a126eaaa16cb1ee0946b71
            06545d264030199f87df1558b414aa7f051871cd
            f3f2966ec511b64b2d46f38c0363be269bb4246a
            36d5b1f2fadddbb60a80f7cac601455c51286240
            aa7014e691a6222a0b93e61d6aa2ffa12aa4ced1
            e10b602c31b8a3838fdfd76a86b022b7abceb12c
            365c59757756f3f91480d3bfeb841b543010201f
          )
          test "$(git -C .p1a-ancestry-authority rev-parse HEAD)" = "\${expected[10]}"
          test "$(git -C .p1a-ancestry-authority remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test -z "$(git -C .p1a-ancestry-authority status --porcelain=v1)"
          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' .p1a-ancestry-authority/.git/config; then
            echo "persisted ancestry authority credential material detected" >&2
            exit 1
          fi
          mapfile -t actual < <(git -C .p1a-ancestry-authority rev-list --reverse "\${expected[10]}")
          test "\${#actual[@]}" -eq "\${#expected[@]}"
          for index in "\${!expected[@]}"; do
            sha="\${expected[$index]}"
            [[ "$sha" =~ ^[0-9a-f]{40}$ ]]
            test "\${actual[$index]}" = "$sha"
            test "$(git -C .p1a-ancestry-authority cat-file -t "$sha")" = commit
            tree="$(git -C .p1a-ancestry-authority show -s --format=%T "$sha")"
            [[ "$tree" =~ ^[0-9a-f]{40}$ ]]
            test "$(git -C .p1a-ancestry-authority cat-file -t "$tree")" = tree
            if (( index > 0 )); then
              parent="$(git -C .p1a-ancestry-authority cat-file -p "$sha" | sed -n 's/^parent //p')"
              test "$parent" = "\${expected[$((index - 1))]}"
            fi
          done
          git -C .p1a-ancestry-authority merge-base --is-ancestor "\${expected[0]}" "\${expected[10]}"

`;
const TWO_STAGE_CI_START = "      - name: Acquire bounded trusted-reconciliation staging objects\n";
const TWO_STAGE_CI_END = "      - name: P1-A trusted verifier controls\n";
const TWO_STAGE_CI_SHA256 = "3fb24871674a86d9f3940b3c236215aa763d29018ff858e046fc2efbcaef8625";
function exactTwoStageCustodyFragment(source) {
  assert.equal(source.split(TWO_STAGE_CI_START).length - 1, 1,
    "two-stage custody: staging acquisition missing or duplicated");
  const start = source.indexOf(TWO_STAGE_CI_START);
  const end = source.indexOf(TWO_STAGE_CI_END, start);
  assert.ok(end > start, "two-stage custody: verifier placement missing");
  const fragment = source.slice(start, end);
  assert.equal(sha256(fragment), TWO_STAGE_CI_SHA256,
    "two-stage custody: exact fragment digest mismatch");
  for (const required of [
    "persist-credentials: false",
    "path: .p1a-trusted-reconciliation-staging",
    "Construct exact trusted-reconciliation authority store",
    "cat-file commit",
    "hash-object -w -t commit --stdin",
    "hash-object -w -t tree --stdin",
    "rm -rf \"$staging\"",
    "test ! -e \"$staging\"",
    "objects/info/alternates",
    "816c3a7c199e3c6bc4e482435eed60c1fcf0a11c",
    "merge-base --is-ancestor",
  ]) assert.ok(fragment.includes(required), `two-stage custody: missing ${required}`);
  assert.ok(!fragment.includes("persist-credentials: true"),
    "two-stage custody: credentials persisted");
  return { fragment, start, end };
}
export function removeTwoStageCustodyFragment(source) {
  const { start, end } = exactTwoStageCustodyFragment(source);
  return `${source.slice(0, start)}${source.slice(end)}`;
}
const BASE_TRUSTED_VERIFIER_STEP = `      - name: P1-A trusted verifier controls
        run: node scripts/test-p1a-trusted-verifier.mjs
`;
const ISOLATED_TRUSTED_VERIFIER_STEP = `      - name: P1-A trusted verifier controls
        env:
          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate
          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline
        run: node scripts/test-p1a-trusted-verifier.mjs
`;
const CI_TRUSTED_VERIFIER_MARKER =
  "      - name: P1-A trusted verifier controls";
const CI_CURRENT_CONTRACT_MARKER =
  "      - name: P1-A current candidate-data contract controls";
const TRUSTED_CURRENT_CONTRACT_ADDITION = [
  "          node --check scripts/test-p1a-trusted-verifier.mjs",
  "          node --check scripts/test-p1a-dual-base-verifier.mjs",
  "          node --check scripts/validate-p1a-threat-model.mjs",
  "",
  "      - name: P1-A current candidate-data contract controls",
  "        env:",
  "          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate",
  "          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline",
  "          P1A_DUAL_BASE_AUTHORITY_ROOT: .p1a-dual-base-authority",
  "          P1A_EVIDENCE_BASE_AUTHORITY_ROOT: .p1a-evidence-base-authority",
  "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority",
  "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority",
  "          P1A_PR16_CHAIN_AUTHORITY_ROOT: .p1a-pr16-remediation-chain-authority",
  "          P1A_PR16_HISTORICAL_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-cleanliness",
  "        run: node scripts/test-p1a-dual-base-verifier.mjs",
  "",
  "      - name: Remove isolated P1-A authority checkouts",
  "        if: always()",
  "        run: |",
  "          rm -rf .p1a-original-candidate .p1a-trusted-baseline .p1a-dual-base-authority .p1a-evidence-base-authority .p1a-ancestry-authority .p1a-trusted-reconciliation-staging .p1a-trusted-reconciliation-authority .p1a-pr16-chain-staging-trusted-base .p1a-pr16-chain-staging-original-amendment .p1a-pr16-chain-staging-rejected-chain .p1a-pr16-chain-staging-rejected-cleanliness .p1a-pr16-chain-staging-action-inventory .p1a-pr16-remediation-chain-authority",
  "          test ! -e .p1a-original-candidate",
  "          test ! -e .p1a-trusted-baseline",
  "          test ! -e .p1a-dual-base-authority",
  "          test ! -e .p1a-evidence-base-authority",
  "          test ! -e .p1a-ancestry-authority",
  "          test ! -e .p1a-trusted-reconciliation-authority",
  "          test ! -e .p1a-trusted-reconciliation-staging",
  "          test ! -e .p1a-pr16-chain-staging-trusted-base",
  "          test ! -e .p1a-pr16-chain-staging-original-amendment",
  "          test ! -e .p1a-pr16-chain-staging-rejected-chain",
  "          test ! -e .p1a-pr16-chain-staging-rejected-cleanliness",
  "          test ! -e .p1a-pr16-chain-staging-action-inventory",
  "          test ! -e .p1a-pr16-remediation-chain-authority",
  "",
  "      - name: P1-A trusted-bootstrap secret-detector tests",
].join("\n");

function replaceExactlyOnce(source, fragment, replacement, label) {
  assert.equal(source.split(fragment).length - 1, 1, `${label}: fragment count mismatch`);
  return source.replace(fragment, replacement);
}

export function composeTrustedCi(baseline) {
  const actionPinned = pinBaselineActions(baseline);
  const readOnlyCheckout = replaceExactlyOnce(
    actionPinned, CI_CHECKOUT_REF, TRUSTED_CI_CHECKOUT, "trusted checkout",
  );
  const acquired = replaceExactlyOnce(
    readOnlyCheckout,
    CI_TRUSTED_VERIFIER_MARKER,
    `${TRUSTED_CI_ACQUISITION}${CI_TRUSTED_VERIFIER_MARKER}`,
    "trusted acquisition placement",
  );
  const twoStageFragment = exactTwoStageCustodyFragment(
    readFileSync(path.join(moduleRoot, ".github/workflows/ci.yml"), "utf8"),
  ).fragment;
  const trustedReconciliationAcquired = replaceExactlyOnce(
    acquired,
    CI_TRUSTED_VERIFIER_MARKER,
    `${twoStageFragment}${CI_TRUSTED_VERIFIER_MARKER}`,
    "two-stage custody placement",
  );
  const isolated = replaceExactlyOnce(
    trustedReconciliationAcquired,
    BASE_TRUSTED_VERIFIER_STEP,
    ISOLATED_TRUSTED_VERIFIER_STEP,
    "isolated authority path and cleanup placement",
  );
  return replaceExactlyOnce(
    isolated,
    [
      "          node --check scripts/test-p1a-trusted-verifier.mjs",
      "          node --check scripts/validate-p1a-threat-model.mjs",
      "",
      "      - name: P1-A trusted-bootstrap secret-detector tests",
    ].join("\n"),
    TRUSTED_CURRENT_CONTRACT_ADDITION,
    "current candidate-data contract placement",
  );
}

export function composeCandidateCi(baseline) {
  return replaceExactlyOnce(
    baseline,
    CI_CURRENT_CONTRACT_MARKER,
    `${REQUIRED_CI_ADDITION}${CI_CURRENT_CONTRACT_MARKER}`,
    "candidate data placement after trusted authority acquisition",
  );
}

export function composeFinalCi(baseline) {
  return composeCandidateCi(composeTrustedCi(baseline));
}

export function validateComposedCandidateCi(git, candidateSha, workflowSha) {
  const path = ".github/workflows/ci.yml";
  const entry = git("ls-tree", candidateSha, "--", path);
  assert.match(entry, /^100644\s+blob\s+[0-9a-f]{40}\t/, `${path}: unsafe entry`);
  assert.equal(blobAt(git, COMPOSED_CI_BASE, path), COMPOSED_CI_BASE_BLOB,
    `${path}: baseline blob mismatch`);
  const trusted = `${git("show", `${workflowSha}:${path}`)}\n`;
  const candidate = `${git("show", `${candidateSha}:${path}`)}\n`;
  assert.ok(!trusted.includes(REQUIRED_CI_ADDITION), `${path}: trusted stage contains candidate step`);
  assert.ok(!trusted.includes("pnpm test:p1a-threat-model"), `${path}: trusted stage contains historical root command`);
  assert.equal(candidate, composeCandidateCi(trusted), `${path}: composed state or remainder mismatch`);
  validateOrdinaryCiActionPins(candidate);
  assert.equal(candidate.split(TRUSTED_CI_ACQUISITION).length - 1, 1,
    `${path}: trusted fragment missing or duplicated`);
  removeTwoStageCustodyFragment(candidate);
  assert.equal(candidate.split(REQUIRED_CI_ADDITION).length - 1, 1,
    `${path}: candidate fragment missing or duplicated`);
  const candidateDataIndex = candidate.indexOf(REQUIRED_CI_ADDITION);
  for (const authorityMarker of [
    "      - name: Acquire exact immutable P1-A ancestry authority",
    "      - name: Construct exact trusted-reconciliation authority store",
  ]) {
    const authorityIndex = candidate.indexOf(authorityMarker);
    assert.ok(authorityIndex >= 0 && authorityIndex < candidateDataIndex,
      `${path}: candidate validation precedes ${authorityMarker.trim()}`);
  }
  const cleanupIndex = candidate.indexOf("      - name: Remove isolated P1-A authority checkouts");
  assert.ok(cleanupIndex > candidateDataIndex, `${path}: authority cleanup precedes candidate validation`);
  for (const forbidden of [
    "P1A_RUNTIME_APP_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----", "pull_request_target", "node candidate/",
    "continue-on-error:", "permissions:\n  contents: write", "fetch-depth: 0",
  ]) assert.ok(!candidate.includes(forbidden), `${path}: forbidden ${forbidden}`);
  assert.ok(!/\$\{\{\s*secrets\s*\./.test(candidate), `${path}: protected secret reference`);
  for (const required of [
    "node scripts/validate-p1a-threat-model.mjs --candidate-data-only",
    "node scripts/test-p1a-trusted-verifier.mjs",
    "node scripts/test-p1a-ci-secret-detector.mjs",
    "node scripts/detect-p1a-ordinary-ci-secrets.mjs",
    "P1-A private cross-repository suites are intentionally unavailable",
  ]) assert.ok(candidate.includes(required), `${path}: missing ${required}`);
  assert.ok(!candidate.includes("pnpm test:p1a-threat-model"),
    `${path}: historical suite cannot execute from reconciled root`);
  return Object.freeze({
    baselineBlob: COMPOSED_CI_BASE_BLOB,
    trustedBlob: blobAt(git, workflowSha, path),
    candidateBlob: blobAt(git, candidateSha, path),
  });
}

export function validateCandidateDataOnly({
  repoRoot = candidateRoot,
  candidateSha,
  ancestryAuthorityRoot = process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
  trustedReconciliationAuthorityRoot = process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
} = {}) {
  const checks = [];
  const check = (name, operation) => {
    operation();
    checks.push(name);
  };
  exactSha(candidateSha, "candidate");
  check("candidate_identity", () => {
    assert.equal(gitAt(repoRoot, "rev-parse", "HEAD"), candidateSha);
    assert.equal(gitAt(repoRoot, "cat-file", "-t", candidateSha), "commit");
    assert.equal(
      normalizeRepository(gitAt(repoRoot, "remote", "get-url", "origin")),
      "https://github.com/DarksiedCEO/zbestmedia",
    );
  });
  const parents = gitAt(repoRoot, "show", "-s", "--format=%P", candidateSha).split(" ");
  check("ordered_parentage", () => {
    assert.equal(parents.length, 2, "candidate must have exactly two parents");
    assert.equal(parents[0], ORIGINAL_CANDIDATE, "first parent is not original candidate");
    assert.match(parents[1], /^[0-9a-f]{40}$/, "trusted parent is not immutable");
  });
  const trustedParent = parents[1];
  check("required_ancestry", () => {
    verifyCanonicalBoundedAncestry({ ancestryAuthorityRoot });
    verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot });
    gitAt(repoRoot, "merge-base", "--is-ancestor", TRUSTED_RECONCILIATION_BASE, trustedParent);
    gitAt(repoRoot, "merge-base", "--is-ancestor", ORIGINAL_CANDIDATE, candidateSha);
    gitAt(repoRoot, "merge-base", "--is-ancestor", trustedParent, candidateSha);
  });
  check("exact_scope", () => {
    const changed = gitAt(repoRoot, "diff", "--name-only", `${trustedParent}..${candidateSha}`)
      .split("\n").filter(Boolean).sort();
    assert.deepEqual(changed, [...CANDIDATE_OWNED_FILES].sort());
  });
  check("candidate_blob_identity", () => {
    for (const file of EXACT_CANDIDATE_OWNED_FILES) {
      assert.equal(gitAt(repoRoot, "rev-parse", `${candidateSha}:${file}`),
        gitAt(repoRoot, "rev-parse", `${ORIGINAL_CANDIDATE}:${file}`), file);
    }
  });
  check("trusted_blob_identity", () => {
    for (const file of TRUSTED_INFRASTRUCTURE_FILES) {
      if (file === ".github/workflows/ci.yml") continue;
      assert.equal(gitAt(repoRoot, "rev-parse", `${candidateSha}:${file}`),
        gitAt(repoRoot, "rev-parse", `${trustedParent}:${file}`), file);
    }
  });
  check("ordinary_ci_composition", () => {
    const git = (...args) => gitAt(repoRoot, ...args);
    validateComposedCandidateCi(git, candidateSha, trustedParent);
  });
  check("candidate_documents", () => {
    const packageLoad = (file) => JSON.parse(readFileSync(path.join(repoRoot, file), "utf8"));
    const model = packageLoad("docs/security/p1-a/model.json");
    const evidence = packageLoad("docs/security/p1-a/evidence-register.json");
    const manifest = packageLoad("docs/security/p1-a/validation-manifest.json");
    const markdown = readFileSync(path.join(repoRoot, "docs/security/p1-a/threat-model.md"), "utf8");
    validateData(model, evidence, manifest, markdown);
    assert.deepEqual(manifest.requiredTests, REQUIRED_CHECKS);
    assert.deepEqual(model.gate, {
      runtimeChanged: false, productionClaimed: false, p1bAuthorized: false, selfCertified: false,
    });
  });
  check("custody_separation", () => {
    assert.ok(!process.env.P1A_WORKFLOW_SHA, "candidate cannot select workflow SHA");
    assert.ok(!process.env.P1A_VERIFIER_SHA, "candidate cannot select verifier SHA");
    assert.ok(!process.env.P1A_RUNTIME_APP_PRIVATE_KEY, "protected credential present");
    if (process.env.P1A_TRUSTED_EXECUTION_ROOT) {
      assert.notEqual(path.resolve(repoRoot), path.resolve(process.env.P1A_TRUSTED_EXECUTION_ROOT));
    }
  });
  assert.equal(gitAt(repoRoot, "status", "--porcelain"), "", "dirty candidate worktree");
  return Object.freeze({
    scope: "CANDIDATE_DATA_VALIDATED", candidateSha, required: checks.length,
    executed: checks.length, passed: checks.length, failed: 0, skipped: 0,
    cancelled: 0, neutral: 0, stale: 0, notVerified: 0, notRun: 0,
    certified: false, protectedOperations: 0,
  });
}

export function validateDualBaseScope({
  git,
  candidateSha,
  evidenceBaseSha,
  reconciliationBaseSha,
  originalCandidateSha,
  workflowSha,
  ancestryAuthorityRoot = process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
  trustedReconciliationAuthorityRoot = process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
}) {
  for (const [label, value, expected] of [
    ["evidence/model base", evidenceBaseSha, AUTHORIZED_BASE],
    ["trusted reconciliation base", reconciliationBaseSha, TRUSTED_RECONCILIATION_BASE],
    ["original candidate", originalCandidateSha, ORIGINAL_CANDIDATE],
  ]) {
    assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} SHA absent`);
    assert.equal(value, expected, `${label} identity mismatch`);
    assert.equal(git("cat-file", "-t", value), "commit", `${label} is not a commit`);
  }
  assert.match(candidateSha ?? "", /^[0-9a-f]{40}$/, "candidate SHA absent");
  assert.match(workflowSha ?? "", /^[0-9a-f]{40}$/, "workflow SHA absent");
  assert.equal(git("cat-file", "-t", candidateSha), "commit", "candidate is not a commit");
  assert.equal(git("cat-file", "-t", workflowSha), "commit", "workflow is not a commit");
  verifyCanonicalBoundedAncestry({
    ancestryAuthorityRoot,
    evidenceBaseSha,
    originalCandidateSha,
    authorizedBoundarySha: evidenceBaseSha,
  });
  verifyCanonicalTrustedReconciliationAncestry({
    trustedReconciliationAuthorityRoot,
    evidenceBaseSha,
    originalCandidateSha: reconciliationBaseSha,
    authorizedBoundarySha: evidenceBaseSha,
  });
  git("merge-base", "--is-ancestor", reconciliationBaseSha, workflowSha);
  git("merge-base", "--is-ancestor", workflowSha, candidateSha);
  git("merge-base", "--is-ancestor", originalCandidateSha, candidateSha);

  const historical = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${evidenceBaseSha}..${originalCandidateSha}`,
  );
  assert.deepEqual(historical, [...AUTHORIZED_CANDIDATE_FILES].sort(),
    "historical evidence/model scope mismatch");
  const trusted = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${evidenceBaseSha}..${reconciliationBaseSha}`,
  );
  assert.deepEqual(trusted, [...TRUSTED_INFRASTRUCTURE_FILES].sort(),
    "trusted infrastructure scope mismatch");
  const amendment = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${reconciliationBaseSha}..${workflowSha}`,
  );
  assert.deepEqual(amendment, [...AMENDMENT_CONTROLLED_FILES].sort(),
    "trusted amendment scope mismatch");
  const reconciled = gitLines(
    git,
    "diff", "--name-only", "--diff-filter=ACMRTD",
    `${reconciliationBaseSha}..${candidateSha}`,
  );
  assert.deepEqual(reconciled, [...new Set([...AMENDMENT_CONTROLLED_FILES, ...CANDIDATE_OWNED_FILES])].sort(),
    "reconciled candidate scope mismatch");

  for (const file of TRUSTED_INFRASTRUCTURE_FILES) {
    if (file === ".github/workflows/ci.yml") continue;
    const authority = AMENDMENT_CONTROLLED_FILES.includes(file) ? workflowSha : reconciliationBaseSha;
    assert.equal(blobAt(git, candidateSha, file), blobAt(git, authority, file),
      `${file}: trusted blob identity mismatch`);
  }
  for (const file of AMENDMENT_CONTROLLED_FILES) {
    if (file === ".github/workflows/ci.yml") continue;
    assert.equal(blobAt(git, candidateSha, file), blobAt(git, workflowSha, file),
      `${file}: amended trusted blob identity mismatch`);
  }
  for (const file of EXACT_CANDIDATE_OWNED_FILES) {
    const expected = blobAt(git, originalCandidateSha, file);
    assert.ok(expected, `${file}: original candidate blob absent`);
    assert.equal(blobAt(git, candidateSha, file), expected,
      `${file}: candidate evidence blob identity mismatch`);
  }
  validateComposedCandidateCi(git, candidateSha, workflowSha);
  return { historical, trusted, amendment, reconciled };
}

function validateGitScope(manifest, candidateSha) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: candidateRoot,
      encoding: "utf8",
    }).trim();
  assert.equal(git("rev-parse", "HEAD"), candidateSha);
  validateDualBaseScope({
    git,
    candidateSha,
    evidenceBaseSha: process.env.P1A_EVIDENCE_BASE_SHA,
    reconciliationBaseSha: process.env.P1A_RECONCILIATION_BASE_SHA,
    originalCandidateSha: process.env.P1A_ORIGINAL_CANDIDATE_SHA,
    workflowSha: process.env.P1A_WORKFLOW_SHA,
    ancestryAuthorityRoot: process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
  });
  for (const file of CANDIDATE_OWNED_FILES) {
    const stat = lstatSync(path.join(candidateRoot, file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `${file}: unsafe`);
  }
  assert.equal(git("status", "--porcelain"), "", "candidate worktree dirty");
}

function evidenceDigest() {
  const files = [
    "docs/security/p1-a/model.json",
    "docs/security/p1-a/evidence-register.json",
    "docs/security/p1-a/validation-manifest.json",
    "docs/security/p1-a/threat-model.md",
  ];
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(path.join(candidateRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function runCheck(name, context) {
  const { model, evidence, manifest, markdown, candidateSha } = context;
  switch (name) {
    case "manifest_identity":
      validateManifest(model, evidence, manifest);
      return;
    case "trust_anchor":
      assert.equal(process.env.P1A_TRUST_BASE_SHA, AUTHORIZED_BASE);
      assert.equal(process.env.P1A_EVIDENCE_BASE_SHA, AUTHORIZED_BASE);
      assert.equal(process.env.P1A_RECONCILIATION_BASE_SHA, TRUSTED_RECONCILIATION_BASE);
      assert.equal(process.env.P1A_ORIGINAL_CANDIDATE_SHA, ORIGINAL_CANDIDATE);
      assert.equal(process.env.P1A_TRUST_RUNTIME_PIN, AUTHORIZED_RUNTIME);
      return;
    case "file_scope":
      validateGitScope(manifest, candidateSha);
      return;
    case "evidence_integrity":
      validateManifest(model, evidence, manifest);
      return;
    case "evidence_binding":
      validateEvidenceBinding(evidence, manifest, {
        specGitDir: process.env.P1A_SPEC_GIT_DIR,
        runtimeGitDir: process.env.P1A_RUNTIME_GIT_DIR,
      });
      context.authenticationState = assertAuthenticationStatus(
        manifest.crossRepositoryCiAuthentication,
        "VERIFIED",
      );
      return;
    case "required_coverage":
      assert.equal(model.actors.length, 22);
      assert.equal(model.actions.length, 28);
      assert.equal(model.threats.length, 31);
      assert.equal(model.controls.length, 13);
      return;
    case "id_uniqueness":
      for (const rows of [
        model.actors,
        model.actions,
        model.assets,
        model.boundaries,
        model.flows,
        model.controls,
        model.threats,
        model.escalationChains,
      ]) {
        unique(rows.map((item) => item.id), "model IDs");
      }
      return;
    case "cross_references": {
      const evidenceIds = new Set(evidence.references.map((item) => item.id));
      for (const threat of model.threats) {
        assert.ok(threat.evidenceRefs.length && threat.controlIds.length);
        for (const id of threat.evidenceRefs) assert.ok(evidenceIds.has(id));
      }
      return;
    }
    case "authority_completeness":
      assert.equal(model.authorityPolicy.rules.length, 616);
      unique(
        model.authorityPolicy.rules.map(
          (rule) => `${rule.actorId}:${rule.actionId}`,
        ),
        "authority pairs",
      );
      return;
    case "separation_rules":
      assert.equal(model.authorityPolicy.separationRules.length, 9);
      assert.equal(model.gate.selfCertified, false);
      return;
    case "tenant_operations":
      assert.equal(model.tenantOperations.length, 18);
      assert.equal(model.tenantPropagation.length, 7);
      assert.equal(model.tenantOperationPolicy.denialBehavior, "DENY_AND_LOG");
      return;
    case "credential_custody":
      assert.equal(model.credentialClasses.length, 10);
      assert.equal(model.credentialPolicy.readerActorIds.length, 0);
      return;
    case "escalation_completeness":
      assert.equal(model.escalationChains.length, model.threats.length);
      unique(
        model.escalationChains.map((item) => item.detectionSignal),
        "detection signals",
      );
      return;
    case "documentation_consistency": {
      const match = markdown.match(/```json p1a-summary\n([^\n]+)\n```/);
      assert.ok(match, "documentation summary absent");
      const summary = JSON.parse(match[1]);
      assert.equal(summary.authorityRules, 616);
      assert.equal(summary.threats, 31);
      assert.equal(summary.controls, 13);
      return;
    }
    case "negative_controls": {
      const trustedControls = readFileSync(
        path.join(moduleRoot, "scripts/test-p1a-trusted-verifier.mjs"),
        "utf8",
      );
      const dualBaseControls = readFileSync(
        path.join(moduleRoot, "scripts/test-p1a-dual-base-verifier.mjs"),
        "utf8",
      );
      for (const id of [
        "declared_not_proven_while_verified",
        "declared_verified_while_not_verified",
        "missing_runtime_store",
        "path_traversal",
        "encoded_traversal",
        "impossible_range",
        "blob_substitution",
        "workflow_sha_substitution",
        "candidate_scope_expansion",
        "secret_in_untrusted_workflow",
      ]) {
        assert.ok(trustedControls.includes(id), `missing protected control ${id}`);
      }
      for (const id of [
        "dual_base_valid_reconciliation",
        "wrong_evidence_model_base",
        "candidate_modifies_trusted_verifier",
      ]) {
        assert.ok(dualBaseControls.includes(id), `missing dual-base control ${id}`);
      }
      return;
    }
    default:
      throw new Error(`unknown required check ${name}`);
  }
}

function main() {
  if (process.argv.includes("--candidate-data-only")) {
    const summary = validateCandidateDataOnly({ candidateSha: process.env.P1A_CANDIDATE_SHA });
    console.log(JSON.stringify(summary));
    return;
  }
  const candidateIndex = process.argv.indexOf("--candidate-sha");
  const candidateSha =
    candidateIndex >= 0
      ? process.argv[candidateIndex + 1]
      : process.env.P1A_CANDIDATE_SHA;
  const { workflowSha, verifierSha, verifierBlobSha } =
    validateTrustedIdentity();
  const model = load("docs/security/p1-a/model.json");
  const evidence = load("docs/security/p1-a/evidence-register.json");
  const manifest = load("docs/security/p1-a/validation-manifest.json");
  const markdown = readFileSync(
    path.join(candidateRoot, "docs/security/p1-a/threat-model.md"),
    "utf8",
  );
  const context = {
    model,
    evidence,
    manifest,
    markdown,
    candidateSha,
    authenticationState: "NOT_VERIFIED",
  };
  const totals = {
    required: REQUIRED_CHECKS.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    neutral: 0,
    stale: 0,
    notVerified: 0,
    notRun: 0,
  };
  for (const name of REQUIRED_CHECKS) {
    totals.executed += 1;
    try {
      runCheck(name, context);
      totals.passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      if (error?.notVerified) {
        totals.notVerified += 1;
        console.error(`NOT_VERIFIED ${name}: ${error.message}`);
      } else {
        totals.failed += 1;
        console.error(`FAIL ${name}: ${error.message}`);
      }
    }
  }
  const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
  console.log(
    JSON.stringify({
      suite: "p1-a-trusted-certification",
      workflowSha,
      verifierSha,
      verifierBlobSha,
      verifierDigest: sha256(verifierBytes),
      candidateSha,
      baseSha: AUTHORIZED_BASE,
      evidenceBaseSha: AUTHORIZED_BASE,
      reconciliationBaseSha: TRUSTED_RECONCILIATION_BASE,
      originalCandidateSha: ORIGINAL_CANDIDATE,
      runtimePin: AUTHORIZED_RUNTIME,
      evidenceDigest: evidenceDigest(),
      crossRepositoryCiAuthentication: context.authenticationState,
      ...totals,
      authorityRules: model.authorityPolicy.rules.length,
      threats: model.threats.length,
      controls: model.controls.length,
    }),
  );
  if (
    totals.executed !== totals.required ||
    totals.passed !== totals.required ||
    totals.failed ||
    totals.skipped ||
    totals.cancelled ||
    totals.neutral ||
    totals.stale ||
    totals.notVerified ||
    totals.notRun
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
