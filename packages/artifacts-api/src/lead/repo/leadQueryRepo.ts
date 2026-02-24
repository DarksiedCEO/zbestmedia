import type { PoolClient } from "pg";

export type LeadListFilters = {
  lifecycleStage?: string;
  minScore?: number;
  maxScore?: number;
  source?: string;
  createdFrom?: Date;
  createdTo?: Date;
};

export type LeadListOptions = {
  limit: number;
  cursor?: string;
};

export type LeadListRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  email: string | null;
  company_name: string | null;
  source: string;
  lifecycle_stage: string;
  score_total: number;
};

export class LeadQueryRepo {
  async list(
    client: PoolClient,
    tenantId: string,
    filters: LeadListFilters,
    options: LeadListOptions
  ): Promise<{ rows: LeadListRow[]; nextCursor?: string }> {
    const values: unknown[] = [tenantId];
    const conditions: string[] = ["tenant_id = $1"];
    let idx = values.length + 1;

    if (filters.lifecycleStage) {
      conditions.push(`lifecycle_stage = $${idx++}`);
      values.push(filters.lifecycleStage);
    }
    if (filters.source) {
      conditions.push(`source = $${idx++}`);
      values.push(filters.source);
    }
    if (typeof filters.minScore === "number") {
      conditions.push(`score_total >= $${idx++}`);
      values.push(filters.minScore);
    }
    if (typeof filters.maxScore === "number") {
      conditions.push(`score_total <= $${idx++}`);
      values.push(filters.maxScore);
    }
    if (filters.createdFrom) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(filters.createdFrom);
    }
    if (filters.createdTo) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(filters.createdTo);
    }
    if (options.cursor) {
      conditions.push(`updated_at < $${idx++}`);
      values.push(new Date(options.cursor));
    }

    const query = `
      SELECT id, created_at, updated_at, email, company_name, source, lifecycle_stage, score_total
      FROM lead.leads
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT $${idx}
    `;
    values.push(options.limit);

    const { rows } = await client.query<LeadListRow>(query, values);
    const nextCursor =
      rows.length === options.limit ? new Date(rows[rows.length - 1].updated_at).toISOString() : undefined;

    return { rows, nextCursor };
  }
}
