import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateBrandId, generateEventId, generateTenantId } from '../domain/ids.js';
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
}
