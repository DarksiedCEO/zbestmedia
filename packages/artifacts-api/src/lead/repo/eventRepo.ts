import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type LeadEventRow = {
  id: string;
  type: string;
  created_at: Date;
  payload: Record<string, unknown>;
};

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

  async recent(client: PoolClient, tenantId: string, leadId: string, limit: number): Promise<LeadEventRow[]> {
    const { rows } = await client.query<LeadEventRow>(
      `
      SELECT id, type, created_at, payload
      FROM lead.lead_events
      WHERE tenant_id = $1 AND lead_id = $2
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [tenantId, leadId, limit]
    );
    return rows;
  }

  async recentForScoring(client: PoolClient, tenantId: string, leadId: string): Promise<LeadEventRow[]> {
    return this.recent(client, tenantId, leadId, 100);
  }
}
