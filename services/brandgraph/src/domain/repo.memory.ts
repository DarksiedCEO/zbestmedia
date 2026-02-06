import { BrandGraphRepo, ArtifactLink } from './repo';
import { GraphQueryOptions, GraphSnapshot, GraphSnapshotList } from './graph';
import { tenantKey } from "./tenantKey.js";

export class InMemoryBrandGraphRepo implements BrandGraphRepo {
  constructor(
    private readonly links: ArtifactLink[] = []
  ) {}

  async createBrand(_input: { id: string; tenantId: string; name: string }) { return {} as any; }
  async getBrand(_tenantId: string, _id: string) { return null; }
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

    filtered = filtered
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.eventId.localeCompare(b.eventId)
          : a.createdAt.localeCompare(b.createdAt)
      )
      .slice(0, limit);

    const nodes = new Map<string, { id: string; type: 'brand' | 'artifact'; label: string }>();
    const edges = [];

    nodes.set(tenantKey(tenantId, brandId), { id: brandId, type: 'brand', label: brandId });

    for (const link of filtered) {
      nodes.set(link.artifactId, { id: link.artifactId, type: 'artifact', label: link.artifactId });

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
      nodes: Array.from(nodes.values()),
      edges,
      generatedAt: new Date().toISOString(),
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
        ? a.eventId.localeCompare(b.eventId)
        : a.createdAt.localeCompare(b.createdAt)
    );

    const snapshots = filtered.slice(0, limit).map(l => ({
      eventId: l.eventId,
      createdAt: l.createdAt,
    }));

    return { brandId, snapshots };
  }
}
