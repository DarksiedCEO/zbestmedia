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
export const CURRENT_TRUSTED_BASE =
  "1648d21e78088a8e0df4bb2eac7bde797d4ac665";
export const CURRENT_TRUSTED_BASE_TREE =
  "588f349716dc51c39b2ababd1dd94be5871761bf";
export const CURRENT_TRUSTED_BASE_PARENTS = Object.freeze([
  "2f4baca937ef8b36d1560a010e8e7f430819197c",
  "f939fa7e8561477a42e8edb0249fd18642577976",
]);
export const POST_PR17_TRUSTED_BASE =
  "48c688099e42065820f9f5c983fed41d5d0d1cf8";
export const POST_PR17_TRUSTED_BASE_TREE =
  "49ada2924c4cb05d48306c26f9538895c8b50817";
export const POST_PR17_TRUSTED_BASE_PARENTS = Object.freeze([
  CURRENT_TRUSTED_BASE,
  "833e812b10e8ff15beda1177c9c85056f1eddfc8",
]);
export const POST_PR18_TRUSTED_BASE =
  "4d14255f6665851d4930d450d5cd26509ef8ea23";
export const POST_PR18_TRUSTED_BASE_TREE =
  "401b8f92ef8366f50075144ec88cb16f8f3cc78a";
export const POST_PR18_TRUSTED_BASE_PARENTS = Object.freeze([
  POST_PR17_TRUSTED_BASE,
  "2f84098473db672eabdf67a7009e2e87202aa5b1",
]);
export const POST_PR19_TRUSTED_BASE =
  "d568774d37b5f2543ece72c6e9482dd187d9f389";
export const POST_PR19_TRUSTED_BASE_TREE =
  "dc6995008c675fbdcade5e5436869debc42af2c8";
export const POST_PR19_TRUSTED_BASE_PARENTS = Object.freeze([
  POST_PR18_TRUSTED_BASE,
  "65880c7ad8086639596939866cbfdc5faefe3509",
]);
export const EVENT_BOUND_TARGET_REPOSITORY = "DarksiedCEO/zbestmedia";
export const CURRENT_TRUSTED_WORKFLOW_SHA =
  "94941bbf6afbd0073f6619b2c63b0e6c5c6ca4e8";
export const CURRENT_TRUSTED_WORKFLOW_BLOB =
  "a1066580b0b477cf17c53f5c11ebefcedac0a883";
