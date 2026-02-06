import { BrandGraphRepo, ArtifactLink } from './repo';
import { GraphSnapshot, GraphSnapshotList } from './graph';

export class InMemoryBrandGraphRepo implements BrandGraphRepo {
  constructor(
    private readonly links: ArtifactLink[] = []
  ) {}

  async createBrand(input: { id: string; tenantId: string; name: string }) { return {} as any; }
  async getBrand(id: string) { return null; }
  async createEvent(input: any) { return {} as any; }
  async findEventByBrand(brandId: string, eventType: string) { return null; }
  async linkArtifact(input: any) { return {} as any; }
  async listArtifactLinks(brandId: string) { return []; }

  async getGraph(brandId: string): Promise<GraphSnapshot> {
    const nodes = new Map<string, { id: string; type: 'brand' | 'artifact' }>();
    const edges = [];

    nodes.set(brandId, { id: brandId, type: 'brand' });

    for (const link of this.links.filter(l => l.brandId === brandId)) {
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
  }

  async getGraphSnapshots(brandId: string): Promise<GraphSnapshotList> {
    const snapshots = this.links
      .filter(l => l.brandId === brandId)
      .map(l => ({
        eventId: l.eventId,
        createdAt: l.createdAt,
      }));

    return { brandId, snapshots };
  }
}
