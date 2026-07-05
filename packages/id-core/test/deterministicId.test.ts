import { describe, expect, it } from "vitest";
import { deterministicArtifactId } from "../src/deterministicId";

describe("deterministicArtifactId", () => {
  it("SECURITY: identical requestId+artifactType+input+attempt but different workspaceId produce DIFFERENT ids", () => {
    // Closes the cross-tenant collision / existence-oracle finding: without
    // workspaceId in the hash, two tenants submitting the same requestId
    // (plausible — request IDs are caller-generated) collide onto the same
    // artifactId, letting one tenant read/overwrite/probe the other's data.
    const base = {
      requestId: "req-shared",
      artifactType: "BrandBible",
      input: { a: 1 },
      attempt: 1
    };

    const idTenantA = deterministicArtifactId({ ...base, workspaceId: "workspace-a" });
    const idTenantB = deterministicArtifactId({ ...base, workspaceId: "workspace-b" });

    expect(idTenantA).not.toBe(idTenantB);
  });

  it("SECURITY: pipe-delimited tuple ambiguity cannot collide two different tuples", () => {
    // Regression for the delimiter-injection finding: with a naive
    // `${a}|${b}|...` join and no charset restriction on requestId /
    // artifactType, {requestId:"A|B", artifactType:"C"} and
    // {requestId:"A", artifactType:"B|C"} both flatten to "...|A|B|C|..."
    // and collide onto the same artifactId (a caller-inducible id-squatting
    // / conflict footgun within a workspace). Encoding must disambiguate.
    const shared = { workspaceId: "workspace-a", input: { a: 1 }, attempt: 1 };
    const idA = deterministicArtifactId({ ...shared, requestId: "A|B", artifactType: "C" });
    const idB = deterministicArtifactId({ ...shared, requestId: "A", artifactType: "B|C" });
    expect(idA).not.toBe(idB);
  });

  it("SECURITY: ambiguity across the workspace/requestId boundary cannot collide", () => {
    // A caller authorized for both "ws" and "ws|A" (or any prefix pair)
    // must not be able to make a "ws" + "A|..." tuple collide with a
    // "ws|A" + "..." tuple.
    const idA = deterministicArtifactId({
      workspaceId: "ws",
      requestId: "A|req",
      artifactType: "T",
      input: { a: 1 },
      attempt: 1
    });
    const idB = deterministicArtifactId({
      workspaceId: "ws|A",
      requestId: "req",
      artifactType: "T",
      input: { a: 1 },
      attempt: 1
    });
    expect(idA).not.toBe(idB);
  });

  it("is still deterministic for the same workspaceId", () => {
    const base = {
      requestId: "req-1",
      artifactType: "BrandBible",
      input: { a: 1 },
      attempt: 1,
      workspaceId: "workspace-a"
    };

    expect(deterministicArtifactId(base)).toBe(deterministicArtifactId(base));
  });

  it("ignores object key order", () => {
    const base = {
      requestId: "req-1",
      artifactType: "BrandBible",
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
      attempt: 1,
      input: { a: 1 }
    });

    const id2 = deterministicArtifactId({
      requestId: "req-1",
      artifactType: "BrandBible",
      workspaceId: "workspace-1",
      attempt: 2,
      input: { a: 1 }
    });

    expect(id1).not.toBe(id2);
  });
});
