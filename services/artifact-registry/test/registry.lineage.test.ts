import { describe, expect, it } from "vitest";
import { createMemoryPrisma } from "./helpers";
import { deterministicArtifactId } from "@zbest/id-core";
import { storeArtifact, sealArtifact } from "../src/domain/registry";
import { getLineage } from "../src/domain/lineage";
import type { EventPublisher } from "../src/events/publisher";

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

class TestPublisher implements EventPublisher {
  async publishArtifactStored() {}
  async publishArtifactSealed() {}
}

describe("artifact lineage", () => {
  it("returns supersedes chain", async () => {
    const prisma = createMemoryPrisma();
    const publisher = new TestPublisher();

    const inputA = { prompt: "A" };
    const artifactIdA = deterministicArtifactId({
      requestId: "req-A",
      artifactType: "BrandBible",
      input: inputA,
      attempt: 1
    });
    const metaA = buildMeta({ artifactId: artifactIdA, artifactType: "BrandBible", requestId: "req-A", attempt: 1 });

    await storeArtifact(prisma, publisher, {
      requestId: "req-A",
      workspaceId: "workspace-1",
      brandId: "brand-1",
      artifactType: "BrandBible",
      artifactVersion: "1.0.0",
      attempt: 1,
      input: inputA,
      payload: {
        meta: metaA,
        brandId: "brand-1",
        title: "Brand Bible",
        summary: "summary",
        voice: "direct",
        tone: "clear",
        pillars: ["clarity"],
        dos: ["be direct"],
        donts: ["ramble"]
      },
      meta: metaA
    });

    const inputB = { prompt: "B" };
    const artifactIdB = deterministicArtifactId({
      requestId: "req-B",
      artifactType: "BrandBible",
      input: inputB,
      attempt: 1
    });
    const metaB = buildMeta({ artifactId: artifactIdB, artifactType: "BrandBible", requestId: "req-B", attempt: 1 });

    await storeArtifact(prisma, publisher, {
      requestId: "req-B",
      workspaceId: "workspace-1",
      brandId: "brand-1",
      artifactType: "BrandBible",
      artifactVersion: "1.0.0",
      attempt: 1,
      input: inputB,
      payload: {
        meta: metaB,
        brandId: "brand-1",
        title: "Brand Bible",
        summary: "summary",
        voice: "direct",
        tone: "clear",
        pillars: ["clarity"],
        dos: ["be direct"],
        donts: ["ramble"]
      },
      meta: metaB,
      supersedesArtifactId: artifactIdA
    });

    await sealArtifact(prisma, publisher, {
      artifactId: artifactIdB,
      sealedBy: "actor-1",
      sealedReason: "supersedes"
    });

    const lineage = await getLineage(prisma, artifactIdB, 5);
    expect(lineage.supersededBy).toContain(artifactIdA);
    expect(lineage.edges.some((edge) => edge.from === artifactIdA && edge.to === artifactIdB)).toBe(true);
  });
});
