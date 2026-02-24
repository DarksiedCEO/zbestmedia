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

describe.runIf(Boolean(DATABASE_URL))("lead conversion routes", () => {
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

  it("appends conversion and supports bounded retrieval", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });

    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: "a@acme.com", source: "website" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const conversion = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/conversions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "meeting_booked" }
    });
    expect(conversion.statusCode).toBe(200);
    expect(conversion.json().leadId).toBe(leadId);
    expect(conversion.json().conversion.type).toBe("meeting_booked");

    const getLead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}?eventsLimit=1&conversionsLimit=1`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(getLead.statusCode).toBe(200);
    expect(getLead.json().lead.id).toBe(leadId);
    expect(getLead.json().limits.events).toBe(1);
    expect(getLead.json().limits.conversions).toBe(1);
    expect(Array.isArray(getLead.json().events)).toBe(true);
    expect(Array.isArray(getLead.json().conversions)).toBe(true);
  });

  it("caps retrieval limits at 50", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });

    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: "cap@acme.com", source: "website" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const res = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}?eventsLimit=999&conversionsLimit=999`,
      headers: { authorization: `Bearer ${tokenA}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().limits.events).toBe(50);
    expect(res.json().limits.conversions).toBe(50);
  });
});
