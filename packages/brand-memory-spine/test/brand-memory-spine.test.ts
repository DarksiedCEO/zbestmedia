import { describe, expect, it } from "vitest";
import type { MemorySnapshot } from "../src/index";

describe("brand memory spine", () => {
  it("accepts a snapshot shape", () => {
    const snapshot: MemorySnapshot = {
      snapshotId: "snap-1",
      brandId: "brand-1",
      createdAt: "2026-02-03T00:00:00Z",
      links: [
        { sourceId: "art-1", targetId: "art-2", relation: "derived" }
      ]
    };

    expect(snapshot.links.length).toBe(1);
    expect(snapshot.links[0].relation).toBe("derived");
  });
});
