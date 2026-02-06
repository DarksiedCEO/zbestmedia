import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateBrandId, generateEventId, generateTenantId, makeEventId } from '../domain/ids.js';
import type { GraphQueryOptions } from '../domain/graph.js';
import type { BrandGraphRepo } from '../domain/repo.js';
import { createArtifactLinkWorkflow } from '../workflows/artifactLink.workflow.js';
import { WorkflowRunner } from '../workflows/runner.js';

const CreateBrandSchema = z.object({
  name: z.string().min(1),
  tenantName: z.string().optional().default('Default Tenant'),
});

const MAX_LIMIT = 500;

function parseGraphQueryOptions(query: unknown): GraphQueryOptions {
  const q = (query ?? {}) as Record<string, unknown>;

  const limitRaw = q.limit;
  let limit: number | undefined;

  if (typeof limitRaw === 'string' && limitRaw.trim() !== '') {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_LIMIT) {
      throw new Error('INVALID_LIMIT');
    }
    limit = n;
  } else if (typeof limitRaw === 'number') {
    const n = limitRaw;
    if (!Number.isInteger(n) || n <= 0 || n > MAX_LIMIT) {
      throw new Error('INVALID_LIMIT');
    }
    limit = n;
  }

  const cursor =
    typeof q.cursor === 'string' && q.cursor.trim() !== '' ? q.cursor : undefined;

  const fromTimestamp =
    typeof q.fromTimestamp === 'string' && q.fromTimestamp.trim() !== ''
      ? q.fromTimestamp
      : undefined;

  const toTimestamp =
    typeof q.toTimestamp === 'string' && q.toTimestamp.trim() !== ''
      ? q.toTimestamp
      : undefined;

  let eventTypes: Array<'ARTIFACT_LINKED'> | undefined;
  const et = q.eventTypes;

  if (typeof et === 'string' && et.trim() !== '') {
    if (et !== 'ARTIFACT_LINKED') throw new Error('INVALID_EVENT_TYPES');
    eventTypes = ['ARTIFACT_LINKED'];
  } else if (Array.isArray(et) && et.length > 0) {
    const normalized = et.filter((x): x is string => typeof x === 'string');
    if (normalized.some((x) => x !== 'ARTIFACT_LINKED')) throw new Error('INVALID_EVENT_TYPES');
    eventTypes = ['ARTIFACT_LINKED'];
  }

  if (fromTimestamp && Number.isNaN(Date.parse(fromTimestamp))) {
    throw new Error('INVALID_FROM_TIMESTAMP');
  }
  if (toTimestamp && Number.isNaN(Date.parse(toTimestamp))) {
    throw new Error('INVALID_TO_TIMESTAMP');
  }

  return {
    limit,
    cursor,
    fromTimestamp,
    toTimestamp,
    eventTypes,
  };
}

export async function brandRoutes(
  app: FastifyInstance,
  deps: { repo: BrandGraphRepo; workflowRunner?: WorkflowRunner }
) {
  const { repo } = deps;
  const workflowRunner = deps.workflowRunner ?? new WorkflowRunner(repo);
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

    await workflowRunner.run(createArtifactLinkWorkflow(repo), {
      tenantId: brand.tenantId,
      brandId,
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

  // GET /brandgraph/graph/:brandId
  app.get('/graph/:brandId', async (request, reply) => {
    const { brandId } = request.params as { brandId: string };

    let options: GraphQueryOptions | undefined;
    try {
      options = parseGraphQueryOptions(request.query);
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(400).send({ error: msg });
    }

    const graph = await repo.getGraph(brandId, options);

    return reply.code(200).send(graph);
  });

  // GET /brandgraph/graph/:brandId/snapshots
  app.get('/graph/:brandId/snapshots', async (request, reply) => {
    const { brandId } = request.params as { brandId: string };

    let options: GraphQueryOptions | undefined;
    try {
      options = parseGraphQueryOptions(request.query);
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(400).send({ error: msg });
    }

    const snapshots = await repo.getGraphSnapshots(brandId, options);
    return reply.code(200).send(snapshots);
  });
}
