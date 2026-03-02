import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
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
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return "unknown";
  }
}

function fail(msg) {
  console.error(`[eval] ${msg}`);
  process.exit(1);
}

const manifest = readJson("intelligence/registry/manifest.json");
const prompt = manifest.prompts.find((p) => p.id === "content.score");
if (!prompt) fail("manifest missing prompt id=content.score");

const fixturePath = "intelligence/evaluations/fixtures/content.score.fixture.v1.json";
const input = readJson(fixturePath);

const promptText = readFileSync(prompt.path, "utf8");

const ajv = new Ajv2020({ allErrors: true, strict: true });
const inputSchema = readJson(prompt.inputSchema);
const outputSchema = readJson(prompt.outputSchema);

const validateIn = ajv.compile(inputSchema);
if (!validateIn(input)) fail(`input schema validation failed: ${ajv.errorsText(validateIn.errors)}`);

const orca = await callOrca({ promptEntry: prompt, promptText, inputJson: input });
const output = parseStrictJson(orca.raw);

const validateOut = ajv.compile(outputSchema);
if (!validateOut(output)) fail(`output schema validation failed: ${ajv.errorsText(validateOut.errors)}`);

const golden = prompt.golden ? readJson(prompt.golden) : null;
let drift = null;

if (golden) {
  const policy = prompt.driftPolicy ?? { maxScoreDelta: 10, maxWarningsIncrease: 3 };

  const score = diffScore(output, golden, policy.maxScoreDelta);
  const signalKeys = diffSignalKeys(output, golden);
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
    fail(`golden drift detected: ${JSON.stringify(drift, null, 2)}`);
  }
}

const report = {
  at: nowIso(),
  gitSha: gitSha(),
  prompt: {
    id: prompt.id,
    promptVersion: prompt.promptVersion,
    path: prompt.path,
    promptSha256: sha256File(prompt.path),
    inputSchema: prompt.inputSchema,
    outputSchema: prompt.outputSchema,
    outputSchemaSha256: sha256File(prompt.outputSchema),
    golden: prompt.golden ?? null
  },
  orca: {
    correlationId: orca.correlationId,
    responseCorrelationId: orca.responseCorrelationId,
    durationMs: orca.durationMs
  },
  fixture: {
    path: fixturePath,
    sha256: sha256File(fixturePath),
    meta: input._meta ?? null
  },
  result: {
    ok: true,
    outputSha256: sha256String(JSON.stringify(output)),
    output,
    drift
  }
};

const outPath = `intelligence/evaluations/reports/content.score.${Date.now()}.json`;
writeJson(outPath, report);
console.log(`[eval] OK wrote ${outPath}`);
