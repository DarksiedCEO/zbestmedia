import { BrandGraphRepo, ArtifactLink, Brand } from './repo';
import { GraphQueryOptions, GraphSnapshot, GraphSnapshotList } from './graph';
import { tenantKey } from "./tenantKey.js";

export class InMemoryBrandGraphRepo implements BrandGraphRepo {
  private readonly brands = new Map<string, Brand>();

  constructor(
    private readonly links: ArtifactLink[] = []
  ) {}

  async createBrand(input: { id: string; tenantId: string; name: string }): Promise<Brand> {
    const brand: Brand = {
      ...input,
      createdAt: new Date().toISOString()
    };
    this.brands.set(tenantKey(input.tenantId, input.id), brand);
    return brand;
  }

  async getBrand(tenantId: string, id: string): Promise<Brand | null> {
    return this.brands.get(tenantKey(tenantId, id)) ?? null;
  }

  async listBrands(tenantId: string): Promise<Brand[]> {
    return Array.from(this.brands.values()).filter(b => b.tenantId === tenantId);
  }
  async createEvent(_input: any) { return {} as any; }
  async findEventByBrand(_tenantId: string, _brandId: string, _eventType: string) { return null; }
  async linkArtifact(_input: any) { return {} as any; }
  async listArtifactLinks(_tenantId: string, _brandId: string) { return []; }

  async getGraph(tenantId: string, brandId: string, options: GraphQueryOptions = {}): Promise<GraphSnapshot> {
    const DEFAULT_LIMIT = 100;
    const { limit = DEFAULT_LIMIT, cursor, fromTimestamp, toTimestamp } = options;

    let filtered = this.links.filter(l => l.tenantId === tenantId && l.brandId === brandId);

    if (cursor) {
      filtered = filtered.filter(l => l.eventId > cursor);
    }

    if (fromTimestamp) {
      filtered = filtered.filter(l => l.createdAt >= fromTimestamp);
    }

    if (toTimestamp) {
      filtered = filtered.filter(l => l.createdAt <= toTimestamp);
    }

    filtered = filtered.sort((a, b) => a.eventId.localeCompare(b.eventId));
    const orderedLinks = filtered;

    let pagedSource = orderedLinks;
    if (cursor) {
      const cursorIndex = orderedLinks.findIndex((l) => l.eventId === cursor);
      if (cursorIndex === -1) {
        throw new Error("INVALID_CURSOR");
      }
      pagedSource = orderedLinks.slice(cursorIndex + 1);
    }

    const paged = pagedSource.slice(0, limit);
    const hasMore = pagedSource.length > paged.length;

    const nodes = new Map<string, { id: string; type: 'brand' | 'artifact'; label: string }>();
    const edges = [];

    nodes.set(tenantKey(tenantId, brandId), { id: brandId, type: 'brand', label: brandId });

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
  }

  async getGraphSnapshots(tenantId: string, brandId: string, options: GraphQueryOptions = {}): Promise<GraphSnapshotList> {
    const DEFAULT_LIMIT = 100;
    const { limit = DEFAULT_LIMIT, cursor, fromTimestamp, toTimestamp } = options;

    let filtered = this.links.filter(l => l.tenantId === tenantId && l.brandId === brandId);

    if (cursor) {
      filtered = filtered.filter(l => l.eventId > cursor);
    }

    if (fromTimestamp) {
      filtered = filtered.filter(l => l.createdAt >= fromTimestamp);
    }

    if (toTimestamp) {
      filtered = filtered.filter(l => l.createdAt <= toTimestamp);
    }

    filtered = filtered.sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.eventId.localeCompare(a.eventId)
        : b.createdAt.localeCompare(a.createdAt)
    );

    if (cursor) {
      const cursorIndex = filtered.findIndex((l) => l.eventId === cursor);
      if (cursorIndex === -1) {
        throw new Error("INVALID_CURSOR");
      }
      filtered = filtered.slice(cursorIndex + 1);
    }

    const paged = filtered.slice(0, limit);
    const snapshots = paged.map(l => ({
      eventId: l.eventId,
      createdAt: l.createdAt,
    }));

    return {
      brandId,
      snapshots,
      nextCursor: filtered.length > paged.length && snapshots.length
        ? snapshots[snapshots.length - 1]!.eventId
        : null
    };
  }
}
