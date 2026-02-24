import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export class LeadEventRepo {
  async append(
    client: PoolClient,
    tenantId: string,
    leadId: string,
    type: string,
    payload: Record<string, unknown>,
    actor: string
  ): Promise<void> {
    await client.query(
      `
      INSERT INTO lead.lead_events (id, tenant_id, lead_id, type, payload, actor)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [randomUUID(), tenantId, leadId, type, payload, actor]
    );
  }
}
