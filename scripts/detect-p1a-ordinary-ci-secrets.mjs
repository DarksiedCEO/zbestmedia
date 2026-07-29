import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const PRODUCTION_TARGET = ".github/workflows/ci.yml";
const productionTarget = path.join(
  repositoryRoot,
  PRODUCTION_TARGET,
);

const findingRules = [
  {
    code: "PRIVATE_KEY_PAYLOAD",
    test: (source) =>
      /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i.test(
        source,
      ),
  },
  {
    code: "FORBIDDEN_APP_PRIVATE_KEY_REFERENCE",
    test: (source) =>
      source
        .replace(/^[ \t]*#[ \t]?/gm, "")
        .replace(/\s+/g, "")
        .includes("P1A_RUNTIME_APP_PRIVATE_KEY"),
  },
  {
    code: "GITHUB_SECRET_EXPRESSION",
    test: (source) =>
      /\$\{\{[^}]*\bsecrets\s*(?:\.|\[)/i.test(source),
  },
  {
    code: "PRIVILEGED_APP_TOKEN_ACTION",
    test: (source) =>
      /(?:actions\/create-github-app-token|P1A_RUNTIME_(?:INSTALLATION_)?TOKEN)/i.test(
        source.replace(/\s+/g, ""),
      ),
  },
  {
    code: "INDIRECT_PRIVILEGED_TOKEN_OUTPUT",
    test: (source) =>
      /\$\{\{[^}]*\bsteps\s*\.[\w-]+\s*\.\s*outputs\s*\.\s*token\b/i.test(
        source,
      ),
  },
  {
    code: "PRIVILEGED_PULL_REQUEST_TARGET",
    test: (source) => /^\s*pull_request_target\s*:/m.test(source),
  },
];

function assertStructurallyScannable(source) {
  assert.ok(source.length > 0, "workflow is empty");
  assert.ok(source.length <= 1_000_000, "workflow exceeds scanner size limit");
  assert.ok(!source.includes("\0"), "workflow contains a NUL byte");
  assert.ok(/^name\s*:/m.test(source), "workflow name key is missing");
  assert.ok(/^on\s*:/m.test(source), "workflow event key is missing");
  assert.ok(/^jobs\s*:/m.test(source), "workflow jobs key is missing");
  assert.equal(
    (source.match(/\$\{\{/g) ?? []).length,
    (source.match(/\}\}/g) ?? []).length,
    "workflow expression delimiters are unbalanced",
  );
}

export function classifyOrdinaryCi(source) {
  try {
    assertStructurallyScannable(source);
  } catch {
    return {
      status: "FAIL",
      findings: ["PARSER_UNCERTAINTY"],
    };
  }

  const findings = findingRules
    .filter((rule) => rule.test(source))
    .map((rule) => rule.code)
    .sort();
  return {
    status: findings.length ? "FAIL" : "PASS",
    findings,
  };
}

function main() {
  const workflowIndex = process.argv.indexOf("--workflow");
  const requested =
    workflowIndex >= 0 ? process.argv[workflowIndex + 1] : productionTarget;
  assert.ok(requested, "--workflow requires a path");
  const resolved = realpathSync(path.resolve(requested));
  assert.equal(
    resolved,
    realpathSync(productionTarget),
    "detector may scan only .github/workflows/ci.yml",
  );
  const result = classifyOrdinaryCi(readFileSync(resolved, "utf8"));
  console.log(
    JSON.stringify({
      detector: "p1-a-ordinary-ci-secret-boundary",
      target: PRODUCTION_TARGET,
      ...result,
    }),
  );
  if (result.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
