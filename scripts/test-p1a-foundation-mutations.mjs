import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseStrictJson, canonicalDigest } from "./p1a/canonical-json.mjs";
import { validateManifest } from "./p1a/certification-manifest.mjs";
import { classifySubject } from "./p1a/subject-classifier.mjs";
import { evaluateCompleteness } from "./p1a/completeness-oracle.mjs";
import { createAccounting, applyAccountingEvent, aggregateAccounting } from "./p1a/accounting-state-machine.mjs";

const sha = (c) => c.repeat(40), digest = (c) => c.repeat(64); let killed = 0;
const realManifest = JSON.parse(await readFile(new URL("../.github/p1a/certification-contract.v1.json", import.meta.url), "utf8"));
const mutations = [
  ["M-MAN-003_duplicate_role", () => { const manifest = structuredClone(realManifest); const copy = structuredClone(manifest.authorities[0]); copy.authority_id = "z_duplicate"; copy.materialization_path = "z_duplicate_store"; manifest.authorities.push(copy); assert.throws(() => validateManifest(manifest), /duplicated/); }],
  ["M-CUST-001_candidate_manifest", () => { const manifest = structuredClone(realManifest); manifest.repositoryIdentity.selectedBy = "candidate"; assert.throws(() => validateManifest(manifest), /custody/); }],
  ["M-CLS-001_zero_match", () => { const policy = { repository: "DarksiedCEO/zbestmedia", contractDigest: digest("a"), selectingAuthorities: { github_event: { digest: digest("b"), source: "trusted_external" } }, gitObservationDigests: {} }; const env = { repository: policy.repository, subjectSha: sha("a"), subjectTree: sha("b"), orderedParents: [sha("c")], eventKind: "push", authorizedFileScope: [], observedScope: [], contractDigest: policy.contractDigest, selectingAuthority: { kind: "github_event", digest: digest("b"), source: "attacker" }, eventHeadSha: sha("a"), unprivileged: false, certificationClaim: true }; assert.throws(() => classifySubject(env, policy, canonicalDigest(env)), /authority|canonical/); }],
  ["M-ORA-001_missing_producer", () => { const manifest = { contractVersion: "v", authorities: [{ authority_id: "a", role: "r", owner: "trusted", consumer_bindings: ["c"] }], consumers: [{ consumer_id: "c", required_roles: ["r"], verification_obligations: ["v"], cleanup_obligations: ["c"], accounting_obligations: ["a"] }] }; const executableRegistry = { producers: [], consumers: [{ consumer_id: "c" }], objectStores: [] }; const frozenCatalog = { contractVersion: "v", consumers: [{ consumer_id: "c" }] }; const report = evaluateCompleteness({ manifest, executableRegistry, frozenCatalog, bindings: { executableRegistryDigest: canonicalDigest(executableRegistry), frozenCatalogDigest: canonicalDigest(frozenCatalog) } }); assert(report.findings.some((x) => x.code === "MISSING_PRODUCER")); }],
  ["M-ACC-001_skip_as_green", () => { const identity = { runId: "r", attempt: 1, candidateSha: sha("a"), workflowSha: sha("b"), contractDigest: digest("c") }; const a = createAccounting(identity, ["required"]); applyAccountingEvent(a, { eventId: "1", checkId: "required", state: "SKIPPED" }); assert.equal(aggregateAccounting(a).decision, "NON_GREEN"); }],
  ["M-JSON-001_duplicate_key", () => assert.throws(() => parseStrictJson('{"x":1,"x":2}'), /duplicate key/)]
];
for (const [id, run] of mutations) { run(); killed += 1; console.log(`KILLED ${id}`); }
console.log(JSON.stringify({ suite: "p1a-foundation-hostile-inputs", attempted: mutations.length, executed: mutations.length, rejected: killed, mutationClaim: false }));
