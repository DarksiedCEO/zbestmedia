import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateBearerToken, authorizeTenant, extractBearerToken, type ServiceAuthConfig } from '@zbest/service-auth';
import { generateBrandId, generateEventId, makeEventId } from '../domain/ids.js';
import type { GraphQueryOptions } from '../domain/graph.js';
import type { BrandGraphRepo } from '../domain/repo.js';
import { getTenantId } from './tenant.js';
import { createArtifactLinkWorkflow } from '../workflows/artifactLink.workflow.js';
import { WorkflowRunner } from '../workflows/runner.js';

// Single choke point for every route: authenticate the bearer token (401),
// resolve the tenant id from the header only — never from the request body,
// which the caller fully controls (400 on missing/malformed), then confirm
// the authenticated identity is actually authorized for that tenant (403).
function authenticateAndGetTenantId(request: FastifyRequest, authConfig: ServiceAuthConfig): string {
  const token = extractBearerToken(request.headers.authorization);
  const identity = authenticateBearerToken(token, authConfig);
  const tenantId = getTenantId(request);
  authorizeTenant(identity, tenantId);
  return tenantId;
}

const CreateBrandSchema = z.object({
  name: z.string().min(1),
  tenantName: z.string().optional().default('Default Tenant'),
});

const MAX_LIMIT = 100;
const CursorSchema = z
  .string()
  .min(3)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

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

  const cursorRaw =
    typeof q.cursor === 'string' && q.cursor.trim() !== '' ? q.cursor : undefined;
  const cursorParsed = cursorRaw ? CursorSchema.safeParse(cursorRaw) : undefined;
  if (cursorRaw && !cursorParsed?.success) {
    throw new Error('INVALID_CURSOR');
  }

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
    cursor: cursorRaw ?? undefined,
    fromTimestamp,
    toTimestamp,
    eventTypes,
  };
}

export async function brandRoutes(
  app: FastifyInstance,
  deps: { repo: BrandGraphRepo; workflowRunner?: WorkflowRunner; authConfig: ServiceAuthConfig }
) {
  const { repo, authConfig } = deps;
  const workflowRunner = deps.workflowRunner ?? new WorkflowRunner(repo);
  // POST /brandgraph/brands
  app.post('/brands', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { name } = CreateBrandSchema.parse(request.body);
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

  // GET /brandgraph/brands
  app.get('/brands', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const brands = await repo.listBrands(tenantId);
    return reply.send(brands);
  });

  // GET /brandgraph/brands/:id
  app.get('/brands/:id', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { id } = request.params as { id: string };
    
    const brand = await repo.getBrand(tenantId, id);

    if (!brand) {
      return reply.status(404).send({ error: 'Brand not found' });
    }

    return brand;
  });

  // POST /brandgraph/brands/:id/artifacts/link
  app.post('/brands/:id/artifacts/link', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { id: brandId } = request.params as { id: string };
    const body = request.body as { artifactId: string; artifactType?: string };

    if (!body?.artifactId || typeof body.artifactId !== 'string') {
      return reply.code(400).send({ error: 'INVALID_ARTIFACT_ID' });
    }

    const brand = await repo.getBrand(tenantId, brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    const link = await repo.linkArtifact({
      tenantId,
      brandId,
      artifactId: body.artifactId,
      artifactType: body.artifactType ?? null,
    });

    await repo.createEvent({
      id: makeEventId({ tenantId, brandId, eventType: 'ARTIFACT_LINKED' }),
      tenantId,
      brandId,
      eventType: 'ARTIFACT_LINKED',
      payload: { artifactId: link.artifactId, artifactType: link.artifactType ?? null },
    });

    await workflowRunner.run(createArtifactLinkWorkflow(repo), {
      tenantId,
      brandId,
    });

    return reply.code(200).send(link);
  });

  // GET /brandgraph/brands/:id/graph
  app.get('/brands/:id/graph', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { id: brandId } = request.params as { id: string };

    const brand = await repo.getBrand(tenantId, brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    const linkedArtifacts = await repo.listArtifactLinks(tenantId, brandId);

    // Keep it minimal for now. Events listing can be added in BT-3C.2 if you want.
    return reply.code(200).send({
      brand,
      linkedArtifacts,
    });
  });

  // GET /brandgraph/graph/:brandId
  app.get('/graph/:brandId', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { brandId } = request.params as { brandId: string };

    let options: GraphQueryOptions | undefined;
    try {
      options = parseGraphQueryOptions(request.query);
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(400).send({ error: msg });
    }

    const brand = await repo.getBrand(tenantId, brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    let graph;
    try {
      graph = await repo.getGraph(tenantId, brandId, options);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INVALID_CURSOR') {
        return reply.code(400).send({ error: msg });
      }
      throw err;
    }

    return reply.code(200).send(graph);
  });

  // GET /brandgraph/graph/:brandId/snapshots
  app.get('/graph/:brandId/snapshots', async (request, reply) => {
    let tenantId: string;
    try {
      tenantId = authenticateAndGetTenantId(request, authConfig);
    } catch (err) {
      const error = err as { statusCode?: number; code?: string };
      return reply.code(error.statusCode ?? 400).send({ error: error.code ?? 'TENANT_ID_REQUIRED' });
    }

    const { brandId } = request.params as { brandId: string };

    let options: GraphQueryOptions | undefined;
    try {
      options = parseGraphQueryOptions(request.query);
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(400).send({ error: msg });
    }

    const brand = await repo.getBrand(tenantId, brandId);
    if (!brand) return reply.code(404).send({ error: 'NOT_FOUND' });

    let snapshots;
    try {
      snapshots = await repo.getGraphSnapshots(tenantId, brandId, options);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INVALID_CURSOR') {
        return reply.code(400).send({ error: msg });
      }
      throw err;
    }
    return reply.code(200).send(snapshots);
  });
}
