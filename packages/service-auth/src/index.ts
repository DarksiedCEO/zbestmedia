import { z } from "zod";

// Security floor: every service-to-service call must present a Bearer token
// mapped to an identity, and every tenant-scoped operation must check that
// identity's tenant list — closing "no auth on any route" and "tenantId
// trusted from the caller" in one shared, fail-fast primitive.

export const WILDCARD_TENANT = "*";

// Shared tenant/workspace identifier validator. Both brandgraph (x-tenant-id)
// and artifact-registry (x-workspace-id) validate the caller-claimed tenant
// header against THIS schema, so the two services can't drift to different
// strictness levels (the prior gap: one enforced a charset regex, the other
// accepted any non-empty string).
export const tenantIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "tenant/workspace id must be URL/header safe");

// Fastify delivers a header as string | string[] | undefined. One place that
// normalizes it, reused by extractBearerToken and readTenantHeader so the
// unwrap idiom is not re-typed per call site.
export function extractHeaderValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? undefined;
}

// 400 boundary: a required tenant/workspace header is missing or malformed.
// Distinct from ServiceAuthError (401/403) because it is a request-shape
// problem, not an auth decision. Carries statusCode so Fastify's error
// handling and both services' error mappers can render it uniformly.
export class HeaderRequiredError extends Error {
  public readonly statusCode = 400 as const;
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Read + validate a tenant/workspace id header in one shared call. Both
// services use this; only the machine-readable `code` differs per service.
export function readTenantHeader(
  raw: string | string[] | undefined,
  opts: { code: string }
): string {
  const value = extractHeaderValue(raw);
  const parsed = tenantIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new HeaderRequiredError(opts.code, "Missing or invalid tenant/workspace id header");
  }
  return parsed.data;
}

const ServiceIdentitySchema = z.object({
  keyId: z.string().min(1),
  token: z.string().min(8),
  tenants: z.array(z.string().min(1)).min(1),
  description: z.string().optional()
});

const ServiceIdentityListSchema = z.array(ServiceIdentitySchema).min(1);

export type ServiceIdentity = {
  keyId: string;
  tenants: string[];
  description?: string;
};

export type ServiceAuthConfig = {
  principalsByToken: Map<string, ServiceIdentity>;
};

export class ServiceAuthError extends Error {
  public readonly statusCode: 401 | 403;
  public readonly code: "UNAUTHENTICATED" | "TENANT_FORBIDDEN";

  constructor(statusCode: 401 | 403, code: ServiceAuthError["code"], message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Fail-closed: missing, empty, or malformed config throws rather than
// falling back to an open/no-auth state. Duplicate tokens are rejected
// because they would make identity resolution ambiguous.
export function resolveServiceAuthConfig(raw: string | undefined): ServiceAuthConfig {
  if (!raw || raw.trim() === "") {
    throw new Error("Missing SERVICE_AUTH_TOKENS — service cannot start without an auth config");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("SERVICE_AUTH_TOKENS must be valid JSON");
  }

  const identities = ServiceIdentityListSchema.parse(parsedJson);

  const principalsByToken = new Map<string, ServiceIdentity>();
  for (const identity of identities) {
    if (principalsByToken.has(identity.token)) {
      throw new Error(`SERVICE_AUTH_TOKENS contains a duplicate token (keyId: ${identity.keyId})`);
    }
    principalsByToken.set(identity.token, {
      keyId: identity.keyId,
      tenants: [...new Set(identity.tenants)],
      description: identity.description
    });
  }

  return { principalsByToken };
}

// The 401 boundary: no token, or a token that doesn't map to any identity.
export function authenticateBearerToken(
  token: string | null,
  config: ServiceAuthConfig
): ServiceIdentity {
  if (!token) {
    throw new ServiceAuthError(401, "UNAUTHENTICATED", "Missing bearer token");
  }

  const identity = config.principalsByToken.get(token);
  if (!identity) {
    throw new ServiceAuthError(401, "UNAUTHENTICATED", "Invalid bearer token");
  }

  return identity;
}

// The 403 boundary: an authenticated identity that isn't allowed to touch
// this specific tenant/workspace. This is the check that closes the
// "artifact reads are a global bucket" and "tenantId trusted from the
// caller" findings — authentication alone is not authorization.
export function authorizeTenant(identity: ServiceIdentity, tenantId: string): void {
  if (identity.tenants.includes(WILDCARD_TENANT)) {
    return;
  }
  if (!identity.tenants.includes(tenantId)) {
    throw new ServiceAuthError(
      403,
      "TENANT_FORBIDDEN",
      `Identity "${identity.keyId}" is not authorized for tenant "${tenantId}"`
    );
  }
}

// Convenience: authenticate then authorize in one call — the shape every
// route handler actually wants.
export function authenticateAndAuthorize(
  token: string | null,
  tenantId: string,
  config: ServiceAuthConfig
): ServiceIdentity {
  const identity = authenticateBearerToken(token, config);
  authorizeTenant(identity, tenantId);
  return identity;
}

export function extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
  const header = extractHeaderValue(authorizationHeader);
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token;
}
