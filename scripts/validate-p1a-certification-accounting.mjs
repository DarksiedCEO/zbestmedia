import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateCertificationBundle } from "./p1a-certification-core.mjs";

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    assert.ok(key?.startsWith("--") && value, "malformed CLI arguments");
    assert.ok(!(key.slice(2) in values), `duplicate argument ${key}`);
    values[key.slice(2)] = value;
  }
  return values;
}

export { validateCertificationBundle } from "./p1a-certification-core.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArguments(process.argv.slice(2));
  const summary = validateCertificationBundle({
    nested: JSON.parse(readFileSync(args.nested, "utf8")),
    integration: JSON.parse(readFileSync(args.integration, "utf8")),
  }, {
    repository: args.repository, remote: args.remote, candidateSha: args.candidate,
    workflowSha: args.workflow, verifierSha: args.verifier,
    verifierDigest: args["verifier-digest"], authorizedBaseSha: args.base,
    runtimePin: args.runtime, scopeDigest: args["scope-digest"],
    evidencePackageDigest: args["evidence-package-digest"],
  });
  writeFileSync(args.output, `${JSON.stringify(summary)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(summary));
}
