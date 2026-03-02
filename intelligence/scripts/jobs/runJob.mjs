import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { writeJson } from "../../../tools/fs/write-json.mjs";
import { sha256File, sha256String } from "../../../tools/crypto/sha256.mjs";
import { callOrca } from "../runtime/orcaClient.mjs";
import { parseStrictJson } from "../runtime/strictJson.mjs";
import { evaluateDrift } from "../runtime/diff.mjs";
import { createJobId } from "../runtime/jobId.mjs";
import { getOrcaEnv } from "../runtime/orcaEnv.mjs";

function nowIso() {
  return new Date().toISOString();
}

function fail(msg) {
  console.error(`[runJob] ${msg}`);
  process.exit(1);
}

export async function runJob({
  prompt,
  fixturePath,
  fixture,
  inputForModel,
  policyInfo,
  ajv,
  gitSha,
  persistArtifacts = true
}) {
  const inputSchema = readJson(prompt.inputSchema);
  const outputSchema = readJson(prompt.outputSchema);

  const validateIn = ajv.compile(inputSchema);
  if (!validateIn(fixture)) {
    fail(`[${prompt.id}] input invalid: ${ajv.errorsText(validateIn.errors)}`);
  }

  const promptText = readFileSync(prompt.path, "utf8");
  const promptSha = sha256File(prompt.path);
  const fixtureHash = sha256File(fixturePath);
  const jobId = createJobId({
    promptId: prompt.id,
    fixtureHash,
    promptSha,
    policyHash: policyInfo?.resolvedPolicyHash ?? null
  });

  const baseDir = `intelligence/artifacts/${jobId}`;
  const reportsDir = `${baseDir}/reports`;
  if (persistArtifacts) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const orca = await callOrca({ promptId: prompt.id, promptText, inputJson: inputForModel });
  const output = parseStrictJson(orca.raw);

  const validateOut = ajv.compile(outputSchema);
  if (!validateOut(output)) {
    fail(`[${prompt.id}] output invalid: ${ajv.errorsText(validateOut.errors)}`);
  }

  let drift = null;
  if (prompt.golden) {
    const golden = readJson(prompt.golden);
    drift = evaluateDrift(prompt.driftPolicy?.mode ?? "structure", output, golden, prompt.driftPolicy ?? {});
    if (!drift.ok) {
      fail(`[${prompt.id}] golden drift: ${JSON.stringify(drift, null, 2)}`);
    }
  }

  const outputSha256 = sha256String(JSON.stringify(output));
  const report = {
    at: nowIso(),
    jobId,
    gitSha,
    prompt: {
      id: prompt.id,
      promptVersion: prompt.promptVersion,
      path: prompt.path,
      promptSha256: promptSha,
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
      sha256: fixtureHash,
      meta: fixture._meta ?? null
    },
    policy: policyInfo ?? null,
    result: {
      ok: true,
      outputSha256,
      output,
      drift
    }
  };

  const reportPath = `${reportsDir}/${prompt.id}.report.json`;
  if (persistArtifacts) {
    writeJson(reportPath, report);
  }

  const orcaEnv = getOrcaEnv();
  const manifest = {
    jobId,
    createdAt: nowIso(),
    prompt: {
      id: prompt.id,
      promptVersion: prompt.promptVersion,
      path: prompt.path,
      promptSha256: promptSha
    },
    fixture: {
      path: fixturePath,
      sha256: fixtureHash
    },
    policy: policyInfo ?? null,
    execMeta: {
      gitSha,
      nodeVersion: process.version,
      orca: {
        baseUrl: orcaEnv.baseUrl,
        model: orcaEnv.model,
        timeoutMs: orcaEnv.timeoutMs,
        retryMax: orcaEnv.retryMax,
        retryBaseMs: orcaEnv.retryBaseMs
      }
    },
    reports: [
      {
        path: reportPath,
        sha256: sha256String(JSON.stringify(report))
      }
    ],
    outputSha256
  };

  if (persistArtifacts) {
    writeJson(`${baseDir}/manifest.json`, manifest);
  }

  return {
    jobId,
    baseDir,
    reportPath,
    manifest,
    output,
    outputSha256,
    policyInfo
  };
}
