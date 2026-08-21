import { z } from "zod";

// Security floor: every service-to-service call must present a Bearer token
// mapped to an identity, and every tenant-scoped operation must check that
// identity's tenant list — closing "no auth on any route" and "tenantId
// trusted from the caller" in one shared, fail-fast primitive.

export const WILDCARD_TENANT = "*";
export const WILDCARD_SCOPE = "*";

export const CredentialLifecycleStatusSchema = z.enum([
  "ISSUED",
  "ACTIVE",
  "ROTATING",
  "SUPERSEDED",
  "EXPIRED",
  "REVOKED"
]);
export type CredentialLifecycleStatus = z.infer<typeof CredentialLifecycleStatusSchema>;

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
  principalId: z.string().min(1),
  subject: z.string().min(1),
  audiences: z.array(z.string().min(1)).min(1),
  scopes: z.array(z.string().min(1)).min(1),
  tenants: z.array(z.string().min(1)).min(1),
  issuedAt: z.string().datetime(),
  notBefore: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: CredentialLifecycleStatusSchema,
  generation: z.number().int().positive(),
  revokedAt: z.string().datetime().optional(),
  replacesKeyId: z.string().min(1).optional(),
  description: z.string().optional()
}).superRefine((identity, ctx) => {
  const issuedAt = Date.parse(identity.issuedAt);
  const notBefore = Date.parse(identity.notBefore);
  const expiresAt = Date.parse(identity.expiresAt);
  if (notBefore < issuedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notBefore"], message: "notBefore cannot precede issuedAt" });
  }
  if (expiresAt <= notBefore) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must be after notBefore" });
  }
  if (identity.status === "REVOKED" && !identity.revokedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revoked credentials require revokedAt" });
  }
  if (identity.revokedAt && Date.parse(identity.revokedAt) < issuedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "revokedAt cannot precede issuedAt" });
  }
});

const ServiceIdentityListSchema = z.array(ServiceIdentitySchema).min(1);

export type ServiceIdentity = {
  keyId: string;
  principalId: string;
  subject: string;
  audiences: string[];
  scopes: string[];
  tenants: string[];
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  status: CredentialLifecycleStatus;
  generation: number;
  revokedAt?: string;
  replacesKeyId?: string;
  description?: string;
};

export type ServiceAuthConfig = {
  principalsByToken: Map<string, ServiceIdentity>;
  maximumGenerationByPrincipal: Map<string, number>;
};

export class ServiceAuthError extends Error {
  public readonly statusCode: 401 | 403;
  public readonly code:
    | "UNAUTHENTICATED"
    | "CREDENTIAL_NOT_ACTIVE"
    | "CREDENTIAL_NOT_YET_VALID"
    | "CREDENTIAL_EXPIRED"
    | "CREDENTIAL_REVOKED"
    | "CREDENTIAL_ROLLBACK"
    | "PRINCIPAL_FORBIDDEN"
    | "SUBJECT_FORBIDDEN"
    | "AUDIENCE_FORBIDDEN"
    | "SCOPE_FORBIDDEN"
    | "TENANT_FORBIDDEN";

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
  const maximumGenerationByPrincipal = new Map<string, number>();
  const keyIds = new Set<string>();
  for (const identity of identities) {
    if (principalsByToken.has(identity.token)) {
      throw new Error(`SERVICE_AUTH_TOKENS contains a duplicate token (keyId: ${identity.keyId})`);
    }
    if (keyIds.has(identity.keyId)) {
      throw new Error(`SERVICE_AUTH_TOKENS contains a duplicate keyId (${identity.keyId})`);
    }
    keyIds.add(identity.keyId);
    principalsByToken.set(identity.token, {
      keyId: identity.keyId,
      principalId: identity.principalId,
      subject: identity.subject,
      audiences: [...new Set(identity.audiences)],
      scopes: [...new Set(identity.scopes)],
      tenants: [...new Set(identity.tenants)],
      issuedAt: identity.issuedAt,
      notBefore: identity.notBefore,
      expiresAt: identity.expiresAt,
      status: identity.status,
      generation: identity.generation,
      revokedAt: identity.revokedAt,
      replacesKeyId: identity.replacesKeyId,
      description: identity.description
    });
    maximumGenerationByPrincipal.set(
      identity.principalId,
      Math.max(maximumGenerationByPrincipal.get(identity.principalId) ?? 0, identity.generation)
    );
  }

