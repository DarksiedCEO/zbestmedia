import { describe, expect, it } from "vitest";
import {
  HeaderRequiredError,
  ServiceAuthError,
  authenticateAndAuthorize,
  authenticateAndAuthorizeServiceRequest,
  authenticateBearerToken,
  authorizeTenant,
  extractBearerToken,
  extractHeaderValue,
  readTenantHeader,
  revokeServiceCredential,
  rotateServiceCredential,
  resolveAuthorizedPrincipalIds,
  resolveServiceAuthConfig,
  tenantIdSchema
} from "../src/index";

const ACTIVE_WINDOW = {
  issuedAt: "2026-01-01T00:00:00.000Z",
  notBefore: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  status: "ACTIVE" as const,
  generation: 1
};
const VALID_ENV = JSON.stringify([
  { keyId: "brandgraph-service", token: "tok-brandgraph", principalId: "brandgraph", subject: "service:brandgraph", audiences: ["artifact-registry"], scopes: ["artifact:read"], tenants: ["acme", "beta-corp"], ...ACTIVE_WINDOW },
  { keyId: "internal-admin", token: "tok-admin", principalId: "admin", subject: "service:admin", audiences: ["artifact-registry"], scopes: ["*"], tenants: ["*"], ...ACTIVE_WINDOW }
]);

