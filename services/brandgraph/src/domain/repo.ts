import { prisma } from "../db/prisma.js";
import { PrismaBrandGraphRepo } from "./repo.prisma.js";
import { GraphQueryOptions, GraphSnapshot, GraphSnapshotList } from './graph.js';
import { tenantKey } from "./tenantKey.js";

export type Brand = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
};

export type GraphEvent = {
  id: string;
  tenantId: string;
  brandId?: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

export interface BrandGraphRepo {
  createBrand(input: { id: string; tenantId: string; name: string }): Promise<Brand>;
  getBrand(tenantId: string, id: string): Promise<Brand | null>;
  createEvent(input: Omit<GraphEvent, "createdAt">): Promise<GraphEvent>;
  findEventByBrand(tenantId: string, brandId: string, eventType: string): Promise<GraphEvent | null>;
  linkArtifact(input: {
    tenantId: string;
    brandId: string;
    artifactId: string;
    artifactType?: string | null;
  }): Promise<ArtifactLink>;
  listArtifactLinks(tenantId: string, brandId: string): Promise<ArtifactLink[]>;

  /** Read-only full graph projection */
  getGraph(tenantId: string, brandId: string, options?: GraphQueryOptions): Promise<GraphSnapshot>;

  /** Historical snapshot index */
  getGraphSnapshots(tenantId: string, brandId: string, options?: GraphQueryOptions): Promise<GraphSnapshotList>;
}

const isTest = process.env.NODE_ENV === "test" || process.env.BRANDGRAPH_DB === "test";

export function createBrandGraphRepo(): BrandGraphRepo {
  if (isTest) {
    return createInMemoryRepo();
  }
  return new PrismaBrandGraphRepo(prisma);
}

export function createInMemoryRepo(): BrandGraphRepo {
  const brands = new Map<string, Brand>();
  const events: GraphEvent[] = [];
  const artifactLinks = new Map<string, ArtifactLink>();
  const DEFAULT_LIMIT = 100;

  const getArtifactId = (payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    return typeof record.artifactId === "string" ? record.artifactId : null;
  };

  return {
    async createBrand({ id, tenantId, name }) {
      const now = new Date().toISOString();
      const brand: Brand = { id, tenantId, name, createdAt: now };
      brands.set(tenantKey(tenantId, id), brand);
      return brand;
    },
    async getBrand(tenantId, id) {
      return brands.get(tenantKey(tenantId, id)) ?? null;
    },
    async createEvent(input) {
      const now = new Date().toISOString();
      const event: GraphEvent = { ...input, createdAt: now };
      events.push(event);
      return event;
    },
    async findEventByBrand(tenantId, brandId, eventType) {
      return (
        events.find(
          (evt) => evt.tenantId === tenantId && evt.brandId === brandId && evt.eventType === eventType
        ) ?? null
      );
    },
    async linkArtifact(input) {
      const key = `${input.tenantId}:${input.brandId}:${input.artifactId}`;
      const existing = artifactLinks.get(key);
      if (existing) return existing;

      const link: ArtifactLink = {
        id: key,
        tenantId: input.tenantId,
        brandId: input.brandId,
        artifactId: input.artifactId,
        artifactType: input.artifactType ?? null,
        linkedAt: new Date().toISOString(),
        eventId: "event-" + key, // Dummy eventId for compat
        createdAt: new Date().toISOString()
      };
      artifactLinks.set(key, link);
      return link;
    },
    async listArtifactLinks(tenantId, brandId) {
      return Array.from(artifactLinks.values()).filter(
        (link) => link.tenantId === tenantId && link.brandId === brandId
      );
    },
    async getGraph(tenantId, brandId, options = {}) {
      const {
        limit = DEFAULT_LIMIT,
        cursor,
        fromTimestamp,
        toTimestamp,
        eventTypes,
      } = options;

      let filtered = events.filter((evt) => evt.tenantId === tenantId && evt.brandId === brandId);
      const allowedEventTypes = eventTypes?.length ? new Set(eventTypes) : null;

      if (allowedEventTypes) {
        filtered = filtered.filter((evt) => allowedEventTypes.has(evt.eventType as 'ARTIFACT_LINKED'));
      } else {
        filtered = filtered.filter((evt) => evt.eventType === 'ARTIFACT_LINKED');
      }

      if (cursor) {
        filtered = filtered.filter((evt) => evt.id > cursor);
      }

      if (fromTimestamp) {
        filtered = filtered.filter((evt) => evt.createdAt >= fromTimestamp);
      }

      if (toTimestamp) {
        filtered = filtered.filter((evt) => evt.createdAt <= toTimestamp);
      }

      filtered = filtered
        .sort((a, b) =>
          a.createdAt === b.createdAt
            ? a.id.localeCompare(b.id)
            : a.createdAt.localeCompare(b.createdAt)
        )
        .slice(0, limit);

      const nodes = new Map<string, { id: string; type: 'brand' | 'artifact'; label: string }>();
      const edges = [];

      nodes.set(brandId, { id: brandId, type: 'brand', label: brandId });

      for (const evt of filtered) {
        const artifactId = getArtifactId(evt.payload);
        if (!artifactId) continue;

        nodes.set(artifactId, { id: artifactId, type: 'artifact', label: artifactId });

        edges.push({
          id: evt.id,
          from: brandId,
          to: artifactId,
          type: 'ARTIFACT_LINKED' as const,
          createdAt: evt.createdAt,
          eventId: evt.id,
        });
      }

      return {
        brandId,
        nodes: Array.from(nodes.values()),
        edges,
        generatedAt: new Date().toISOString(),
      };
    },
    async getGraphSnapshots(tenantId, brandId, options = {}) {
      const {
        limit = DEFAULT_LIMIT,
        cursor,
        fromTimestamp,
        toTimestamp,
        eventTypes,
      } = options;

      let filtered = events.filter((evt) => evt.tenantId === tenantId && evt.brandId === brandId);
      const allowedEventTypes = eventTypes?.length ? new Set(eventTypes) : null;

      if (allowedEventTypes) {
        filtered = filtered.filter((evt) => allowedEventTypes.has(evt.eventType as 'ARTIFACT_LINKED'));
      } else {
        filtered = filtered.filter((evt) => evt.eventType === 'ARTIFACT_LINKED');
      }

      if (cursor) {
        filtered = filtered.filter((evt) => evt.id > cursor);
      }

      if (fromTimestamp) {
        filtered = filtered.filter((evt) => evt.createdAt >= fromTimestamp);
      }

      if (toTimestamp) {
        filtered = filtered.filter((evt) => evt.createdAt <= toTimestamp);
      }

      filtered = filtered.sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt)
      );

      const snapshots = filtered.slice(0, limit).map((evt) => ({
        eventId: evt.id,
        createdAt: evt.createdAt,
      }));

      return { brandId, snapshots };
    }
  };
}

export type ArtifactLink = {
  id: string;
  tenantId: string;
  brandId: string;
  artifactId: string;
  artifactType?: string | null;
  linkedAt: string;
  eventId: string;
  createdAt: string;
};
