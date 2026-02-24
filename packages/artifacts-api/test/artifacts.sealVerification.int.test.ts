import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { createPool } from "../src/db/pool";
import { withTenant } from "../src/db/withTenant";
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

describe.runIf(Boolean(DATABASE_URL))("artifact seal verification on retrieval", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const pool = createPool(DATABASE_URL!);

  beforeAll(async () => {
    const env: AppEnv = {
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: DATABASE_URL!,
      AUTH_JWT_SECRET: JWT_SECRET,
      ARTIFACT_SIGNING_KEY: SIGNING_KEY
    };

    await applyArtifactsMigration({ databaseUrl: env.DATABASE_URL });
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns 200 when seal matches", async () => {
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

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/artifacts/${artifactId}`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(getRes.statusCode).toBe(200);
  });

  it("returns 500 when stored signature is tampered", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/artifacts",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        artifactType: "brand.copy",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { copy: "hello" }
      }
    });
    expect(createRes.statusCode).toBe(201);
    const artifactId = String(createRes.json().artifactId);

    await withTenant(pool, TENANT_A, async (client) => {
      await client.query("UPDATE artifacts SET signature = $1 WHERE artifact_id = $2", ["00", artifactId]);
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/artifacts/${artifactId}`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(getRes.statusCode).toBe(500);
    expect(getRes.json()).toEqual({ error: "artifact_integrity_failure" });
  });
});
