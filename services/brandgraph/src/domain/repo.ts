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

      if (eventTypes?.length && !eventTypes.includes('ARTIFACT_LINKED')) {
        return {
          brandId,
          nodes: [{ id: brandId, type: 'brand', label: brandId }],
          edges: [],
          generatedAt: new Date().toISOString(),
          nextCursor: null,
        };
      }

      let allLinks = Array.from(artifactLinks.values()).filter(
        (link) => link.tenantId === tenantId && link.brandId === brandId
      );

      if (fromTimestamp) {
        allLinks = allLinks.filter((link) => link.createdAt >= fromTimestamp);
      }

      if (toTimestamp) {
        allLinks = allLinks.filter((link) => link.createdAt <= toTimestamp);
      }

      allLinks = allLinks.sort((a, b) => a.eventId.localeCompare(b.eventId));
      const orderedLinks = allLinks;

      let pagedSource = orderedLinks;
      if (cursor) {
        const cursorIndex = orderedLinks.findIndex((link) => link.eventId === cursor);
        if (cursorIndex === -1) {
          throw new Error("INVALID_CURSOR");
        }
        pagedSource = orderedLinks.slice(cursorIndex + 1);
      }

      const paged = pagedSource.slice(0, limit);
      const hasMore = pagedSource.length > paged.length;

      const nodes = new Map<string, { id: string; type: 'brand' | 'artifact'; label: string }>();
      const edges = [];

      nodes.set(brandId, { id: brandId, type: 'brand', label: brandId });

      for (const link of orderedLinks) {
        nodes.set(link.artifactId, { id: link.artifactId, type: 'artifact', label: link.artifactId });
      }

      for (const link of paged) {
        edges.push({
          id: link.eventId,
          from: brandId,
          to: link.artifactId,
          type: 'ARTIFACT_LINKED' as const,
          createdAt: link.createdAt,
          eventId: link.eventId,
        });
      }

      return {
        brandId,
        nodes: Array.from(nodes.values()).sort((a, b) => a.id.localeCompare(b.id)),
        edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
        generatedAt: new Date().toISOString(),
        nextCursor: hasMore && edges.length ? edges[edges.length - 1]!.id : null,
      };
    },
    async getGraphSnapshots(tenantId, brandId, options = {}) {
      const { limit = DEFAULT_LIMIT, cursor, fromTimestamp, toTimestamp, eventTypes } = options;

      if (eventTypes?.length && !eventTypes.includes('ARTIFACT_LINKED')) {
        return { brandId, snapshots: [], nextCursor: null };
      }

      let allLinks = Array.from(artifactLinks.values()).filter(
        (link) => link.tenantId === tenantId && link.brandId === brandId
      );

      if (fromTimestamp) {
        allLinks = allLinks.filter((link) => link.createdAt >= fromTimestamp);
      }

      if (toTimestamp) {
        allLinks = allLinks.filter((link) => link.createdAt <= toTimestamp);
      }

      allLinks = allLinks.sort((a, b) =>
        a.createdAt === b.createdAt
          ? b.eventId.localeCompare(a.eventId)
          : b.createdAt.localeCompare(a.createdAt)
      );

      if (cursor) {
        const cursorIndex = allLinks.findIndex((link) => link.eventId === cursor);
        if (cursorIndex === -1) {
          throw new Error("INVALID_CURSOR");
        }
        allLinks = allLinks.slice(cursorIndex + 1);
      }

      const pagedSnapshots = allLinks.slice(0, limit);
      const snapshots = pagedSnapshots.map((link) => ({
        eventId: link.eventId,
        createdAt: link.createdAt,
      }));

      return {
        brandId,
        snapshots,
        nextCursor: allLinks.length > pagedSnapshots.length && snapshots.length
          ? snapshots[snapshots.length - 1]!.eventId
          : null
      };
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
