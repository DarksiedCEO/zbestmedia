import Ajv2020 from "ajv/dist/2020.js";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { writeJson } from "../../../tools/fs/write-json.mjs";
import { execSync } from "node:child_process";
import { resolvePolicy } from "../runtime/policyResolver.mjs";
import { runJob } from "../jobs/runJob.mjs";

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
    const ids = [...queue];
    queue = [];
    levels.push(ids.map((id) => byId.get(id)));

    for (const id of ids) {
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

  const result = await runJob({
    prompt,
    fixturePath,
    fixture,
    inputForModel,
    policyInfo,
    ajv: context.ajv,
    gitSha: context.gitSha,
    persistArtifacts: true
  });

  return {
    id: prompt.id,
    output: result.output,
    outputSha256: result.outputSha256,
    jobId: result.jobId,
    report: result.reportPath,
    artifactDir: result.baseDir
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
    summary.prompts.push({
      id: item.id,
      ok: true,
      jobId: item.jobId,
      report: item.report,
      artifactDir: item.artifactDir,
      outputSha256: item.outputSha256
    });
  }
}

const summaryPath = `intelligence/evaluations/reports/_summary.${Date.now()}.json`;
writeJson(summaryPath, summary);

const governanceReports = summary.prompts.filter((p) => p.id.startsWith("governance."));
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
