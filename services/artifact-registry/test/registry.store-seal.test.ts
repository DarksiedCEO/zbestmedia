import { describe, expect, it } from "vitest";
import { createMemoryPrisma } from "./helpers";
import { deterministicArtifactId } from "@zbest/id-core";
import { storeArtifact, sealArtifact } from "../src/domain/registry";
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
  stored: number = 0;
  sealed: number = 0;
  async publishArtifactStored() {
    this.stored += 1;
  }
  async publishArtifactSealed() {
    this.sealed += 1;
  }
}

describe("artifact registry store/seal", () => {
  it("uses deterministic ids", async () => {
    const prisma = createMemoryPrisma();
    const publisher = new TestPublisher();
    const input = { prompt: "hello" };

    const id1 = deterministicArtifactId({
      requestId: "req-1",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });

    const id2 = deterministicArtifactId({
      requestId: "req-1",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });

    expect(id1).toBe(id2);

    const meta = buildMeta({ artifactId: id1, artifactType: "BrandBible", requestId: "req-1", attempt: 1 });

    const stored = await storeArtifact(prisma, publisher, {
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
    const publisher = new TestPublisher();
    const input = { prompt: "seal" };
    const artifactId = deterministicArtifactId({
      requestId: "req-2",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });
    const meta = buildMeta({ artifactId, artifactType: "BrandBible", requestId: "req-2", attempt: 1 });

    await storeArtifact(prisma, publisher, {
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

    const firstSeal = await sealArtifact(prisma, publisher, {
      artifactId,
      sealedBy: "actor-1",
      sealedReason: "final"
    });

    const secondSeal = await sealArtifact(prisma, publisher, {
      artifactId,
      sealedBy: "actor-1",
      sealedReason: "final"
    });

    expect(firstSeal.immutableAt?.toISOString()).toBe(secondSeal.immutableAt?.toISOString());
  });
});
