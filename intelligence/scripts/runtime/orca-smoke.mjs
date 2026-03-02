import { writeJson } from "../../../tools/fs/write-json.mjs";
import { sha256String } from "../../../tools/crypto/sha256.mjs";
import { callOrca } from "./orcaClient.mjs";
import { parseStrictJson } from "./strictJson.mjs";

function nowIso() {
  return new Date().toISOString();
}

const promptId = "orca.smoke";
const promptText = 'Return ONLY JSON: {"ok":true,"ping":"pong"}';
const inputJson = { ping: "pong" };
const promptEntry = { id: promptId, golden: null };

const started = Date.now();
const orca = await callOrca({ promptEntry, promptText, inputJson });
const latencyMs = Date.now() - started;

const parsed = parseStrictJson(orca.raw);
if (parsed?.ok !== true) {
  console.error("[orca:smoke] Bad response:", parsed);
  process.exit(1);
}

const report = {
  at: nowIso(),
  ok: true,
  latencyMs,
  attempts: orca.attempts ?? 1,
  correlationId: orca.correlationId,
  responseCorrelationId: orca.responseCorrelationId ?? null,
  durationMsHeader: orca.durationMs ?? null,
  outputSha256: sha256String(JSON.stringify(parsed)),
  output: parsed
};

const outPath = `intelligence/evaluations/reports/_orca_health.${Date.now()}.json`;
writeJson(outPath, report);
console.log(`[orca:smoke] OK wrote ${outPath}`);
