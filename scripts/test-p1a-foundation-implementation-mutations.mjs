import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL(".", import.meta.url));
const repository = fileURLToPath(new URL("..", import.meta.url));
const bootstrap = "/private/tmp/zbm-p1a-packet3-trusted-foundation/scripts";
const requiredEnvironment = ["P1A_REQUIRED_CONSUMER_CATALOG_PATH", "P1A_REQUIRED_CONSUMER_CATALOG_SCHEMA_PATH", "P1A_REQUIRED_CONSUMER_CATALOG_FREEZE_PATH"];
for (const name of requiredEnvironment) assert.ok(process.env[name], `${name} must be selected by the trusted harness`);
const execute = (testPath) => spawnSync(process.execPath, [testPath], { encoding: "utf8", env: process.env });
const combined = (run) => `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const mutants = [
  { id: "manifest_custody_bypass", file: "p1a/certification-manifest.mjs", from: 'manifest.repositoryIdentity.selectedBy !== "trusted_workflow"', to: 'manifest.repositoryIdentity.selectedBy === "candidate"', control: "manifest_attacker_custody" },
  { id: "nested_object_unknown_bypass", file: "p1a/certification-manifest.mjs", from: 'exactKeys(item, OBJECT_FIELDS, "required object");', to: '', control: "manifest_nested_unknown_object_field" },
  { id: "canonical_byte_bypass", file: "p1a/canonical-json.mjs", from: 'if (!Buffer.from(bytes).equals(canonicalBytes(value)))', to: 'if (false && !Buffer.from(bytes).equals(canonicalBytes(value)))', control: "noncanonical_bytes_rejected" },
  { id: "consumer_accounting_set_bypass", file: "p1a/completeness-oracle.mjs", from: 'if (!exactSet(accountingIds, requiredIds)) findings.push(finding("CATALOG_CONSUMER_SET_INVALID", "accounting", { actual: accountingIds, expected: requiredIds }));', to: 'if (false && !exactSet(accountingIds, requiredIds)) findings.push(finding("CATALOG_CONSUMER_SET_INVALID", "accounting", { actual: accountingIds, expected: requiredIds }));', control: "oracle_accounting_set_exact" },
  { id: "catalog_authority_bypass", file: "p1a/completeness-oracle.mjs", from: '!isLoadedRequiredConsumerCatalog(frozenCatalog) || ', to: '', control: "oracle_unloaded_catalog_rejected" },
  { id: "external_catalog_custody_bypass", file: "p1a/required-consumer-catalog.mjs", from: 'canonicalDigest(authority) !== canonicalDigest(expectedAuthority)', to: 'false', control: "external_catalog_candidate_authority_rejected" },
  { id: "direct_accounting_green", file: "p1a/accounting-state-machine.mjs", from: 'if (record.state !== derived || record.key !== keyOf(accounting.identity, id))', to: 'if (record.key !== keyOf(accounting.identity, id))', control: "accounting_direct_green_tamper_rejected" },
  { id: "missing_event_acceptance", file: "p1a/accounting-state-machine.mjs", from: 'const derived = record.contradictions.length > 0 ? "INDETERMINATE" : record.events.length === 0 ? "NOT_RUN" : record.events.at(-1).state;', to: 'const derived = record.state;', control: "accounting_direct_green_tamper_rejected" },
  { id: "fabricated_evidence_authority", file: "p1a/adverse-evidence.mjs", from: '!PRODUCERS.has(envelope.producer) || ', to: '', control: "mutated_evidence_producer_rejected" },
  { id: "subject_selected_authority", file: "p1a/subject-classifier.mjs", from: 'envelope.selectingAuthority?.source !== expectedAuthority.source || ', to: '', control: "classifier_candidate_authority" }
];

const results = [];
for (const mutant of mutants) {
  const root = await mkdtemp(join(tmpdir(), `p1a-mutant-${mutant.id}-`));
  try {
    await cp(join(scripts, "p1a"), join(root, "scripts", "p1a"), { recursive: true });
    await cp(join(scripts, "test-p1a-foundation.mjs"), join(root, "scripts", "test-p1a-foundation.mjs"));
    await cp(join(repository, ".github", "p1a"), join(root, ".github", "p1a"), { recursive: true });
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    const testPath = join(root, "scripts", "test-p1a-foundation.mjs");
    const baseline = execute(testPath);
    assert.equal(baseline.status, 0, `${mutant.id}: unmutated isolated baseline failed\n${combined(baseline)}`);
    assert.match(baseline.stdout, /"failed":0/iu, `${mutant.id}: baseline did not complete full suite`);
    const target = join(root, "scripts", mutant.file); const original = await readFile(target, "utf8");
    assert.equal(original.split(mutant.from).length - 1, 1, `${mutant.id}: mutation site must exist exactly once`);
    const changed = original.replace(mutant.from, mutant.to); assert.notEqual(changed, original);
    await writeFile(target, changed);
    const run = execute(testPath);
    assert.notEqual(run.status, 0, `${mutant.id}: implementation mutant survived`);
    assert.match(combined(run), new RegExp(`FAIL ${mutant.control}(?:\\s|$)`, "u"), `${mutant.id}: failure was not attributable to ${mutant.control}\n${combined(run)}`);
    results.push({ id: mutant.id, target: mutant.file, control: mutant.control, exercised: true, killed: true, exitCode: run.status });
    console.log(`KILLED ${mutant.id} target=${mutant.file} control=${mutant.control}`);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const bootstrapRoot = await mkdtemp(join(tmpdir(), "p1a-mutant-bootstrap-"));
try {
  await cp(join(bootstrap, "p1a-bootstrap-verifier.mjs"), join(bootstrapRoot, "p1a-bootstrap-verifier.mjs"));
  await cp(join(bootstrap, "test-p1a-bootstrap-verifier.mjs"), join(bootstrapRoot, "test-p1a-bootstrap-verifier.mjs"));
  const bootstrapTest = join(bootstrapRoot, "test-p1a-bootstrap-verifier.mjs");
  const bootstrapTestSource = await readFile(bootstrapTest, "utf8");
  const bootstrapLoop = "for (const test of tests) { test.run(); passed += 1; console.log(`PASS ${test.name}`); }";
  assert.equal(bootstrapTestSource.split(bootstrapLoop).length - 1, 1, "bootstrap test instrumentation site must exist exactly once");
  await writeFile(bootstrapTest, bootstrapTestSource.replace(bootstrapLoop, "for (const test of tests) { try { test.run(); passed += 1; console.log(`PASS ${test.name}`); } catch (error) { console.error(`FAIL ${test.name}`); throw error; } }"));
  const baseline = execute(bootstrapTest);
  assert.equal(baseline.status, 0, `bootstrap unmutated isolated baseline failed\n${combined(baseline)}`);
  const target = join(bootstrapRoot, "p1a-bootstrap-verifier.mjs"); const original = await readFile(target, "utf8");
  const site = "sha256(authority) !== expectedDigest"; assert.equal(original.split(site).length - 1, 1, "bootstrap mutation site must exist exactly once");
  await writeFile(target, original.replace(site, "false"));
  const run = execute(bootstrapTest);
  assert.notEqual(run.status, 0, "bootstrap authorization mutant survived");
  assert.match(combined(run), /FAIL candidate_selected_frozen_authority(?:\s|$)/u, `bootstrap mutant failure was not attributable to candidate_selected_frozen_authority\n${combined(run)}`);
  results.push({ id: "bootstrap_authorization_bypass", target: "frozen-bootstrap/p1a-bootstrap-verifier.mjs", control: "candidate_selected_frozen_authority", exercised: true, killed: true, exitCode: run.status });
  console.log("KILLED bootstrap_authorization_bypass target=frozen-bootstrap control=candidate_selected_frozen_authority");
} finally { await rm(bootstrapRoot, { recursive: true, force: true }); }

console.log(JSON.stringify({ suite: "p1a-foundation-implementation-mutations", attempted: results.length, executed: results.length, killed: results.length, survived: 0, equivalent: 0, unresolved: 0, results }));
