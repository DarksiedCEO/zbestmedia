import { describe, expect, it } from "vitest";
import { deterministicArtifactId } from "../src/deterministicId";

describe("deterministicArtifactId", () => {
  it("ignores object key order", () => {
    const base = {
      requestId: "req-1",
      artifactType: "BrandBible",
      attempt: 1
    };

    const id1 = deterministicArtifactId({
      ...base,
      input: { a: 1, b: { c: 2, d: 3 } }
    });

    const id2 = deterministicArtifactId({
      ...base,
      input: { b: { d: 3, c: 2 }, a: 1 }
    });

    expect(id1).toBe(id2);
  });

  it("treats array order as meaningful", () => {
    const base = {
      requestId: "req-1",
      artifactType: "BrandBible",
      attempt: 1
    };

    const id1 = deterministicArtifactId({
      ...base,
      input: { items: ["a", "b"] }
    });

    const id2 = deterministicArtifactId({
      ...base,
      input: { items: ["b", "a"] }
    });

    expect(id1).not.toBe(id2);
  });

  it("changes with attempt", () => {
    const id1 = deterministicArtifactId({
      requestId: "req-1",
      artifactType: "BrandBible",
      attempt: 1,
      input: { a: 1 }
    });

    const id2 = deterministicArtifactId({
      requestId: "req-1",
      artifactType: "BrandBible",
      attempt: 2,
      input: { a: 1 }
    });

    expect(id1).not.toBe(id2);
  });
});
