import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type LeadConversionRow = {
  id: string;
  type: string;
  created_at: Date;
  value_usd: string | null;
  meta: Record<string, unknown>;
};

export class LeadConversionRepo {
  async append(
    client: PoolClient,
    tenantId: string,
    leadId: string,
    type: string,
    valueUsd: number | null,
    meta: Record<string, unknown>,
    actor: string
  ): Promise<void> {
    await client.query(
      `
      INSERT INTO lead.lead_conversions (id, tenant_id, lead_id, type, value_usd, meta, actor)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [randomUUID(), tenantId, leadId, type, valueUsd, meta, actor]
    );
  }

  async recent(client: PoolClient, tenantId: string, leadId: string, limit: number): Promise<LeadConversionRow[]> {
    const { rows } = await client.query<LeadConversionRow>(
      `
      SELECT id, type, created_at, value_usd, meta
      FROM lead.lead_conversions
      WHERE tenant_id = $1 AND lead_id = $2
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [tenantId, leadId, limit]
    );
    return rows;
  }

  async recentForScoring(client: PoolClient, tenantId: string, leadId: string): Promise<LeadConversionRow[]> {
    return this.recent(client, tenantId, leadId, 100);
  }
}