export const EVENT_BOUND_AMENDMENT_CLASS_A_FILES = Object.freeze([
  ".github/workflows/ci.yml",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
export const EVENT_BOUND_AMENDMENT_CLASS_B_FILES = Object.freeze([
  ".github/workflows/ci.yml",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
// Backward-compatible name for the original event-topology remediation class.
export const EVENT_BOUND_AMENDMENT_FILES = EVENT_BOUND_AMENDMENT_CLASS_A_FILES;
export const EVENT_BOUND_AMENDMENT_CLASSES = Object.freeze([
  Object.freeze({
    id: "EVENT_TOPOLOGY_SYNTHETIC_FIXTURE",
    files: EVENT_BOUND_AMENDMENT_CLASS_A_FILES,
  }),
  Object.freeze({
    id: "FINAL_RECONCILIATION_TRUSTED_WORKFLOW_ACQUISITION",
    files: EVENT_BOUND_AMENDMENT_CLASS_B_FILES,
  }),
]);

function classifyEventBoundAmendmentFiles(files, label) {
  const actual = [...files].sort();
  const matches = EVENT_BOUND_AMENDMENT_CLASSES.filter(({ files: authorized }) =>
    actual.length === authorized.length &&
    actual.every((file, index) => file === [...authorized].sort()[index]));
  assert.equal(matches.length, 1,
    `${label}: scope must match exactly one trusted remediation class`);
  return matches[0].id;
}
export const COMPOSED_CI_BASE =
  "06e6497ac3420998671f255a42a20d8cb8b9ca50";
export const COMPOSED_CI_BASE_BLOB =
  "9a3f1a04f99e83d9dad84cf384d86117a7d282f1";
export const ORIGINAL_CANDIDATE =
  "365c59757756f3f91480d3bfeb841b543010201f";
export const ORIGINAL_EVIDENCE_REGISTER_BLOB =
  "205dc5451bfc639bdfcbd58d380e11439e6f9764";
export const CURRENT_TRUSTED_TARGET_CODEOWNERS_BLOB =
  "894435d1c6e92bd0a678a72f06fcec04815a18a4";
export const GENERATION_1_RECONCILIATION =
  "2d4884e5d927182209e7d7eb3a93296401576778";
export const GENERATION_1_RECONCILIATION_TREE =
  "7377768c799d4fcc163acb5f0b9c8bae7e09fd6d";
export const GENERATION_1_RECONCILIATION_PARENTS = Object.freeze([
  ORIGINAL_CANDIDATE,
  "bce95a11fb18b2d4539a555ae686c2fe083e5970",
]);
export const CURRENT_TRUSTED_TARGET =
  "b0c1b2129123b941c6a350c16dae0ae3a8e076ca";
export const CURRENT_TRUSTED_TARGET_CI_BLOB =
  "e5c469125577b22d9b96ea81502bb67d354a3ab4";
export const CURRENT_TRUSTED_TARGET_TREE =
  "c8fe6f31288bffcf1b8c35a825c60c6a5d31703d";
export const CURRENT_TRUSTED_TARGET_PARENTS = Object.freeze([
  "94941bbf6afbd0073f6619b2c63b0e6c5c6ca4e8",
  "03eeb8bd04850fc211ca61d1c591b8c6cec905b1",
]);
export const GENERATION_2_RECONCILIATION =
  "9fa0c2ac5b0b42a885330c7d7d54df65afae3736";
export const GENERATION_2_RECONCILIATION_TREE =
  "feb82b29b0c0ee6b6ed8dbf6f58e2349d68fc713";
export const GENERATION_2_RECONCILIATION_PARENTS = Object.freeze([
  GENERATION_1_RECONCILIATION,
  CURRENT_TRUSTED_TARGET,
]);
export const GENERATION_2_FIRST_REMEDIATION =
  "e7bc2cc630d7b49c7333e9431bad54b1193aae14";
export const GENERATION_2_SECOND_REMEDIATION =
  "b5f7e14872fb1ceff9664ad3023af86c0eca5eef";
export const GENERATION_2_THIRD_REMEDIATION =
  "172ff1dde7082f0c408ab595f02b08d51e2e57d6";
export const GENERATION_2_FOURTH_REMEDIATION =
  "16b426a047ef75d06a0df4b62cac76b28ec8e5f8";
export const GENERATION_2_FIFTH_REMEDIATION =
  "f8b9d3cc9d2e2a92ea41662bca64d61b0f097326";
export const GENERATION_2_SIXTH_REMEDIATION =
  "6c95cac5f28ed55cacbd21e512a6745aa7a73b94";
export const GENERATION_2_SEVENTH_REMEDIATION =
  "586f285df9d770825d9fe6aee893a74fdb99e294";
export const GENERATION_2_EIGHTH_REMEDIATION =
  "66e5616fbf448e58526d81af5530bc60812c8727";
export const GENERATION_2_NINTH_REMEDIATION =
  "bac62f20ebfec8602718023418552f50e8d6616e";
export const GENERATION_2_TENTH_REMEDIATION =
  "098da9abb3c9add8c9aeeb9255b834e2f75f0b0a";
export const GENERATION_2_ELEVENTH_REMEDIATION =
  "faed8e5cca47d46643e4f3fdfdf4120242495fcf";
export const GENERATION_2_REMEDIATION_PREFIX = Object.freeze([
  GENERATION_2_FIRST_REMEDIATION,
  GENERATION_2_SECOND_REMEDIATION,
  GENERATION_2_THIRD_REMEDIATION,
  GENERATION_2_FOURTH_REMEDIATION,
  GENERATION_2_FIFTH_REMEDIATION,
  GENERATION_2_SIXTH_REMEDIATION,
  GENERATION_2_SEVENTH_REMEDIATION,
  GENERATION_2_EIGHTH_REMEDIATION,
  GENERATION_2_NINTH_REMEDIATION,
  GENERATION_2_TENTH_REMEDIATION,
  GENERATION_2_ELEVENTH_REMEDIATION,
]);

export const AUTHORIZED_CANDIDATE_CLEANLINESS_ROOTS = Object.freeze([
  ".p1a-original-candidate",
  ".p1a-trusted-baseline",
  ".p1a-dual-base-authority",
  ".p1a-evidence-base-authority",
  ".p1a-ancestry-authority",
  ".p1a-trusted-reconciliation-authority",
  ".p1a-pr16-remediation-chain-authority",
  ".p1a-pr16-chain-staging-action-inventory",
  ".p1a-pr16-chain-staging-original-amendment",
  ".p1a-pr16-chain-staging-rejected-chain",
  ".p1a-pr16-chain-staging-rejected-cleanliness",
  ".p1a-pr16-chain-staging-trusted-base",
  ".p1a-pr16-chain-staging-current-predecessor",
  ".p1a-pr16-chain-staging-minimum-depth",
  ".p1a-current-trusted-target-authority",
  ".p1a-generation2-anchor-authority",
]);
export const GENERATION_2_CONTROL_FILES = Object.freeze([
  "scripts/test-p1a-dual-base-verifier.mjs",
  "scripts/test-p1a-trusted-verifier.mjs",
  "scripts/validate-p1a-threat-model.mjs",
]);
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

function exactCommitMetadata(git, sha, label) {
  exactSha(sha, label);
  const lines = git("cat-file", "commit", sha).split("\n");
  const tree = lines.find((line) => line.startsWith("tree "))?.slice(5);
  exactSha(tree, `${label} tree`);
  const parents = lines.filter((line) => line.startsWith("parent "))
    .map((line) => line.slice(7));
  parents.forEach((parent) => exactSha(parent, `${label} parent`));
  return Object.freeze({ tree, parents: Object.freeze(parents) });
}

function parseCandidateStatus(status) {
  assert.equal(typeof status, "string", "candidate cleanliness status must be text");
  return status.split("\0").filter(Boolean).map((record) => {
    assert.ok(record.length >= 4 && record[2] === " ",
      "candidate cleanliness status entry malformed");
    return Object.freeze({ code: record.slice(0, 2), path: record.slice(3) });
  });
}

function isExactAuthorityPath(candidatePath, authorizedRoot) {
  assert.equal(path.posix.normalize(candidatePath), candidatePath,
    "candidate cleanliness path is non-canonical");
  return candidatePath === authorizedRoot || candidatePath.startsWith(`${authorizedRoot}/`);
}

export function assertCandidateSourceClean(
  repoRoot,
  authorityRoots = AUTHORIZED_CANDIDATE_CLEANLINESS_ROOTS,
) {
  assert.equal(new Set(authorityRoots).size, AUTHORIZED_CANDIDATE_CLEANLINESS_ROOTS.length,
    "candidate cleanliness authority inventory must be exact and unique");
  assert.deepEqual(authorityRoots, AUTHORIZED_CANDIDATE_CLEANLINESS_ROOTS,
    "candidate-selected cleanliness authority inventory forbidden");
  const status = execFileSync(
    "git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  for (const entry of parseCandidateStatus(status)) {
    assert.equal(entry.code, "??",
      `tracked, staged, deleted, renamed, copied, or conflicted candidate path: ${entry.path}`);
    const matches = authorityRoots.filter((rootPath) => isExactAuthorityPath(entry.path, rootPath));
    assert.equal(matches.length, 1, `unexpected untracked candidate path: ${entry.path}`);
    const authorityRoot = path.join(repoRoot, matches[0]);
    assert.ok(existsSync(authorityRoot), `trusted workflow authority root absent: ${matches[0]}`);
    assert.equal(lstatSync(authorityRoot).isSymbolicLink(), false,
      `trusted workflow authority root cannot be a symlink: ${matches[0]}`);
    let current = authorityRoot;
    for (const segment of path.posix.relative(matches[0], entry.path).split("/").filter(Boolean)) {
      current = path.join(current, segment);
      if (existsSync(current)) {
        assert.equal(lstatSync(current).isSymbolicLink(), false,
          `trusted workflow authority descendant cannot be a symlink: ${entry.path}`);
      }
    }
  }
}

function gitBufferAt(repoRoot, ...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizeRepository(value) {
  return value
    ?.replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

export function parseTreeManifest(raw, label = "tree manifest") {
  assert.ok(Buffer.isBuffer(raw), `${label}: buffer required`);
  const records = raw.length === 0
    ? []
    : raw.toString("utf8").split("\0").slice(0, -1);
  assert.ok(raw.length === 0 || raw.at(-1) === 0,
    `${label}: missing NUL terminator`);
  const manifest = new Map();
  for (const record of records) {
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
    assert.ok(match, `${label}: malformed record`);
    const [, mode, type, objectSha, objectPath] = match;
    assertSafeRepoPath(objectPath, `${label} path`);
    assert.ok(!manifest.has(objectPath), `${label}: duplicate path ${objectPath}`);
    manifest.set(objectPath, Object.freeze({ mode, type, objectSha }));
  }
  return manifest;
}

export function readTreeManifest({ authorityRoot, commitSha, label } = {}) {
  assert.ok(authorityRoot, `${label}: authority root absent`);
  exactSha(commitSha, `${label} commit`);
  const resolved = realpathSync(path.resolve(authorityRoot));
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia", `${label}: repository mismatch`);
  assert.equal(gitAt(resolved, "cat-file", "-t", commitSha), "commit",
    `${label}: commit absent`);
  const gitDir = gitAt(resolved, "rev-parse", "--absolute-git-dir");
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    `${label}: alternates forbidden`);
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  `${label}: grafts forbidden`);
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    `${label}: replace refs forbidden`);
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    `${label}: persisted credentials forbidden`);
  return parseTreeManifest(
    gitBufferAt(resolved, "ls-tree", "-r", "--full-tree", "-z", commitSha),
    label,
  );
}

export function compareTreeManifests(trustedManifest, candidateManifest) {
  assert.ok(trustedManifest instanceof Map, "trusted manifest: Map required");
  assert.ok(candidateManifest instanceof Map, "candidate manifest: Map required");
  const paths = [...new Set([...trustedManifest.keys(), ...candidateManifest.keys()])].sort();
  return paths.map((objectPath) => {
    const trusted = trustedManifest.get(objectPath);
    const candidate = candidateManifest.get(objectPath);
    let status;
    if (!trusted) status = "ADDED";
    else if (!candidate) status = "DELETED";
    else if (trusted.mode === candidate.mode && trusted.type === candidate.type &&
      trusted.objectSha === candidate.objectSha) status = "UNCHANGED";
    else status = "MODIFIED";
    return Object.freeze({ path: objectPath, status, trusted, candidate });
  });
}

export function verifyExactCurrentTrustedBaseTopology({ trustedBaseRoot } = {}) {
  assert.ok(trustedBaseRoot, "trusted-base topology: independent source absent");
  const resolved = realpathSync(path.resolve(trustedBaseRoot));
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia", "trusted-base topology: repository mismatch");
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), CURRENT_TRUSTED_BASE,
    "trusted-base topology: exact merge SHA mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", CURRENT_TRUSTED_BASE), "commit",
    "trusted-base topology: commit object absent");
  const metadata = exactCommitMetadata((...args) => gitAt(resolved, ...args),
    CURRENT_TRUSTED_BASE, "trusted-base topology");
  assert.equal(metadata.tree,
    CURRENT_TRUSTED_BASE_TREE, "trusted-base topology: tree mismatch");
  assert.deepEqual([...metadata.parents],
    [...CURRENT_TRUSTED_BASE_PARENTS], "trusted-base topology: ordered parents mismatch");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "trusted-base topology: source is dirty");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "trusted-base topology: alternates forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "trusted-base topology: replace refs forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "trusted-base topology: grafts forbidden");
  return Object.freeze({
    sha: CURRENT_TRUSTED_BASE,
    tree: CURRENT_TRUSTED_BASE_TREE,
    parents: CURRENT_TRUSTED_BASE_PARENTS,
  });
}

