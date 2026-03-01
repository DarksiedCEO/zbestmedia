import type { PoolClient } from "pg";

export type PolicyAuditRow = {
  id: string;
  policy_version_id: string;
  event_type: string;
  actor_id: string;
  ts: Date;
  details_json: Record<string, unknown>;
};

export async function getPolicyAudit(args: {
  client: PoolClient;
  tenantId: string;
  policyVersionId: string;
}): Promise<PolicyAuditRow[]> {
  const { rows } = await args.client.query<PolicyAuditRow>(
    `
    SELECT id, policy_version_id, event_type, actor_id, ts, details_json
    FROM agency.policy_audit_log
    WHERE tenant_id = $1 AND policy_version_id = $2
    ORDER BY ts ASC, id ASC
    `,
    [args.tenantId, args.policyVersionId]
  );
  return rows;
}
