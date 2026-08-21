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
  const outbox = new Map<string, any>();

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
      findUnique: async ({ where }: any) => outbox.get(where.id) ?? null,
      create: async ({ data }: any) => {
        const row = { ...data, createdAt: new Date(), publishedAt: null, attemptCount: 0,
          nextAttemptAt: new Date(), leaseOwner: null, leaseExpiresAt: null, terminalAt: null };
        outbox.set(row.id, row);
        return row;
      },
      findMany: async () => Array.from(outbox.values()),
      updateMany: async ({ where, data }: any) => {
        const row = outbox.get(where.id);
        if (!row) return { count: 0 };
        outbox.set(where.id, { ...row, ...data });
        return { count: 1 };
      }
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
      const artifactSnapshot = new Map(artifacts);
      const edgeSnapshot = edges.map((edge) => ({ ...edge }));
      const outboxSnapshot = new Map(outbox);
      try {
        return await fn(prismaLike);
      } catch (error) {
        artifacts.clear();
        for (const [key, value] of artifactSnapshot) artifacts.set(key, value);
        edges.splice(0, edges.length, ...edgeSnapshot);
        outbox.clear();
        for (const [key, value] of outboxSnapshot) outbox.set(key, value);
        throw error;
      }
    }
  };

  return prismaLike as unknown as PrismaClient;
}