export function verifyEventBoundAmendmentTopology({
  authorityRoot,
  candidateSha,
  eventName,
  eventRepository,
  eventBaseRepository,
  eventHeadRepository,
  eventBaseRef,
  eventBaseSha,
  eventHeadSha,
} = {}) {
  assert.ok(authorityRoot, "event authority: isolated object store absent");
  const resolved = realpathSync(path.resolve(authorityRoot));
  assert.equal(eventRepository, EVENT_BOUND_TARGET_REPOSITORY,
    "event authority: workflow repository mismatch");
  assert.equal(eventBaseRepository, EVENT_BOUND_TARGET_REPOSITORY,
    "event authority: base repository mismatch");
  assert.equal(eventHeadRepository, EVENT_BOUND_TARGET_REPOSITORY,
    "event authority: cross-repository candidate forbidden");
  assert.ok(["pull_request", "push", "push_create"].includes(eventName),
    "event authority: unsupported event kind");
  assert.equal(gitAt(resolved, "check-ref-format", "--branch", eventBaseRef), eventBaseRef,
    "event authority: invalid target ref identity");
  assert.ok(!eventBaseRef.startsWith("refs/") && !/^[0-9a-f]{40}$/.test(eventBaseRef),
    "event authority: target ref must be an event branch name, not a ref or object selector");
  exactSha(eventBaseSha, "event authority base");
  exactSha(eventHeadSha, "event authority head");
  exactSha(candidateSha, "event authority canonical candidate");
  assert.equal(candidateSha, eventHeadSha,
    "event authority: canonical candidate must equal the immutable event head");
  assert.notEqual(eventHeadSha, eventBaseSha,
    "event authority: amendment must be distinct from base");
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    `https://github.com/${EVENT_BOUND_TARGET_REPOSITORY}`,
    "event authority: repository identity mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", eventHeadSha), "commit",
    "event authority: head commit object absent");
  assert.equal(gitAt(resolved, "rev-parse", `${eventHeadSha}^{commit}`), eventHeadSha,
    "event authority: head object substitution");
  const headParents = gitAt(resolved, "cat-file", "commit", eventHeadSha)
    .split("\n").filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
  let secondParentSha;
  let subjectClass;
  if (headParents.length === 1) {
    const directParent = headParents[0];
    if (directParent === GENERATION_2_ELEVENTH_REMEDIATION) {
      const anchorFirst = [...GENERATION_2_REMEDIATION_PREFIX];
      for (let index = anchorFirst.length - 1; index > 0; index -= 1) {
        const child = anchorFirst[index];
        const parent = anchorFirst[index - 1];
        assert.equal(gitAt(resolved, "cat-file", "-t", child), "commit",
          "event authority: bounded remediation commit absent");
        const parents = gitAt(resolved, "cat-file", "commit", child)
          .split("\n").filter((line) => line.startsWith("parent "))
          .map((line) => line.slice(7));
        assert.deepEqual(parents, [parent],
          "event authority: bounded remediation chain mismatch");
      }
      assert.deepEqual(
        gitAt(resolved, "cat-file", "commit", GENERATION_2_FIRST_REMEDIATION)
          .split("\n").filter((line) => line.startsWith("parent "))
          .map((line) => line.slice(7)),
        [GENERATION_2_RECONCILIATION],
        "event authority: terminal remediation edge does not bind the exact anchor",
      );
      if (eventName === "pull_request") {
        assert.equal(eventBaseSha, CURRENT_TRUSTED_TARGET,
          "event authority: PR transport trusted target mismatch");
      } else {
        assert.equal(eventBaseSha, directParent,
          "event authority: push transport predecessor mismatch");
      }
      subjectClass = "GENERATION2_REMEDIATION_DESCENDANT";
    } else {
      assert.equal(gitAt(resolved, "cat-file", "-t", eventBaseSha), "commit",
        "event authority: base commit object absent");
      assert.equal(gitAt(resolved, "rev-parse", `${eventBaseSha}^{commit}`), eventBaseSha,
        "event authority: base object substitution");
      assert.equal(directParent, eventBaseSha,
        "event authority: amendment must have exactly the event base as parent");
      subjectClass = eventName === "push_create"
        ? "EVENT_BOUND_BRANCH_CREATION_AMENDMENT"
        : "EVENT_BOUND_PR_AMENDMENT";
    }
    secondParentSha = eventHeadSha;
  } else {
    assert.equal(gitAt(resolved, "cat-file", "-t", eventBaseSha), "commit",
      "event authority: base commit object absent");
    assert.equal(gitAt(resolved, "rev-parse", `${eventBaseSha}^{commit}`), eventBaseSha,
      "event authority: base object substitution");
    assert.equal(headParents.length, 2,
      "event authority: target push must be an exact two-parent merge");
    assert.equal(headParents[0], eventBaseSha,
      "event authority: target merge first parent is not the event-bound base");
    secondParentSha = headParents[1];
    exactSha(secondParentSha, "event authority second parent");
    assert.equal(gitAt(resolved, "cat-file", "-t", secondParentSha), "commit",
      "event authority: second-parent commit object absent");
    assert.deepEqual(
      gitAt(resolved, "cat-file", "commit", secondParentSha)
        .split("\n").filter((line) => line.startsWith("parent ")).map((line) => line.slice(7)),
      [eventBaseSha],
      "event authority: second parent is not an exact amendment of the event base",
    );
    subjectClass = "EVENT_BOUND_TARGET_MERGE";
  }
  const scopeBaseSha = subjectClass === "GENERATION2_REMEDIATION_DESCENDANT"
    ? headParents[0]
    : eventBaseSha;
  const changed = gitAt(resolved, "diff", "--name-only", `${scopeBaseSha}..${eventHeadSha}`)
    .split("\n").filter(Boolean).sort();
  const amendmentClass = classifyEventBoundAmendmentFiles(
    changed, "event authority: amendment changed-file scope mismatch");
  const topologyBaseSha = subjectClass === "GENERATION2_REMEDIATION_DESCENDANT"
    ? headParents[0]
    : eventBaseSha;
  const secondParentChanged = gitAt(resolved, "diff", "--name-only",
    `${topologyBaseSha}..${secondParentSha}`).split("\n").filter(Boolean).sort();
  const secondParentAmendmentClass = classifyEventBoundAmendmentFiles(
    secondParentChanged, "event authority: second-parent changed-file scope mismatch");
  assert.equal(secondParentAmendmentClass, amendmentClass,
    "event authority: amendment class changed across merge topology");
  const secondParentTree = gitAt(resolved, "show", "-s", "--format=%T", secondParentSha);
  exactSha(secondParentTree, "event authority second-parent tree");
  assert.equal(gitAt(resolved, "cat-file", "-t", secondParentTree), "tree",
    "event authority: second-parent tree absent");
  const resultingTree = gitAt(resolved, "show", "-s", "--format=%T", eventHeadSha);
  assert.equal(resultingTree, secondParentTree,
    "event authority: resulting merge tree differs from exact second-parent tree");
  const refs = gitAt(resolved, "for-each-ref", "--format=%(refname)");
  assert.equal(refs, "", "event authority: mutable refs forbidden");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "event authority: alternates forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "event authority: grafts forbidden");
  return Object.freeze({
    repository: eventRepository,
    eventName,
    subjectClass,
    amendmentClass,
    targetRef: eventBaseRef,
    baseSha: eventBaseSha,
    headSha: eventHeadSha,
    headParents: Object.freeze(headParents),
    changedFiles: Object.freeze(changed),
    secondParentTree,
    secondParentSha,
    resultingMergeParents: Object.freeze([topologyBaseSha, secondParentSha]),
    resultingMergeTree: resultingTree,
  });
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
  "          P1A_CANDIDATE_TOPOLOGY_FETCH_TOKEN: ${{ github.token }}",
  "          P1A_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority",
  "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority",
  "          P1A_PR16_CHAIN_AUTHORITY_ROOT: .p1a-pr16-remediation-chain-authority",
  "          P1A_TRUSTED_BASE_FULL_SOURCE_ROOT: .p1a-pr16-chain-staging-trusted-base",
  "          P1A_CURRENT_TRUSTED_TARGET_ROOT: .p1a-current-trusted-target-authority",
  "          P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT: .p1a-generation2-anchor-authority",
  "          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate",
  "          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline",
  "        run: |",
  "          set -euo pipefail",
  "          authority=\"$RUNNER_TEMP/p1a-candidate-topology-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT\"",
  "          trap 'rm -rf -- \"$authority\"' EXIT",
  "          test -n \"$P1A_CANDIDATE_TOPOLOGY_FETCH_TOKEN\"",
  "          auth_header=\"$(printf 'x-access-token:%s' \"$P1A_CANDIDATE_TOPOLOGY_FETCH_TOKEN\" | base64 | tr -d '\\n')\"",
  "          unset P1A_CANDIDATE_TOPOLOGY_FETCH_TOKEN",
  "          git init --bare -q \"$authority\"",
  "          git -C \"$authority\" remote add origin https://github.com/DarksiedCEO/zbestmedia",
  "          git -C \"$authority\" -c protocol.version=2 \\",
  "            -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header\" \\",
  "            fetch --no-tags --no-write-fetch-head --depth=12 origin \"$P1A_CANDIDATE_SHA\"",
  "          unset auth_header",
  "          test \"$(git -C \"$authority\" cat-file -t \"$P1A_CANDIDATE_SHA\")\" = commit",
  "          test \"$(git -C \"$authority\" cat-file commit \"$P1A_CANDIDATE_SHA\" | sed -n 's/^parent //p')\" = \\",
  "            \"faed8e5cca47d46643e4f3fdfdf4120242495fcf\"",
  "          test \"$(git -C \"$authority\" cat-file commit faed8e5cca47d46643e4f3fdfdf4120242495fcf | sed -n 's/^parent //p')\" = \\",
  "            \"098da9abb3c9add8c9aeeb9255b834e2f75f0b0a\"",
  "          test \"$(git -C \"$authority\" cat-file commit 098da9abb3c9add8c9aeeb9255b834e2f75f0b0a | sed -n 's/^parent //p')\" = \\",
  "            \"bac62f20ebfec8602718023418552f50e8d6616e\"",
  "          test \"$(git -C \"$authority\" cat-file commit bac62f20ebfec8602718023418552f50e8d6616e | sed -n 's/^parent //p')\" = \\",
  "            \"66e5616fbf448e58526d81af5530bc60812c8727\"",
  "          test \"$(git -C \"$authority\" cat-file commit 66e5616fbf448e58526d81af5530bc60812c8727 | sed -n 's/^parent //p')\" = \\",
  "            \"586f285df9d770825d9fe6aee893a74fdb99e294\"",
  "          test \"$(git -C \"$authority\" cat-file commit 586f285df9d770825d9fe6aee893a74fdb99e294 | sed -n 's/^parent //p')\" = \\",
  "            \"6c95cac5f28ed55cacbd21e512a6745aa7a73b94\"",
  "          test \"$(git -C \"$authority\" cat-file commit 6c95cac5f28ed55cacbd21e512a6745aa7a73b94 | sed -n 's/^parent //p')\" = \\",
  "            \"f8b9d3cc9d2e2a92ea41662bca64d61b0f097326\"",
  "          test \"$(git -C \"$authority\" cat-file commit f8b9d3cc9d2e2a92ea41662bca64d61b0f097326 | sed -n 's/^parent //p')\" = \\",
  "            \"16b426a047ef75d06a0df4b62cac76b28ec8e5f8\"",
  "          test \"$(git -C \"$authority\" cat-file commit 16b426a047ef75d06a0df4b62cac76b28ec8e5f8 | sed -n 's/^parent //p')\" = \\",
  "            \"172ff1dde7082f0c408ab595f02b08d51e2e57d6\"",
  "          test \"$(git -C \"$authority\" cat-file commit 172ff1dde7082f0c408ab595f02b08d51e2e57d6 | sed -n 's/^parent //p')\" = \\",
  "            \"b5f7e14872fb1ceff9664ad3023af86c0eca5eef\"",
  "          test \"$(git -C \"$authority\" cat-file commit b5f7e14872fb1ceff9664ad3023af86c0eca5eef | sed -n 's/^parent //p')\" = \\",
  "            \"e7bc2cc630d7b49c7333e9431bad54b1193aae14\"",
  "          test \"$(git -C \"$authority\" cat-file commit e7bc2cc630d7b49c7333e9431bad54b1193aae14 | sed -n 's/^parent //p')\" = \\",
  "            \"9fa0c2ac5b0b42a885330c7d7d54df65afae3736\"",
  "          if git -C \"$authority\" cat-file -e '9fa0c2ac5b0b42a885330c7d7d54df65afae3736^{commit}' 2>/dev/null; then",
  "            echo \"generation-2 anchor leaked into candidate/event authority\" >&2",
  "            exit 1",
  "          fi",
  "          if git -C \"$authority\" cat-file -e 'b0c1b2129123b941c6a350c16dae0ae3a8e076ca^{commit}' 2>/dev/null; then",
  "            echo \"trusted target leaked into candidate/event authority\" >&2",
  "            exit 1",
  "          fi",
  "          mapfile -t event_commits < <(git -C \"$authority\" cat-file --batch-all-objects \\",
  "            --batch-check='%(objectname) %(objecttype)' | awk '$2 == \"commit\" {print $1}' | sort)",
  "          mapfile -t expected_event_commits < <(printf '%s\\n' \\",
  "            \"$P1A_CANDIDATE_SHA\" \\",
  "            faed8e5cca47d46643e4f3fdfdf4120242495fcf \\",
  "            098da9abb3c9add8c9aeeb9255b834e2f75f0b0a \\",
  "            bac62f20ebfec8602718023418552f50e8d6616e \\",
  "            66e5616fbf448e58526d81af5530bc60812c8727 \\",
  "            586f285df9d770825d9fe6aee893a74fdb99e294 \\",
  "            6c95cac5f28ed55cacbd21e512a6745aa7a73b94 \\",
  "            f8b9d3cc9d2e2a92ea41662bca64d61b0f097326 \\",
  "            16b426a047ef75d06a0df4b62cac76b28ec8e5f8 \\",
  "            172ff1dde7082f0c408ab595f02b08d51e2e57d6 \\",
  "            b5f7e14872fb1ceff9664ad3023af86c0eca5eef \\",
  "            e7bc2cc630d7b49c7333e9431bad54b1193aae14 | sort)",
  "          test \"${event_commits[*]}\" = \"${expected_event_commits[*]}\"",
  "          test -z \"$(git -C \"$authority\" for-each-ref --format='%(refname)')\"",
  "          test ! -e \"$authority/objects/info/alternates\"",
  "          test ! -s \"$authority/info/grafts\"",
  "          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' \"$authority/config\"; then",
  "            echo \"persisted candidate topology credential material detected\" >&2",
  "            exit 1",
  "          fi",
  "          export P1A_EVENT_AUTHORITY_ROOT=\"$authority\"",
  "          node scripts/validate-p1a-threat-model.mjs --candidate-data-only",
  "          rm -rf -- \"$authority\"",
  "          test ! -e \"$authority\"",
  "          trap - EXIT",
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
const CURRENT_PREDECESSOR_AUTHORITY_V3_ACTION_COUNTS = Object.freeze({
  "actions/cache": 1,
  "actions/checkout": 13,
  "actions/setup-node": 1,
  "raven-actions/actionlint": 1,
});
const CURRENT_PREDECESSOR_AUTHORITY_V4_ACTION_COUNTS = Object.freeze({
  "actions/cache": 1,
  "actions/checkout": 14,
  "actions/setup-node": 1,
  "raven-actions/actionlint": 1,
});
const CURRENT_TRUSTED_TARGET_AUTHORITY_V6_ACTION_COUNTS = Object.freeze({
  "actions/cache": 1,
  "actions/checkout": 16,
  "actions/setup-node": 1,
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

export function validateOrdinaryCiActionPins(source, { profile = "CURRENT_TRUSTED_TARGET_AUTHORITY_V6_19" } = {}) {
  const uses = parseOrdinaryCiActionInventory(source);
  const expectedCounts = profile === "CURRENT_TRUSTED_TARGET_AUTHORITY_V6_19"
    ? CURRENT_TRUSTED_TARGET_AUTHORITY_V6_ACTION_COUNTS
    : profile === "CURRENT_PREDECESSOR_AUTHORITY_V4_17"
      ? CURRENT_PREDECESSOR_AUTHORITY_V4_ACTION_COUNTS
    : profile === "CURRENT_PREDECESSOR_AUTHORITY_V3_16"
      ? CURRENT_PREDECESSOR_AUTHORITY_V3_ACTION_COUNTS
    : profile === "CURRENT_PREDECESSOR_AUTHORITY_V2_15"
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
const HISTORICAL_TWO_STAGE_CI_SHA256 = "3fb24871674a86d9f3940b3c236215aa763d29018ff858e046fc2efbcaef8625";
const TWO_STAGE_CI_SHA256 = "9811b6846536a7f465a23eff51f1e6271ac0d1f4ed2330357fed6095080f04b1";
function exactTwoStageCustodyFragment(source) {
  assert.equal(source.split(TWO_STAGE_CI_START).length - 1, 1,
    "two-stage custody: staging acquisition missing or duplicated");
  const start = source.indexOf(TWO_STAGE_CI_START);
  const end = source.indexOf(TWO_STAGE_CI_END, start);
  assert.ok(end > start, "two-stage custody: verifier placement missing");
  const fragment = source.slice(start, end);
  assert.notEqual(TWO_STAGE_CI_SHA256, HISTORICAL_TWO_STAGE_CI_SHA256,
    "two-stage custody: current and historical profiles must remain distinct");
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
  "          P1A_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  "          P1A_EVENT_REPOSITORY: ${{ github.repository }}",
  "          P1A_EVENT_NAME: ${{ github.event_name }}",
  "          P1A_EVENT_BASE_REPOSITORY: ${{ github.event.pull_request.base.repo.full_name || github.repository }}",
  "          P1A_EVENT_HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  "          P1A_EVENT_BASE_REF: ${{ github.event.pull_request.base.ref || github.ref_name }}",
  "          P1A_EVENT_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}",
  "          P1A_EVENT_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  "          P1A_EVENT_FETCH_TOKEN: ${{ github.token }}",
  "          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate",
  "          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline",
  "          P1A_DUAL_BASE_AUTHORITY_ROOT: .p1a-dual-base-authority",
  "          P1A_EVIDENCE_BASE_AUTHORITY_ROOT: .p1a-evidence-base-authority",
  "          P1A_ANCESTRY_AUTHORITY_ROOT: .p1a-ancestry-authority",
  "          P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT: .p1a-trusted-reconciliation-authority",
  "          P1A_PR16_CHAIN_AUTHORITY_ROOT: .p1a-pr16-remediation-chain-authority",
  "          P1A_PR16_HISTORICAL_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-cleanliness",
  "          P1A_TRUSTED_BASE_FULL_SOURCE_ROOT: .p1a-pr16-chain-staging-trusted-base",
  "          P1A_PR16_ACTION_INVENTORY_SOURCE_ROOT: .p1a-pr16-chain-staging-action-inventory",
  "          P1A_PR16_ORIGINAL_AMENDMENT_SOURCE_ROOT: .p1a-pr16-chain-staging-original-amendment",
  "          P1A_PR16_REJECTED_CHAIN_SOURCE_ROOT: .p1a-pr16-chain-staging-rejected-chain",
  "          P1A_PR16_CURRENT_PREDECESSOR_SOURCE_ROOT: .p1a-pr16-chain-staging-current-predecessor",
  "          P1A_PR16_MINIMUM_DEPTH_SOURCE_ROOT: .p1a-pr16-chain-staging-minimum-depth",
  "          P1A_CURRENT_TRUSTED_TARGET_ROOT: .p1a-current-trusted-target-authority",
  "          P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT: .p1a-generation2-anchor-authority",
  "        run: |",
  "          set -euo pipefail",
  "          zero_sha=0000000000000000000000000000000000000000",
  "          authority=\"$RUNNER_TEMP/p1a-event-authority-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT\"",
  "          trap 'rm -rf -- \"$authority\"' EXIT",
  "          test \"$P1A_EVENT_REPOSITORY\" = \"DarksiedCEO/zbestmedia\"",
  "          test \"$P1A_EVENT_BASE_REPOSITORY\" = \"DarksiedCEO/zbestmedia\"",
  "          test \"$P1A_EVENT_HEAD_REPOSITORY\" = \"DarksiedCEO/zbestmedia\"",
  "          test \"$P1A_EVENT_NAME\" = pull_request || test \"$P1A_EVENT_NAME\" = push",
  "          [[ \"$P1A_EVENT_HEAD_SHA\" =~ ^[0-9a-f]{40}$ ]]",
  "          [[ \"$P1A_EVENT_BASE_SHA\" =~ ^[0-9a-f]{40}$ ]]",
  "          [[ \"$P1A_CANDIDATE_SHA\" =~ ^[0-9a-f]{40}$ ]]",
  "          test \"$P1A_CANDIDATE_SHA\" = \"$P1A_EVENT_HEAD_SHA\"",
  "          test -n \"$P1A_EVENT_FETCH_TOKEN\"",
  "          auth_header=\"$(printf 'x-access-token:%s' \"$P1A_EVENT_FETCH_TOKEN\" | base64 | tr -d '\\n')\"",
  "          unset P1A_EVENT_FETCH_TOKEN",
  "          test ! -e \"$authority\"",
  "          git init --bare -q \"$authority\"",
  "          git -C \"$authority\" remote add origin https://github.com/DarksiedCEO/zbestmedia",
  "          if test \"$P1A_EVENT_NAME\" = push && test \"$P1A_EVENT_BASE_SHA\" = \"$zero_sha\"; then",
  "            git -C \"$authority\" -c protocol.version=2 \\",
  "              -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header\" \\",
  "              fetch --no-tags --no-write-fetch-head --depth=1 origin \"$P1A_EVENT_HEAD_SHA\"",
  "            mapfile -t event_head_parents < <(git -C \"$authority\" cat-file commit \\",
  "              \"$P1A_EVENT_HEAD_SHA\" | sed -n 's/^parent //p')",
  "            test \"${#event_head_parents[@]}\" -eq 1",
  "            P1A_EVENT_BASE_SHA=\"${event_head_parents[0]}\"",
  "            [[ \"$P1A_EVENT_BASE_SHA\" =~ ^[0-9a-f]{40}$ ]]",
  "            git -C \"$authority\" -c protocol.version=2 \\",
  "              -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header\" \\",
  "              fetch --no-tags --no-write-fetch-head --depth=1 origin \"$P1A_EVENT_BASE_SHA\"",
  "            P1A_EVENT_NAME=push_create",
  "          else",
  "            git -C \"$authority\" -c protocol.version=2 \\",
  "              -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header\" \\",
  "              fetch --no-tags --no-write-fetch-head --depth=12 origin \\",
  "              \"$P1A_EVENT_HEAD_SHA\"",
  "          fi",
  "          unset auth_header",
  "          test -z \"$(git -C \"$authority\" for-each-ref --format='%(refname)')\"",
  "          test ! -e \"$authority/objects/info/alternates\"",
  "          test ! -s \"$authority/info/grafts\"",
  "          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' \"$authority/config\"; then",
  "            echo \"persisted event authority credential material detected\" >&2",
  "            exit 1",
  "          fi",
  "          export P1A_EVENT_AUTHORITY_ROOT=\"$authority\"",
  "          node scripts/test-p1a-dual-base-verifier.mjs",
  "          rm -rf -- \"$authority\"",
  "          test ! -e \"$authority\"",
  "          trap - EXIT",
  "",
  "      - name: Remove isolated P1-A authority checkouts",
  "        if: always()",
  "        run: |",
  "          rm -rf .p1a-original-candidate .p1a-trusted-baseline .p1a-dual-base-authority .p1a-evidence-base-authority .p1a-ancestry-authority .p1a-trusted-reconciliation-staging .p1a-trusted-reconciliation-authority .p1a-pr16-chain-staging-trusted-base .p1a-pr16-chain-staging-original-amendment .p1a-pr16-chain-staging-rejected-chain .p1a-pr16-chain-staging-rejected-cleanliness .p1a-pr16-chain-staging-action-inventory .p1a-pr16-chain-staging-current-predecessor .p1a-pr16-chain-staging-minimum-depth .p1a-pr16-remediation-chain-authority .p1a-current-trusted-target-authority",
  "          test ! -e .p1a-original-candidate",
  "          test ! -e .p1a-trusted-baseline",
  "          test ! -e .p1a-dual-base-authority",
  "          test ! -e .p1a-evidence-base-authority",
  "          test ! -e .p1a-ancestry-authority",
  "          test ! -e .p1a-trusted-reconciliation-authority",
  "          test ! -e .p1a-trusted-reconciliation-staging",
  "          test ! -e .p1a-pr16-chain-staging-trusted-base",
  "          test ! -e .p1a-pr16-chain-staging-current-predecessor",
  "          test ! -e .p1a-pr16-chain-staging-original-amendment",
  "          test ! -e .p1a-pr16-chain-staging-rejected-chain",
  "          test ! -e .p1a-pr16-chain-staging-rejected-cleanliness",
  "          test ! -e .p1a-pr16-chain-staging-action-inventory",
  "          test ! -e .p1a-pr16-chain-staging-minimum-depth",
  "          test ! -e .p1a-pr16-remediation-chain-authority",
  "          test ! -e .p1a-current-trusted-target-authority",
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

const CURRENT_TRUSTED_TARGET_ACQUISITION = `      - name: Acquire exact P1-A current trusted target authority
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: b0c1b2129123b941c6a350c16dae0ae3a8e076ca
          fetch-depth: 1
          persist-credentials: false
          path: .p1a-current-trusted-target-authority

      - name: Verify exact P1-A current trusted target authority
        run: |
          set -euo pipefail
          authority=.p1a-current-trusted-target-authority
          test "$(git -C "$authority" rev-parse HEAD)" = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca"
          test "$(git -C "$authority" remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test -z "$(git -C "$authority" status --porcelain=v1)"
          test "$(git -C "$authority" cat-file -t HEAD:.github/workflows/ci.yml)" = blob
          test "$(git -C "$authority" rev-parse HEAD:.github/workflows/ci.yml)" = "e5c469125577b22d9b96ea81502bb67d354a3ab4"
          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' "$authority/.git/config"; then
            echo "persisted current-target credential material detected" >&2
            exit 1
          fi

`;

const GENERATION2_ANCHOR_ACQUISITION = `      - name: Acquire exact generation-2 reconciliation anchor authority
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: DarksiedCEO/zbestmedia
          ref: 9fa0c2ac5b0b42a885330c7d7d54df65afae3736
          fetch-depth: 2
          persist-credentials: false
          path: .p1a-generation2-anchor-authority

      - name: Verify exact generation-2 reconciliation anchor authority
        run: |
          set -euo pipefail
          authority=.p1a-generation2-anchor-authority
          anchor=9fa0c2ac5b0b42a885330c7d7d54df65afae3736
          test "$(git -C "$authority" rev-parse HEAD)" = "$anchor"
          test "$(git -C "$authority" remote get-url origin)" = "https://github.com/DarksiedCEO/zbestmedia"
          test -z "$(git -C "$authority" status --porcelain=v1)"
          test "$(git -C "$authority" cat-file -t "$anchor")" = commit
          test "$(git -C "$authority" cat-file commit "$anchor" | sed -n 's/^tree //p')" = "feb82b29b0c0ee6b6ed8dbf6f58e2349d68fc713"
          mapfile -t parents < <(git -C "$authority" cat-file commit "$anchor" | sed -n 's/^parent //p')
          test "\${#parents[@]}" -eq 2
          test "\${parents[0]}" = "2d4884e5d927182209e7d7eb3a93296401576778"
          test "\${parents[1]}" = "b0c1b2129123b941c6a350c16dae0ae3a8e076ca"
          test "$(git -C "$authority" cat-file -t "\${parents[0]}")" = commit
          test "$(git -C "$authority" cat-file -t "\${parents[1]}")" = commit
          test ! -e "$authority/.git/objects/info/alternates"
          test ! -s "$authority/.git/info/grafts"
          test -z "$(git -C "$authority" replace -l)"
          if grep -Eiq 'x-access-token|authorization:|http\\..*extraheader' "$authority/.git/config"; then
            echo "persisted generation-2 anchor credential material detected" >&2
            exit 1
          fi

`;

export function composeGeneration2CandidateCi(baseline) {
  let source = replaceExactlyOnce(baseline,
    "      - name: Construct exact PR16 remediation-chain predecessor authority\n",
    `${CURRENT_TRUSTED_TARGET_ACQUISITION}${GENERATION2_ANCHOR_ACQUISITION}      - name: Construct exact PR16 remediation-chain predecessor authority\n`,
    "current trusted target acquisition placement");
  source = composeCandidateCi(source);
  source = replaceExactlyOnce(source,
    "      - name: P1-A current candidate-data contract controls\n        env:\n          P1A_EVENT_REPOSITORY:",
    "      - name: P1-A current candidate-data contract controls\n        env:\n          P1A_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n          P1A_EVENT_REPOSITORY:",
    "canonical candidate identity binding");
  source = replaceExactlyOnce(source,
    "          [[ \"$P1A_EVENT_BASE_SHA\" =~ ^[0-9a-f]{40}$ ]]\n          test -n \"$P1A_EVENT_FETCH_TOKEN\"",
    "          [[ \"$P1A_EVENT_BASE_SHA\" =~ ^[0-9a-f]{40}$ ]]\n          [[ \"$P1A_CANDIDATE_SHA\" =~ ^[0-9a-f]{40}$ ]]\n          test \"$P1A_CANDIDATE_SHA\" = \"$P1A_EVENT_HEAD_SHA\"\n          test -n \"$P1A_EVENT_FETCH_TOKEN\"",
    "canonical candidate equality proof");
  source = replaceExactlyOnce(source,
    "              fetch --no-tags --no-write-fetch-head --depth=2 origin \\\n",
    "              fetch --no-tags --no-write-fetch-head --depth=12 origin \\\n",
    "generation-2 bounded event-authority depth");
  source = replaceExactlyOnce(source,
    "              \"$P1A_EVENT_BASE_SHA\" \"$P1A_EVENT_HEAD_SHA\"\n",
    "              \"$P1A_EVENT_HEAD_SHA\"\n",
    "generation-2 transport-independent event-head acquisition");
  source = replaceExactlyOnce(source,
    "          P1A_CURRENT_WORKFLOW_FETCH_TOKEN: ${{ github.token }}\n          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate\n          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline\n        run: |\n",
    "          P1A_CURRENT_WORKFLOW_FETCH_TOKEN: ${{ github.token }}\n          P1A_ORIGINAL_REPOSITORY_ROOT: .p1a-original-candidate\n          P1A_BASELINE_REPOSITORY_ROOT: .p1a-trusted-baseline\n          P1A_CURRENT_TRUSTED_TARGET_ROOT: .p1a-current-trusted-target-authority\n          P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT: .p1a-generation2-anchor-authority\n        run: |\n",
    "current trusted target trusted-verifier authority binding");
  source = replaceExactlyOnce(source,
    "          P1A_PR16_MINIMUM_DEPTH_SOURCE_ROOT: .p1a-pr16-chain-staging-minimum-depth\n",
    "          P1A_PR16_MINIMUM_DEPTH_SOURCE_ROOT: .p1a-pr16-chain-staging-minimum-depth\n          P1A_CURRENT_TRUSTED_TARGET_ROOT: .p1a-current-trusted-target-authority\n          P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT: .p1a-generation2-anchor-authority\n",
    "current trusted target candidate-data authority binding");
  source = replaceExactlyOnce(source,
    " .p1a-pr16-chain-staging-minimum-depth .p1a-pr16-remediation-chain-authority\n",
    " .p1a-pr16-chain-staging-minimum-depth .p1a-pr16-remediation-chain-authority .p1a-current-trusted-target-authority .p1a-generation2-anchor-authority\n",
    "current trusted target cleanup inventory");
  return replaceExactlyOnce(source,
    "          test ! -e .p1a-pr16-remediation-chain-authority\n",
    "          test ! -e .p1a-pr16-remediation-chain-authority\n          test ! -e .p1a-current-trusted-target-authority\n          test ! -e .p1a-generation2-anchor-authority\n",
    "current trusted target cleanup proof");
}

export function composeFinalCi(baseline) {
  return composeCandidateCi(composeTrustedCi(baseline));
}

export function validateComposedCandidateCi(git, candidateSha, workflowSha, workflowGit = git,
  { generation2 = false, baselineGit = git } = {}) {
  const path = ".github/workflows/ci.yml";
  const entry = git("ls-tree", candidateSha, "--", path);
  assert.match(entry, /^100644\s+blob\s+[0-9a-f]{40}\t/, `${path}: unsafe entry`);
  assert.equal(blobAt(baselineGit, COMPOSED_CI_BASE, path), COMPOSED_CI_BASE_BLOB,
    `${path}: baseline blob mismatch`);
  const trusted = `${workflowGit("show", `${workflowSha}:${path}`)}\n`;
  const candidate = `${git("show", `${candidateSha}:${path}`)}\n`;
  assert.ok(!trusted.includes(REQUIRED_CI_ADDITION), `${path}: trusted stage contains candidate step`);
  assert.ok(!trusted.includes("pnpm test:p1a-threat-model"), `${path}: trusted stage contains historical root command`);
  assert.equal(candidate, generation2 ? composeGeneration2CandidateCi(trusted) : composeCandidateCi(trusted),
    `${path}: composed state or remainder mismatch`);
  validateOrdinaryCiActionPins(candidate, { profile: generation2
    ? "CURRENT_TRUSTED_TARGET_AUTHORITY_V6_19" : "CURRENT_PREDECESSOR_AUTHORITY_V4_17" });
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

export function classifyP1aReconciliationTopology({
  git, anchorGit = git, candidateSha,
}) {
  exactSha(candidateSha, "reconciliation candidate");
  const parents = git("cat-file", "commit", candidateSha).split("\n")
    .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));

  if (parents.length === 2 && parents[0] === ORIGINAL_CANDIDATE) {
    assert.match(parents[1], /^[0-9a-f]{40}$/,
      "generation-1 trusted parent is not immutable");
    return Object.freeze({
      generation: "GENERATION_1_RECONCILIATION",
      parents: Object.freeze(parents),
      trustedParent: parents[1],
    });
  }

  const anchorCommit = anchorGit("cat-file", "commit", GENERATION_2_RECONCILIATION);
  const anchorTree = anchorCommit.split("\n").find((line) => line.startsWith("tree "))?.slice(5);
  const anchorParents = anchorCommit.split("\n").filter((line) => line.startsWith("parent "))
    .map((line) => line.slice(7));
  assert.equal(anchorTree,
    GENERATION_2_RECONCILIATION_TREE,
    "generation-2 reconciliation anchor tree mismatch");
  assert.deepEqual(anchorParents,
    [...GENERATION_2_RECONCILIATION_PARENTS],
    "generation-2 reconciliation anchor ordered parentage mismatch");
  const remediationPath = [];
  let cursor = candidateSha;
  while (cursor !== GENERATION_2_RECONCILIATION) {
    remediationPath.push(cursor);
    const cursorParents = git("cat-file", "commit", cursor).split("\n")
      .filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
    assert.equal(cursorParents.length, 1,
      "generation-2 remediation path must remain linear and single-parent");
    cursor = cursorParents[0];
    assert.ok(remediationPath.length <= 12,
      "generation-2 remediation path exceeds the bounded authorized chain");
  }
  assert.ok(remediationPath.length <= 12,
    "generation-2 remediation path exceeds the bounded authorized chain");
  if (candidateSha !== GENERATION_2_RECONCILIATION) {
    const anchorFirstPath = [...remediationPath].reverse();
    assert.deepEqual(
      anchorFirstPath.slice(0, Math.min(anchorFirstPath.length,
        GENERATION_2_REMEDIATION_PREFIX.length)),
      GENERATION_2_REMEDIATION_PREFIX.slice(0, Math.min(anchorFirstPath.length,
        GENERATION_2_REMEDIATION_PREFIX.length)),
      "generation-2 remediation path bypasses the exact authorized descendants",
    );
  }
  return Object.freeze({
    generation: candidateSha === GENERATION_2_RECONCILIATION
      ? "GENERATION_2_RECONCILIATION"
      : "GENERATION_2_REMEDIATION_DESCENDANT",
    parents: Object.freeze(parents),
    trustedParent: CURRENT_TRUSTED_TARGET,
    reconciliationAnchor: GENERATION_2_RECONCILIATION,
    anchorParents: GENERATION_2_RECONCILIATION_PARENTS,
    remediationPath: Object.freeze(remediationPath),
  });
}

export function verifyGeneration2AnchorAuthority({
  authorityRoot = process.env.P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT,
} = {}) {
  assert.ok(authorityRoot, "generation-2 anchor authority absent");
  assert.ok(!lstatSync(authorityRoot).isSymbolicLink(),
    "generation-2 anchor authority symlink forbidden");
  const resolved = realpathSync(authorityRoot);
  assert.notEqual(resolved, realpathSync(candidateRoot),
    "candidate checkout cannot be generation-2 anchor authority");
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia", "generation-2 anchor repository mismatch");
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), GENERATION_2_RECONCILIATION,
    "generation-2 anchor authority HEAD mismatch");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "generation-2 anchor authority dirty");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)"), "",
    "generation-2 anchor authority mutable refs forbidden");
  assert.ok(!existsSync(path.join(resolved, ".git/objects/info/alternates")),
    "generation-2 anchor authority alternates forbidden");
  assert.ok(!existsSync(path.join(resolved, ".git/info/grafts")) ||
    readFileSync(path.join(resolved, ".git/info/grafts"), "utf8") === "",
  "generation-2 anchor authority grafts forbidden");
  assert.equal(gitAt(resolved, "replace", "-l"), "",
    "generation-2 anchor authority replace refs forbidden");
  const config = readFileSync(path.join(resolved, ".git/config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "generation-2 anchor authority credential material persisted");
  const commit = gitAt(resolved, "cat-file", "commit", GENERATION_2_RECONCILIATION);
  const tree = commit.split("\n").find((line) => line.startsWith("tree "))?.slice(5);
  const parents = commit.split("\n").filter((line) => line.startsWith("parent "))
    .map((line) => line.slice(7));
  assert.equal(tree, GENERATION_2_RECONCILIATION_TREE,
    "generation-2 anchor authority tree mismatch");
  assert.deepEqual(parents, [...GENERATION_2_RECONCILIATION_PARENTS],
    "generation-2 anchor authority ordered parents mismatch");
  for (const parent of parents) {
    assert.equal(gitAt(resolved, "cat-file", "-t", parent), "commit",
      "generation-2 anchor parent object absent");
  }
  for (const descendant of [GENERATION_2_FIRST_REMEDIATION,
    "b5f7e14872fb1ceff9664ad3023af86c0eca5eef"]) {
    assert.throws(() => gitAt(resolved, "cat-file", "-e", `${descendant}^{commit}`),
      "generation-2 anchor authority contains remediation descendant");
  }
  return Object.freeze({ root: resolved, anchor: GENERATION_2_RECONCILIATION,
    tree, parents: Object.freeze(parents) });
}

export function verifyCandidateTopologyAuthority({ authorityRoot, candidateSha } = {}) {
  assert.ok(authorityRoot, "candidate topology authority absent");
  exactSha(candidateSha, "candidate topology authority candidate");
  const resolved = realpathSync(path.resolve(authorityRoot));
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia",
    "candidate topology authority repository mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", candidateSha), "commit",
    "candidate topology authority candidate absent");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)"), "",
    "candidate topology authority mutable refs forbidden");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "candidate topology authority alternates forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "candidate topology authority grafts forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "candidate topology authority replace refs forbidden");
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "candidate topology authority persisted credentials forbidden");
  return Object.freeze({ root: resolved, candidateSha });
}

