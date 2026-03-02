import Ajv2020 from "ajv/dist/2020.js";
import { readJson } from "../../../tools/fs/read-json.mjs";
import { resolvePolicy } from "../runtime/policyResolver.mjs";
import { runJob } from "./runJob.mjs";
import { createJobId } from "../runtime/jobId.mjs";
import { sha256File } from "../../../tools/crypto/sha256.mjs";
import { execSync } from "node:child_process";

function fail(msg) {
  console.error(`[replay] ${msg}`);
  process.exit(1);
}

function parseJobId() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--job");
  if (flag >= 0 && args[flag + 1]) return args[flag + 1];
  if (args[0] && !args[0].startsWith("--")) return args[0];
  fail("usage: pnpm ag:replay -- --job <jobId>");
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return "unknown";
  }
}

const jobId = parseJobId();
const manifestPath = `intelligence/artifacts/${jobId}/manifest.json`;
const priorManifest = readJson(manifestPath);

const registry = readJson("intelligence/registry/manifest.json");
const prompt = registry.prompts.find(
  (p) => p.id === priorManifest.prompt?.id && p.promptVersion === priorManifest.prompt?.promptVersion
);
if (!prompt) {
  fail(`prompt not found in registry: ${priorManifest.prompt?.id} v${priorManifest.prompt?.promptVersion}`);
}

const fixturePath = priorManifest.fixture?.path;
if (!fixturePath) fail("invalid job manifest: missing fixture.path");
const fixture = readJson(fixturePath);

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

const recomputed = createJobId({
  promptId: prompt.id,
  fixtureHash: sha256File(fixturePath),
  promptSha: sha256File(prompt.path),
  policyHash: policyInfo?.resolvedPolicyHash ?? null
});

if (recomputed !== jobId) {
  fail(`determinism failure: recomputed jobId=${recomputed} expected=${jobId}`);
}

const replay = await runJob({
  prompt,
  fixturePath,
  fixture,
  inputForModel,
  policyInfo,
  ajv: new Ajv2020({ allErrors: true, strict: true }),
  gitSha: gitSha(),
  persistArtifacts: false
});

if (replay.outputSha256 !== priorManifest.outputSha256) {
  fail(`replay hash mismatch: expected=${priorManifest.outputSha256} actual=${replay.outputSha256}`);
}

console.log(`[replay] OK deterministic replay for ${jobId}`);
