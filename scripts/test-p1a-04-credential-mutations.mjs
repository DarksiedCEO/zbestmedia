import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "packages/service-auth/src/index.ts");
const original = readFileSync(sourcePath, "utf8");

const mutants = [
  ["expiry-boundary", "now.getTime() >= Date.parse(identity.expiresAt)", "now.getTime() > Date.parse(identity.expiresAt)"],
  ["not-before-boundary", "now.getTime() < Date.parse(identity.notBefore)", "now.getTime() <= Date.parse(identity.notBefore)"],
  ["accept-non-active", "identity.status !== \"ACTIVE\"", "false"],
  ["accept-stale-generation", "identity.generation < (config.maximumGenerationByPrincipal.get(identity.principalId) ?? identity.generation)", "false"],
  ["invert-principal-binding", "identity.principalId !== requirement.principalId", "identity.principalId === requirement.principalId"],
  ["drop-subject-binding", "identity.subject !== requirement.subject", "false"],
  ["drop-principal-policy-fail-closed", "  if (!raw) throw new Error(\"Missing SERVICE_AUTH_ALLOWED_PRINCIPALS — service cannot start without a principal policy\");", "  if (!raw) return new Set();"],
  ["weaken-scope-all-to-some", "requirement.requiredScopes.some((scope) => !identity.scopes.some((granted) => grantsScope(granted, scope)))", "requirement.requiredScopes.every((scope) => !identity.scopes.some((granted) => grantsScope(granted, scope)))"],
  ["keep-predecessor-active", "current.status = \"SUPERSEDED\"", "current.status = \"ACTIVE\""],
  ["mutate-before-rotation-audit", "audit.append({\n    type: \"SERVICE_CREDENTIAL_ROTATED\"", "current.status = \"SUPERSEDED\";\n  audit.append({\n    type: \"SERVICE_CREDENTIAL_ROTATED\""],
  ["rotate-revoked-guard", "if (current.status === \"REVOKED\") {", "if (false) {"],
  ["schema-window-inverted", "if (expiresAt <= notBefore) {", "if (false) {"],
  ["bearer-scheme-any", "if (!scheme || !token || scheme.toLowerCase() !== \"bearer\") {", "if (!scheme || !token) {"],
  ["convenience-skip-tenant", "  authorizeTenant(identity, tenantId);\n  return identity;", "  return identity;"],
  ["duplicate-keyid-allowed", "    if (keyIds.has(identity.keyId)) {\n      throw new Error(`SERVICE_AUTH_TOKENS contains a duplicate keyId (${identity.keyId})`);\n    }", ""],
  ["revoke-not-idempotent", "  if (identity.status === \"REVOKED\") return;", ""],
  ["revoked-requires-revokedat-dropped", "  if (identity.status === \"REVOKED\" && !identity.revokedAt) {", "  if (false) {"],
];

const results = [];
try {
  for (const [id, from, to] of mutants) {
    assert.ok(original.includes(from), `${id}: mutation target missing`);
    writeFileSync(sourcePath, original.replace(from, to));
    const run = spawnSync("pnpm", ["--filter", "@zbest/service-auth", "test"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    results.push({ id, status: run.status === 0 ? "SURVIVED" : "KILLED" });
  }
} finally {
  writeFileSync(sourcePath, original);
}

const survivors = results.filter(({ status }) => status === "SURVIVED");
console.log(JSON.stringify({ suite: "p1a-04-credential-mutation", total: results.length, killed: results.length - survivors.length, survived: survivors.length, results }));
if (survivors.length > 0) process.exitCode = 1;
