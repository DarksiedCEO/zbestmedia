import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { generateBrandId, generateEventId, generateTenantId } from '../domain/ids.js';

const CreateBrandSchema = z.object({
  name: z.string().min(1),
  tenantName: z.string().optional().default('Default Tenant'),
});

export async function brandRoutes(app: FastifyInstance) {
  // POST /brandgraph/brands
  app.post('/brands', async (request, reply) => {
    const { name, tenantName } = CreateBrandSchema.parse(request.body);
    
    // In a real app, tenantId would come from auth context. 
    // For now, we derive it from tenantName for determinism.
    const tenantId = generateTenantId(tenantName!);
    const brandId = generateBrandId(tenantId, name);

    const result = await prisma.$transaction(async (tx) => {
      // Ensure tenant exists
      await tx.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, name: tenantName! },
      });

      const brand = await tx.brand.upsert({
        where: { id: brandId },
        update: { name },
        create: {
          id: brandId,
          name,
          tenantId,
        },
      });

      const event = await tx.graphEvent.create({
        data: {
          id: generateEventId(),
          tenantId,
          brandId,
          eventType: 'BRAND_CREATED',
          payload: JSON.stringify({ name, tenantId, timestamp: new Date().toISOString() }),
        },
      });

      return { brand, event };
    });

    return reply.status(201).send(result.brand);
  });

  // GET /brandgraph/brands/:id
  app.get('/brands/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const brand = await prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      return reply.status(404).send({ error: 'Brand not found' });
    }

    return brand;
  });
}
