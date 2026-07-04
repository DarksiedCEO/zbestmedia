import { describe, expect, it, vi } from "vitest";
import { createMemoryPrisma } from "./helpers";
import { deterministicArtifactId } from "@zbest/id-core";
import { storeArtifact, sealArtifact } from "../src/domain/registry";

function buildMeta(args: { artifactId: string; artifactType: string; requestId: string; attempt: number }) {
  return {
    artifactId: args.artifactId,
    requestId: args.requestId,
    artifactType: args.artifactType,
    schemaVersion: "1.0.0",
    lineage: {
      parentArtifactIds: [],
      sourceEventId: "evt-1",
      attempt: args.attempt
    }
  };
}

const mockNc = {
  publish: vi.fn(),
} as any;

describe("artifact registry store/seal", () => {
  it("uses deterministic ids", async () => {
    const prisma = createMemoryPrisma();
    const input = { prompt: "hello" };

    const id1 = deterministicArtifactId({
      workspaceId: "workspace-1",
      requestId: "req-1",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });

    const id2 = deterministicArtifactId({
      workspaceId: "workspace-1",
      requestId: "req-1",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });

    expect(id1).toBe(id2);

    const meta = buildMeta({ artifactId: id1, artifactType: "BrandBible", requestId: "req-1", attempt: 1 });

    const stored = await storeArtifact(prisma, mockNc, {
      requestId: "req-1",
      workspaceId: "workspace-1",
      brandId: "brand-1",
      artifactType: "BrandBible",
      artifactVersion: "1.0.0",
      attempt: 1,
      input,
      payload: {
        meta,
        brandId: "brand-1",
        title: "Brand Bible",
        summary: "summary",
        voice: "direct",
        tone: "clear",
        pillars: ["clarity"],
        dos: ["be direct"],
        donts: ["ramble"]
      },
      meta
    });

    expect(stored.artifactId).toBe(id1);
  });

  it("seals idempotently", async () => {
    const prisma = createMemoryPrisma();
    const input = { prompt: "seal" };
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-1",
      requestId: "req-2",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });
    const meta = buildMeta({ artifactId, artifactType: "BrandBible", requestId: "req-2", attempt: 1 });

    await storeArtifact(prisma, mockNc, {
      requestId: "req-2",
      workspaceId: "workspace-1",
      brandId: "brand-1",
      artifactType: "BrandBible",
      artifactVersion: "1.0.0",
      attempt: 1,
      input,
      payload: {
        meta,
        brandId: "brand-1",
        title: "Brand Bible",
        summary: "summary",
        voice: "direct",
        tone: "clear",
        pillars: ["clarity"],
        dos: ["be direct"],
        donts: ["ramble"]
      },
      meta
    });

    const firstSeal = await sealArtifact(prisma, mockNc, {
      workspaceId: "workspace-1",
      artifactId,
      sealedBy: "actor-1",
      sealedReason: "final"
    });

    const secondSeal = await sealArtifact(prisma, mockNc, {
      workspaceId: "workspace-1",
      artifactId,
      sealedBy: "actor-1",
      sealedReason: "final"
    });

    expect(firstSeal.immutableAt?.toISOString()).toBe(secondSeal.immutableAt?.toISOString());
  });
});
