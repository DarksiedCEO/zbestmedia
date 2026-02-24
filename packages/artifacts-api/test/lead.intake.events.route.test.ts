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

describe.runIf(Boolean(DATABASE_URL))("lead intake and events routes", () => {
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
      MAX_PROVENANCE_DEPTH: 25
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 400 for invalid intake payload", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "not-an-email" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_payload");
  });

  it("creates on first intake and upserts by tenant+email on second intake", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });

    const first = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "u1@acme.com", firstName: "A" }
    });
    expect(first.statusCode).toBe(200);
    const leadIdA = String(first.json().leadId);

    const second = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "u1@acme.com", lastName: "B" }
    });
    expect(second.statusCode).toBe(200);
    const leadIdB = String(second.json().leadId);
    expect(leadIdB).toBe(leadIdA);

    const getLead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadIdA}`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(getLead.statusCode).toBe(200);
    expect(getLead.json().lead.firstName).toBe("A");
    expect(getLead.json().lead.lastName).toBe("B");
    expect(getLead.json().events.length).toBeGreaterThanOrEqual(2);
  });

  it("appends custom events and returns them via lead fetch", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const intake = await app.inject({
      method: "POST",
      url: "/v1/leads/intake",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { source: "website", email: "events@acme.com" }
    });
    expect(intake.statusCode).toBe(200);
    const leadId = String(intake.json().leadId);

    const append = await app.inject({
      method: "POST",
      url: `/v1/leads/${leadId}/events`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: "pricing_view", payload: { page: "pricing" } }
    });
    expect(append.statusCode).toBe(204);

    const getLead = await app.inject({
      method: "GET",
      url: `/v1/leads/${leadId}?eventsLimit=50`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(getLead.statusCode).toBe(200);
    expect(getLead.json().events.some((e: { type: string }) => e.type === "pricing_view")).toBe(true);
  });
});
