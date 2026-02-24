import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type AppEnv } from "../src/config/env";
import { resetMetricsForTests, snapshotMetrics } from "../src/metrics/counters";
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

describe("policy firewall on supersede route", () => {
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
      POLICY_VERSION: "policy-v1"
    };

    resetMetricsForTests();
    app = await buildServer(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMetricsForTests();
  });

  it("returns 400 policy_denied for forbidden new artifact type", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    const res = await app.inject({
      method: "POST",
      url: "/v1/artifacts/some-artifact-id/supersede",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        newArtifactType: "medical.advice",
        newSchemaVersion: 2,
        newEvalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        newPayload: { text: "hello" }
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "policy_denied",
      policyVersion: "policy-v1"
    });
    expect(res.json().violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "artifact_type_forbidden" })])
    );
    expect(snapshotMetrics().policyDenials).toBe(1);
    expect(snapshotMetrics().policyDenialsByCode.artifact_type_forbidden).toBe(1);
  });

  it("returns 400 policy_denied for forbidden phrase in supersede payload", async () => {
    const token = await signToken("11111111-1111-4111-8111-111111111111");
    const res = await app.inject({
      method: "POST",
      url: "/v1/artifacts/some-artifact-id/supersede",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        newArtifactType: "brand.copy",
        newSchemaVersion: 2,
        newEvalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
        newPayload: { claim: "No risk and 100% guaranteed." }
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "policy_denied",
      policyVersion: "policy-v1"
    });
    expect(res.json().violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "payload_forbidden_phrase" })])
    );
    expect(snapshotMetrics().policyDenials).toBe(1);
    expect(snapshotMetrics().policyDenialsByCode.payload_forbidden_phrase).toBe(1);
  });
});
