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

describe.runIf(Boolean(DATABASE_URL))("lead tenant isolation invariants", () => {
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
      FORBIDDEN_ARTIFACT_TYPES: "legal.advice,medical.advice",
      FORBIDDEN_PHRASES: "guaranteed results,no risk,100% guaranteed",
      POLICY_VERSION: "policy-v1",
      MAX_PROVENANCE_DEPTH: 25,
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 16_384,
      LEAD_MAX_CONVERSION_META_BYTES: 16_384,
      LEAD_MAX_INTAKE_ATTR_BYTES: 16_384,
      LEAD_ROUTE_SLOW_BUDGET_MS: 250
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("prevents tenant B from reading tenant A lead", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const tokenB = await signToken({ tenantId: TENANT_B, actorId: "actor-b" });

    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: "tenant-a-read@acme.com", source: "website" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const ownRead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(ownRead.statusCode).toBe(200);

    const crossRead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}`,
      headers: { authorization: `Bearer ${tokenB}` }
    });
    expect(crossRead.statusCode).toBe(404);
  });

  it("prevents tenant B from appending events or conversions to tenant A lead", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const tokenB = await signToken({ tenantId: TENANT_B, actorId: "actor-b" });

    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: "tenant-a-write@acme.com", source: "website" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const crossEvent = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/events`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { type: "cross_tenant_event", payload: { blocked: true } }
    });
    expect(crossEvent.statusCode).toBe(404);

    const crossConversion = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/conversions`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { type: "cross_tenant_conversion", valueUsd: 1 }
    });
    expect(crossConversion.statusCode).toBe(404);

    const ownRead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}?eventsLimit=50&conversionsLimit=50`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(ownRead.statusCode).toBe(200);

    const body = ownRead.json();
    expect(body.events.some((e: { type: string }) => e.type === "cross_tenant_event")).toBe(false);
    expect(body.conversions.some((c: { type: string }) => c.type === "cross_tenant_conversion")).toBe(false);
  });
});