describe("resolveServiceAuthConfig — fail-closed config parsing", () => {
  it("requires an explicit, unique server-owned principal allowlist", () => {
    expect(() => resolveAuthorizedPrincipalIds(undefined)).toThrow(/SERVICE_AUTH_ALLOWED_PRINCIPALS/);
    expect(() => resolveAuthorizedPrincipalIds("brandgraph,brandgraph")).toThrow(/unique/);
    expect([...resolveAuthorizedPrincipalIds("brandgraph, artifact-worker")]).toEqual(["brandgraph", "artifact-worker"]);
  });
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
      { keyId: "a", token: "tok-duplicate", principalId: "a", subject: "a", audiences: ["svc"], scopes: ["read"], tenants: ["acme"], ...ACTIVE_WINDOW },
      { keyId: "b", token: "tok-duplicate", principalId: "b", subject: "b", audiences: ["svc"], scopes: ["read"], tenants: ["beta-corp"], ...ACTIVE_WINDOW }
    ]);
    expect(() => resolveServiceAuthConfig(dup)).toThrow(/duplicate/i);
  });

  it("throws on duplicate key ids even when tokens differ", () => {
    const dup = JSON.stringify([
      { keyId: "same", token: "tok-duplicate-a", principalId: "a", subject: "a", audiences: ["svc"], scopes: ["read"], tenants: ["acme"], ...ACTIVE_WINDOW },
      { keyId: "same", token: "tok-duplicate-b", principalId: "b", subject: "b", audiences: ["svc"], scopes: ["read"], tenants: ["beta-corp"], ...ACTIVE_WINDOW }
    ]);
    expect(() => resolveServiceAuthConfig(dup)).toThrow(/duplicate keyId/);
  });

  it("rejects inverted validity windows and revoked records without revocation provenance", () => {
    const base = JSON.parse(VALID_ENV)[0];
    expect(() => resolveServiceAuthConfig(JSON.stringify([{ ...base, expiresAt: base.notBefore }]))).toThrow(/expiresAt/);
    expect(() => resolveServiceAuthConfig(JSON.stringify([{ ...base, status: "REVOKED" }]))).toThrow(/revokedAt/);
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

describe("credential lifetime, revocation, and audited rotation", () => {
  it("rejects a credential at the exact expiry boundary and under clock skew", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date(ACTIVE_WINDOW.expiresAt)))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_EXPIRED" }));
    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date("2027-01-01T00:00:00.001Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_EXPIRED" }));
  });

  it("accepts exactly at not-before and rejects one millisecond before", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date("2025-12-31T23:59:59.999Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_NOT_YET_VALID" }));
    expect(authenticateBearerToken("tok-brandgraph", config, new Date(ACTIVE_WINDOW.notBefore)).keyId)
      .toBe("brandgraph-service");
  });

  it.each(["ISSUED", "ROTATING", "SUPERSEDED", "EXPIRED"] as const)("fails closed for %s lifecycle state", (status) => {
    const raw = JSON.stringify([{ ...JSON.parse(VALID_ENV)[0], status }]);
    expect(() => authenticateBearerToken("tok-brandgraph", resolveServiceAuthConfig(raw), new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_NOT_ACTIVE" }));
  });

  it("rejects configs with a missing lifetime instead of creating an unbounded credential", () => {
    expect(() => resolveServiceAuthConfig(JSON.stringify([
      { keyId: "legacy", token: "legacy-token", tenants: ["acme"], status: "ACTIVE", generation: 1 }
    ]))).toThrow();
  });

  it("revokes immediately, audits without token material, and keeps cross-tenant denial", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    const events: unknown[] = [];
    revokeServiceCredential(config, "tok-brandgraph", {
      actorId: "credential-custodian",
      reason: "incident",
      now: new Date("2026-06-01T00:00:00.000Z")
    }, { append: (event) => events.push(event) });

    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date("2026-06-01T00:00:00.001Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_REVOKED" }));
    expect(JSON.stringify(events)).not.toContain("tok-brandgraph");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ previousStatus: "ACTIVE", status: "REVOKED", generation: 1 });
  });

  it("does not revoke when audit persistence fails", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => revokeServiceCredential(config, "tok-brandgraph", {
      actorId: "credential-custodian", reason: "test"
    }, { append: () => { throw new Error("audit unavailable"); } })).toThrow(/audit unavailable/);
    expect(authenticateBearerToken("tok-brandgraph", config, new Date("2026-06-01T00:00:00.000Z")).status)
      .toBe("ACTIVE");
  });

  it("rotates to generation + 1, audits, and invalidates the predecessor immediately", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    const events: unknown[] = [];
    const next = rotateServiceCredential(config, "tok-brandgraph", {
      keyId: "brandgraph-service-v2",
      token: "tok-brandgraph-v2",
      tenants: ["acme"],
      issuedAt: "2026-06-01T00:00:00.000Z",
      notBefore: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z"
    }, { actorId: "credential-custodian", reason: "scheduled", now: new Date("2026-06-01T00:00:00.000Z") },
    { append: (event) => events.push(event) });

    expect(next.generation).toBe(2);
    expect(next.replacesKeyId).toBe("brandgraph-service");
    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date("2026-06-01T00:00:00.001Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_NOT_ACTIVE" }));
    expect(authenticateBearerToken("tok-brandgraph-v2", config, new Date("2026-06-01T00:00:00.001Z")).keyId)
      .toBe("brandgraph-service-v2");
    expect(JSON.stringify(events)).not.toContain("tok-brandgraph");
    expect(events[0]).toMatchObject({ previousStatus: "ACTIVE", status: "SUPERSEDED", generation: 2 });
  });

  it("rolls rotation back completely when audit persistence fails", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => rotateServiceCredential(config, "tok-brandgraph", {
      keyId: "brandgraph-service-v2", token: "tok-brandgraph-v2", tenants: ["acme"],
      issuedAt: "2026-06-01T00:00:00.000Z", notBefore: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z"
    }, { actorId: "custodian", reason: "test", now: new Date("2026-06-01T00:00:00.000Z") },
    { append: () => { throw new Error("audit unavailable"); } })).toThrow(/audit unavailable/);
    expect(config.principalsByToken.has("tok-brandgraph-v2")).toBe(false);
    expect(authenticateBearerToken("tok-brandgraph", config, new Date("2026-06-01T00:00:00.000Z")).status).toBe("ACTIVE");
  });

  it("rejects stale generations and scope escalation during rotation", () => {
    const stale = JSON.parse(VALID_ENV)[0];
    const newer = { ...stale, keyId: "brandgraph-service-v2", token: "tok-brandgraph-v2", generation: 2 };
    const config = resolveServiceAuthConfig(JSON.stringify([stale, newer]));
    expect(() => authenticateBearerToken("tok-brandgraph", config, new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_ROLLBACK" }));

    const active = resolveServiceAuthConfig(VALID_ENV);
    expect(() => rotateServiceCredential(active, "tok-brandgraph", {
      keyId: "brandgraph-service-v2", token: "tok-brandgraph-v2", tenants: ["acme"], scopes: ["artifact:write"],
      issuedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-07-01T00:00:00.000Z"
    }, { actorId: "custodian", reason: "test", now: new Date("2026-06-01T00:00:00.000Z") }, { append: () => undefined }))
      .toThrow(/escalate/);
  });

  it("never rotates revoked or superseded credentials and reports the real lifecycle class", () => {
    const revoked = resolveServiceAuthConfig(VALID_ENV);
    revokeServiceCredential(revoked, "tok-brandgraph", { actorId: "custodian", reason: "incident" }, { append: () => undefined });
    const replacement = { keyId: "brandgraph-v2", token: "tok-brandgraph-v2", tenants: ["acme"], issuedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-07-01T00:00:00.000Z" };
    expect(() => rotateServiceCredential(revoked, "tok-brandgraph", replacement, { actorId: "custodian", reason: "probe", now: new Date("2026-06-01T00:00:00.000Z") }, { append: () => undefined }))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_REVOKED" }));

    const superseded = resolveServiceAuthConfig(JSON.stringify([{ ...JSON.parse(VALID_ENV)[0], status: "SUPERSEDED" }]));
    expect(() => rotateServiceCredential(superseded, "tok-brandgraph", replacement, { actorId: "custodian", reason: "probe", now: new Date("2026-06-01T00:00:00.000Z") }, { append: () => undefined }))
      .toThrowError(expect.objectContaining({ code: "CREDENTIAL_NOT_ACTIVE" }));
  });

  it("revocation is idempotent and emits exactly one provenance event", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    const events: unknown[] = [];
    const audit = { append: (event: unknown) => events.push(event) };
    revokeServiceCredential(config, "tok-brandgraph", { actorId: "custodian", reason: "incident" }, audit);
    revokeServiceCredential(config, "tok-brandgraph", { actorId: "custodian", reason: "duplicate" }, audit);
    expect(events).toHaveLength(1);
  });
});

