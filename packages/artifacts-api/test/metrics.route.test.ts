import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { resetMetricsForTests } from "../src/metrics/counters";
import { buildServer } from "../src/server";

const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);

async function signToken(tenantId: string, actorId = "actor-1"): Promise<string> {
  return new SignJWT({ tenantId, roles: ["admin"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actorId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

describe("GET /metrics", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/zbest_test",
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY,
      MAX_ARTIFACT_WRITES_PER_MINUTE: 60
    };

    resetMetricsForTests();
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns metrics JSON shape when authenticated", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      artifactsCreated: expect.any(Number),
      artifactsSuperseded: expect.any(Number),
      sealVerificationFailures: expect.any(Number),
      tenantBudgetViolations: expect.any(Number)
    });
  });
});