export function verifyOriginalCandidateArtifactAuthority({ authorityRoot, candidateRoot } = {}) {
  assert.ok(authorityRoot, "original candidate artifact authority absent");
  const requested = path.resolve(authorityRoot);
  assert.ok(!lstatSync(requested).isSymbolicLink(),
    "original candidate artifact authority symlink forbidden");
  const resolved = realpathSync(requested);
  if (candidateRoot) {
    assert.notEqual(resolved, realpathSync(path.resolve(candidateRoot)),
      "candidate checkout cannot be original candidate artifact authority");
  }
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia",
    "original candidate artifact authority repository mismatch");
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), ORIGINAL_CANDIDATE,
    "original candidate artifact authority HEAD mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", ORIGINAL_CANDIDATE), "commit",
    "original candidate artifact authority commit absent");
  assert.equal(gitAt(resolved, "cat-file", "-t", `${ORIGINAL_CANDIDATE}^{tree}`), "tree",
    "original candidate artifact authority tree absent");
  assert.equal(gitAt(resolved, "rev-parse",
    `${ORIGINAL_CANDIDATE}:docs/security/p1-a/evidence-register.json`),
  ORIGINAL_EVIDENCE_REGISTER_BLOB, "original evidence-register blob mismatch");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "original candidate artifact authority dirty");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "original candidate artifact authority alternates forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "original candidate artifact authority grafts forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "original candidate artifact authority replace refs forbidden");
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "original candidate artifact authority persisted credentials forbidden");
  return Object.freeze({ root: resolved, gitDir });
}

