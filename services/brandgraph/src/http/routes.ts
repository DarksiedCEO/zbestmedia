import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateBrandId, generateEventId, generateTenantId, makeEventId } from '../domain/ids.js';
import type { BrandGraphRepo } from '../domain/repo.js';

const CreateBrandSchema = z.object({
  name: z.string().min(1),
  tenantName: z.string().optional().default('Default Tenant'),
});

export async function brandRoutes(app: FastifyInstance, deps: { repo: BrandGraphRepo }) {
  const { repo } = deps;
  // POST /brandgraph/brands
  app.post('/brands', async (request, reply) => {
    const { name, tenantName } = CreateBrandSchema.parse(request.body);
    
    // In a real app, tenantId would come from auth context. 
    // For now, we derive it from tenantName for determinism.
    const tenantId = generateTenantId(tenantName!);
    const brandId = generateBrandId(tenantId, name);

    const brand = await repo.createBrand({ id: brandId, tenantId, name });

    await repo.createEvent({
      id: generateEventId(),
      tenantId,
      brandId,
      eventType: 'BRAND_CREATED',
      payload: { name, tenantId, timestamp: new Date().toISOString() },
    });

    return reply.status(201).send(brand);
  });

  // GET /brandgraph/brands/:id
  app.get('/brands/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const brand = await repo.getBrand(id);

    if (!brand) {
      return reply.status(404).send({ error: 'Brand not found' });
    }

    return brand;
  });

  // POST /brandgraph/brands/:id/artifacts/link
  app.post('/brands/:id/artifacts/link', async (request, reply) => {
    const { id: brandId } = request.params as { id: string };
    const body = request.body as { artifactId: string; artifactType?: string };

    if (!body?.artifactId || typeof body.artifactId !== 'string') {
      return reply.code(400).send({ error: 'INVALID_ARTIFACT_ID' });
    }

    const brand = await repo.getBrand(brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    const link = await repo.linkArtifact({
      tenantId: brand.tenantId,
      brandId,
      artifactId: body.artifactId,
      artifactType: body.artifactType ?? null,
    });

    await repo.createEvent({
      id: makeEventId({ tenantId: brand.tenantId, brandId, eventType: 'ARTIFACT_LINKED' }),
      tenantId: brand.tenantId,
      brandId,
      eventType: 'ARTIFACT_LINKED',
      payload: { artifactId: link.artifactId, artifactType: link.artifactType ?? null },
    });

    return reply.code(200).send(link);
  });

  // GET /brandgraph/brands/:id/graph
  app.get('/brands/:id/graph', async (request, reply) => {
    const { id: brandId } = request.params as { id: string };

    const brand = await repo.getBrand(brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    const linkedArtifacts = await repo.listArtifactLinks(brandId);

    // Keep it minimal for now. Events listing can be added in BT-3C.2 if you want.
    return reply.code(200).send({
      brand,
      linkedArtifacts,
    });
  });
}
