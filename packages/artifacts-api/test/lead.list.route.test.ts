import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { buildServer } from "../src/server";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

async function signToken(args: { tenantId: string; actorId: string; roles?: string[] }): Promise<string> {
  return new SignJWT({
    tenantId: args.tenantId,
    roles: args.roles ?? ["admin"]
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(args.actorId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function uniqueEmail(prefix: string, i: number): string {
  return `${prefix}_${Date.now()}_${i}@acme.com`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe.runIf(Boolean(DATABASE_URL))("GET /v1/leads", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: DATABASE_URL!,
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY,
      MAX_ARTIFACT_WRITES_PER_MINUTE: 60,
      MAX_POLICY_PAYLOAD_BYTES: 50_000,
      MAX_POLICY_PAYLOAD_KEYS: 200,
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 16_384,
      LEAD_MAX_CONVERSION_META_BYTES: 16_384,
      LEAD_MAX_INTAKE_ATTR_BYTES: 16_384,
      LEAD_ROUTE_SLOW_BUDGET_MS: 250,
      FORBIDDEN_ARTIFACT_TYPES: "legal.advice,medical.advice",
      FORBIDDEN_PHRASES: "guaranteed results,no risk,100% guaranteed",
      POLICY_VERSION: "policy-v1",
      MAX_PROVENANCE_DEPTH: 25
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("defaults to limit=20 and returns nextCursor when more rows exist", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const headers = { authorization: `Bearer ${tokenA}` };

    for (let i = 0; i < 25; i += 1) {
      const intake = await app.inject({
        method: "POST",
        url: "/v1/leads/intake",
        headers,
        payload: { source: "website", email: uniqueEmail("list_default", i) }
      });
      expect(intake.statusCode).toBe(200);
      const leadId = String(intake.json().leadId);
      await app.inject({
        method: "POST",
        url: `/v1/leads/${leadId}/events`,
        headers,
        payload: { type: "pricing_view", payload: { i } }
      });
      await sleep(2);
    }

    const list = await app.inject({
      method: "GET",
      url: "/v1/leads",
      headers
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.limit).toBe(20);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(20);
    expect(typeof body.nextCursor).toBe("string");
  });

  it("supports cursor pagination without overlap", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const headers = { authorization: `Bearer ${tokenA}` };

    for (let i = 0; i < 6; i += 1) {
      const intake = await app.inject({
        method: "POST",
        url: "/v1/leads/intake",
        headers,
        payload: { source: "website", email: uniqueEmail("list_cursor", i) }
      });
      expect(intake.statusCode).toBe(200);
      const leadId = String(intake.json().leadId);
      await app.inject({
        method: "POST",
        url: `/v1/leads/${leadId}/events`,
        headers,
        payload: { type: "form_submit", payload: { i } }
      });
      await sleep(2);
    }

    const page1 = await app.inject({
      method: "GET",
      url: "/v1/leads?limit=2",
      headers
    });
    expect(page1.statusCode).toBe(200);
    const b1 = page1.json();
    expect(b1.data.length).toBe(2);
    expect(typeof b1.nextCursor).toBe("string");

    const page2 = await app.inject({
      method: "GET",
      url: `/v1/leads?limit=2&cursor=${encodeURIComponent(String(b1.nextCursor))}`,
      headers
    });
    expect(page2.statusCode).toBe(200);
    const b2 = page2.json();
    expect(b2.data.length).toBe(2);

    const ids1 = new Set(b1.data.map((r: { id: string }) => r.id));
    expect(b2.data.some((r: { id: string }) => ids1.has(r.id))).toBe(false);
  });

  it("applies filters for source and score range", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const headers = { authorization: `Bearer ${tokenA}` };

    const intakeA = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers,
      payload: { source: "website", email: uniqueEmail("filter_match", 1) }
    });
    expect(intakeA.statusCode).toBe(200);
    const leadA = String(intakeA.json().leadId);
    await app.inject({
      method: "POST",
      url: `/v1/leads/${leadA}/events`,
      headers,
      payload: { type: "demo_request", payload: {} }
    });
    await app.inject({
      method: "GET",
      url: `/v1/leads/${leadA}/score?recompute=true`,
      headers
    });

    const intakeB = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers,
      payload: { source: "outbound", email: uniqueEmail("filter_exclude", 2) }
    });
    expect(intakeB.statusCode).toBe(200);
    const leadB = String(intakeB.json().leadId);
    await app.inject({
      method: "GET",
      url: `/v1/leads/${leadB}/score?recompute=true`,
      headers
    });

    const filtered = await app.inject({
      method: "GET",
      url: "/v1/leads?source=website&minScore=30&maxScore=100",
      headers
    });
    expect(filtered.statusCode).toBe(200);
    const body = filtered.json();
    expect(body.data.some((r: { id: string }) => r.id === leadA)).toBe(true);
    expect(body.data.some((r: { id: string }) => r.id === leadB)).toBe(false);
  });

  it("enforces query bounds and returns INVALID_QUERY", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const headers = { authorization: `Bearer ${tokenA}` };

    const badRange = await app.inject({
      method: "GET",
      url: "/v1/leads?minScore=90&maxScore=10",
      headers
    });
    expect(badRange.statusCode).toBe(400);
    expect(badRange.json().error).toBe("INVALID_QUERY");

    const badLimit = await app.inject({
      method: "GET",
      url: "/v1/leads?limit=999",
      headers
    });
    expect(badLimit.statusCode).toBe(400);
    expect(badLimit.json().error).toBe("INVALID_QUERY");
  });

  it("enforces tenant isolation in list endpoint", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const tokenB = await signToken({ tenantId: TENANT_B, actorId: "actor-b" });
    const headersA = { authorization: `Bearer ${tokenA}` };
    const headersB = { authorization: `Bearer ${tokenB}` };

    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: headersA,
      payload: { source: "website", email: uniqueEmail("tenant_iso", 1) }
    });
    expect(intake.statusCode).toBe(200);
    const leadA = String(intake.json().leadId);

    const listB = await app.inject({
      method: "GET",
      url: "/v1/leads?limit=50",
      headers: headersB
    });
    expect(listB.statusCode).toBe(200);
    expect(listB.json().data.some((row: { id: string }) => row.id === leadA)).toBe(false);
  });
});
