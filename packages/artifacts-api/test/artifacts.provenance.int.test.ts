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

describe.runIf(Boolean(DATABASE_URL))("artifact provenance endpoint", () => {
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

  it("returns deterministic provenance chain for superseded artifacts", async () => {
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
        payload: { headline: "v1" }
      }
    });
    expect(createRes.statusCode).toBe(201);
    const artifactA = String(createRes.json().artifactId);

    const supersedeRes = await app.inject({
      method: "POST",
      url: `/v1/artifacts/${artifactA}/supersede`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        newArtifactType: "brand.positioning",
        newSchemaVersion: 2,
        newEvalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        newPayload: { headline: "v2" }
      }
    });
    expect(supersedeRes.statusCode).toBe(201);
    const artifactB = String(supersedeRes.json().artifactId);

    const provRes = await app.inject({
      method: "GET",
      url: `/v1/artifacts/${artifactB}/provenance`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    expect(provRes.statusCode).toBe(200);
    expect(provRes.json()).toMatchObject({
      artifact: {
        artifactId: artifactB,
        artifactType: "brand.positioning",
        schemaVersion: 2
      },
      sealVerification: {
        matches: true
      },
      supersedesChain: [
        { artifactId: artifactB, artifactType: "brand.positioning", schemaVersion: 2 },
        { artifactId: artifactA, artifactType: "brand.positioning", schemaVersion: 1 }
      ]
    });
  });
});
