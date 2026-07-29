import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyOrdinaryCi,
  PRODUCTION_TARGET,
} from "./detect-p1a-ordinary-ci-secrets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detectorSource = readFileSync(
  path.join(root, "scripts/detect-p1a-ordinary-ci-secrets.mjs"),
  "utf8",
);
const base = `name: CI
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: node --version
`;

const cases = [
  ["clean_workflow", base, "PASS", []],
  [
    "ordinary_app_id_only",
    `${base}\nenv:\n  P1A_RUNTIME_APP_ID: \${{ vars.P1A_RUNTIME_APP_ID }}\n`,
    "PASS",
    [],
  ],
  [
    "forbidden_private_key_reference",
    `${base}\nenv:\n  KEY: \${{ secrets.P1A_RUNTIME_APP_PRIVATE_KEY }}\n`,
    "FAIL",
    ["FORBIDDEN_APP_PRIVATE_KEY_REFERENCE", "GITHUB_SECRET_EXPRESSION"],
  ],
  [
    "private_key_payload",
    `${base}\n# -----BEGIN RSA PRIVATE KEY-----\n`,
    "FAIL",
    ["PRIVATE_KEY_PAYLOAD"],
  ],
  [
    "privileged_installation_token",
    `${base}\n# uses: actions/create-github-app-token@0123456789abcdef0123456789abcdef01234567\n`,
    "FAIL",
    ["PRIVILEGED_APP_TOKEN_ACTION"],
  ],
  [
    "indirect_secret_expression",
    `${base}\nenv:\n  KEY: \${{ secrets[env.RUNTIME_KEY_NAME] }}\n`,
    "FAIL",
    ["GITHUB_SECRET_EXPRESSION"],
  ],
  [
    "whitespace_obfuscated_private_key_reference",
    `${base}\n# P1A_RUNTIME_APP_\n#   PRIVATE_KEY\n`,
    "FAIL",
    ["FORBIDDEN_APP_PRIVATE_KEY_REFERENCE"],
  ],
];

let passed = 0;
for (const [name, source, expectedStatus, expectedFindings] of cases) {
  const actual = classifyOrdinaryCi(source);
  assert.equal(actual.status, expectedStatus, name);
  assert.deepEqual(actual.findings, [...expectedFindings].sort(), name);
  passed += 1;
  console.log(`PASS ${name}`);
}

assert.ok(detectorSource.includes("P1A_RUNTIME_APP_PRIVATE_KEY"));
assert.equal(PRODUCTION_TARGET, ".github/workflows/ci.yml");
assert.notEqual(
  PRODUCTION_TARGET,
  "scripts/detect-p1a-ordinary-ci-secrets.mjs",
);
passed += 1;
console.log("PASS detector_source_rule_definitions_excluded");

const parserUncertainty = classifyOrdinaryCi("not a workflow");
assert.deepEqual(parserUncertainty, {
  status: "FAIL",
  findings: ["PARSER_UNCERTAINTY"],
});
passed += 1;
console.log("PASS parser_uncertainty_fails_closed");

console.log(
  JSON.stringify({
    suite: "p1-a-ordinary-ci-secret-detector",
    required: cases.length + 2,
    executed: cases.length + 2,
    passed,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    neutral: 0,
    stale: 0,
    notVerified: 0,
    positive: 3,
    negative: 5,
    failClosed: 1,
  }),
);
