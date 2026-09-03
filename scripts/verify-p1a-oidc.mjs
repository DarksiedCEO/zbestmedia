#!/usr/bin/env node
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { acquireAndVerifyGitHubOidc } from "./p1a-oidc-verifier.mjs";

const required = ["P1A_OIDC_AUDIENCE", "P1A_OIDC_SUBJECT", "P1A_REPOSITORY", "P1A_REPOSITORY_OWNER_ID", "P1A_PROTECTED_REF", "P1A_WORKFLOW_REF", "P1A_WORKFLOW_SHA", "P1A_PROTECTED_ENVIRONMENT", "P1A_OIDC_OUTPUT"];
for (const key of required) assert.ok(process.env[key], `${key} absent`);
const result = await acquireAndVerifyGitHubOidc({ audience: process.env.P1A_OIDC_AUDIENCE, subject: process.env.P1A_OIDC_SUBJECT, repository: process.env.P1A_REPOSITORY, repositoryOwnerId: process.env.P1A_REPOSITORY_OWNER_ID, ref: process.env.P1A_PROTECTED_REF, workflowRef: process.env.P1A_WORKFLOW_REF, workflowSha: process.env.P1A_WORKFLOW_SHA, environment: process.env.P1A_PROTECTED_ENVIRONMENT });
writeFileSync(process.env.P1A_OIDC_OUTPUT, `${JSON.stringify(result)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ oidc: "CRYPTOGRAPHICALLY_VERIFIED", workflowSha: result.workflowSha, workflowRef: result.workflowRef }));
