import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const p0Root = resolve(repoRoot, "docs/governance/p0-reconciliation");
const load = (path) => JSON.parse(readFileSync(resolve(p0Root, path), "utf8"));
const registry = load("canonical-agent-registry.json");
const quarantine = load("quarantined-32-record-ledger.json");
const schema = load("schemas/cross-repository-agent-contract.schema.json");
const actualHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const requestedCandidateSha = process.env.P0_CANDIDATE_SHA;
if (requestedCandidateSha && requestedCandidateSha !== actualHeadSha) {
  throw new Error(
    `P0_CANDIDATE_SHA ${requestedCandidateSha} does not match git HEAD ${actualHeadSha}`,
  );
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateShape = ajv.compile(schema);

const STAGES = [
  "SOURCE_PINNED", "LINEAGE_VERIFIED", "RECONCILED",
  "SINGLE_TASK_DEFINED", "MASTERY_SKILLS_DEFINED", "CONTRACT_VALIDATED",
  "RUNTIME_IMPLEMENTED", "LOCALLY_VERIFIED", "BENCHMARK_PASSED",
  "SECURITY_REVIEWED", "RELIABILITY_REVIEWED", "EXACT_SHA_VERIFIED",
  "AEGIS_CERTIFIED", "SUPERVISED", "LIVE_MISSION_PROVEN",
];
const TYPES = [
  "SOURCE_PIN", "LINEAGE", "RECONCILIATION", "SINGLE_TASK_CONTRACT",
  "MASTERY_SKILLS", "CONTRACT_VALIDATION", "RUNTIME_IMPLEMENTATION",
  "LOCAL_VERIFICATION", "BENCHMARK", "SECURITY_REVIEW",
  "RELIABILITY_REVIEW", "EXACT_SHA_CI", "AEGIS_CERTIFICATION",
  "SUPERVISED_MISSION", "LIVE_MISSION",
];
const ISSUERS = [
  "principal:source.registry", "principal:source.registry",
  "principal:source.registry", "principal:source.registry",
  "principal:source.registry", "principal:source.registry",
  "principal:runtime.builder", "principal:ci.github", "principal:ci.github",
  "principal:security.reviewer", "principal:reliability.reviewer",
  "principal:ci.github", "principal:aegis.authority",
  "principal:human.supervisor", "principal:human.supervisor",
];
const SYSTEMS = [
  "zbestmedia-source-registry", "zbestmedia-source-registry",
  "zbestmedia-source-registry", "zbestmedia-source-registry",
  "zbestmedia-source-registry", "zbestmedia-source-registry",
  "zbestmedia-ui-runtime", "github-actions", "github-actions",
  "security-review-authority", "reliability-review-authority",
  "github-actions", "aegis-certification-authority",
  "human-supervision-ledger", "human-supervision-ledger",
];
const SPECIALISTS = [
  "agent.case-study-architect", "agent.client-strategy",
  "agent.cooper-qualification-director",
  "agent.cta-optimizer", "agent.false-claim-detector", "agent.ga4-audit",
  "agent.google-ads-strategist", "agent.headline", "agent.implementation-qa",
  "agent.landing-page-auditor", "agent.lead-intake", "agent.llm-visibility",
  "agent.meta-ads-strategist", "agent.mobile-ux-auditor", "agent.offer-copy",
  "agent.offer-weakness-detector", "agent.pixel-verification",
  "agent.proposal-builder", "agent.red-team-sentinel",
  "agent.revenue-leak-analyst", "agent.scriptwriter-narrative-director",
  "agent.seo-strategist", "agent.trust-asset-builder",
  "agent.website-leak-detector",
];
const LEADS = [
  "lead.executive-command", "lead.brand-intelligence",
  "lead.marketing-operations", "lead.revenue-performance",
  "lead.revenue-recovery-audit", "lead.lead-capture", "lead.qualification",
  "lead.copywriting", "lead.creative-production", "lead.seo-llm-visibility",
  "lead.analytics-truth", "lead.engineering", "lead.client-strategy",
  "lead.proof-case-studies", "lead.security-compliance", "lead.red-team",
  "lead.learning-intelligence", "lead.operations",
];

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const AGENT = "agent.test-agent";
const ARTIFACT = "artifact_agent_contract_0001";
const SPEC_ARTIFACT = "artifact_agent_specification_0001";
const TENANT = "tenant_zbestmedia";
const WORKSPACE = "workspace_agency";
const HUMAN = "principal:andre.founder";
const NOW = "2026-07-26T23:00:00.000Z";

function makeSpecification() {
  return {
    repository: "DarksiedCEO/zbestmedia",
    commitSha: SHA,
    path: "agents/test-agent.json",
    contractVersion: "1.0.0",
    sourceHash: `sha256:${"3".repeat(64)}`,
    artifactId: SPEC_ARTIFACT,
  };
}

function makeRuntime() {
  return {
    repository: "DarksiedCEO/zbestmedia-ui",
    commitSha: SHA,
    bindingPath: "server/agents/test-agent.ts",
    manifestId: "manifest_test_agent_0001",
    artifactId: ARTIFACT,
  };
}

function makeApproval() {
  return {
    approvalStatus: "APPROVED",
    approvalId: "approval_founder_0001",
    approvedByPrincipalId: HUMAN,
    approvedAt: "2026-07-26T22:00:00.000Z",
    expiresAt: "2026-07-27T22:00:00.000Z",
    revokedAt: null,
    approvalScope: "AGENT_LIVE_PROMOTION",
    subjectSha: SHA,
    subjectArtifactIds: [SPEC_ARTIFACT, ARTIFACT],
    tenantId: TENANT,
    workspaceId: WORKSPACE,
  };
}

const context = () => ({
  subjectSha: SHA,
  agentId: AGENT,
  tenantId: TENANT,
  workspaceId: WORKSPACE,
  now: NOW,
  authorizedHumans: new Set([HUMAN]),
  trustedIssuers: new Set(ISSUERS),
  artifacts: new Map([
    [ARTIFACT, `sha256:${"1".repeat(64)}`],
    [SPEC_ARTIFACT, `sha256:${"3".repeat(64)}`],
  ]),
  reviewedCommits: new Map([
    ["DarksiedCEO/zbestmedia", SHA],
    ["DarksiedCEO/zbestmedia-ui", SHA],
  ]),
  trustedEvidenceRecords: new Map(
    Array.from({ length: TYPES.length }, (_, index) => {
      const evidence = makeEvidence(index);
      return [evidence.evidenceId, JSON.stringify(evidence)];
    }),
  ),
  trustedSpecificationBindings: new Map([[AGENT, JSON.stringify(makeSpecification())]]),
  trustedRuntimeBindings: new Map([[AGENT, JSON.stringify(makeRuntime())]]),
  trustedApprovalRecords: new Map([["approval_founder_0001", JSON.stringify(makeApproval())]]),
  policies: new Set([
    "policy_tenant_auth_0001",
    "policy_evidence_revocation_0001",
    "policy_downstream_invalidation_0001",
  ]),
  revokedEvidence: new Set(),
  revokedApprovals: new Set(),
  revokedSchemas: new Set(),
});

function makeEvidence(index) {
  return {
    evidenceId: `evidence_${String(index).padStart(12, "0")}`,
    evidenceType: TYPES[index],
    artifactId: index < 6 ? SPEC_ARTIFACT : ARTIFACT,
    artifactHash: index < 6 ? `sha256:${"3".repeat(64)}` : `sha256:${"1".repeat(64)}`,
    subjectSha: SHA,
    agentId: AGENT,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    createdAt: "2026-07-26T20:00:00.000Z",
    validUntil: "2026-07-27T20:00:00.000Z",
    source: { issuerPrincipalId: ISSUERS[index], systemId: SYSTEMS[index] },
    verificationStatus: "VERIFIED",
  };
}

function makeContract(stage) {
  const index = STAGES.indexOf(stage);
  const live = stage === "LIVE_MISSION_PROVEN";
  const runtime = index >= STAGES.indexOf("RUNTIME_IMPLEMENTED");
  return {
    agentId: AGENT,
    subjectSha: SHA,
    subjectCreatedAt: "2026-07-26T19:00:00.000Z",
    specification: makeSpecification(),
    runtime: runtime ? makeRuntime() : null,
    tenantAuthorization: {
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      tenantIsolationMode: "TENANT_SCOPED",
      authorizationPolicyId: "policy_tenant_auth_0001",
      humanApprovalRequired: live,
    },
    toolPermissions: runtime ? [{
      toolId: "artifact-reader",
      allowedActions: ["read-artifact"],
      environment: "READ_ONLY_REMOTE",
      tenantScope: TENANT,
      approvalRequired: true,
      credentialBoundary: "READ_ONLY_EVIDENCE_TOKEN",
      readWriteMode: "READ_ONLY",
    }] : [],
    evidence: Array.from({ length: index + 1 }, (_, i) => makeEvidence(i)),
    approval: live ? makeApproval() : {
      approvalStatus: "NOT_REQUESTED",
      approvalId: null,
      approvedByPrincipalId: null,
      approvedAt: null,
      expiresAt: null,
      revokedAt: null,
      approvalScope: null,
      subjectSha: null,
      subjectArtifactIds: [],
      tenantId: TENANT,
      workspaceId: WORKSPACE,
    },
    governance: {
      schemaVersion: "2.0.0",
      rollbackTargetSha: OTHER_SHA,
      supersedesSchemaVersion: "1.0.0",
      revocationPolicyId: "policy_evidence_revocation_0001",
      downstreamInvalidationPolicyId: "policy_downstream_invalidation_0001",
      nextOwnerPrincipalId: "principal:runtime.owner",
    },
    promotionStatus: stage,
    stageHistory: STAGES.slice(0, index + 1),
  };
}

function semanticErrors(value, ctx) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (value.subjectSha !== ctx.subjectSha) fail("wrong subject SHA");
  if (value.agentId !== ctx.agentId) fail("wrong agent");
  if (ctx.trustedSpecificationBindings.get(value.agentId) !== JSON.stringify(value.specification)) {
    fail("specification binding is not authenticated");
  }
  if (
    value.runtime &&
    ctx.trustedRuntimeBindings.get(value.agentId) !== JSON.stringify(value.runtime)
  ) fail("runtime binding is not authenticated");
  if (ctx.reviewedCommits.get(value.specification.repository) !== value.specification.commitSha) {
    fail("unreviewed specification commit");
  }
  if (ctx.artifacts.get(value.specification.artifactId) !== value.specification.sourceHash) {
    fail("unreviewed specification artifact");
  }
  if (
    value.runtime &&
    ctx.reviewedCommits.get(value.runtime.repository) !== value.runtime.commitSha
  ) fail("unreviewed runtime commit");
  if (value.runtime && !ctx.artifacts.has(value.runtime.artifactId)) {
    fail("unreviewed runtime artifact");
  }
  if (value.tenantAuthorization.tenantId !== ctx.tenantId) fail("wrong tenant");
  if (value.tenantAuthorization.workspaceId !== ctx.workspaceId) fail("wrong workspace");
  if (!ctx.policies.has(value.tenantAuthorization.authorizationPolicyId)) fail("untrusted authorization policy");
  if (ctx.revokedSchemas.has(value.governance.schemaVersion)) fail("revoked schema");
  if (!ctx.policies.has(value.governance.revocationPolicyId)) fail("untrusted revocation policy");
  if (!ctx.policies.has(value.governance.downstreamInvalidationPolicyId)) fail("untrusted invalidation policy");

  const ids = new Set();
  const types = new Set();
  for (const evidence of value.evidence) {
    if (ids.has(evidence.evidenceId)) fail("duplicate evidence ID");
    ids.add(evidence.evidenceId);
    types.add(evidence.evidenceType);
    if (evidence.verificationStatus !== "VERIFIED") fail("unverified evidence");
    if (ctx.revokedEvidence.has(evidence.evidenceId)) fail("revoked evidence");
    if (ctx.trustedEvidenceRecords.get(evidence.evidenceId) !== JSON.stringify(evidence)) {
      fail("evidence record is not authenticated");
    }
    if (
      evidence.subjectSha !== value.subjectSha ||
      evidence.agentId !== value.agentId ||
      evidence.tenantId !== ctx.tenantId ||
      evidence.workspaceId !== ctx.workspaceId
    ) fail("evidence binding mismatch");
    if (!ctx.artifacts.has(evidence.artifactId)) fail("unknown artifact");
    if (ctx.artifacts.get(evidence.artifactId) !== evidence.artifactHash) fail("artifact hash mismatch");
    if (!ctx.trustedIssuers.has(evidence.source.issuerPrincipalId)) fail("untrusted issuer");
    const typeIndex = TYPES.indexOf(evidence.evidenceType);
    if (
      evidence.source.issuerPrincipalId !== ISSUERS[typeIndex] ||
      evidence.source.systemId !== SYSTEMS[typeIndex]
    ) fail("issuer is not authoritative for evidence type");
    if (Date.parse(evidence.createdAt) < Date.parse(value.subjectCreatedAt)) fail("evidence predates subject");
    if (Date.parse(evidence.createdAt) > Date.parse(ctx.now)) fail("future evidence");
    if (Date.parse(evidence.validUntil) <= Date.parse(ctx.now)) fail("stale evidence");
  }
  const index = STAGES.indexOf(value.promotionStatus);
  for (const required of TYPES.slice(0, index + 1)) {
    if (!types.has(required)) fail(`missing gate ${required}`);
  }

  const allowed = {
    "repository-reader": new Set(["read-source"]),
    "artifact-reader": new Set(["read-artifact"]),
    "local-test-runner": new Set(["execute-local-test"]),
    "ci-evidence-reader": new Set(["read-ci-result"]),
  };
  for (const permission of value.toolPermissions) {
    if (permission.tenantScope !== ctx.tenantId) fail("tool tenant mismatch");
    for (const action of permission.allowedActions) {
      if (!allowed[permission.toolId]?.has(action)) fail("tool action not allowlisted");
    }
  }

  if (value.promotionStatus === "LIVE_MISSION_PROVEN") {
    const approval = value.approval;
    if (value.tenantAuthorization.humanApprovalRequired !== true) fail("human approval disabled");
    if (ctx.trustedApprovalRecords.get(approval.approvalId) !== JSON.stringify(approval)) {
      fail("approval record is not authenticated");
    }
    if (!ctx.authorizedHumans.has(approval.approvedByPrincipalId)) fail("unauthorized approver");
    if (approval.approvedByPrincipalId === `principal:${value.agentId}`) fail("self-approval");
    if (ctx.revokedApprovals.has(approval.approvalId)) fail("revoked approval");
    if (
      approval.subjectSha !== value.subjectSha ||
      approval.tenantId !== ctx.tenantId ||
      approval.workspaceId !== ctx.workspaceId
    ) fail("approval binding mismatch");
    const requiredArtifacts = new Set([
      value.specification.artifactId,
      value.runtime.artifactId,
      ...value.evidence.map((evidence) => evidence.artifactId),
    ]);
    if (
      approval.subjectArtifactIds.length !== requiredArtifacts.size ||
      approval.subjectArtifactIds.some((id) => !requiredArtifacts.has(id)) ||
      [...requiredArtifacts].some((id) => !approval.subjectArtifactIds.includes(id))
    ) fail("approval artifact mismatch");
    if (Date.parse(approval.approvedAt) < Date.parse(value.subjectCreatedAt)) fail("approval predates subject");
    if (Date.parse(approval.approvedAt) > Date.parse(ctx.now)) fail("future approval");
    if (Date.parse(approval.expiresAt) <= Date.parse(ctx.now)) fail("expired approval");
  }
  return errors;
}

