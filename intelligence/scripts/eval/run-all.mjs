import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { writeJson } from "../../../tools/fs/write-json.mjs";
import { sha256File, sha256String } from "../../../tools/crypto/sha256.mjs";
import { execSync } from "node:child_process";
import { callOrca } from "../runtime/orcaClient.mjs";
import { parseStrictJson } from "../runtime/strictJson.mjs";
import { diffScore, diffSignalKeys, diffCounts } from "../runtime/diff.mjs";

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

const manifest = readJson("intelligence/registry/manifest.json");
if (!Array.isArray(manifest.prompts) || manifest.prompts.length === 0) {
  fail("manifest has no prompts");
}

const ajv = new Ajv2020({ allErrors: true, strict: true });

const summary = {
  at: nowIso(),
  gitSha: gitSha(),
  prompts: [],
  ok: true
};

for (const p of manifest.prompts) {
  const fixturePath = `intelligence/evaluations/fixtures/${p.id}.fixture.v${p.promptVersion}.json`;
  const fixture = readJson(fixturePath);

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
    const policy = p.driftPolicy ?? { maxScoreDelta: 10, maxWarningsIncrease: 3 };

    const score = output.score !== undefined && golden.score !== undefined
      ? diffScore(output, golden, policy.maxScoreDelta ?? 10)
      : { ok: true, delta: 0 };

    const signalKeys = output.signals && golden.signals
      ? diffSignalKeys(output, golden)
      : { ok: true, missing: [] };

    const counts = diffCounts(output, golden);
    const warningsOk = counts.warningsDelta <= (policy.maxWarningsIncrease ?? 3);

    const ok = score.ok && signalKeys.ok && warningsOk;

    drift = {
      ok,
      score,
      signalKeys,
      counts,
      policy
    };

    if (!ok) {
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
      golden: p.golden ?? null
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

  summary.prompts.push({
    id: p.id,
    ok: true,
    report: outPath
  });
}

const summaryPath = `intelligence/evaluations/reports/_summary.${Date.now()}.json`;
writeJson(summaryPath, summary);
console.log(`[eval:all] OK wrote ${summaryPath}`);