describe("service identity claim binding — hostile authorization", () => {
  const requirement = { principalId: "brandgraph", subject: "service:brandgraph", audience: "artifact-registry", tenantId: "acme", requiredScopes: ["artifact:read"] };

  it("accepts server-required claims carried by verified credential evidence", () => {
    expect(authenticateAndAuthorizeServiceRequest("tok-brandgraph", requirement, resolveServiceAuthConfig(VALID_ENV), new Date("2026-06-01T00:00:00.000Z")).keyId)
      .toBe("brandgraph-service");
  });

  it.each([
    ["principalId", "caller-declared", "PRINCIPAL_FORBIDDEN"],
    ["subject", "caller-declared", "SUBJECT_FORBIDDEN"],
    ["audience", "wrong-service", "AUDIENCE_FORBIDDEN"],
    ["tenantId", "other-tenant", "TENANT_FORBIDDEN"]
  ] as const)("rejects wrong %s", (field, value, code) => {
    expect(() => authenticateAndAuthorizeServiceRequest("tok-brandgraph", { ...requirement, [field]: value }, resolveServiceAuthConfig(VALID_ENV), new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code }));
  });

  it("rejects caller-declared scope escalation and forged credential evidence without leaking secrets", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => authenticateAndAuthorizeServiceRequest("tok-brandgraph", { ...requirement, requiredScopes: ["artifact:write"] }, config, new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "SCOPE_FORBIDDEN" }));
    expect(() => authenticateAndAuthorizeServiceRequest("tok-brandgraph", { ...requirement, requiredScopes: ["artifact:read", "artifact:write"] }, config, new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "SCOPE_FORBIDDEN" }));
    try {
      authenticateAndAuthorizeServiceRequest("forged-secret-token", requirement, config);
      throw new Error("forged credential was accepted");
    } catch (error) {
      expect(String(error)).not.toContain("forged-secret-token");
      expect(error).toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("preserves authorization invariants across representative tenant and scope combinations", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    for (const tenantId of ["acme", "beta-corp", "other-tenant"]) {
      for (const scope of ["artifact:read", "artifact:write", "admin"]) {
        const shouldAllow = tenantId !== "other-tenant" && scope === "artifact:read";
        const operation = () => authenticateAndAuthorizeServiceRequest("tok-brandgraph", { ...requirement, tenantId, requiredScopes: [scope] }, config, new Date("2026-06-01T00:00:00.000Z"));
        if (shouldAllow) expect(operation).not.toThrow(); else expect(operation).toThrow(ServiceAuthError);
      }
    }
  });

  it("supports bounded namespace scopes but rejects unrelated namespaces", () => {
    const raw = JSON.stringify([{ ...JSON.parse(VALID_ENV)[0], scopes: ["artifact:*"] }]);
    const config = resolveServiceAuthConfig(raw);
    expect(() => authenticateAndAuthorizeServiceRequest("tok-brandgraph", requirement, config, new Date("2026-06-01T00:00:00.000Z"))).not.toThrow();
    expect(() => authenticateAndAuthorizeServiceRequest("tok-brandgraph", { ...requirement, requiredScopes: ["admin:write"] }, config, new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "SCOPE_FORBIDDEN" }));
  });
});

describe("exported bearer and convenience boundaries", () => {
  it("rejects non-Bearer authorization schemes", () => {
    expect(extractBearerToken("Basic tok-brandgraph")).toBeNull();
    expect(extractBearerToken("Token tok-brandgraph")).toBeNull();
    expect(extractBearerToken("Bearer tok-brandgraph")).toBe("tok-brandgraph");
  });

  it("authenticateAndAuthorize cannot skip tenant enforcement", () => {
    const config = resolveServiceAuthConfig(VALID_ENV);
    expect(() => authenticateAndAuthorize("tok-brandgraph", "other-tenant", config, new Date("2026-06-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "TENANT_FORBIDDEN" }));
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
