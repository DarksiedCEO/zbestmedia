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

describe.runIf(Boolean(DATABASE_URL))("artifact replay endpoint", () => {
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
      POLICY_VERSION: "policy-v1"
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns replay payload with matching recomputed artifact id", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });

    const createRes = await app.inject({
      method: "POST",
      url: "/v1/artifacts",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        artifactType: "brand.positioning",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { headline: "Revenue Intelligence" }
      }
    });
    expect(createRes.statusCode).toBe(201);
    const artifactId = String(createRes.json().artifactId);

    const replayRes = await app.inject({
      method: "GET",
      url: `/v1/artifacts/${artifactId}/replay`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json()).toMatchObject({
      artifactId,
      recomputedArtifactId: artifactId,
      matches: true
    });
    expect(typeof replayRes.json().canonicalJson).toBe("string");
    expect(replayRes.json().determinismInput).toBeTruthy();
  });
});
