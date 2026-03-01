import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { HARD_INVARIANTS, validateResolvedPolicy } from "./hardInvariants";
import type { PolicyKey } from "./policyKeys";
import { sealPolicyVersion } from "./seal";
import { PolicyError, type PolicyProvenance, type PolicyScopeType, type PolicyStatus, type PolicyVersionRow, type RequiredApprovalRole } from "./types";
import { validatePolicyValue } from "./validators";

type CreateDraftInput = {
  tenantId: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
  clientId?: string | null;
  policyKey: PolicyKey;
  valueJson: unknown;
  effectiveAt: Date;
  expiresAt?: Date | null;
  changeReason: string;
  createdBy: string;
  requiredRoles: RequiredApprovalRole[];
};

type ResolveResult = {
  resolved: unknown;
  provenance: PolicyProvenance | null;
};

function nowUtc(): Date {
  return new Date();
}

export class PolicyService {
  constructor(private readonly client: PoolClient) {}

  private async audit(
    policyVersionId: string,
    tenantId: string,
    eventType: "created" | "submitted" | "approved" | "rejected" | "activated" | "expired" | "superseded" | "rolled_back",
    actorId: string,
    details: unknown
  ): Promise<void> {
    await this.client.query(
      `
      INSERT INTO agency.policy_audit_log (id, tenant_id, policy_version_id, event_type, actor_id, details_json)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [randomUUID(), tenantId, policyVersionId, eventType, actorId, details ?? {}]
    );
  }

  private async nextVersion(
    tenantId: string,
    scopeType: PolicyScopeType,
    scopeId: string | null,
    policyKey: PolicyKey
  ): Promise<number> {
    const { rows } = await this.client.query<{ maxv: string | null }>(
      `
      SELECT COALESCE(MAX(version), 0)::text AS maxv
      FROM agency.policy_versions
      WHERE tenant_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3 AND policy_key = $4
      `,
      [tenantId, scopeType, scopeId, policyKey]
    );
    return Number(rows[0]?.maxv ?? "0") + 1;
  }

  private async countActiveCampaignOverridesForClient(
    tenantId: string,
    clientId: string,
    policyKey: PolicyKey,
    now: Date
  ): Promise<number> {
    const { rows } = await this.client.query<{ cnt: string }>(
      `
      SELECT COUNT(*)::text AS cnt
      FROM agency.policy_versions
      WHERE tenant_id = $1
        AND scope_type = 'campaign'
        AND client_id = $2
        AND policy_key = $3
        AND status = 'active'
        AND effective_at <= $4
        AND expires_at > $4
      `,
      [tenantId, clientId, policyKey, now]
    );
    return Number(rows[0]?.cnt ?? "0");
  }

  async createDraft(input: CreateDraftInput): Promise<{ policyVersionId: string }> {
    const parsed = validatePolicyValue(input.policyKey, input.valueJson);
    if (!parsed.success) {
      throw new PolicyError("INVALID_POLICY", "Policy JSON failed schema validation", parsed.error.issues);
    }

    if (input.scopeType === "campaign") {
      if (!input.clientId) {
        throw new PolicyError("INVALID_POLICY", "Campaign policy overrides require clientId");
      }
      if (!input.expiresAt) {
        throw new PolicyError("EXPIRES_REQUIRED", "Campaign policy overrides require expiresAt");
      }
      if (input.expiresAt.getTime() <= input.effectiveAt.getTime()) {
        throw new PolicyError("INVALID_POLICY", "expiresAt must be after effectiveAt");
      }
    }

    const version = await this.nextVersion(input.tenantId, input.scopeType, input.scopeId, input.policyKey);
    const id = randomUUID();
    const status: PolicyStatus = "draft";
    const sealedHash = sealPolicyVersion({
      tenantId: input.tenantId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      clientId: input.clientId ?? null,
      policyKey: input.policyKey,
      version,
      status,
      effectiveAt: input.effectiveAt.toISOString(),
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
      valueJson: parsed.data,
      changeReason: input.changeReason,
      createdBy: input.createdBy
    });

    await this.client.query(
      `
      INSERT INTO agency.policy_versions (
        id, tenant_id, scope_type, scope_id, client_id, policy_key, value_json, version, status,
        effective_at, expires_at, change_reason, created_by, sealed_hash, supersedes_id, superseded_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL,NULL)
      `,
      [
        id,
        input.tenantId,
        input.scopeType,
        input.scopeId,
        input.clientId ?? null,
        input.policyKey,
        parsed.data,
        version,
        status,
        input.effectiveAt,
        input.expiresAt ?? null,
        input.changeReason,
        input.createdBy,
        sealedHash
      ]
    );

    for (const role of input.requiredRoles) {
      await this.client.query(
        `
        INSERT INTO agency.policy_approvals (id, tenant_id, policy_version_id, required_role, decision)
        VALUES ($1,$2,$3,$4,'pending')
        `,
        [randomUUID(), input.tenantId, id, role]
      );
    }

    await this.audit(id, input.tenantId, "created", input.createdBy, {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      clientId: input.clientId ?? null,
      policyKey: input.policyKey,
      version,
      requiredRoles: input.requiredRoles
    });

    return { policyVersionId: id };
  }

  async submitForApproval(tenantId: string, policyVersionId: string, actorId: string): Promise<void> {
    const { rows } = await this.client.query<{ status: PolicyStatus }>(
      `SELECT status FROM agency.policy_versions WHERE tenant_id=$1 AND id=$2`,
      [tenantId, policyVersionId]
    );
    const status = rows[0]?.status;
    if (!status) throw new PolicyError("NOT_FOUND", "Policy version not found");
    if (status !== "draft") throw new PolicyError("INVALID_STATE", "Only draft can be submitted");

    await this.client.query(`UPDATE agency.policy_versions SET status='pending_approval' WHERE tenant_id=$1 AND id=$2`, [
      tenantId,
      policyVersionId
    ]);

    await this.audit(policyVersionId, tenantId, "submitted", actorId, {});
  }

  async recordApproval(
    tenantId: string,
    policyVersionId: string,
    role: RequiredApprovalRole,
    decision: "approved" | "rejected",
    actorId: string,
    notes?: string
  ): Promise<void> {
    const { rows } = await this.client.query<{ status: PolicyStatus }>(
      `SELECT status FROM agency.policy_versions WHERE tenant_id=$1 AND id=$2`,
      [tenantId, policyVersionId]
    );
    const status = rows[0]?.status;
    if (!status) throw new PolicyError("NOT_FOUND", "Policy version not found");
    if (status !== "pending_approval") throw new PolicyError("INVALID_STATE", "Policy not pending approval");

    const update = await this.client.query(
      `
      UPDATE agency.policy_approvals
      SET decision=$4, decided_by=$5, decided_at=now(), notes=$6
      WHERE tenant_id=$1 AND policy_version_id=$2 AND required_role=$3
      `,
      [tenantId, policyVersionId, role, decision, actorId, notes ?? null]
    );

    if (update.rowCount === 0) {
      throw new PolicyError("INVALID_POLICY", `Required role ${role} not configured for approval`);
    }

    await this.audit(policyVersionId, tenantId, decision, actorId, { role, notes: notes ?? null });

    if (decision === "rejected") {
      await this.client.query(`UPDATE agency.policy_versions SET status='rejected' WHERE tenant_id=$1 AND id=$2`, [
        tenantId,
        policyVersionId
      ]);
      await this.audit(policyVersionId, tenantId, "rejected", actorId, { role });
    }
  }

  private async approvalsSatisfied(tenantId: string, policyVersionId: string): Promise<boolean> {
    const { rows } = await this.client.query<{ approved: string; total: string; rejected: string }>(
      `
      SELECT COUNT(*) FILTER (WHERE decision='approved')::text AS approved,
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE decision='rejected')::text AS rejected
      FROM agency.policy_approvals
      WHERE tenant_id=$1 AND policy_version_id=$2
      `,
      [tenantId, policyVersionId]
    );

    const approved = Number(rows[0]?.approved ?? "0");
    const total = Number(rows[0]?.total ?? "0");
    const rejected = Number(rows[0]?.rejected ?? "0");

    if (rejected > 0) return false;
    return total > 0 && approved === total;
  }

  async activate(tenantId: string, policyVersionId: string, actorId: string): Promise<void> {
    const { rows } = await this.client.query<PolicyVersionRow>(
      `
      SELECT *
      FROM agency.policy_versions
      WHERE tenant_id=$1 AND id=$2
      LIMIT 1
      `,
      [tenantId, policyVersionId]
    );

    const pv = rows[0];
    if (!pv) throw new PolicyError("NOT_FOUND", "Policy version not found");
    if (pv.status !== "pending_approval") {
      throw new PolicyError("INVALID_STATE", "Only pending_approval can be activated");
    }

    const approvalsReady = await this.approvalsSatisfied(tenantId, policyVersionId);
    if (!approvalsReady) {
      throw new PolicyError("APPROVALS_REQUIRED", "Approvals not satisfied");
    }

    if (pv.scope_type === "campaign") {
      if (!pv.expires_at) {
        throw new PolicyError("EXPIRES_REQUIRED", "Campaign overrides require expires_at");
      }

      if (!pv.client_id) {
        throw new PolicyError("INVARIANT_VIOLATION", "campaign policy missing client_id");
      }

      const activeCampaignCount = await this.countActiveCampaignOverridesForClient(
        tenantId,
        pv.client_id,
        pv.policy_key,
        nowUtc()
      );
      if (activeCampaignCount >= HARD_INVARIANTS.maxCampaignPolicyOverridesPerClient) {
        throw new PolicyError(
          "CAP_EXCEEDED",
          `Active campaign override cap (${HARD_INVARIANTS.maxCampaignPolicyOverridesPerClient}) exceeded for client`
        );
      }
    }

    const invariant = validateResolvedPolicy(pv.value_json);
    if (!invariant.ok) {
      await this.audit(policyVersionId, tenantId, "rejected", actorId, {
        reason: "invariant_violation",
        violations: invariant.violations
      });
      throw new PolicyError("INVARIANT_VIOLATION", "Resolved policy violates hard invariants", invariant.violations);
    }

    const activeCurrent = await this.client.query<{ id: string }>(
      `
      SELECT id
      FROM agency.policy_versions
      WHERE tenant_id=$1
        AND scope_type=$2
        AND scope_id IS NOT DISTINCT FROM $3
        AND policy_key=$4
        AND status='active'
      ORDER BY version DESC, effective_at DESC
      LIMIT 1
      `,
      [tenantId, pv.scope_type, pv.scope_id, pv.policy_key]
    );

    const currentlyActiveId = activeCurrent.rows[0]?.id ?? null;

    if (currentlyActiveId) {
      await this.client.query(
        `
        UPDATE agency.policy_versions
        SET status='superseded', superseded_by_id=$3
        WHERE tenant_id=$1 AND id=$2
        `,
        [tenantId, currentlyActiveId, policyVersionId]
      );
      await this.audit(currentlyActiveId, tenantId, "superseded", actorId, { supersededById: policyVersionId });

      await this.client.query(`UPDATE agency.policy_versions SET supersedes_id=$3 WHERE tenant_id=$1 AND id=$2`, [
        tenantId,
        policyVersionId,
        currentlyActiveId
      ]);
    }

    await this.client.query(`UPDATE agency.policy_versions SET status='active' WHERE tenant_id=$1 AND id=$2`, [
      tenantId,
      policyVersionId
    ]);

    await this.audit(policyVersionId, tenantId, "activated", actorId, {});
  }

  async resolve(
    tenantId: string,
    policyKey: PolicyKey,
    now: Date,
    clientId?: string,
    campaignId?: string
  ): Promise<ResolveResult> {
    const candidates: Array<{ scopeType: PolicyScopeType; scopeId: string | null }> = [];

    if (campaignId) candidates.push({ scopeType: "campaign", scopeId: campaignId });
    if (clientId) candidates.push({ scopeType: "client", scopeId: clientId });
    candidates.push({ scopeType: "global", scopeId: null });

    for (const candidate of candidates) {
      const { rows } = await this.client.query<Pick<PolicyVersionRow, "id" | "version" | "value_json" | "scope_type">>(
        `
        SELECT id, version, value_json, scope_type
        FROM agency.policy_versions
        WHERE tenant_id=$1
          AND scope_type=$2
          AND scope_id IS NOT DISTINCT FROM $3
          AND policy_key=$4
          AND status='active'
          AND effective_at <= $5
          AND (expires_at IS NULL OR expires_at > $5)
        ORDER BY version DESC, effective_at DESC
        LIMIT 1
        `,
        [tenantId, candidate.scopeType, candidate.scopeId, policyKey, now]
      );

      const top = rows[0];
      if (!top) continue;

      const invariant = validateResolvedPolicy(top.value_json);
      if (!invariant.ok) {
        await this.audit(top.id, tenantId, "rejected", "system", {
          reason: "invariant_violation",
          violations: invariant.violations,
          policyKey,
          scopeType: top.scope_type
        });
        throw new PolicyError("INVARIANT_VIOLATION", "Resolved policy violates hard invariants", invariant.violations);
      }

      return {
        resolved: top.value_json,
        provenance: {
          scopeType: top.scope_type,
          policyVersionId: top.id,
          version: Number(top.version)
        }
      };
    }

    return { resolved: null, provenance: null };
  }
}
