import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { writeJson } from "../../../tools/fs/write-json.mjs";
import { sha256File, sha256String } from "../../../tools/crypto/sha256.mjs";
import { execSync } from "node:child_process";
import { callOrca } from "../runtime/orcaClient.mjs";
import { parseStrictJson } from "../runtime/strictJson.mjs";
import { evaluateDrift } from "../runtime/diff.mjs";
import { resolvePolicy } from "../runtime/policyResolver.mjs";

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

function toWorkerLevels(prompts) {
  const byId = new Map(prompts.map((p) => [p.id, p]));
  const indegree = new Map();
  const edges = new Map();

  for (const p of prompts) {
    indegree.set(p.id, 0);
    edges.set(p.id, []);
  }

  for (const p of prompts) {
    if (!p.dependsOn) continue;
    if (!byId.has(p.dependsOn)) fail(`unknown prompt dependency: ${p.dependsOn}`);
    indegree.set(p.id, (indegree.get(p.id) ?? 0) + 1);
    edges.get(p.dependsOn)?.push(p.id);
  }

  const levels = [];
  let queue = prompts.filter((p) => (indegree.get(p.id) ?? 0) === 0).map((p) => p.id);
  let visited = 0;

  while (queue.length > 0) {
    const currentLevelIds = [...queue];
    queue = [];
    levels.push(currentLevelIds.map((id) => byId.get(id)));

    for (const id of currentLevelIds) {
      visited += 1;
      for (const next of edges.get(id) ?? []) {
        const nextDegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextDegree);
        if (nextDegree === 0) queue.push(next);
      }
    }
  }

  if (visited !== prompts.length) {
    fail("dependency cycle detected in prompt manifest");
  }

  return levels;
}

async function runWithConcurrency(items, worker, limit) {
  const results = [];
  let next = 0;

  async function runner() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await worker(items[idx]);
    }
  }

  const workers = [];
  const count = Math.min(limit, items.length);
  for (let i = 0; i < count; i += 1) {
    workers.push(runner());
  }

  await Promise.all(workers);
  return results;
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

async function executePrompt(prompt, context) {
  const fixturePath = prompt.fixture ?? `intelligence/evaluations/fixtures/${prompt.id}.fixture.v${prompt.promptVersion}.json`;
  const fixtureBase = readJson(fixturePath);
  const fixture = applyDependencyInput(prompt, fixtureBase, context.outputsById);
  let inputForModel = fixture;
  let policyInfo = null;

  if (prompt.id.startsWith("governance.")) {
    const policyPackId = fixture.policyPackId ?? fixture._meta?.policyPackId;
    if (!policyPackId) fail(`[${prompt.id}] missing policyPackId in fixture`);
    const { resolved, resolvedPolicyHash } = resolvePolicy(policyPackId);
    policyInfo = { policyPackId, resolvedPolicyHash };
    inputForModel = {
      ...fixture,
      _policy: resolved,
      _policyHash: resolvedPolicyHash
    };
  }

  const inputSchema = readJson(prompt.inputSchema);
  const outputSchema = readJson(prompt.outputSchema);

  const validateIn = context.ajv.compile(inputSchema);
  if (!validateIn(fixture)) {
    fail(`[${prompt.id}] input invalid: ${context.ajv.errorsText(validateIn.errors)}`);
  }

  const promptText = readFileSync(prompt.path, "utf8");
  const orca = await callOrca({ promptId: prompt.id, promptText, inputJson: inputForModel });
  const output = parseStrictJson(orca.raw);

  const validateOut = context.ajv.compile(outputSchema);
  if (!validateOut(output)) {
    fail(`[${prompt.id}] output invalid: ${context.ajv.errorsText(validateOut.errors)}`);
  }

  let drift = null;
  if (prompt.golden) {
    const golden = readJson(prompt.golden);
    drift = evaluateDrift(prompt.driftPolicy?.mode ?? "structure", output, golden, prompt.driftPolicy ?? {});
    if (!drift.ok) {
      fail(`[${prompt.id}] golden drift: ${JSON.stringify(drift, null, 2)}`);
    }
  }

  const report = {
    at: nowIso(),
    gitSha: context.gitSha,
    prompt: {
      id: prompt.id,
      promptVersion: prompt.promptVersion,
      path: prompt.path,
      promptSha256: sha256File(prompt.path),
      inputSchema: prompt.inputSchema,
      outputSchema: prompt.outputSchema,
      outputSchemaSha256: sha256File(prompt.outputSchema),
      golden: prompt.golden ?? null,
      driftPolicy: prompt.driftPolicy ?? null,
      dependsOn: prompt.dependsOn ?? null
    },
    orca: {
      correlationId: orca.correlationId,
      responseCorrelationId: orca.responseCorrelationId,
      durationMs: orca.durationMs,
      attempts: orca.attempts ?? 1
    },
    fixture: {
      path: fixturePath,
      sha256: sha256File(fixturePath),
      meta: fixture._meta ?? null
    },
    policy: policyInfo,
    result: {
      ok: true,
      outputSha256: sha256String(JSON.stringify(output)),
      output,
      drift
    }
  };

  const outPath = `intelligence/evaluations/reports/${prompt.id}.${Date.now()}.json`;
  writeJson(outPath, report);

  return {
    id: prompt.id,
    output,
    report: outPath
  };
}

const manifest = readJson("intelligence/registry/manifest.json");
if (!Array.isArray(manifest.prompts) || manifest.prompts.length === 0) {
  fail("manifest has no prompts");
}

const concurrency = Math.max(1, Math.min(4, Number(process.env.EVAL_CONCURRENCY ?? 1)));
const levels = toWorkerLevels(manifest.prompts);
const context = {
  ajv: new Ajv2020({ allErrors: true, strict: true }),
  outputsById: new Map(),
  gitSha: gitSha()
};

const summary = {
  at: nowIso(),
  gitSha: context.gitSha,
  concurrency,
  prompts: [],
  ok: true
};

for (const level of levels) {
  const finished = await runWithConcurrency(level, async (prompt) => executePrompt(prompt, context), concurrency);
  for (const item of finished) {
    context.outputsById.set(item.id, item.output);
    summary.prompts.push({ id: item.id, ok: true, report: item.report });
  }
}

const governanceReports = summary.prompts.filter((p) => p.id.startsWith("governance."));
const summaryPath = `intelligence/evaluations/reports/_summary.${Date.now()}.json`;
writeJson(summaryPath, summary);

if (governanceReports.length > 0) {
  const dossier = {
    at: nowIso(),
    gitSha: context.gitSha,
    reports: governanceReports,
    riskcheck: context.outputsById.get("governance.riskcheck") ?? null,
    safeRewrite: context.outputsById.get("governance.safeRewrite") ?? null
  };

  const dossierPath = `intelligence/evaluations/reports/_governance_dossier.${Date.now()}.json`;
  writeJson(dossierPath, dossier);
  console.log(`[eval:all] OK wrote ${summaryPath}`);
  console.log(`[eval:all] OK wrote ${dossierPath}`);
} else {
  console.log(`[eval:all] OK wrote ${summaryPath}`);
}