function validate(value, ctx = context()) {
  const shape = validateShape(value);
  const errors = shape ? semanticErrors(value, ctx) : validateShape.errors;
  return { valid: shape && errors.length === 0, errors };
}
const valid = (value, ctx) => {
  const result = validate(value, ctx);
  if (!result.valid) throw new Error(`expected valid: ${JSON.stringify(result.errors)}`);
};
const invalid = (value, ctx) => {
  if (validate(value, ctx).valid) throw new Error("expected invalid");
};
const quarantineEntryValid = (value) =>
  typeof value === "string" &&
  /^unresolved-occurrence-[0-9]{3}$/.test(value);
const canonicalRegistryValid = (records) =>
  records.length === 42 &&
  new Set(records.map((record) => record.id)).size === 42 &&
  !records.some((record) => /aaliyah/i.test(record.id) || /aaliyah/i.test(record.name));

const cases = [];
const test = (name, run) => cases.push({ name, run });
const aggregatePasses = (summary) =>
  summary.executed === summary.required &&
  summary.failed === 0 &&
  summary.skipped === 0 &&
  summary.cancelled === 0 &&
  summary.neutral === 0 &&
  summary.stale === 0;
const mutate = (stage, change, ctx) => {
  const value = makeContract(stage);
  change(value, ctx);
  invalid(value, ctx);
};

