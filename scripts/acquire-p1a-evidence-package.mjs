#!/usr/bin/env node
import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import { acquireGitHubEvidencePackage } from "./p1a-evidence-package.mjs";

for (const key of ["P1A_EVIDENCE_RUN_ID", "P1A_EVIDENCE_ARTIFACT_NAME", "P1A_EVIDENCE_DECLARED_DIGEST", "P1A_EVIDENCE_OUTPUT", "P1A_EVIDENCE_RECEIPT", "GITHUB_TOKEN"]) assert.ok(process.env[key], `${key} absent`);
const result = await acquireGitHubEvidencePackage({ repository: process.env.GITHUB_REPOSITORY, runId: process.env.P1A_EVIDENCE_RUN_ID, artifactName: process.env.P1A_EVIDENCE_ARTIFACT_NAME, token: process.env.GITHUB_TOKEN, outputPath: process.env.P1A_EVIDENCE_OUTPUT, declaredDigest: process.env.P1A_EVIDENCE_DECLARED_DIGEST });
writeFileSync(process.env.P1A_EVIDENCE_RECEIPT, `${JSON.stringify(result)}\n`, { flag: "wx", mode: 0o600 });
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `P1A_EVIDENCE_PACKAGE_DIGEST=${result.digest}\n`, "utf8");
console.log(JSON.stringify({ evidencePackage: "TRUSTED_SIDE_HASHED", artifactId: result.artifactId, digest: result.digest, size: result.size }));
