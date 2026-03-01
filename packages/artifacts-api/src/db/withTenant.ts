import type { Pool, PoolClient } from "pg";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertTenantId(tenantId: string): void {
  if (!tenantId || tenantId.trim().length === 0) {
    throw new Error("tenant_id_required");
  }
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error("tenant_id_invalid");
  }
}

export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  assertTenantId(tenantId);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    const result = await fn(client);

    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Do not mask the original error when rollback itself fails.
    }
    throw err;
  } finally {
    client.release();
  }
}
