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

describe.runIf(Boolean(DATABASE_URL))("tenant write budget", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: DATABASE_URL!,
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY,
      MAX_ARTIFACT_WRITES_PER_MINUTE: 1,
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

  it("returns 429 on second write in the same minute for a tenant", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });

    const first = await app.inject({
      method: "POST",
      url: "/v1/artifacts",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        artifactType: "brand.positioning",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { headline: "first" }
      }
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/v1/artifacts",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        artifactType: "brand.positioning",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { headline: "second" }
      }
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "tenant_budget_exceeded" });
  });
});