  return { principalsByToken, maximumGenerationByPrincipal };
}

// The 401 boundary: no token, or a token that doesn't map to any identity.
export function authenticateBearerToken(
  token: string | null,
  config: ServiceAuthConfig,
  now = new Date()
): ServiceIdentity {
  if (!token) {
    throw new ServiceAuthError(401, "UNAUTHENTICATED", "Missing bearer token");
  }

  const identity = config.principalsByToken.get(token);
  if (!identity) {
    throw new ServiceAuthError(401, "UNAUTHENTICATED", "Invalid bearer token");
  }

  if (identity.status === "REVOKED") {
    throw new ServiceAuthError(401, "CREDENTIAL_REVOKED", "Credential has been revoked");
  }
  if (identity.status !== "ACTIVE") {
    throw new ServiceAuthError(401, "CREDENTIAL_NOT_ACTIVE", "Credential is not active");
  }
  if (now.getTime() < Date.parse(identity.notBefore)) {
    throw new ServiceAuthError(401, "CREDENTIAL_NOT_YET_VALID", "Credential is not yet valid");
  }
  if (now.getTime() >= Date.parse(identity.expiresAt)) {
    throw new ServiceAuthError(401, "CREDENTIAL_EXPIRED", "Credential has expired");
  }
  if (identity.generation < (config.maximumGenerationByPrincipal.get(identity.principalId) ?? identity.generation)) {
    throw new ServiceAuthError(401, "CREDENTIAL_ROLLBACK", "Credential generation is stale");
  }

  return identity;
}

export type ServiceAuthorizationRequirement = {
  principalId: string;
  subject: string;
  audience: string;
  tenantId: string;
  requiredScopes: string[];
};

export function authorizeServiceRequest(
  identity: ServiceIdentity,
  requirement: ServiceAuthorizationRequirement
): void {
  if (identity.principalId !== requirement.principalId) {
    throw new ServiceAuthError(403, "PRINCIPAL_FORBIDDEN", "Credential principal is not authorized");
  }
  if (identity.subject !== requirement.subject) {
    throw new ServiceAuthError(403, "SUBJECT_FORBIDDEN", "Credential subject is not authorized");
  }
  if (!identity.audiences.includes(requirement.audience)) {
    throw new ServiceAuthError(403, "AUDIENCE_FORBIDDEN", "Credential audience is not authorized");
  }
  authorizeTenant(identity, requirement.tenantId);
  if (!identity.scopes.includes(WILDCARD_SCOPE) && requirement.requiredScopes.some((scope) => !identity.scopes.includes(scope))) {
    throw new ServiceAuthError(403, "SCOPE_FORBIDDEN", "Credential scope is not authorized");
  }
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
  config: ServiceAuthConfig,
  now = new Date()
): ServiceIdentity {
  const identity = authenticateBearerToken(token, config, now);
  authorizeTenant(identity, tenantId);
  return identity;
}

export function authenticateAndAuthorizeServiceRequest(
  token: string | null,
  requirement: ServiceAuthorizationRequirement,
  config: ServiceAuthConfig,
  now = new Date()
): ServiceIdentity {
  const identity = authenticateBearerToken(token, config, now);
  authorizeServiceRequest(identity, requirement);
  return identity;
}

export type CredentialAuditEvent = {
  type: "SERVICE_CREDENTIAL_ROTATED" | "SERVICE_CREDENTIAL_REVOKED";
  at: string;
  actorId: string;
  keyId: string;
  replacementKeyId?: string;
  generation: number;
  previousStatus: CredentialLifecycleStatus;
  status: CredentialLifecycleStatus;
  reason: string;
};

export type CredentialAuditSink = {
  append: (event: CredentialAuditEvent) => void;
};

