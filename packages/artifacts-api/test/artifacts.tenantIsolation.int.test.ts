import { SignJWT } from "jose";
import supertest from "supertest";
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

describe.runIf(Boolean(DATABASE_URL))("RLS: cross-tenant artifact isolation", () => {
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

  it("tenant A create/read succeeds while tenant B read returns 404", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const tokenB = await signToken({ tenantId: TENANT_B, actorId: "actor-b" });

    const createRes = await supertest(app.server)
      .post("/v1/artifacts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        artifactType: "brand.positioning",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { headline: "Revenue Intelligence" }
      })
      .expect(201);

    const artifactId = String(createRes.body.artifactId);
    expect(artifactId.length).toBeGreaterThan(10);

    await supertest(app.server)
      .get(`/v1/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    await supertest(app.server)
      .get(`/v1/artifacts/${artifactId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
  });

  it("tenant B cannot supersede tenant A artifact (404), tenant A can (201)", async () => {
    const tokenA = await signToken({ tenantId: TENANT_A, actorId: "actor-a" });
    const tokenB = await signToken({ tenantId: TENANT_B, actorId: "actor-b" });

    const createRes = await supertest(app.server)
      .post("/v1/artifacts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        artifactType: "brand.copy",
        schemaVersion: 1,
        sourceArtifactIds: [],
        evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        payload: { copy: "hello" }
      })
      .expect(201);

    const artifactId = String(createRes.body.artifactId);

    await supertest(app.server)
      .post(`/v1/artifacts/${artifactId}/supersede`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        newArtifactType: "brand.copy",
        newSchemaVersion: 2,
        newEvalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        newPayload: { copy: "hello v2" }
      })
      .expect(404);

    await supertest(app.server)
      .post(`/v1/artifacts/${artifactId}/supersede`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        newArtifactType: "brand.copy",
        newSchemaVersion: 2,
        newEvalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        newPayload: { copy: "hello v2" }
      })
      .expect(201);
  });
});
