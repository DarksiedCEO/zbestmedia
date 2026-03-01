import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "../src/config/env";
import { resetGovernanceSnapshotCacheForTests } from "../src/agency/policy/governance/snapshot";
import { buildServer } from "../src/server";

const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);

async function signToken(tenantId: string, actorId = "actor-1"): Promise<string> {
  return new SignJWT({ tenantId, roles: ["sebastian"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actorId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function writeFiles(): { defaultsPath: string; registryPath: string; eventsPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-route-"));
  const defaultsPath = path.join(dir, "runtime.defaults.json");
  const registryPath = path.join(dir, "registry.json");
  const eventsPath = path.join(dir, "events.jsonl");

  fs.writeFileSync(
    defaultsPath,
    JSON.stringify(
      {
        POLICY_BREAKER_FAILURE_THRESHOLD: 5,
        POLICY_BREAKER_RESET_AFTER_MS: 15000,
        POLICY_RETRY_MAX: 2,
        POLICY_RETRY_BASE_DELAY_MS: 80,
        POLICY_RETRY_MAX_DELAY_MS: 400
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        baseline_report_path: "ops/load_runs/reports/base.json",
        baseline_hash: "abc123",
        baseline_run_path: "ops/load_runs/baselines/base.json",
        accepted_at: "2026-03-01T00:00:00.000Z",
        accepted_by: "andre",
        notes: "ok",
        chaos_report_path: ""
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    eventsPath,
    `${JSON.stringify({
      event_id: "e-ci-1",
      ts: "2026-03-01T01:00:00.000Z",
      source: "ci",
      verdict: { passed: true, reasons: [] },
      metrics: { retry_amplification: 0.01, breaker_open_rate: 0 },
      tags: []
    })}\n`,
    "utf8"
  );

  return { defaultsPath, registryPath, eventsPath };
}

describe("policy governance internal route", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/zbest_test",
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY,
      MAX_ARTIFACT_WRITES_PER_MINUTE: 60,
      MAX_POLICY_PAYLOAD_BYTES: 50_000,
      MAX_POLICY_PAYLOAD_KEYS: 200,
      FORBIDDEN_ARTIFACT_TYPES: "legal.advice,medical.advice",
      FORBIDDEN_PHRASES: "guaranteed results,no risk,100% guaranteed",
      POLICY_VERSION: "policy-v1",
      MAX_PROVENANCE_DEPTH: 25,
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 16_384,
      LEAD_MAX_CONVERSION_META_BYTES: 16_384,
      LEAD_MAX_INTAKE_ATTR_BYTES: 16_384,
      LEAD_ROUTE_SLOW_BUDGET_MS: 250
    };

    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetGovernanceSnapshotCacheForTests();
  });

  it("returns 404 when introspection disabled", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    const res = await app.inject({
      method: "GET",
      url: "/policy/internal/governance",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when introspection token is invalid", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    process.env.POLICY_INTROSPECTION_ENABLED = "true";
    process.env.POLICY_INTROSPECTION_TOKEN = "top-secret";

    const res = await app.inject({
      method: "GET",
      url: "/policy/internal/governance",
      headers: {
        authorization: `Bearer ${token}`,
        "x-policy-introspection-token": "wrong"
      }
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns governance snapshot when enabled and authorized", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    const files = writeFiles();

    process.env.POLICY_INTROSPECTION_ENABLED = "true";
    process.env.POLICY_INTROSPECTION_TOKEN = "top-secret";
    process.env.POLICY_RUNTIME_DEFAULTS_PATH = files.defaultsPath;
    process.env.POLICY_BASELINE_REGISTRY_PATH = files.registryPath;
    process.env.SLO_EVENTS_JSONL_PATH = files.eventsPath;

    const res = await app.inject({
      method: "GET",
      url: "/policy/internal/governance",
      headers: {
        authorization: `Bearer ${token}`,
        "x-policy-introspection-token": "top-secret"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      runtime: {
        defaults_hash: expect.any(String),
        breaker: { state: expect.any(String) },
        retry: { max_attempts: 2 }
      },
      baseline: {
        current_baseline_hash: "abc123",
        accepted_by: "andre"
      },
      guardrails: {
        guardrail_hash: expect.any(String)
      },
      governance_fingerprint: expect.any(String)
    });
  });
});
