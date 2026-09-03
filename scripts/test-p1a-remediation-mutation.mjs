import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = realpathSync(mkdtempSync(path.join(tmpdir(), "p1a02-mutants-")));
async function mutant(name, sourcePath, replacements) {
  let source = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) { assert.ok(source.includes(from), `${name}: mutation target missing`); source = source.replace(from, to); }
  const target = path.join(temp, `${name}.mjs`);
  writeFileSync(target, source);
  return import(`${new URL(`file://${target}`).href}?${name}`);
}

const results = [];
const wrapper = path.join(temp, "git"); const marker = path.join(temp, "git-invoked");
writeFileSync(wrapper, `#!/bin/sh\necho invoked > '${marker}'\nexit 99\n`); chmodSync(wrapper, 0o700);
const gitMutant = await mutant("M1_AMBIENT_GIT_EXECUTABLE", new URL("./p1a-hermetic-git.mjs", import.meta.url), [["/usr/bin/git", wrapper]]);
let gitRejected = false; try { gitMutant.hermeticGit(process.cwd(), ["rev-parse", "HEAD"]); } catch { gitRejected = true; }
results.push({ id: "M1_AMBIENT_GIT_EXECUTABLE", killed: gitRejected && existsSync(marker) });

const oidcMutant = await mutant("M2_SKIP_OIDC_SIGNATURE", new URL("./p1a-oidc-verifier.mjs", import.meta.url), [["assert.ok(verify(\"RSA-SHA256\", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], \"base64url\")), \"OIDC signature invalid\");", "assert.ok(true);"]]);
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const jwk = publicKey.export({ format: "jwk" }); jwk.kid = "k"; jwk.use = "sig";
const now = 2_000_000_000; const expected = { audience: "a", subject: "s", repository: "r", repositoryOwnerId: "1", ref: "ref", workflowRef: "wf", workflowSha: "1".repeat(40), environment: "e" };
const claims = { iss: "https://token.actions.githubusercontent.com", aud: "a", sub: "s", repository: "r", repository_owner_id: "1", ref: "ref", workflow_ref: "wf", workflow_sha: "1".repeat(40), environment: "e", iat: now - 1, nbf: now - 1, exp: now + 60 };
const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k" })).toString("base64url"), p = Buffer.from(JSON.stringify(claims)).toString("base64url");
const forged = `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), attacker).toString("base64url")}`;
let forgedAccepted = false; try { oidcMutant.verifyGitHubOidcToken(forged, { keys: [jwk] }, expected, now); forgedAccepted = true; } catch {}
results.push({ id: "M2_SKIP_OIDC_SIGNATURE", killed: forgedAccepted });

const evidenceMutant = await mutant("M3_SKIP_EVIDENCE_DIGEST", new URL("./p1a-evidence-package.mjs", import.meta.url), [["if (declaredDigest) assert.equal(digest, declaredDigest, \"declared evidence package digest mismatch\");", "if (false) assert.equal(digest, declaredDigest);"]]);
const evidencePath = path.join(temp, "evidence.bin"); writeFileSync(evidencePath, "evidence");
let wrongDigestAccepted = false; try { evidenceMutant.hashTrustedEvidencePackage(evidencePath, "0".repeat(64)); wrongDigestAccepted = true; } catch {}
results.push({ id: "M3_SKIP_EVIDENCE_DIGEST", killed: wrongDigestAccepted });

const authorityMutant = await mutant("M4_REDUCE_AUTHORITY_DENOMINATOR", new URL("./p1a-authority-inventory.mjs", import.meta.url), [["assert.equal(inventory.authorities.length, REQUIRED_AUTHORITY_CLASSES.length, \"authority denominator mismatch\");", "assert.ok(inventory.authorities.length >= 0);"], ["assert.deepEqual([...classes].sort(), [...REQUIRED_AUTHORITY_CLASSES].sort(), \"missing or unauthorized authority class\");", "assert.ok(true);"]]);
const reduced = { schemaVersion: authorityMutant.AUTHORITY_SCHEMA_VERSION, authorities: [] };
let reducedAccepted = false; try { authorityMutant.validateAuthorityInventory(reduced, { repositoryFor: {}, verificationMethodFor: {}, identityFor: {} }); reducedAccepted = true; } catch {}
results.push({ id: "M4_REDUCE_AUTHORITY_DENOMINATOR", killed: reducedAccepted });

assert.equal(results.length, 4);
assert.deepEqual(results.filter((result) => !result.killed), []);
for (const result of results) console.log(`KILLED ${result.id}`);
console.log(JSON.stringify({ suite: "p1a-02-remediation-mutation", required: 4, executed: 4, killed: 4, survivors: 0 }));