export function verifyTrustedBaselineArtifactAuthority({ authorityRoot, candidateRoot } = {}) {
  assert.ok(authorityRoot, "trusted baseline artifact authority absent");
  const requested = path.resolve(authorityRoot);
  assert.ok(!lstatSync(requested).isSymbolicLink(),
    "trusted baseline artifact authority symlink forbidden");
  const resolved = realpathSync(requested);
  if (candidateRoot) {
    assert.notEqual(resolved, realpathSync(path.resolve(candidateRoot)),
      "candidate checkout cannot be trusted baseline artifact authority");
  }
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia",
    "trusted baseline artifact authority repository mismatch");
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), COMPOSED_CI_BASE,
    "trusted baseline artifact authority HEAD mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", COMPOSED_CI_BASE), "commit",
    "trusted baseline artifact authority commit absent");
  assert.equal(gitAt(resolved, "rev-parse", `${COMPOSED_CI_BASE}:.github/workflows/ci.yml`),
    COMPOSED_CI_BASE_BLOB, "trusted baseline workflow blob mismatch");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "trusted baseline artifact authority dirty");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "trusted baseline artifact authority alternates forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "trusted baseline artifact authority grafts forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "trusted baseline artifact authority replace refs forbidden");
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "trusted baseline artifact authority persisted credentials forbidden");
  return Object.freeze({
    authorityClass: "TRUSTED_BASELINE", root: resolved, gitDir,
    commitSha: COMPOSED_CI_BASE, path: ".github/workflows/ci.yml",
    blobSha: COMPOSED_CI_BASE_BLOB,
  });
}

