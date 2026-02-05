import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db/prisma.js';
import { generateBrandId, generateTenantId } from '../src/domain/ids.js';

describe('BrandGraph CRUD', () => {
  const app = buildServer();

  beforeAll(async () => {
    await app.ready();
    // Clean up test data if possible, but prisma might be pointing to a real db.
    // In a real project, we'd use a test DB or mock prisma.
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
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

    // Verify event was created
    const event = await prisma.graphEvent.findFirst({
      where: { brandId: expectedBrandId, eventType: 'BRAND_CREATED' },
    });
    expect(event).toBeDefined();
    const payload = JSON.parse(event?.payload as string);
    expect(payload.name).toBe(brandName);
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
});
