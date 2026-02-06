import { Prisma, type PrismaClient } from "../generated/prisma/index.js";
import { GraphSnapshot, GraphSnapshotList } from './graph';
import type { ArtifactLink, Brand, BrandGraphRepo, GraphEvent } from "./repo.js";

type PrismaBrand = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
};

type PrismaGraphEvent = {
  id: string;
  tenantId: string;
  brandId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: Date;
};

export class PrismaBrandGraphRepo implements BrandGraphRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async createBrand(input: { id: string; tenantId: string; name: string }): Promise<Brand> {
    const brand = await this.prisma.brand.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        name: input.name,
      },
    });

    return this.toBrand(brand);
  }

  async getBrand(id: string): Promise<Brand | null> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    return brand ? this.toBrand(brand) : null;
  }

  async createEvent(input: Omit<GraphEvent, "createdAt">): Promise<GraphEvent> {
    if (input.eventType === "ARTIFACT_LINKED" && input.brandId) {
      const artifactId = this.getArtifactId(input.payload);
      if (artifactId) {
        const existing = await this.findArtifactEvent(input.brandId, artifactId);
        if (existing) return this.toGraphEvent(existing);

        const created = await this.prisma.graphEvent.create({
          data: {
            id: `${input.brandId}:${artifactId}`,
            tenantId: input.tenantId,
            brandId: input.brandId,
            eventType: input.eventType,
            payload: input.payload as Prisma.InputJsonValue,
          },
        });
        return this.toGraphEvent(created);
      }
    }

    const event = await this.prisma.graphEvent.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        brandId: input.brandId ?? null,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });

    return this.toGraphEvent(event);
  }

  async findEventByBrand(brandId: string, eventType: string): Promise<GraphEvent | null> {
    const event = await this.prisma.graphEvent.findFirst({
      where: { brandId, eventType },
      orderBy: { createdAt: "desc" },
    });
    return event ? this.toGraphEvent(event) : null;
  }

  async linkArtifact(input: {
    tenantId: string;
    brandId: string;
    artifactId: string;
    artifactType?: string | null;
  }): Promise<ArtifactLink> {
    const existing = await this.findArtifactEvent(input.brandId, input.artifactId);
    if (existing) return this.toArtifactLink(existing);

    const created = await this.prisma.graphEvent.create({
      data: {
        id: `${input.brandId}:${input.artifactId}`,
        tenantId: input.tenantId,
        brandId: input.brandId,
        eventType: "ARTIFACT_LINKED",
        payload: {
          artifactId: input.artifactId,
          artifactType: input.artifactType ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return this.toArtifactLink(created);
  }

  async listArtifactLinks(brandId: string): Promise<ArtifactLink[]> {
    const events = await this.prisma.graphEvent.findMany({
      where: { brandId, eventType: "ARTIFACT_LINKED" },
      orderBy: { createdAt: "asc" },
    });

    return events.map((event) => this.toArtifactLink(event)).filter((link) => link.artifactId);
  }

  async getGraph(brandId: string): Promise<GraphSnapshot> {
    const events = await this.prisma.graphEvent.findMany({
      where: { brandId, eventType: 'ARTIFACT_LINKED' },
      orderBy: { createdAt: 'asc' },
    });

    const nodes = new Map<string, { id: string; type: 'brand' | 'artifact' }>();
    const edges = [];

    nodes.set(brandId, { id: brandId, type: 'brand' });

    for (const e of events) {
      const payload = e.payload as { artifactId: string };

      nodes.set(payload.artifactId, {
        id: payload.artifactId,
        type: 'artifact',
      });

      edges.push({
        from: brandId,
        to: payload.artifactId,
        type: 'ARTIFACT_LINKED' as const,
        eventId: e.id,
        createdAt: e.createdAt.toISOString(),
      });
    }

    return {
      brandId,
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  async getGraphSnapshots(brandId: string): Promise<GraphSnapshotList> {
    const events = await this.prisma.graphEvent.findMany({
      where: { brandId, eventType: 'ARTIFACT_LINKED' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      brandId,
      snapshots: events.map(e => ({
        eventId: e.id,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  private getArtifactId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    return typeof record.artifactId === "string" ? record.artifactId : null;
  }

  private async findArtifactEvent(brandId: string, artifactId: string): Promise<PrismaGraphEvent | null> {
    const events = await this.prisma.graphEvent.findMany({
      where: { brandId, eventType: "ARTIFACT_LINKED" },
      orderBy: { createdAt: "desc" },
    });

    return events.find((event) => this.getArtifactId(event.payload) === artifactId) ?? null;
  }

  private toBrand(brand: PrismaBrand): Brand {
    return {
      id: brand.id,
      tenantId: brand.tenantId,
      name: brand.name,
      createdAt: brand.createdAt.toISOString(),
    };
  }

  private toGraphEvent(event: PrismaGraphEvent): GraphEvent {
    return {
      id: event.id,
      tenantId: event.tenantId,
      brandId: event.brandId ?? null,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private toArtifactLink(event: PrismaGraphEvent): ArtifactLink {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    return {
      id: event.id,
      tenantId: event.tenantId,
      brandId: event.brandId ?? "",
      artifactId: typeof payload.artifactId === "string" ? payload.artifactId : "",
      artifactType: typeof payload.artifactType === "string" ? payload.artifactType : null,
      linkedAt: event.createdAt.toISOString(),
      eventId: event.id,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
