#!/usr/bin/env node
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { bindWorkflowIdentity } from "./p1a-workflow-identity.mjs";

for (const key of ["P1A_TRUSTED_ROOT", "P1A_REPOSITORY", "P1A_WORKFLOW_REF", "P1A_WORKFLOW_SHA", "P1A_EVENT_NAME", "P1A_PROTECTED_REF", "P1A_PROTECTED_ENVIRONMENT", "P1A_WORKFLOW_IDENTITY_OUTPUT"]) assert.ok(process.env[key], `${key} absent`);
const result = bindWorkflowIdentity({ trustedRoot: process.env.P1A_TRUSTED_ROOT, repository: process.env.P1A_REPOSITORY, workflowRef: process.env.P1A_WORKFLOW_REF, workflowSha: process.env.P1A_WORKFLOW_SHA, eventName: process.env.P1A_EVENT_NAME, protectedRef: process.env.P1A_PROTECTED_REF, environment: process.env.P1A_PROTECTED_ENVIRONMENT });
writeFileSync(process.env.P1A_WORKFLOW_IDENTITY_OUTPUT, `${JSON.stringify(result)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ workflowIdentity: "BOUND", workflowSha: result.workflowSha, workflowBlob: result.blob, workflowDigest: result.sha256 }));
