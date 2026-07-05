import { describe, expect, it } from "vitest";
import {
  HeaderRequiredError,
  ServiceAuthError,
  authenticateBearerToken,
  authorizeTenant,
  extractHeaderValue,
  readTenantHeader,
  resolveServiceAuthConfig,
  tenantIdSchema
} from "../src/index";

const VALID_ENV = JSON.stringify([
  { keyId: "brandgraph-service", token: "tok-brandgraph", tenants: ["acme", "beta-corp"] },
  { keyId: "internal-admin", token: "tok-admin", tenants: ["*"] }
]);

describe("resolveServiceAuthConfig — fail-closed config parsing", () => {
  it("throws when the env value is missing", () => {
    expect(() => resolveServiceAuthConfig(undefined)).toThrow(/SERVICE_AUTH_TOKENS/);
  });

  it("throws when the env value is empty", () => {
    expect(() => resolveServiceAuthConfig("")).toThrow(/SERVICE_AUTH_TOKENS/);
  });

  it("throws on malformed JSON rather than silently granting no-auth access", () => {
    expect(() => resolveServiceAuthConfig("{not valid json")).toThrow();
  });

  it("throws when an entry is missing required fields", () => {
    expect(() => resolveServiceAuthConfig(JSON.stringify([{ keyId: "x" }]))).toThrow();
  });

  it("throws on duplicate tokens (ambiguous identity resolution)", () => {
    const dup = JSON.stringify([
      { keyId: "a", token: "tok-duplicate", tenants: ["acme"] },
      { keyId: "b", token: "tok-duplicate", tenants: ["beta-corp"] }
    ]);
    expect(() => resolveServiceAuthConfig(dup)).toThrow(/duplicate/i);
  });

  it("parses a valid config into a lookup map", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(config.principalsByToken.size).toBe(2);
    expect(config.principalsByToken.get("tok-brandgraph")?.keyId).toBe("brandgraph-service");
  });
});

describe("authenticateBearerToken — the 401 boundary", () => {
  const config = resolveServiceAuthConfig(VALID_ENV);

  it("rejects a missing token", () => {
    expect(() => authenticateBearerToken(null, config)).toThrow(ServiceAuthError);
    try {
      authenticateBearerToken(null, config);
    } catch (err) {
      expect((err as ServiceAuthError).statusCode).toBe(401);
    }
  });

  it("rejects an unknown token", () => {
    expect(() => authenticateBearerToken("tok-not-real", config)).toThrow(ServiceAuthError);
  });

  it("accepts a known token and returns its identity", () => {
    const identity = authenticateBearerToken("tok-brandgraph", config);
    expect(identity.keyId).toBe("brandgraph-service");
    expect(identity.tenants).toEqual(["acme", "beta-corp"]);
  });
});

describe("authorizeTenant — the 403 boundary (closes the cross-tenant/global-bucket gap)", () => {
  const config = resolveServiceAuthConfig(VALID_ENV);
  const scoped = authenticateBearerToken("tok-brandgraph", config);
  const admin = authenticateBearerToken("tok-admin", config);

  it("allows a tenant explicitly listed for the identity", () => {
    expect(() => authorizeTenant(scoped, "acme")).not.toThrow();
  });

  it("rejects a tenant NOT listed for the identity — this is the fix for cross-tenant reads", () => {
    expect(() => authorizeTenant(scoped, "some-other-tenant")).toThrow(ServiceAuthError);
    try {
      authorizeTenant(scoped, "some-other-tenant");
    } catch (err) {
      expect((err as ServiceAuthError).statusCode).toBe(403);
    }
  });

  it("wildcard '*' identities may access any tenant", () => {
    expect(() => authorizeTenant(admin, "literally-any-tenant-id")).not.toThrow();
  });
});

describe("extractHeaderValue — normalizing Fastify header shapes", () => {
  it("returns undefined for a missing header", () => {
    expect(extractHeaderValue(undefined)).toBeUndefined();
  });

  it("returns the string as-is for a single-value header", () => {
    expect(extractHeaderValue("acme")).toBe("acme");
  });

  it("returns the first element for a multi-value header array", () => {
    expect(extractHeaderValue(["acme", "beta"])).toBe("acme");
  });
});

describe("tenantIdSchema — the shared tenant/workspace id validator (closes header-schema drift)", () => {
  it("accepts a well-formed id", () => {
    expect(tenantIdSchema.safeParse("workspace-a").success).toBe(true);
  });

  it("rejects too-short ids", () => {
    expect(tenantIdSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects ids exceeding the max length", () => {
    expect(tenantIdSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("rejects ids with unsafe characters (header-injection shapes)", () => {
    expect(tenantIdSchema.safeParse("acme\ninjected").success).toBe(false);
    expect(tenantIdSchema.safeParse("acme|other").success).toBe(false);
    expect(tenantIdSchema.safeParse(".leading-dot").success).toBe(false);
  });
});

describe("readTenantHeader — shared header read+validate (replaces per-service duplication)", () => {
  it("returns the validated id for a good header", () => {
    expect(readTenantHeader("workspace-a", { code: "WORKSPACE_ID_REQUIRED" })).toBe("workspace-a");
  });

  it("unwraps an array-valued header", () => {
    expect(readTenantHeader(["workspace-a", "x"], { code: "WORKSPACE_ID_REQUIRED" })).toBe("workspace-a");
  });

  it("throws HeaderRequiredError (400) with the given code for a missing header", () => {
    try {
      readTenantHeader(undefined, { code: "WORKSPACE_ID_REQUIRED" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HeaderRequiredError);
      expect((err as HeaderRequiredError).statusCode).toBe(400);
      expect((err as HeaderRequiredError).code).toBe("WORKSPACE_ID_REQUIRED");
    }
  });

  it("throws HeaderRequiredError for a malformed id, using the caller's code", () => {
    try {
      readTenantHeader("bad|value", { code: "TENANT_ID_REQUIRED" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HeaderRequiredError);
      expect((err as HeaderRequiredError).code).toBe("TENANT_ID_REQUIRED");
    }
  });
});