// Lifecycle changes fail closed: an audit event must be durably accepted by
// the caller-provided sink before the in-memory authorization state changes.
// Tokens are deliberately absent from audit events.
export function revokeServiceCredential(
  config: ServiceAuthConfig,
  token: string,
  input: { actorId: string; reason: string; now?: Date },
  audit: CredentialAuditSink
): void {
  const identity = config.principalsByToken.get(token);
  if (!identity) throw new ServiceAuthError(401, "UNAUTHENTICATED", "Unknown credential");
  if (identity.status === "REVOKED") return;

  const at = (input.now ?? new Date()).toISOString();
  audit.append({
    type: "SERVICE_CREDENTIAL_REVOKED",
    at,
    actorId: input.actorId,
    keyId: identity.keyId,
    generation: identity.generation,
    previousStatus: identity.status,
    status: "REVOKED",
    reason: input.reason
  });
  identity.status = "REVOKED";
  identity.revokedAt = at;
}

export function rotateServiceCredential(
  config: ServiceAuthConfig,
  currentToken: string,
  replacement: {
    keyId: string;
    token: string;
    principalId?: string;
    subject?: string;
    audiences?: string[];
    scopes?: string[];
    tenants: string[];
    issuedAt: string;
    notBefore?: string;
    expiresAt: string;
  },
  input: { actorId: string; reason: string; now?: Date },
  audit: CredentialAuditSink
): ServiceIdentity {
  const current = config.principalsByToken.get(currentToken);
  if (!current) throw new ServiceAuthError(401, "UNAUTHENTICATED", "Unknown credential");
  if (current.status !== "ACTIVE") {
    throw new ServiceAuthError(401, "CREDENTIAL_REVOKED", "Revoked credential cannot be rotated");
  }
  if (config.principalsByToken.has(replacement.token)) {
    throw new Error("Replacement token is already registered");
  }
  if ([...config.principalsByToken.values()].some((identity) => identity.keyId === replacement.keyId)) {
    throw new Error("Replacement keyId is already registered");
  }

  const at = (input.now ?? new Date()).toISOString();

  const parsed = ServiceIdentitySchema.parse({
    ...replacement,
    principalId: replacement.principalId ?? current.principalId,
    subject: replacement.subject ?? current.subject,
    audiences: replacement.audiences ?? current.audiences,
    scopes: replacement.scopes ?? current.scopes,
    notBefore: replacement.notBefore ?? replacement.issuedAt,
    status: "ACTIVE",
    generation: current.generation + 1,
    replacesKeyId: current.keyId
  });
  const { token: _token, ...identityFields } = parsed;
  const next: ServiceIdentity = {
    ...identityFields,
    audiences: [...new Set(parsed.audiences)],
    scopes: [...new Set(parsed.scopes)],
    tenants: [...new Set(parsed.tenants)]
  };
  if (Date.parse(next.notBefore) > Date.parse(at) || Date.parse(next.expiresAt) <= Date.parse(at)) {
    throw new Error("Replacement credential must be valid at the rotation instant");
  }
  if (next.principalId !== current.principalId || next.subject !== current.subject) {
    throw new Error("Rotation cannot change credential principal or subject");
  }
  if (next.tenants.some((tenant) => !current.tenants.includes(WILDCARD_TENANT) && !current.tenants.includes(tenant)) ||
      next.audiences.some((audience) => !current.audiences.includes(audience)) ||
      next.scopes.some((scope) => !current.scopes.includes(WILDCARD_SCOPE) && !current.scopes.includes(scope))) {
    throw new Error("Rotation cannot escalate credential authorization");
  }

  audit.append({
    type: "SERVICE_CREDENTIAL_ROTATED",
    at,
    actorId: input.actorId,
    keyId: current.keyId,
    replacementKeyId: next.keyId,
    generation: next.generation,
    previousStatus: current.status,
    status: "SUPERSEDED",
    reason: input.reason
  });
  current.status = "SUPERSEDED";
  config.principalsByToken.set(replacement.token, next);
  config.maximumGenerationByPrincipal.set(current.principalId, next.generation);
  return next;
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
