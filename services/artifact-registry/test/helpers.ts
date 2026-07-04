import type { PrismaClient } from "@prisma/client";

type ArtifactRecord = {
  artifactId: string;
  workspaceId: string;
  brandId: string;
  requestId: string;
  artifactType: string;
  artifactVersion: string;
  attempt: number;
  inputHash: string;
  payload: unknown;
  meta: unknown;
  evalReport?: unknown | null;
  supersedesArtifactId?: string | null;
  immutableAt?: Date | null;
  createdAt: Date;
};

type EdgeRecord = {
  fromArtifactId: string;
  toArtifactId: string;
  edgeType: string;
  createdAt: Date;
};

export function createMemoryPrisma(): PrismaClient {
  const artifacts = new Map<string, ArtifactRecord>();
  const edges: EdgeRecord[] = [];

  const prismaLike = {
    artifact: {
      findUnique: async ({ where }: { where: { artifactId: string } }) => {
        return artifacts.get(where.artifactId) ?? null;
      },
      // Workspace-scoped lookup — the shape the fix uses for every tenant-
      // sensitive read so a wrong-workspace request finds nothing, same as
      // a truly nonexistent id.
      findFirst: async ({ where }: { where: { artifactId?: string; workspaceId?: string } }) => {
        for (const record of artifacts.values()) {
          if (where.artifactId && record.artifactId !== where.artifactId) continue;
          if (where.workspaceId && record.workspaceId !== where.workspaceId) continue;
          return record;
        }
        return null;
      },
      findMany: async ({ where }: { where: { artifactId?: { in: string[] }; workspaceId?: string } }) => {
        return Array.from(artifacts.values()).filter((record) => {
          if (where.artifactId?.in && !where.artifactId.in.includes(record.artifactId)) return false;
          if (where.workspaceId && record.workspaceId !== where.workspaceId) return false;
          return true;
        });
      },
      create: async ({ data }: { data: Omit<ArtifactRecord, "createdAt"> }) => {
        const record: ArtifactRecord = {
          ...data,
          evalReport: data.evalReport ?? null,
          supersedesArtifactId: data.supersedesArtifactId ?? null,
          immutableAt: data.immutableAt ?? null,
          createdAt: new Date()
        } as ArtifactRecord;
        artifacts.set(record.artifactId, record);
        return record;
      },
      update: async ({ where, data }: { where: { artifactId: string }; data: Partial<ArtifactRecord> }) => {
        const existing = artifacts.get(where.artifactId);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data } as ArtifactRecord;
        artifacts.set(where.artifactId, updated);
        return updated;
      }
    },
    eventOutbox: {
      upsert: async () => ({}),
      findUnique: async () => ({ id: "any", publishedAt: new Date() }), // prevent real publishing attempt in domain tests
      update: async () => ({})
    },
    artifactLineageEdge: {
      upsert: async ({ where, create }: { where: { fromArtifactId_toArtifactId_edgeType: { fromArtifactId: string; toArtifactId: string; edgeType: string } }; create: EdgeRecord }) => {
        const existing = edges.find(
          (edge) =>
            edge.fromArtifactId === where.fromArtifactId_toArtifactId_edgeType.fromArtifactId &&
            edge.toArtifactId === where.fromArtifactId_toArtifactId_edgeType.toArtifactId &&
            edge.edgeType === where.fromArtifactId_toArtifactId_edgeType.edgeType
        );
        if (!existing) {
          edges.push({ ...create, createdAt: new Date() });
        }
        return create;
      },
      findMany: async ({ where }: { where: Partial<EdgeRecord> }) => {
        return edges.filter((edge) => {
          return (
            (where.fromArtifactId ? edge.fromArtifactId === where.fromArtifactId : true) &&
            (where.toArtifactId ? edge.toArtifactId === where.toArtifactId : true) &&
            (where.edgeType ? edge.edgeType === where.edgeType : true)
          );
        });
      }
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      return fn(prismaLike);
    }
  };

  return prismaLike as unknown as PrismaClient;
}
