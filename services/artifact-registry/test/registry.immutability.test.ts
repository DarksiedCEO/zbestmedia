import { describe, expect, it } from "vitest";
import { createMemoryPrisma } from "./helpers";
import { deterministicArtifactId } from "@zbest/id-core";
import { sealArtifact, storeArtifact } from "../src/domain/registry";
import type { EventPublisher } from "../src/events/publisher";
import { RegistryError } from "../src/domain/errors";

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

describe("artifact immutability", () => {
  it("rejects updates after sealing", async () => {
    const prisma = createMemoryPrisma();
    const publisher = new TestPublisher();
    const input = { prompt: "immutable" };
    const artifactId = deterministicArtifactId({
      requestId: "req-3",
      artifactType: "BrandBible",
      input,
      attempt: 1
    });
    const meta = buildMeta({ artifactId, artifactType: "BrandBible", requestId: "req-3", attempt: 1 });

    await storeArtifact(prisma, publisher, {
      requestId: "req-3",
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

    await sealArtifact(prisma, publisher, {
      artifactId,
      sealedBy: "actor-1",
      sealedReason: "final"
    });

    const updatedPayload = {
      meta,
      brandId: "brand-1",
      title: "Brand Bible",
      summary: "changed",
      voice: "direct",
      tone: "clear",
      pillars: ["clarity"],
      dos: ["be direct"],
      donts: ["ramble"]
    };

    await expect(
      storeArtifact(prisma, publisher, {
        requestId: "req-3",
        workspaceId: "workspace-1",
        brandId: "brand-1",
        artifactType: "BrandBible",
        artifactVersion: "1.0.0",
        attempt: 1,
        input,
        payload: updatedPayload,
        meta
      })
    ).rejects.toBeInstanceOf(RegistryError);
  });
});
