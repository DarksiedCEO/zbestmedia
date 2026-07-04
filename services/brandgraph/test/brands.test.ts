import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveServiceAuthConfig } from '@zbest/service-auth';
import { buildServer } from '../src/server.js';
import { createInMemoryRepo } from '../src/domain/repo.js';
import { generateBrandId } from '../src/domain/ids.js';

// Wildcard identity: this suite exercises business logic across many
// distinct tenant ids, so the "legitimate caller" fixture is authorized for
// all of them, exactly like an internal trusted-service credential. The
// dedicated "authentication and authorization" describe block below proves
// the 401/403 boundaries with tenant-scoped identities instead.
const TEST_AUTH_ENV = JSON.stringify([
  { keyId: 'test-suite-caller', token: 'test-token', tenants: ['*'] },
  { keyId: 'scoped-caller', token: 'scoped-token', tenants: ['only-allowed-tenant'] }
]);
const testAuthConfig = resolveServiceAuthConfig(TEST_AUTH_ENV);

describe('BrandGraph CRUD', () => {
  const repo = createInMemoryRepo();
  const app = buildServer({ repo, authConfig: testAuthConfig });
  const tenant = (id: string) => ({ 'x-tenant-id': id, authorization: 'Bearer test-token' });

  beforeAll(async () => {
    await app.ready();
    // Clean up test data if possible, but prisma might be pointing to a real db.
    // In a real project, we'd use a test DB or mock prisma.
  });

  afterAll(async () => {
    await app.close();
    // no external DB to disconnect
  });

  it('POST /brandgraph/brands creates a brand with deterministic ID', async () => {
    const brandName = 'Test Brand ' + Date.now();
    const tenantId = 'tenant-test';
    const expectedBrandId = generateBrandId(tenantId, brandName);

    const response = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      headers: tenant(tenantId),
      payload: {
        name: brandName,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(expectedBrandId);
    expect(body.name).toBe(brandName);
    expect(body.tenantId).toBe(tenantId);

    const event = await repo.findEventByBrand(tenantId, expectedBrandId, 'BRAND_CREATED');
    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({ name: brandName });
  });

  it('GET /brandgraph/brands/:id returns the brand', async () => {
    const brandName = 'Fetch Test Brand';
    const tenantId = 'tenant-fetch';
    const brandId = generateBrandId(tenantId, brandName);

    // Ensure it exists
    await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      headers: tenant(tenantId),
      payload: { name: brandName },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/brandgraph/brands/${brandId}`,
      headers: tenant(tenantId),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(brandId);
    expect(body.name).toBe(brandName);
  });

  it('GET /brandgraph/brands/:id returns 404 for non-existent brand', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brandgraph/brands/non-existent-id',
      headers: tenant('tenant-missing'),
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /brandgraph/brands/:id/artifacts/link links an artifact (idempotent)', async () => {
    // Create brand
    const tenantId = 'tenant-link';
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      headers: tenant(tenantId),
      payload: { name: 'RocketCo' },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string; tenantId: string };

    // Link artifact
    const linkRes1 = await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      headers: tenant(tenantId),
      payload: { artifactId: 'art_123', artifactType: 'BrandBible' },
    });

    expect(linkRes1.statusCode).toBe(200);
    const link1 = JSON.parse(linkRes1.payload) as { artifactId: string };
    expect(link1.artifactId).toBe('art_123');

    // Link same artifact again (idempotent)
    const linkRes2 = await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      headers: tenant(tenantId),
      payload: { artifactId: 'art_123', artifactType: 'BrandBible' },
    });

    expect(linkRes2.statusCode).toBe(200);
  });

  it('runs artifact link workflow and emits graph snapshot events', async () => {
    const tenantId = 'tenant-workflow';
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      headers: tenant(tenantId),
      payload: { name: `WorkflowCo-${Date.now()}` },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      headers: tenant(tenantId),
      payload: { artifactId: 'art_workflow', artifactType: 'Workflow' },
    });

    const snapshotEvent = await repo.findEventByBrand(tenantId, created.id, 'GRAPH_SNAPSHOT_UPDATED');
    expect(snapshotEvent).toBeDefined();

    const workflowEvent = await repo.findEventByBrand(tenantId, created.id, 'WORKFLOW_STEP_COMPLETED');
    expect(workflowEvent).toBeDefined();
  });

  it('GET /brandgraph/brands/:id/graph returns linkedArtifacts', async () => {
    const tenantId = 'tenant-graph';
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      headers: tenant(tenantId),
      payload: { name: 'GraphCo' },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      headers: tenant(tenantId),
      payload: { artifactId: 'art_999', artifactType: 'VisualBible' },
    });

    const graphRes = await app.inject({
      method: 'GET',
      url: `/brandgraph/brands/${created.id}/graph`,
      headers: tenant(tenantId),
    });

    expect(graphRes.statusCode).toBe(200);
    const body = JSON.parse(graphRes.payload) as {
      brand: { id: string };
      linkedArtifacts: Array<{ artifactId: string; artifactType?: string | null }>;
    };

    expect(body.brand.id).toBe(created.id);
    expect(body.linkedArtifacts.some((a) => a.artifactId === 'art_999')).toBe(true);
  });

  it('link + graph return 404 when brand does not exist', async () => {
    const linkRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands/non-existent/artifacts/link',
      headers: tenant('tenant-missing'),
      payload: { artifactId: 'art_nope' },
    });
    expect(linkRes.statusCode).toBe(404);

    const graphRes = await app.inject({
      method: 'GET',
      url: '/brandgraph/brands/non-existent/graph',
      headers: tenant('tenant-missing'),
    });
    expect(graphRes.statusCode).toBe(404);
  });

  it('returns 400 when tenant header is missing (but the caller is authenticated)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brandgraph/brands/any-id',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(400);
  });

  describe('Authentication and authorization', () => {
    it('returns 401 when no Authorization header is present at all', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/brandgraph/brands/any-id',
        headers: { 'x-tenant-id': 'tenant-no-token' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for an unrecognized bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/brandgraph/brands/any-id',
        headers: { 'x-tenant-id': 'tenant-bad-token', authorization: 'Bearer not-a-real-token' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when a valid token is used to claim a tenant it is not authorized for', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/brandgraph/brands/any-id',
        headers: { 'x-tenant-id': 'some-other-tenant', authorization: 'Bearer scoped-token' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('accepts a scoped token for the exact tenant it is authorized for', async () => {
      const brandName = 'Scoped Token Brand';
      const response = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: { 'x-tenant-id': 'only-allowed-tenant', authorization: 'Bearer scoped-token' },
        payload: { name: brandName },
      });
      expect(response.statusCode).toBe(201);
    });

    it('rejects the old body.tenantId trust path — a body-supplied tenantId is ignored, not honored', async () => {
      // Closes the audited finding directly: a caller authorized ONLY for
      // "only-allowed-tenant" must not be able to write into another tenant
      // by naming it in the request body instead of the header.
      const response = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: { authorization: 'Bearer scoped-token' },
        payload: { name: 'Body Tenant Attempt', tenantId: 'some-other-tenant' },
      });
      // No x-tenant-id header at all -> 400, never a silently-accepted
      // body tenantId.
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Tenant scoping', () => {
    it('isolates tenants (brand created in t1 is invisible to t2)', async () => {
      const tenantId = 't1a';
      const otherTenantId = 't2a';
      const brandName = `Scoped-${Date.now()}`;
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: brandName },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      const r1 = await app.inject({
        method: 'GET',
        url: `/brandgraph/brands/${brand.id}`,
        headers: tenant(tenantId),
      });
      expect(r1.statusCode).toBe(200);

      const r2 = await app.inject({
        method: 'GET',
        url: `/brandgraph/brands/${brand.id}`,
        headers: tenant(otherTenantId),
      });
      expect(r2.statusCode).toBe(404);
    });

    it('blocks cross-tenant writes and reads', async () => {
      const tenantId = 't1w';
      const otherTenantId = 't2w';
      const brandName = `ScopedWrite-${Date.now()}`;
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: brandName },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      const linkRes = await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(otherTenantId),
        payload: { artifactId: 'art_cross' },
      });
      expect(linkRes.statusCode).toBe(404);

      const graphRes = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}`,
        headers: tenant(otherTenantId),
      });
      expect(graphRes.statusCode).toBe(404);
    });
  });

  describe('BT-5 Graph Read APIs', () => {
    it('GET /brandgraph/graph/:brandId returns a complete graph view', async () => {
      const tenantId = 'tenant-read';
      const brandName = `GraphRead-${Date.now()}`;
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: brandName },
      });
      const brand = JSON.parse(createRes.payload);

      // Link an artifact
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_graph_1', artifactType: 'StyleGuide' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}`,
        headers: tenant(tenantId),
      });

      expect(response.statusCode).toBe(200);
      const graph = JSON.parse(response.payload);

      expect(graph.brandId).toBe(brand.id);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2); // Brand + Artifact
      expect(graph.edges.length).toBeGreaterThanOrEqual(1); // Link edge

      const brandNode = graph.nodes.find((n: any) => n.type === 'brand');
      expect(brandNode.id).toBe(brand.id);
      expect(brandNode.label).toBe(brand.id);

      const artifactNode = graph.nodes.find((n: any) => n.type === 'artifact');
      expect(artifactNode.label).toBe('art_graph_1');
    });

    it('GET /brandgraph/graph/:brandId/snapshots returns historical snapshots', async () => {
      const tenantId = 'tenant-snapshot';
      const brandName = `SnapshotRead-${Date.now()}`;
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: brandName },
      });
      const brand = JSON.parse(createRes.payload);

      // Linking triggers snapshot update via workflow
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_snap_1' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}/snapshots`,
        headers: tenant(tenantId),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.brandId).toBe(brand.id);
      expect(Array.isArray(body.snapshots)).toBe(true);
      expect(body.snapshots.length).toBeGreaterThan(0);
      expect(body.snapshots[0].eventId).toBeDefined();
    });

    it('GET /brandgraph/graph/:brandId/snapshots supports paging with nextCursor', async () => {
      const tenantId = 'tenant-snapshot-paging';
      const brandName = `SnapshotPage-${Date.now()}`;
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: brandName },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload);

      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_snap_a' },
      });
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_snap_b' },
      });

      const first = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}/snapshots?limit=1`,
        headers: tenant(tenantId),
      });
      expect(first.statusCode).toBe(200);
      const firstBody = JSON.parse(first.payload) as {
        snapshots: Array<{ eventId: string }>;
        nextCursor: string | null;
      };
      expect(firstBody.snapshots.length).toBe(1);
      expect(firstBody.nextCursor).toBe(firstBody.snapshots[0]!.eventId);

      const second = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}/snapshots?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
        headers: tenant(tenantId),
      });
      expect(second.statusCode).toBe(200);
      const secondBody = JSON.parse(second.payload) as { snapshots: Array<{ eventId: string }> };
      expect(secondBody.snapshots.some((s) => s.eventId === firstBody.nextCursor)).toBe(false);
    });

    it('GET /brandgraph/graph/:brandId/snapshots returns 400 for invalid cursor', async () => {
      const tenantId = 'tenant-snapshot-invalid';
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: 'SnapshotInvalid' },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload);

      const res = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}/snapshots?cursor=does-not-exist`,
        headers: tenant(tenantId),
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /brandgraph/graph/:brandId supports limit', async () => {
      const tenantId = 'tenant-limit';
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: 'LimitCo' },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_A', artifactType: 'BrandBible' },
      });
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_B', artifactType: 'VisualBible' },
      });

      const graphRes = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}?limit=1`,
        headers: tenant(tenantId),
      });
      expect(graphRes.statusCode).toBe(200);

      const body = JSON.parse(graphRes.payload) as { edges: Array<{ id: string }>; nextCursor: string | null };
      expect(body.edges.length).toBe(1);
      expect(body.nextCursor).toBe(body.edges[0]!.id);
    });

    it('GET /brandgraph/graph/:brandId supports cursor paging', async () => {
      const tenantId = 'tenant-cursor';
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: 'CursorCo' },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_1' },
      });
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_2' },
      });

      const first = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}?limit=1`,
        headers: tenant(tenantId),
      });
      expect(first.statusCode).toBe(200);

      const firstBody = JSON.parse(first.payload) as { edges: Array<{ id: string }>; nextCursor: string | null };
      expect(firstBody.edges.length).toBe(1);
      const cursor = firstBody.nextCursor!;

      const second = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}?cursor=${encodeURIComponent(cursor)}&limit=10`,
        headers: tenant(tenantId),
      });
      expect(second.statusCode).toBe(200);

      const secondBody = JSON.parse(second.payload) as { edges: Array<{ id: string }> };
      expect(secondBody.edges.length).toBeGreaterThanOrEqual(0);
      expect(secondBody.edges.some((e) => e.id === cursor)).toBe(false);
    });

    it('GET /brandgraph/graph/:brandId returns 400 for invalid limit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/brandgraph/graph/non-existent?limit=999999',
        headers: tenant('tenant-invalid'),
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /brandgraph/graph/:brandId returns 400 for invalid cursor', async () => {
      const tenantId = 'tenant-invalid-cursor';
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: 'CursorInvalid' },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      const res = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}?cursor=does-not-exist`,
        headers: tenant(tenantId),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent graph', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/brandgraph/graph/does-not-exist',
        headers: tenant('tenant-missing'),
      });
      expect(response.statusCode).toBe(404);
    });

    it('GET /brandgraph/graph/:brandId returns stable ordering', async () => {
      const tenantId = 'tenant-stable';
      const createRes = await app.inject({
        method: 'POST',
        url: '/brandgraph/brands',
        headers: tenant(tenantId),
        payload: { name: 'StableOrder' },
      });
      expect(createRes.statusCode).toBe(201);
      const brand = JSON.parse(createRes.payload) as { id: string };

      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_2' },
      });
      await app.inject({
        method: 'POST',
        url: `/brandgraph/brands/${brand.id}/artifacts/link`,
        headers: tenant(tenantId),
        payload: { artifactId: 'art_1' },
      });

      const first = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}`,
        headers: tenant(tenantId),
      });
      const second = await app.inject({
        method: 'GET',
        url: `/brandgraph/graph/${brand.id}`,
        headers: tenant(tenantId),
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const firstBody = JSON.parse(first.payload) as { edges: Array<{ id: string }> };
      const secondBody = JSON.parse(second.payload) as { edges: Array<{ id: string }> };
      expect(firstBody.edges[0]?.id).toBe(secondBody.edges[0]?.id);
    });
  });
});
