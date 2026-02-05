import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { createInMemoryRepo } from '../src/domain/repo.js';
import { generateBrandId, generateTenantId } from '../src/domain/ids.js';

describe('BrandGraph CRUD', () => {
  const repo = createInMemoryRepo();
  const app = buildServer({ repo });

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
    const tenantName = 'Test Tenant';
    const expectedTenantId = generateTenantId(tenantName);
    const expectedBrandId = generateBrandId(expectedTenantId, brandName);

    const response = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      payload: {
        name: brandName,
        tenantName: tenantName,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(expectedBrandId);
    expect(body.name).toBe(brandName);
    expect(body.tenantId).toBe(expectedTenantId);

    const event = await repo.findEventByBrand(expectedBrandId, 'BRAND_CREATED');
    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({ name: brandName });
  });

  it('GET /brandgraph/brands/:id returns the brand', async () => {
    const brandName = 'Fetch Test Brand';
    const tenantName = 'Test Tenant';
    const tenantId = generateTenantId(tenantName);
    const brandId = generateBrandId(tenantId, brandName);

    // Ensure it exists
    await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      payload: { name: brandName, tenantName },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/brandgraph/brands/${brandId}`,
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
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /brandgraph/brands/:id/artifacts/link links an artifact (idempotent)', async () => {
    // Create brand
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      payload: { tenantName: 'Acme', name: 'RocketCo' },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string; tenantId: string };

    // Link artifact
    const linkRes1 = await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      payload: { artifactId: 'art_123', artifactType: 'BrandBible' },
    });

    expect(linkRes1.statusCode).toBe(200);
    const link1 = JSON.parse(linkRes1.payload) as { artifactId: string };
    expect(link1.artifactId).toBe('art_123');

    // Link same artifact again (idempotent)
    const linkRes2 = await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      payload: { artifactId: 'art_123', artifactType: 'BrandBible' },
    });

    expect(linkRes2.statusCode).toBe(200);
  });

  it('runs artifact link workflow and emits graph snapshot events', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      payload: { tenantName: 'Acme', name: `WorkflowCo-${Date.now()}` },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      payload: { artifactId: 'art_workflow', artifactType: 'Workflow' },
    });

    const snapshotEvent = await repo.findEventByBrand(created.id, 'GRAPH_SNAPSHOT_UPDATED');
    expect(snapshotEvent).toBeDefined();

    const workflowEvent = await repo.findEventByBrand(created.id, 'WORKFLOW_STEP_COMPLETED');
    expect(workflowEvent).toBeDefined();
  });

  it('GET /brandgraph/brands/:id/graph returns linkedArtifacts', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/brandgraph/brands',
      payload: { tenantName: 'Acme', name: 'GraphCo' },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/brandgraph/brands/${created.id}/artifacts/link`,
      payload: { artifactId: 'art_999', artifactType: 'VisualBible' },
    });

    const graphRes = await app.inject({
      method: 'GET',
      url: `/brandgraph/brands/${created.id}/graph`,
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
      payload: { artifactId: 'art_nope' },
    });
    expect(linkRes.statusCode).toBe(404);

    const graphRes = await app.inject({
      method: 'GET',
      url: '/brandgraph/brands/non-existent/graph',
    });
    expect(graphRes.statusCode).toBe(404);
  });
});
