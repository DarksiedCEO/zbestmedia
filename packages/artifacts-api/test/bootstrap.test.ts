import { describe, expect, it } from "vitest";

import { getRequestLogContext, loadEnv } from "../src/index";

describe("loadEnv", () => {
  it("parses required values and defaults", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://localhost:5432/zbest",
      AUTH_JWT_SECRET: "secret",
      ARTIFACT_SIGNING_KEY: "signing-key"
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(8080);
  });

  it("fails fast on missing required fields", () => {
    expect(() => loadEnv({})).toThrowError(/Invalid environment configuration/);
  });
});

describe("getRequestLogContext", () => {
  it("includes requestId, tenantId, actorId when available", () => {
    const context = getRequestLogContext({
      id: "generated-request-id",
      headers: {
        "x-request-id": "external-request-id",
        "x-tenant-id": "tenant-1",
        "x-actor-id": "actor-1"
      }
    });

    expect(context).toEqual({
      requestId: "external-request-id",
      tenantId: "tenant-1",
      actorId: "actor-1"
    });
  });
});