test("census exact 24+18=42 with one external", () => {
  const ids = (kind) => registry.records.filter((x) => x.kind === kind).map((x) => x.id).sort();
  if (JSON.stringify(ids("SPECIALIST_SPEC")) !== JSON.stringify([...SPECIALISTS].sort())) throw new Error("specialist mismatch");
  if (JSON.stringify(ids("DEPARTMENT_LEAD")) !== JSON.stringify([...LEADS].sort())) throw new Error("lead mismatch");
  if (
    registry.records.length !== 42 ||
    registry.counts.specialistSpecificationsObserved !== 25 ||
    registry.counts.specialistSpecificationsCanonical !== 24 ||
    registry.counts.departmentLeads !== 18 ||
    registry.counts.zbmCanonicalTotal !== 42 ||
    registry.counts.externalExcluded !== 1 ||
    registry.counts.sourceRecordsObserved !== 43
  ) throw new Error("42 canonical + 1 external accounting mismatch");
  if (
    registry.sourceCommitSha !== "94376718e07df2e9d44864ed0394d58219224e61" ||
    registry.sourceEvidence.specialistDirectoryTreeOid !== "2f2dacfbec217dccd142b1e598108b327ab967a7" ||
    registry.sourceEvidence.departmentLeadsBlobOid !== "9af16a1aff96b070588cf38d9308d821ec3c3d65"
  ) throw new Error("census source evidence mismatch");
});
test("canonical IDs unique and quarantine excluded", () => {
  const ids = registry.records.map((x) => x.id);
  if (
    !canonicalRegistryValid(registry.records) ||
    ids.some((id) => id.startsWith("unresolved-"))
  ) throw new Error("canonical uniqueness failure");
});
test("canonical names locked to Brandy Kobe Jordyn", () => {
  const expected = new Map([
    ["lead.brand-intelligence", "Brandy"],
    ["lead.marketing-operations", "Kobe"],
    ["lead.revenue-performance", "Jordyn"],
  ]);
  for (const [id, name] of expected) {
    if (registry.records.find((record) => record.id === id)?.name !== name) {
      throw new Error(`wrong canonical name for ${id}`);
    }
  }
  const forbidden = new Set(["Brandon", "Brandyn", "Jordan"]);
  if (registry.records.some((record) => forbidden.has(record.name))) {
    throw new Error("legacy spelling used as canonical display name");
  }
});
test("Aaliyah excluded as separate external system", () => {
  if (registry.records.some((record) => /aaliyah/i.test(record.id) || /aaliyah/i.test(record.name))) {
    throw new Error("Aaliyah contaminated ZBM canonical registry");
  }
  if (registry.externalSystems.length !== 1) throw new Error("external system count mismatch");
  const external = registry.externalSystems[0];
  if (
    external.id !== "external.aaliyah" ||
    external.relationship !== "SEPARATE_FOUNDER_SYSTEM" ||
    external.countedInZbmAgentTotal !== false ||
    external.runtimeAuthority !== "SEPARATE" ||
    external.repositoryAuthority !== "SEPARATE_OR_UNRESOLVED" ||
    external.historicalEvidencePreserved !== true
  ) throw new Error("Aaliyah external-system invariant failure");
});
test("runtime references remain documentary and uncertified", () => {
  for (const id of [
    "lead.brand-intelligence",
    "lead.marketing-operations",
    "lead.revenue-performance",
  ]) {
    const record = registry.records.find((entry) => entry.id === id);
    if (
      record?.documentaryStatus !== "RUNTIME_REFERENCE_OBSERVED_NOT_CERTIFIED" ||
      record.runtimeReferenceObserved !== true ||
      record.runtimeRepository !== "DarksiedCEO/zbestmedia-ui" ||
      record.productionProven !== false ||
      record.liveMissionProven !== false ||
      record.certificationStatus !== "NOT_PROVEN" ||
      "operationalStatus" in record
    ) throw new Error(`ambiguous runtime status for ${id}`);
  }
  if (JSON.stringify(registry).includes("PRODUCTION_PENDING")) {
    throw new Error("production-pending language remains in census");
  }
});
test("observed documentary accounting remains 43 plus 32", () => {
  if (
    registry.counts.zbmCanonicalTotal + registry.counts.externalExcluded !== 43 ||
    quarantine.claimedOccurrenceCount !== 32
  ) throw new Error("observed documentary accounting mismatch");
});
test("founder packet has no stale reviewer verdict", () => {
  const packet = readFileSync(resolve(p0Root, "founder-packet.md"), "utf8");
  for (const gate of [
    "Independent Security verdict | NOT_RUN",
    "Independent Reliability verdict | NOT_RUN",
    "Independent Test Verification verdict | NOT_RUN",
    "Release Guardian verdict | NOT_RUN",
    "Independent AEGIS verdict | NOT_RUN",
  ]) {
    if (!packet.includes(gate)) throw new Error(`missing fresh gate state: ${gate}`);
  }
  if (
    packet.includes("Confirm whether Aaliyah") ||
    packet.includes("Decide whether backend `Brandyn`") ||
    !packet.includes("Aaliyah: `SEPARATE_FOUNDER_SYSTEM`") ||
    !packet.includes("Canonical display names: `Brandy`, `Kobe`, `Jordyn`")
  ) throw new Error("resolved founder decision reopened");
});
test("quarantine exact 32 unique claim-only slots", () => {
  if (
    quarantine.claimedOccurrenceCount !== 32 ||
    quarantine.individuallyReproducedCount !== 0 ||
    quarantine.slots.length !== 32 ||
    new Set(quarantine.slots).size !== 32
  ) throw new Error("quarantine invariant failure");
});
test("quarantine has no operational state", () => {
  if (quarantine.slots.some((x) => typeof x !== "string")) throw new Error("promotable quarantine object");
  if (quarantine.observedCandidatesNotCounted.some((x) => x.runtime || x.promotionStatus || x.toolPermissions)) throw new Error("quarantine operational state");
});
test("positive documentary record", () => valid(makeContract("SOURCE_PINNED")));
test("positive fully gated promotion", () => valid(makeContract("LIVE_MISSION_PROVEN")));
test("reject fabricated LIVE", () => mutate("LIVE_MISSION_PROVEN", (x) => x.evidence.forEach((e) => { e.source.issuerPrincipalId = "principal:attacker"; })));
test("reject humanApprovalRequired=false", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.tenantAuthorization.humanApprovalRequired = false; }));
test("reject arbitrary approver", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.approvedByPrincipalId = "principal:unknown.person"; }));
test("reject NOT_REQUESTED approver", () => mutate("SOURCE_PINNED", (x) => { x.approval.approvedByPrincipalId = HUMAN; }));
test("reject NOT_REQUESTED timestamp", () => mutate("SOURCE_PINNED", (x) => { x.approval.approvedAt = NOW; }));
test("reject fake evidence ID", () => mutate("SOURCE_PINNED", (x) => { x.evidence[0].evidenceId = "fake"; }));
test("reject malformed artifact hash", () => mutate("SOURCE_PINNED", (x) => { x.evidence[0].artifactHash = "sha256:bad"; }));
test("reject mismatched artifact hash", () => mutate("SOURCE_PINNED", (x) => { x.evidence[0].artifactHash = `sha256:${"2".repeat(64)}`; }));
test("reject mismatched evidence SHA", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[0].subjectSha = OTHER_SHA; }));
test("reject foreign specification commit", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.specification.commitSha = OTHER_SHA; }));
test("reject foreign runtime commit", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.runtime.commitSha = OTHER_SHA; }));
test("reject substituted specification artifact", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.specification.sourceHash = `sha256:${"4".repeat(64)}`; }));
test("reject unknown runtime artifact", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.runtime.artifactId = "artifact_unknown_runtime_0001"; }));
test("reject forged trusted-issuer evidence", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[0].createdAt = "2026-07-26T20:00:01.000Z"; }));
test("reject forged approval identity", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.approvalId = "approval_forged_0001"; }));
test("reject cross-agent specification binding", () => {
  const ctx = context();
  ctx.artifacts.set("artifact_other_spec_0001", `sha256:${"6".repeat(64)}`);
  mutate("LIVE_MISSION_PROVEN", (x) => {
    x.specification.path = "agents/other-agent.json";
    x.specification.artifactId = "artifact_other_spec_0001";
    x.specification.sourceHash = `sha256:${"6".repeat(64)}`;
    x.approval.subjectArtifactIds = ["artifact_other_spec_0001", ARTIFACT];
  }, ctx);
});
test("reject cross-agent runtime binding", () => mutate("LIVE_MISSION_PROVEN", (x) => {
  x.runtime.bindingPath = "server/agents/other-agent.ts";
  x.runtime.manifestId = "manifest_other_agent_0001";
}));
test("reject wrong-tenant evidence", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[0].tenantId = "tenant_other"; }));
test("reject wildcard tool", () => mutate("RUNTIME_IMPLEMENTED", (x) => { x.toolPermissions[0].toolId = "*"; }));
test("reject production write", () => mutate("RUNTIME_IMPLEMENTED", (x) => { x.toolPermissions[0].allowedActions = ["delete-production"]; x.toolPermissions[0].readWriteMode = "READ_WRITE"; }));
test("reject stage skipping", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.stageHistory.splice(10, 1); }));
test("reject self-promotion", () => {
  const ctx = context();
  ctx.authorizedHumans.add("principal:agent.test-agent");
  mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.approvedByPrincipalId = "principal:agent.test-agent"; }, ctx);
});
test("reject quarantined promotion", () => {
  const promoted = { id: quarantine.slots[0], promotionStatus: "LIVE_MISSION_PROVEN" };
  if (quarantineEntryValid(promoted)) throw new Error("quarantined object became promotable");
});
test("detect duplicate canonical ID", () => {
  const ids = [...registry.records, registry.records[0]].map((x) => x.id);
  if (new Set(ids).size === ids.length) throw new Error("duplicate undetected");
});
test("detect missing canonical record", () => {
  if (canonicalRegistryValid(registry.records.slice(1))) throw new Error("missing record undetected");
});
test("detect duplicate quarantine ID", () => {
  const ids = [...quarantine.slots, quarantine.slots[0]];
  if (new Set(ids).size === ids.length) throw new Error("duplicate quarantine undetected");
});
test("reject stale exact-SHA evidence", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence.find((e) => e.evidenceType === "EXACT_SHA_CI").validUntil = "2026-07-26T21:00:00.000Z"; }));
test("reject evidence from another agent", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[0].agentId = "agent.other-agent"; }));
test("reject evidence from another workspace", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[0].workspaceId = "workspace_other"; }));
test("reject revoked evidence", () => {
  const ctx = context();
  ctx.revokedEvidence.add("evidence_000000000000");
  mutate("LIVE_MISSION_PROVEN", () => {}, ctx);
});
test("reject revoked approval", () => {
  const ctx = context();
  ctx.revokedApprovals.add("approval_founder_0001");
  mutate("LIVE_MISSION_PROVEN", () => {}, ctx);
});
test("reject revoked schema downstream", () => {
  const ctx = context();
  ctx.revokedSchemas.add("2.0.0");
  mutate("LIVE_MISSION_PROVEN", () => {}, ctx);
});
test("reject wrong approval SHA", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.subjectSha = OTHER_SHA; }));
test("reject wrong approval artifact", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.subjectArtifactIds = ["artifact_unknown_0001"]; }));
test("reject incomplete approval artifact coverage", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.subjectArtifactIds = [ARTIFACT]; }));
test("reject unrelated known approval artifact", () => {
  const ctx = context();
  ctx.artifacts.set("artifact_unrelated_known_0001", `sha256:${"5".repeat(64)}`);
  mutate("LIVE_MISSION_PROVEN", (x) => {
    x.approval.subjectArtifactIds = ["artifact_unrelated_known_0001"];
  }, ctx);
});
test("reject approval before subject", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.approvedAt = "2026-07-26T18:00:00.000Z"; }));
test("reject expired approval", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.approval.expiresAt = "2026-07-26T22:00:00.000Z"; }));
test("reject duplicate evidence ID", () => mutate("LIVE_MISSION_PROVEN", (x) => { x.evidence[1].evidenceId = x.evidence[0].evidenceId; }));
test("reject no-op aggregate", () => {
  if (aggregatePasses({
    required: 35, executed: 0, failed: 0, skipped: 0,
    cancelled: 0, neutral: 0, stale: 0,
  })) throw new Error("no-op aggregate passed");
});

