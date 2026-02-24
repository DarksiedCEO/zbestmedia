import type { PoolClient } from "pg";

type LeadInsertInput = {
  id: string;
  tenantId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyDomain?: string;
  source: string;
  sourceRef?: string;
  channel?: string;
  createdBy?: string;
  updatedBy?: string;
};

type ScoreUpdateInput = {
  leadId: string;
  tenantId: string;
  scoreTotal: number;
  scoreVersion: string;
  lifecycleStage?: string;
  updatedBy?: string;
};

export type LeadRow = {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  source: string;
  source_ref: string | null;
  channel: string | null;
  score_total: number;
  score_version: string;
  score_updated_at: Date | null;
  lifecycle_stage: string;
};

type LeadEventForScoring = {
  id: string;
  type: string;
  created_at: Date;
  payload: Record<string, unknown>;
};

type LeadConversionForScoring = {
  id: string;
  type: string;
  created_at: Date;
  value_usd: number | null;
  meta: Record<string, unknown>;
};

export class LeadRepo {
  async findByEmail(client: PoolClient, tenantId: string, email: string): Promise<LeadRow | null> {
    const { rows } = await client.query<LeadRow>(
      `SELECT * FROM lead.leads WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      [tenantId, email]
    );
    return rows[0] ?? null;
  }

  async findById(client: PoolClient, tenantId: string, leadId: string): Promise<LeadRow | null> {
    const { rows } = await client.query<LeadRow>(
      `SELECT * FROM lead.leads WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, leadId]
    );
    return rows[0] ?? null;
  }

  async getById(client: PoolClient, tenantId: string, leadId: string): Promise<LeadRow | null> {
    return this.findById(client, tenantId, leadId);
  }

  async insert(client: PoolClient, data: LeadInsertInput): Promise<string> {
    await client.query(
      `
      INSERT INTO lead.leads (
        id, tenant_id, email, phone, first_name, last_name,
        company_name, company_domain, source, source_ref, channel, created_by, updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        data.id,
        data.tenantId,
        data.email ?? null,
        data.phone ?? null,
        data.firstName ?? null,
        data.lastName ?? null,
        data.companyName ?? null,
        data.companyDomain ?? null,
        data.source,
        data.sourceRef ?? null,
        data.channel ?? null,
        data.createdBy ?? "system",
        data.updatedBy ?? "system"
      ]
    );
    return data.id;
  }

  async updateSnapshot(
    client: PoolClient,
    id: string,
    tenantId: string,
    fields: Record<string, unknown>,
    updatedBy: string
  ): Promise<void> {
    const keys = Object.keys(fields);
    if (!keys.length) return;

    const set = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");

    await client.query(
      `
      UPDATE lead.leads
      SET ${set}, updated_at = now(), updated_by = $${keys.length + 3}
      WHERE id = $1 AND tenant_id = $2
      `,
      [id, tenantId, ...keys.map((k) => fields[k]), updatedBy]
    );
  }

  async updateScore(client: PoolClient, input: ScoreUpdateInput): Promise<void> {
    await client.query(
      `
      UPDATE lead.leads
      SET score_total = $3,
          score_version = $4,
          score_updated_at = now(),
          lifecycle_stage = COALESCE($5, lifecycle_stage),
          updated_by = $6,
          updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      `,
      [
        input.leadId,
        input.tenantId,
        input.scoreTotal,
        input.scoreVersion,
        input.lifecycleStage ?? null,
        input.updatedBy ?? "system"
      ]
    );
  }

  async recentEventsForScoring(
    client: PoolClient,
    tenantId: string,
    leadId: string,
    limit = 100
  ): Promise<LeadEventForScoring[]> {
    const { rows } = await client.query<LeadEventForScoring>(
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

  async recentConversionsForScoring(
    client: PoolClient,
    tenantId: string,
    leadId: string,
    limit = 100
  ): Promise<LeadConversionForScoring[]> {
    const { rows } = await client.query<LeadConversionForScoring>(
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
}
