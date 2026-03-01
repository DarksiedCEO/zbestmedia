import { describe, expect, it, vi } from "vitest";

import { withTenant } from "../src/db/withTenant";

describe("withTenant", () => {
  it("runs fn in a tenant-scoped transaction", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const release = vi.fn();
    const client = { query, release };
    const pool = {
      connect: vi.fn(async () => client)
    };

    const value = await withTenant(pool as never, "11111111-1111-4111-8111-111111111111", async () => "ok");

    expect(value).toBe("ok");
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(2, "SELECT set_config('app.tenant_id', $1, true)", [
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and rethrows on failure", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const release = vi.fn();
    const client = { query, release };
    const pool = {
      connect: vi.fn(async () => client)
    };
    const err = new Error("boom");

    await expect(
      withTenant(pool as never, "11111111-1111-4111-8111-111111111111", async () => {
        throw err;
      })
    ).rejects.toThrow("boom");

    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(2, "SELECT set_config('app.tenant_id', $1, true)", [
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails fast on invalid tenantId", async () => {
    const pool = {
      connect: vi.fn()
    };

    await expect(withTenant(pool as never, "bad-tenant", async () => "ok")).rejects.toThrow("tenant_id_invalid");
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
