import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
      reconciliationBaseSha, originalCandidateSha,
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

const REQUIRED_CI_ADDITION = [
  "      - name: P1-A validator control suite (hermetic)",
  "        run: pnpm test:p1a-threat-model",
  "",
  "",
].join("\n");

const CI_CHECKOUT_REF =
  "          ref: ${{ github.event.pull_request.head.sha || github.sha }}\n";
const TRUSTED_CI_CHECKOUT =
  `${CI_CHECKOUT_REF}          persist-credentials: false\n`;
const TRUSTED_CI_ACQUISITION = `      - name: Acquire exact original P1-A candidate object
        uses: actions/checkout@v4
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
          git fetch --no-tags --no-write-fetch-head .p1a-original-candidate "$P1A_ORIGINAL_CANDIDATE"
          test "$(git cat-file -t "$P1A_ORIGINAL_CANDIDATE")" = "commit"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE^{commit}")" = "$P1A_ORIGINAL_CANDIDATE"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/model.json")" = "$P1A_ORIGINAL_MODEL_BLOB"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/evidence-register.json")" = "$P1A_ORIGINAL_EVIDENCE_BLOB"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/validation-manifest.json")" = "$P1A_ORIGINAL_MANIFEST_BLOB"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE:docs/security/p1-a/threat-model.md")" = "$P1A_ORIGINAL_MARKDOWN_BLOB"
          test "$(git rev-parse "$P1A_ORIGINAL_CANDIDATE:scripts/test-p1a-threat-model.mjs")" = "$P1A_ORIGINAL_TEST_BLOB"
          rm -rf .p1a-original-candidate
          test ! -e .p1a-original-candidate

`;
const CI_IDENTITY_MARKER =
  "      - name: P1-A trusted-bootstrap exact-SHA identity";
const CI_TRUSTED_VERIFIER_MARKER =
  "      - name: P1-A trusted verifier controls";

function replaceExactlyOnce(source, fragment, replacement, label) {
  assert.equal(source.split(fragment).length - 1, 1, `${label}: fragment count mismatch`);
  return source.replace(fragment, replacement);
}

export function composeTrustedCi(baseline) {
  const readOnlyCheckout = replaceExactlyOnce(
    baseline, CI_CHECKOUT_REF, TRUSTED_CI_CHECKOUT, "trusted checkout",
  );
  return replaceExactlyOnce(
    readOnlyCheckout,
    CI_TRUSTED_VERIFIER_MARKER,
    `${TRUSTED_CI_ACQUISITION}${CI_TRUSTED_VERIFIER_MARKER}`,
    "trusted acquisition placement",
  );
}

export function composeCandidateCi(baseline) {
  return replaceExactlyOnce(
    baseline,
    CI_IDENTITY_MARKER,
    `${REQUIRED_CI_ADDITION}${CI_IDENTITY_MARKER}`,
    "candidate hermetic placement",
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
  const baseline = `${git("show", `${COMPOSED_CI_BASE}:${path}`)}\n`;
  const trusted = `${git("show", `${workflowSha}:${path}`)}\n`;
  const candidate = `${git("show", `${candidateSha}:${path}`)}\n`;
  assert.equal(trusted, composeTrustedCi(baseline), `${path}: trusted stage mismatch`);
  assert.equal(candidate, composeFinalCi(baseline), `${path}: composed state or remainder mismatch`);
  assert.equal(candidate.split(TRUSTED_CI_ACQUISITION).length - 1, 1,
    `${path}: trusted fragment missing or duplicated`);
  assert.equal(candidate.split(REQUIRED_CI_ADDITION).length - 1, 1,
    `${path}: candidate fragment missing or duplicated`);
  for (const forbidden of [
    "P1A_RUNTIME_APP_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----", "pull_request_target", "node candidate/",
    "continue-on-error:", "permissions:\n  contents: write", "fetch-depth: 0",
  ]) assert.ok(!candidate.includes(forbidden), `${path}: forbidden ${forbidden}`);
  assert.ok(!/\$\{\{\s*secrets\s*\./.test(candidate), `${path}: protected secret reference`);
  for (const required of [
    "pnpm test:p1a-threat-model", "node scripts/test-p1a-trusted-verifier.mjs",
    "node scripts/test-p1a-ci-secret-detector.mjs",
    "node scripts/detect-p1a-ordinary-ci-secrets.mjs",
    "P1-A private cross-repository suites are intentionally unavailable",
  ]) assert.ok(candidate.includes(required), `${path}: missing ${required}`);
  return Object.freeze({
    baselineBlob: COMPOSED_CI_BASE_BLOB,
    trustedBlob: blobAt(git, workflowSha, path),
    candidateBlob: blobAt(git, candidateSha, path),
  });
}

export function validateDualBaseScope({
  git,
  candidateSha,
  evidenceBaseSha,
  reconciliationBaseSha,
  originalCandidateSha,
  workflowSha,
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
  git("merge-base", "--is-ancestor", evidenceBaseSha, originalCandidateSha);
  git("merge-base", "--is-ancestor", evidenceBaseSha, reconciliationBaseSha);
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
