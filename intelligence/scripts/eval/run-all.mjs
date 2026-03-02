import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { writeJson } from "../../../tools/fs/write-json.mjs";
import { sha256File, sha256String } from "../../../tools/crypto/sha256.mjs";
import { execSync } from "node:child_process";
import { callOrca } from "../runtime/orcaClient.mjs";
import { parseStrictJson } from "../runtime/strictJson.mjs";
import { evaluateDrift } from "../runtime/diff.mjs";

function nowIso() {
  return new Date().toISOString();
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return "unknown";
  }
}

function fail(msg) {
  console.error(`[eval:all] ${msg}`);
  process.exit(1);
}

function resolveOrder(prompts) {
  const byId = new Map(prompts.map((p) => [p.id, p]));
  const temp = new Set();
  const perm = new Set();
  const out = [];

  function visit(id) {
    if (perm.has(id)) return;
    if (temp.has(id)) fail(`dependency cycle detected at ${id}`);
    temp.add(id);

    const p = byId.get(id);
    if (!p) fail(`unknown prompt dependency: ${id}`);

    if (p.dependsOn) {
      visit(p.dependsOn);
    }

    temp.delete(id);
    perm.add(id);
    out.push(p);
  }

  for (const p of prompts) {
    visit(p.id);
  }

  return out;
}

function applyDependencyInput(prompt, fixture, outputsById) {
  if (!prompt.dependsOn) return fixture;

  const parent = outputsById.get(prompt.dependsOn);
  if (!parent) fail(`[${prompt.id}] missing dependency output for ${prompt.dependsOn}`);

  if (prompt.id === "governance.safeRewrite") {
    return {
      ...fixture,
      policyPackId: parent.policyPackId ?? fixture.policyPackId,
      flags: parent.flags ?? fixture.flags
    };
  }

  return fixture;
}

const manifest = readJson("intelligence/registry/manifest.json");
if (!Array.isArray(manifest.prompts) || manifest.prompts.length === 0) {
  fail("manifest has no prompts");
}

const orderedPrompts = resolveOrder(manifest.prompts);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const outputsById = new Map();
const governanceReports = [];

const summary = {
  at: nowIso(),
  gitSha: gitSha(),
  prompts: [],
  ok: true
};

for (const p of orderedPrompts) {
  const fixturePath = p.fixture ?? `intelligence/evaluations/fixtures/${p.id}.fixture.v${p.promptVersion}.json`;
  const fixtureBase = readJson(fixturePath);
  const fixture = applyDependencyInput(p, fixtureBase, outputsById);

  const inputSchema = readJson(p.inputSchema);
  const outputSchema = readJson(p.outputSchema);

  const validateIn = ajv.compile(inputSchema);
  if (!validateIn(fixture)) {
    fail(`[${p.id}] input invalid: ${ajv.errorsText(validateIn.errors)}`);
  }

  const promptText = readFileSync(p.path, "utf8");
  const orca = await callOrca({ promptId: p.id, promptText, inputJson: fixture });
  const output = parseStrictJson(orca.raw);

  const validateOut = ajv.compile(outputSchema);
  if (!validateOut(output)) {
    fail(`[${p.id}] output invalid: ${ajv.errorsText(validateOut.errors)}`);
  }

  let drift = null;
  if (p.golden) {
    const golden = readJson(p.golden);
    drift = evaluateDrift(p.driftPolicy?.mode ?? "structure", output, golden, p.driftPolicy ?? {});

    if (!drift.ok) {
      fail(`[${p.id}] golden drift: ${JSON.stringify(drift, null, 2)}`);
    }
  }

  const report = {
    at: nowIso(),
    gitSha: gitSha(),
    prompt: {
      id: p.id,
      promptVersion: p.promptVersion,
      path: p.path,
      promptSha256: sha256File(p.path),
      inputSchema: p.inputSchema,
      outputSchema: p.outputSchema,
      outputSchemaSha256: sha256File(p.outputSchema),
      golden: p.golden ?? null,
      driftPolicy: p.driftPolicy ?? null,
      dependsOn: p.dependsOn ?? null
    },
    orca: {
      correlationId: orca.correlationId,
      responseCorrelationId: orca.responseCorrelationId,
      durationMs: orca.durationMs
    },
    fixture: {
      path: fixturePath,
      sha256: sha256File(fixturePath),
      meta: fixture._meta ?? null
    },
    result: {
      ok: true,
      outputSha256: sha256String(JSON.stringify(output)),
      output,
      drift
    }
  };

  const outPath = `intelligence/evaluations/reports/${p.id}.${Date.now()}.json`;
  writeJson(outPath, report);

  outputsById.set(p.id, output);
  if (p.id.startsWith("governance.")) {
    governanceReports.push({ id: p.id, report: outPath, output });
  }

  summary.prompts.push({
    id: p.id,
    ok: true,
    report: outPath
  });
}

const summaryPath = `intelligence/evaluations/reports/_summary.${Date.now()}.json`;
writeJson(summaryPath, summary);

if (governanceReports.length > 0) {
  const dossier = {
    at: nowIso(),
    gitSha: gitSha(),
    reports: governanceReports.map((r) => ({ id: r.id, report: r.report })),
    riskcheck: governanceReports.find((r) => r.id === "governance.riskcheck")?.output ?? null,
    safeRewrite: governanceReports.find((r) => r.id === "governance.safeRewrite")?.output ?? null
  };
  const dossierPath = `intelligence/evaluations/reports/_governance_dossier.${Date.now()}.json`;
  writeJson(dossierPath, dossier);
  console.log(`[eval:all] OK wrote ${summaryPath}`);
  console.log(`[eval:all] OK wrote ${dossierPath}`);
} else {
  console.log(`[eval:all] OK wrote ${summaryPath}`);
}
