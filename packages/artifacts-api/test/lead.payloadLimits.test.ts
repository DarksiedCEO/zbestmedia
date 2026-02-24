import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { buildServer } from "../src/server";
import { applyArtifactsMigration } from "./helpers/migrate";

const DATABASE_URL = process.env.ARTIFACTS_INT_DATABASE_URL;
const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const TENANT_A = "11111111-1111-4111-8111-111111111111";

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

describe.runIf(Boolean(DATABASE_URL))("lead payload limits", () => {
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
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 50,
      LEAD_MAX_CONVERSION_META_BYTES: 50,
      LEAD_MAX_INTAKE_ATTR_BYTES: 50,
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

  it("returns 413 when intake attributes exceed limit", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        source: "website",
        email: "too-big-intake@acme.com",
        attributes: { x: "a".repeat(200) }
      }
    });
    expect(intake.statusCode).toBe(413);
    expect(intake.json().error).toBe("PAYLOAD_TOO_LARGE");
    expect(intake.json().field).toBe("attributes");
  });

  it("returns 413 when event payload exceeds limit", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "event-limit@acme.com" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const eventRes = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/events`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "evt", payload: { x: "a".repeat(200) } }
    });
    expect(eventRes.statusCode).toBe(413);
    expect(eventRes.json().error).toBe("PAYLOAD_TOO_LARGE");
    expect(eventRes.json().field).toBe("payload");
  });

  it("returns 413 when conversion meta exceeds limit", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "conversion-limit@acme.com" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const conversion = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/conversions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "meeting_booked", meta: { x: "a".repeat(200) } }
    });
    expect(conversion.statusCode).toBe(413);
    expect(conversion.json().error).toBe("PAYLOAD_TOO_LARGE");
    expect(conversion.json().field).toBe("meta");
  });

  it("allows payloads under limit", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "within-limit@acme.com", attributes: { x: "ok" } }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const eventRes = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/events`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "evt", payload: { x: "ok" } }
    });
    expect(eventRes.statusCode).toBe(204);

    const conversion = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/conversions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "meeting_booked", meta: { x: "ok" } }
    });
    expect(conversion.statusCode).toBe(200);
  });
});