export function verifyCurrentTrustedTargetArtifactAuthority({
  authorityRoot,
  candidateRoot,
} = {}) {
  assert.ok(authorityRoot, "current trusted target artifact authority absent");
  const requested = path.resolve(authorityRoot);
  assert.ok(!lstatSync(requested).isSymbolicLink(),
    "current trusted target artifact authority symlink forbidden");
  const resolved = realpathSync(requested);
  if (candidateRoot) {
    assert.notEqual(resolved, realpathSync(path.resolve(candidateRoot)),
      "candidate checkout cannot be current trusted target artifact authority");
  }
  assert.equal(normalizeRepository(gitAt(resolved, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia",
    "current trusted target artifact authority repository mismatch");
  assert.equal(gitAt(resolved, "rev-parse", "HEAD"), CURRENT_TRUSTED_TARGET,
    "current trusted target artifact authority HEAD mismatch");
  assert.equal(gitAt(resolved, "cat-file", "-t", CURRENT_TRUSTED_TARGET), "commit",
    "current trusted target artifact authority commit absent");
  assert.equal(gitAt(resolved, "cat-file", "-t", `${CURRENT_TRUSTED_TARGET}^{tree}`), "tree",
    "current trusted target artifact authority tree absent");
  assert.equal(gitAt(resolved, "rev-parse",
    `${CURRENT_TRUSTED_TARGET}:.github/CODEOWNERS`),
  CURRENT_TRUSTED_TARGET_CODEOWNERS_BLOB,
  "current trusted target CODEOWNERS blob mismatch");
  assert.equal(gitAt(resolved, "status", "--porcelain=v1"), "",
    "current trusted target artifact authority dirty");
  const gitDirValue = gitAt(resolved, "rev-parse", "--git-dir");
  const gitDir = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(resolved, gitDirValue);
  assert.ok(!existsSync(path.join(gitDir, "objects/info/alternates")),
    "current trusted target artifact authority alternates forbidden");
  assert.ok(!existsSync(path.join(gitDir, "info/grafts")) ||
    readFileSync(path.join(gitDir, "info/grafts"), "utf8").trim() === "",
  "current trusted target artifact authority grafts forbidden");
  assert.equal(gitAt(resolved, "for-each-ref", "--format=%(refname)", "refs/replace"), "",
    "current trusted target artifact authority replace refs forbidden");
  const config = readFileSync(path.join(gitDir, "config"), "utf8");
  assert.ok(!/x-access-token|authorization:|http\..*extraheader/i.test(config),
    "current trusted target artifact authority persisted credentials forbidden");
  return Object.freeze({ root: resolved, gitDir });
}

export function validateCandidateDataOnly({
  repoRoot = candidateRoot,
  candidateSha,
  ancestryAuthorityRoot = process.env.P1A_ANCESTRY_AUTHORITY_ROOT,
  trustedReconciliationAuthorityRoot = process.env.P1A_TRUSTED_RECONCILIATION_AUTHORITY_ROOT,
  trustedBaseFullSourceRoot = process.env.P1A_TRUSTED_BASE_FULL_SOURCE_ROOT,
  currentTrustedTargetRoot = process.env.P1A_CURRENT_TRUSTED_TARGET_ROOT,
  generation2AnchorAuthorityRoot = process.env.P1A_GENERATION2_ANCHOR_AUTHORITY_ROOT,
  candidateTopologyAuthorityRoot = process.env.P1A_EVENT_AUTHORITY_ROOT,
  originalRepositoryRoot = process.env.P1A_ORIGINAL_REPOSITORY_ROOT,
  baselineRepositoryRoot = process.env.P1A_BASELINE_REPOSITORY_ROOT,
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
  const candidateTopology = verifyCandidateTopologyAuthority({
    authorityRoot: candidateTopologyAuthorityRoot, candidateSha,
  });
  assert.notEqual(candidateTopology.root, realpathSync(repoRoot),
    "primary checkout cannot be candidate topology authority");
  const candidateGit = (...args) => gitAt(candidateTopology.root, ...args);
  const originalAuthority = verifyOriginalCandidateArtifactAuthority({
    authorityRoot: originalRepositoryRoot, candidateRoot: repoRoot,
  });
  assert.notEqual(originalAuthority.root, candidateTopology.root,
    "original candidate and event authorities must remain isolated");
  const originalGit = (...args) => gitAt(originalAuthority.root, ...args);
  const baselineAuthority = verifyTrustedBaselineArtifactAuthority({
    authorityRoot: baselineRepositoryRoot, candidateRoot: repoRoot,
  });
  assert.notEqual(baselineAuthority.root, candidateTopology.root,
    "trusted baseline and event authorities must remain isolated");
  assert.notEqual(baselineAuthority.root, originalAuthority.root,
    "trusted baseline and original candidate authorities must remain isolated");
  const baselineGit = (...args) => gitAt(baselineAuthority.root, ...args);
  const trustedTargetAuthority = verifyCurrentTrustedTargetArtifactAuthority({
    authorityRoot: currentTrustedTargetRoot, candidateRoot: repoRoot,
  });
  assert.notEqual(trustedTargetAuthority.root, candidateTopology.root,
    "trusted target and event authorities must remain isolated");
  assert.notEqual(trustedTargetAuthority.root, originalAuthority.root,
    "trusted target and original candidate authorities must remain isolated");
  const trustedTargetGit = (...args) => gitAt(trustedTargetAuthority.root, ...args);
  verifyGeneration2AnchorAuthority({ authorityRoot: generation2AnchorAuthorityRoot });
  assert.notEqual(realpathSync(generation2AnchorAuthorityRoot), realpathSync(repoRoot),
    "candidate checkout cannot be generation-2 anchor authority");
  const anchorGit = (...args) => gitAt(generation2AnchorAuthorityRoot, ...args);
  const topology = classifyP1aReconciliationTopology({
    git: candidateGit,
    anchorGit,
    candidateSha,
  });
  const parents = [...topology.parents];
  check("ordered_parentage", () => {
    assert.ok([
      "GENERATION_1_RECONCILIATION",
      "GENERATION_2_RECONCILIATION",
      "GENERATION_2_REMEDIATION_DESCENDANT",
    ].includes(topology.generation), "unsupported reconciliation generation");
  });
  const trustedParent = topology.trustedParent;
  check("required_ancestry", () => {
    verifyCanonicalBoundedAncestry({ ancestryAuthorityRoot });
    verifyCanonicalTrustedReconciliationAncestry({ trustedReconciliationAuthorityRoot });
    assert.ok(trustedBaseFullSourceRoot, "trusted-base full source absent");
    verifyExactCurrentTrustedBaseTopology({ trustedBaseRoot: trustedBaseFullSourceRoot });
    if (topology.generation === "GENERATION_1_RECONCILIATION") {
      assert.deepEqual([...exactCommitMetadata((...args) => gitAt(repoRoot, ...args),
        trustedParent, "generation-1 trusted parent").parents], [CURRENT_TRUSTED_BASE],
        "generation-1 trusted parent is not based directly on its authorized trusted base");
    } else {
      assert.equal(trustedParent, CURRENT_TRUSTED_TARGET,
        "generation-2 trusted target mismatch");
      assert.deepEqual([...topology.anchorParents],
        [GENERATION_1_RECONCILIATION, CURRENT_TRUSTED_TARGET],
        "generation-2 anchor ordered parentage mismatch");
      if (topology.generation === "GENERATION_2_REMEDIATION_DESCENDANT") {
        assert.equal(parents.length, 1,
          "generation-2 remediation descendant must have one parent");
      }
    }
    assert.equal(gitAt(trustedBaseFullSourceRoot, "rev-parse", "HEAD"), CURRENT_TRUSTED_BASE,
      "trusted-base full source HEAD mismatch");
    assert.equal(normalizeRepository(gitAt(trustedBaseFullSourceRoot, "remote", "get-url", "origin")),
      "https://github.com/DarksiedCEO/zbestmedia", "trusted-base full source repository mismatch");
    gitAt(trustedBaseFullSourceRoot, "merge-base", "--is-ancestor",
      TRUSTED_RECONCILIATION_BASE, CURRENT_TRUSTED_BASE);
    assert.equal(
      topology.generation === "GENERATION_1_RECONCILIATION"
        ? parents[0]
        : GENERATION_1_RECONCILIATION_PARENTS[0],
      ORIGINAL_CANDIDATE,
      "candidate does not preserve the exact original candidate authority");
    if (topology.generation === "GENERATION_1_RECONCILIATION") {
      assert.equal(parents[1], trustedParent,
        "candidate is not a direct descendant of the trusted parent");
    }
  });
  check("exact_scope", () => {
    assert.ok(currentTrustedTargetRoot, "current trusted target authority absent");
    assert.notEqual(realpathSync(currentTrustedTargetRoot), realpathSync(repoRoot),
      "candidate checkout cannot be current trusted target authority");
    assert.notEqual(realpathSync(currentTrustedTargetRoot), candidateTopology.root,
      "trusted target and candidate authorities must remain isolated");
    const trustedManifest = readTreeManifest({
      authorityRoot: currentTrustedTargetRoot,
      commitSha: trustedParent,
      label: "trusted target manifest",
    });
    const candidateManifest = readTreeManifest({
      authorityRoot: candidateTopology.root,
      commitSha: candidateSha,
      label: "candidate manifest",
    });
    const changed = compareTreeManifests(trustedManifest, candidateManifest)
      .filter(({ status }) => status !== "UNCHANGED")
      .map(({ path: changedPath }) => changedPath)
      .sort();
    const expected = topology.generation !== "GENERATION_1_RECONCILIATION"
      ? [...new Set([...CANDIDATE_OWNED_FILES, ...GENERATION_2_CONTROL_FILES])].sort()
      : [...CANDIDATE_OWNED_FILES].sort();
    assert.deepEqual(changed, expected);
  });
  check("candidate_blob_identity", () => {
    for (const file of EXACT_CANDIDATE_OWNED_FILES) {
      assert.equal(candidateGit("rev-parse", `${candidateSha}:${file}`),
        originalGit("rev-parse", `${ORIGINAL_CANDIDATE}:${file}`), file);
    }
  });
  check("trusted_blob_identity", () => {
    for (const file of TRUSTED_INFRASTRUCTURE_FILES) {
      if (file === ".github/workflows/ci.yml" ||
          (topology.generation !== "GENERATION_1_RECONCILIATION" &&
           GENERATION_2_CONTROL_FILES.includes(file))) continue;
      assert.equal(candidateGit("rev-parse", `${candidateSha}:${file}`),
        trustedTargetGit("rev-parse", `${trustedParent}:${file}`), file);
    }
  });
  check("ordinary_ci_composition", () => {
    const git = (...args) => gitAt(repoRoot, ...args);
    if (topology.generation !== "GENERATION_1_RECONCILIATION") {
      assert.ok(currentTrustedTargetRoot, "current trusted target authority absent");
      assert.notEqual(realpathSync(currentTrustedTargetRoot), realpathSync(repoRoot),
        "candidate checkout cannot be current trusted target authority");
      assert.equal(normalizeRepository(gitAt(currentTrustedTargetRoot, "remote", "get-url", "origin")),
        "https://github.com/DarksiedCEO/zbestmedia", "current trusted target repository mismatch");
      assert.equal(gitAt(currentTrustedTargetRoot, "rev-parse", "HEAD"), CURRENT_TRUSTED_TARGET,
        "current trusted target HEAD mismatch");
      assert.equal(gitAt(currentTrustedTargetRoot, "cat-file", "-t",
        "HEAD:.github/workflows/ci.yml"), "blob", "current trusted workflow is not a blob");
      assert.equal(gitAt(currentTrustedTargetRoot, "rev-parse",
        "HEAD:.github/workflows/ci.yml"), "e5c469125577b22d9b96ea81502bb67d354a3ab4",
      "current trusted workflow blob mismatch");
      assert.equal(gitAt(currentTrustedTargetRoot, "status", "--porcelain=v1"), "",
        "current trusted target authority is dirty");
      validateComposedCandidateCi(git, candidateSha, trustedParent,
        (...args) => gitAt(currentTrustedTargetRoot, ...args),
        { generation2: true, baselineGit });
      return;
    }
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
  assertCandidateSourceClean(repoRoot);
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
  trustedBaseFullSourceRoot = process.env.P1A_TRUSTED_BASE_FULL_SOURCE_ROOT,
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
  assert.ok(trustedBaseFullSourceRoot, "trusted-base full source absent");
  verifyExactCurrentTrustedBaseTopology({ trustedBaseRoot: trustedBaseFullSourceRoot });
  assert.deepEqual([...exactCommitMetadata(git, workflowSha,
    "workflow amendment").parents], [CURRENT_TRUSTED_BASE],
    "workflow amendment is not based directly on the authorized trusted base");
  assert.equal(gitAt(trustedBaseFullSourceRoot, "rev-parse", "HEAD"), CURRENT_TRUSTED_BASE,
    "trusted-base full source HEAD mismatch");
  assert.equal(normalizeRepository(gitAt(trustedBaseFullSourceRoot, "remote", "get-url", "origin")),
    "https://github.com/DarksiedCEO/zbestmedia", "trusted-base full source repository mismatch");
  gitAt(trustedBaseFullSourceRoot, "merge-base", "--is-ancestor",
    reconciliationBaseSha, CURRENT_TRUSTED_BASE);
  const candidateParents = [...exactCommitMetadata(git, candidateSha,
    "reconciled candidate").parents];
  const generation2 = candidateParents.length === 2 &&
    candidateParents[0] === GENERATION_1_RECONCILIATION &&
    candidateParents[1] === CURRENT_TRUSTED_TARGET;
  assert.deepEqual(candidateParents, generation2
    ? [GENERATION_1_RECONCILIATION, CURRENT_TRUSTED_TARGET]
    : [originalCandidateSha, workflowSha], "reconciled candidate ordered parentage mismatch");

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
  validateComposedCandidateCi(git, candidateSha, workflowSha, git, { generation2 });
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