const REQUIRED = new Set([
  "census exact 24+18=42 with one external", "canonical IDs unique and quarantine excluded",
  "canonical names locked to Brandy Kobe Jordyn",
  "Aaliyah excluded as separate external system",
  "runtime references remain documentary and uncertified",
  "observed documentary accounting remains 43 plus 32",
  "founder packet has no stale reviewer verdict",
  "quarantine exact 32 unique claim-only slots", "quarantine has no operational state",
  "positive documentary record", "positive fully gated promotion",
  "reject fabricated LIVE", "reject humanApprovalRequired=false",
  "reject arbitrary approver", "reject NOT_REQUESTED approver",
  "reject NOT_REQUESTED timestamp", "reject fake evidence ID",
  "reject malformed artifact hash", "reject mismatched artifact hash",
  "reject mismatched evidence SHA",
  "reject foreign specification commit", "reject foreign runtime commit",
  "reject substituted specification artifact", "reject unknown runtime artifact",
  "reject forged trusted-issuer evidence",
  "reject forged approval identity", "reject cross-agent specification binding",
  "reject cross-agent runtime binding",
  "reject wrong-tenant evidence", "reject wildcard tool",
  "reject production write", "reject stage skipping", "reject self-promotion",
  "reject quarantined promotion", "detect duplicate canonical ID",
  "detect missing canonical record", "detect duplicate quarantine ID",
  "reject stale exact-SHA evidence", "reject evidence from another agent",
  "reject evidence from another workspace", "reject revoked evidence",
  "reject revoked approval",
  "reject revoked schema downstream", "reject wrong approval SHA",
  "reject wrong approval artifact", "reject approval before subject",
  "reject incomplete approval artifact coverage",
  "reject unrelated known approval artifact",
  "reject expired approval", "reject duplicate evidence ID",
  "reject no-op aggregate",
]);
const names = new Set(cases.map((x) => x.name));
if (names.size !== cases.length) throw new Error("duplicate aggregate case name");
for (const required of REQUIRED) if (!names.has(required)) throw new Error(`missing aggregate case: ${required}`);

let passed = 0;
const failures = [];
for (const entry of cases) {
  try {
    entry.run();
    passed += 1;
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failures.push({ name: entry.name, error: error.message });
    console.error(`FAIL ${entry.name}: ${error.message}`);
  }
}
const summary = {
  suite: "p0-reconciliation",
  candidateSha: actualHeadSha,
  required: REQUIRED.size,
  executed: cases.length,
  passed,
  failed: failures.length,
  skipped: 0,
  cancelled: 0,
  neutral: 0,
  stale: 0,
  failures,
};
console.log(JSON.stringify(summary));
if (!aggregatePasses(summary)) process.exit(1);
