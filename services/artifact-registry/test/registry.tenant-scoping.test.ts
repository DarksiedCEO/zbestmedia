import { describe, expect, it, vi } from "vitest";
import { createMemoryPrisma } from "./helpers";
import { deterministicArtifactId } from "@zbest/id-core";
import { getArtifact, sealArtifact, storeArtifact } from "../src/domain/registry";
import { getLineage } from "../src/domain/lineage";
import { RegistryError } from "../src/domain/errors";

// Closes: "artifact reads are a global bucket with no tenant scoping" and
// "deterministic artifact IDs missing workspace dimension" — these tests
// prove a caller in one workspace cannot read, seal, or link against
// another workspace's artifacts, even when it knows (or guesses) the id.

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

const mockNc = { publish: vi.fn() } as any;

async function seedArtifact(prisma: any, workspaceId: string, requestId: string) {
  const input = { prompt: requestId };
  const artifactId = deterministicArtifactId({
    workspaceId,
    requestId,
    artifactType: "BrandBible",
    input,
    attempt: 1
  });
  const meta = buildMeta({ artifactId, artifactType: "BrandBible", requestId, attempt: 1 });

  await storeArtifact(prisma, mockNc, {
    requestId,
    workspaceId,
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

  return artifactId;
}

describe("artifact registry — tenant scoping", () => {
  it("getArtifact returns the artifact for the owning workspace", async () => {
    const prisma = createMemoryPrisma();
    const artifactId = await seedArtifact(prisma, "workspace-a", "req-owner");

    const artifact = await getArtifact(prisma, "workspace-a", artifactId);
    expect(artifact.artifactId).toBe(artifactId);
  });

  it("getArtifact throws NotFound (not the other tenant's data) for a cross-workspace read", async () => {
    const prisma = createMemoryPrisma();
    const artifactId = await seedArtifact(prisma, "workspace-a", "req-cross-read");

    await expect(getArtifact(prisma, "workspace-b", artifactId)).rejects.toBeInstanceOf(RegistryError);
    await expect(getArtifact(prisma, "workspace-b", artifactId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sealArtifact throws NotFound when the caller's workspace does not own the artifact", async () => {
    const prisma = createMemoryPrisma();
    const artifactId = await seedArtifact(prisma, "workspace-a", "req-cross-seal");

    await expect(
      sealArtifact(prisma, mockNc, {
        workspaceId: "workspace-b",
        artifactId,
        sealedBy: "attacker",
        sealedReason: "trying to seal someone else's artifact"
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // and it's genuinely unsealed still, from the owning workspace's view
    const artifact = await getArtifact(prisma, "workspace-a", artifactId);
    expect(artifact.immutableAt).toBeNull();
  });

  it("storeArtifact rejects supersedesArtifactId pointing at another workspace's artifact", async () => {
    const prisma = createMemoryPrisma();
    const otherWorkspaceArtifactId = await seedArtifact(prisma, "workspace-a", "req-other");

    const input = { prompt: "req-supersede-attempt" };
    const artifactId = deterministicArtifactId({
      workspaceId: "workspace-b",
      requestId: "req-supersede-attempt",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });
    const meta = buildMeta({ artifactId, artifactType: "BrandBible", requestId: "req-supersede-attempt", attempt: 1 });

    await expect(
      storeArtifact(prisma, mockNc, {
        requestId: "req-supersede-attempt",
        workspaceId: "workspace-b",
        brandId: "brand-2",
        artifactType: "BrandBible",
        artifactVersion: "1.0.0",
        attempt: 1,
        input,
        payload: {
          meta,
          brandId: "brand-2",
          title: "Brand Bible",
          summary: "summary",
          voice: "direct",
          tone: "clear",
          pillars: ["clarity"],
          dos: ["be direct"],
          donts: ["ramble"]
        },
        meta,
        supersedesArtifactId: otherWorkspaceArtifactId
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("getLineage throws NotFound for a cross-workspace lineage read", async () => {
    const prisma = createMemoryPrisma();
    const artifactId = await seedArtifact(prisma, "workspace-a", "req-cross-lineage");

    await expect(getLineage(prisma, "workspace-b", artifactId, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
