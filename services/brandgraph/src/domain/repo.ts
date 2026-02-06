import { prisma } from "../db/prisma.js";
import { PrismaBrandGraphRepo } from "./repo.prisma.js";
import { GraphSnapshot, GraphSnapshotList } from './graph.js';

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
  getBrand(id: string): Promise<Brand | null>;
  createEvent(input: Omit<GraphEvent, "createdAt">): Promise<GraphEvent>;
  findEventByBrand(brandId: string, eventType: string): Promise<GraphEvent | null>;
  linkArtifact(input: {
    tenantId: string;
    brandId: string;
    artifactId: string;
    artifactType?: string | null;
  }): Promise<ArtifactLink>;
  listArtifactLinks(brandId: string): Promise<ArtifactLink[]>;

  /** Read-only full graph projection */
  getGraph(brandId: string): Promise<GraphSnapshot>;

  /** Historical snapshot index */
  getGraphSnapshots(brandId: string): Promise<GraphSnapshotList>;
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

  return {
    async createBrand({ id, tenantId, name }) {
      const now = new Date().toISOString();
      const brand: Brand = { id, tenantId, name, createdAt: now };
      brands.set(id, brand);
      return brand;
    },
    async getBrand(id) {
      return brands.get(id) ?? null;
    },
    async createEvent(input) {
      const now = new Date().toISOString();
      const event: GraphEvent = { ...input, createdAt: now };
      events.push(event);
      return event;
    },
    async findEventByBrand(brandId, eventType) {
      return events.find((evt) => evt.brandId === brandId && evt.eventType === eventType) ?? null;
    },
    async linkArtifact(input) {
      const key = `${input.brandId}:${input.artifactId}`;
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
    async listArtifactLinks(brandId) {
      return Array.from(artifactLinks.values()).filter((link) => link.brandId === brandId);
    },
    async getGraph(brandId) {
      const nodes = new Map<string, { id: string; type: 'brand' | 'artifact' }>();
      const edges = [];

      nodes.set(brandId, { id: brandId, type: 'brand' });

      for (const link of Array.from(artifactLinks.values()).filter(l => l.brandId === brandId)) {
        nodes.set(link.artifactId, { id: link.artifactId, type: 'artifact' });

        edges.push({
          from: brandId,
          to: link.artifactId,
          type: 'ARTIFACT_LINKED' as const,
          eventId: link.eventId,
          createdAt: link.createdAt,
        });
      }

      return {
        brandId,
        nodes: Array.from(nodes.values()),
        edges,
      };
    },
    async getGraphSnapshots(brandId) {
      const snapshots = Array.from(artifactLinks.values())
        .filter(l => l.brandId === brandId)
        .map(l => ({
          eventId: l.eventId,
          createdAt: l.createdAt,
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
