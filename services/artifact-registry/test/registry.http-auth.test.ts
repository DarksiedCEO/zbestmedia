import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { resolveServiceAuthConfig } from "@zbest/service-auth";
import { registerRoutes } from "../src/http/routes";
import { createMemoryPrisma } from "./helpers";

// Closes: "zero authentication on any route" and "artifact reads are a
// global bucket with no tenant scoping" at the actual HTTP boundary — the
// domain-level fix (registry.tenant-scoping.test.ts) proves the data layer
// is scoped; this proves an unauthenticated or wrong-tenant HTTP caller
// never reaches it.

const AUTH_ENV = JSON.stringify([
  { keyId: "workspace-a-service", token: "tok-workspace-a", tenants: ["workspace-a"] },
  { keyId: "workspace-b-service", token: "tok-workspace-b", tenants: ["workspace-b"] }
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
});
