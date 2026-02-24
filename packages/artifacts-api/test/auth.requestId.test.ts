import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { buildServer } from "../src/server";

const JWT_SECRET = "x".repeat(64);
const SIGNING_KEY = "y".repeat(64);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function signToken(args: { tenantId?: string; actorId?: string; roles?: string[] }): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (args.tenantId !== undefined) {
    claims.tenantId = args.tenantId;
  }
  if (args.roles !== undefined) {
    claims.roles = args.roles;
  }

  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h");

  if (args.actorId !== undefined) {
    jwt = jwt.setSubject(args.actorId);
  }

  return jwt.sign(new TextEncoder().encode(JWT_SECRET));
}

describe("auth and requestId middleware", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

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
      MAX_PROVENANCE_DEPTH: 25
    };
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 missing_bearer_token when Authorization header is absent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz"
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "missing_bearer_token" });
  });

  it("returns 401 invalid_token for malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { authorization: "Bearer not-a-token" }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_token" });
  });

  it("returns 401 invalid_token_claims for missing tenantId or sub", async () => {
    const token = await signToken({
      actorId: "actor-1",
      roles: ["admin"]
    });

    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_token_claims" });
  });

  it("echoes x-request-id when provided", async () => {
    const token = await signToken({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      roles: ["admin"]
    });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: {
        authorization: `Bearer ${token}`,
        "x-request-id": "abc-123"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBe("abc-123");
    expect(res.json()).toEqual({ ok: true });
  });

  it("generates x-request-id when not provided", async () => {
    const token = await signToken({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      roles: ["admin"]
    });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(String(res.headers["x-request-id"])).toMatch(UUID_RE);
  });
});
