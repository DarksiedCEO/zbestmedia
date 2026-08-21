import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { resolveServiceAuthConfig } from "@zbest/service-auth";
import { registerRoutes, registerServiceAuthHook } from "../src/http/routes";
import { createMemoryPrisma } from "./helpers";

// Closes: "zero authentication on any route" and "artifact reads are a
// global bucket with no tenant scoping" at the actual HTTP boundary — the
// domain-level fix (registry.tenant-scoping.test.ts) proves the data layer
// is scoped; this proves an unauthenticated or wrong-tenant HTTP caller
// never reaches it.

const AUTH_ENV = JSON.stringify([
  { keyId: "workspace-a-service", token: "tok-workspace-a", principalId: "workspace-a-service", subject: "service:workspace-a", audiences: ["artifact-registry"], scopes: ["artifact:*"], tenants: ["workspace-a"], issuedAt: "2026-01-01T00:00:00.000Z", notBefore: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", status: "ACTIVE", generation: 1 },
  { keyId: "workspace-b-service", token: "tok-workspace-b", principalId: "workspace-b-service", subject: "service:workspace-b", audiences: ["artifact-registry"], scopes: ["artifact:*"], tenants: ["workspace-b"], issuedAt: "2026-01-01T00:00:00.000Z", notBefore: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", status: "ACTIVE", generation: 1 }
]);

function buildMeta(args: { artifactId: string; artifactType: string; requestId: string; attempt: number }) {
  return {
    artifactId: args.artifactId,
    requestId: args.requestId,
    artifactType: args.artifactType,
    schemaVersion: "1.0.0",
    lineage: { parentArtifactIds: [], sourceEventId: "evt-1", attempt: args.attempt }
  };
}

function storePayload(overrides: { requestId: string; workspaceId: string; artifactId: string }) {
  const meta = buildMeta({
    artifactId: overrides.artifactId,
    artifactType: "BrandBible",
    requestId: overrides.requestId,
    attempt: 1
  });
  return {
    requestId: overrides.requestId,
    workspaceId: overrides.workspaceId,
    brandId: "brand-1",
    artifactType: "BrandBible",
    artifactVersion: "1.0.0",
    attempt: 1,
    input: { prompt: overrides.requestId },
    payload: {
      meta,
      brandId: "brand-1",
      title: "Brand Bible",
      summary: "summary",
      voice: "direct",
      tone: "clear",
      pillars: ["clarity"],
      dos: ["be direct"],
      donts: ["ramble"]
    },
    meta
  };
}

async function buildTestApp() {
  const app = Fastify();
  const authConfig = resolveServiceAuthConfig(AUTH_ENV);
  const prisma = createMemoryPrisma();
  const nc = { publish: vi.fn() } as any;
  await registerRoutes(app, nc, authConfig, { prisma });
  return app;
}

describe("artifact-registry HTTP — authentication and tenant authorization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it("rejects POST /registry/store with no Authorization header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/registry/store",
      payload: storePayload({ requestId: "req-1", workspaceId: "workspace-a", artifactId: "placeholder" })
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /registry/store when the token isn't authorized for the request's workspace", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-b" },
      payload: storePayload({ requestId: "req-2", workspaceId: "workspace-a", artifactId: "placeholder" })
    });
    expect(res.statusCode).toBe(403);
  });

  it("accepts POST /registry/store with a token authorized for the workspace", async () => {
    const { deterministicArtifactId } = await import("@zbest/id-core");
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-a",
      requestId: "req-3",
      artifactType: "BrandBible",
      input: { prompt: "req-3" },
      attempt: 1
    });

    const res = await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-a" },
      payload: storePayload({ requestId: "req-3", workspaceId: "workspace-a", artifactId })
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().artifactId).toBe(artifactId);
  });

  it("rejects GET /registry/artifacts/:id with no x-workspace-id header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/registry/artifacts/some-id",
      headers: { authorization: "Bearer tok-workspace-a" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 (not another tenant's data) when reading an artifact through the wrong workspace", async () => {
    const { deterministicArtifactId } = await import("@zbest/id-core");
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-a",
      requestId: "req-4",
      artifactType: "BrandBible",
      input: { prompt: "req-4" },
      attempt: 1
    });

    await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-a" },
      payload: storePayload({ requestId: "req-4", workspaceId: "workspace-a", artifactId })
    });

    // workspace-b's own token is valid and it IS authorized to act as
    // workspace-b — but the artifact belongs to workspace-a, so this must
    // read as "not found," never as workspace-a's real data.
    const res = await app.inject({
      method: "GET",
      url: `/registry/artifacts/${artifactId}`,
      headers: { authorization: "Bearer tok-workspace-b", "x-workspace-id": "workspace-b" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the artifact when read through its own workspace", async () => {
    const { deterministicArtifactId } = await import("@zbest/id-core");
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-a",
      requestId: "req-5",
      artifactType: "BrandBible",
      input: { prompt: "req-5" },
      attempt: 1
    });

    await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-a" },
      payload: storePayload({ requestId: "req-5", workspaceId: "workspace-a", artifactId })
    });

    const res = await app.inject({
      method: "GET",
      url: `/registry/artifacts/${artifactId}`,
      headers: { authorization: "Bearer tok-workspace-a", "x-workspace-id": "workspace-a" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().artifactId).toBe(artifactId);
  });

  it("rejects GET /registry/lineage/:id claiming a workspace the token isn't authorized for", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/registry/lineage/some-id",
      headers: { authorization: "Bearer tok-workspace-a", "x-workspace-id": "workspace-b" }
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 (not another tenant's artifact) when workspace-b tries to seal a known workspace-a artifact id through its own legitimate credentials", async () => {
    const { deterministicArtifactId } = await import("@zbest/id-core");
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-a",
      requestId: "req-6",
      artifactType: "BrandBible",
      input: { prompt: "req-6" },
      attempt: 1
    });

    await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-a" },
      payload: storePayload({ requestId: "req-6", workspaceId: "workspace-a", artifactId })
    });

    // workspace-b's own token, its own workspaceId in the body — a fully
    // legitimate caller for itself, just naming an id it doesn't own.
    const res = await app.inject({
      method: "POST",
      url: "/registry/seal",
      headers: { authorization: "Bearer tok-workspace-b" },
      payload: { workspaceId: "workspace-b", artifactId, sealedBy: "attacker", sealedReason: "probe" }
    });
    expect(res.statusCode).toBe(404);

    // and it's genuinely unsealed still, from workspace-a's own view
    const check = await app.inject({
      method: "GET",
      url: `/registry/artifacts/${artifactId}`,
      headers: { authorization: "Bearer tok-workspace-a", "x-workspace-id": "workspace-a" }
    });
    expect(check.json().immutableAt).toBeNull();
  });

  it("returns 404 (not another tenant's lineage graph) when workspace-b requests lineage for a known workspace-a artifact id through its own legitimate credentials", async () => {
    const { deterministicArtifactId } = await import("@zbest/id-core");
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-a",
      requestId: "req-7",
      artifactType: "BrandBible",
      input: { prompt: "req-7" },
      attempt: 1
    });

    await app.inject({
      method: "POST",
      url: "/registry/store",
      headers: { authorization: "Bearer tok-workspace-a" },
      payload: storePayload({ requestId: "req-7", workspaceId: "workspace-a", artifactId })
    });

    const res = await app.inject({
      method: "GET",
      url: `/registry/lineage/${artifactId}`,
      headers: { authorization: "Bearer tok-workspace-b", "x-workspace-id": "workspace-b" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("REGRESSION: an unauthenticated request with a malformed body returns 401, not a schema 400 (auth runs before validation)", async () => {
    // Previously the handler parsed the body before authenticating, so an
    // anonymous caller could probe the request schema via 400 ZodErrors.
    // The onRequest hook now authenticates first, so a tokenless caller is
    // rejected 401 regardless of body shape.
    const res = await app.inject({
      method: "POST",
      url: "/registry/store",
      payload: { total: "garbage", not: "a valid store body" }
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("artifact-registry HTTP — structural auth guarantee (future routes)", () => {
  // Proves the fix is structural, not per-handler discipline: any NEW route
  // registered under the same auth hook is authenticated automatically, so a
  // future route cannot silently ship unauthenticated.
  async function buildAppWithNewRoute() {
    const app = Fastify();
    const authConfig = resolveServiceAuthConfig(AUTH_ENV);
    await app.register(async (instance) => {
      registerServiceAuthHook(instance, authConfig);
      // A brand-new route the original PR never wrote, added AFTER the hook.
      instance.get("/registry/some-future-route", async (_request, reply) => {
        return reply.send({ ok: true });
      });
    });
    // A route OUTSIDE the encapsulated auth context stays open (e.g. health).
    app.get("/health", async () => ({ status: "ok" }));
    return app;
  }

  it("rejects a newly-added protected route with no token (401)", async () => {
    const app = await buildAppWithNewRoute();
    const res = await app.inject({ method: "GET", url: "/registry/some-future-route" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a newly-added protected route with an unknown token (401)", async () => {
    const app = await buildAppWithNewRoute();
    const res = await app.inject({
      method: "GET",
      url: "/registry/some-future-route",
      headers: { authorization: "Bearer not-a-real-token" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("allows a newly-added protected route with a valid token (200)", async () => {
    const app = await buildAppWithNewRoute();
    const res = await app.inject({
      method: "GET",
      url: "/registry/some-future-route",
      headers: { authorization: "Bearer tok-workspace-a" }
    });
    expect(res.statusCode).toBe(200);
  });

  it("leaves routes outside the auth context (health) open", async () => {
    const app = await buildAppWithNewRoute();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
