import type { Pool, PoolClient } from "pg";

import type { AgentId } from "../agents/registry.js";
import {
  AGENT_DEFINITIONS,
  getAgentDefinition
} from "../agents/registry.js";
import {
  AGENT_LIFECYCLE_PROFILES,
  isLifecycleTransitionAllowed,
  type AgentLifecycleStatus
} from "../lifecycle/config.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import type {
  AgentLifecycleEventRecord,
  AgentRecord,
  ApprovalDecision,
  ApprovalDecisionRecord,
  ApprovalRequestRecord,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionStepRecord,
  ExecutionStepStatus,
  EvalRunRecord,
  EvalScoreRecord,
  MemoryEntryRecord,
  OrchestrationAlertAckRecord,
  OrchestrationBundleExportRecord,
  WorkerHeartbeatRecord
} from "./contracts.js";
import { buildAgentOsFoundationBundle } from "./foundation.js";
import { withTenant } from "./withTenant.js";

export type RunWithTenant = <T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
) => Promise<T>;

type AgentRow = {
  tenant_id: string;
  agent_id: AgentId;
  display_name: string;
  task_domain: AgentRecord["taskDomain"];
  workflow_role: AgentRecord["workflowRole"];
  policy_profile_id: string;
  memory_partition_id: string;
  lifecycle_profile_id: string;
  eval_profile_id: string;
  current_version_id: string;
  current_status: AgentLifecycleStatus;
  prohibited_domains: AgentRecord["prohibitedDomains"];
  created_at: string | Date;
  updated_at: string | Date;
  retired_at: string | Date | null;
};

type AgentVersionRow = {
  tenant_id: string;
  agent_version_id: string;
  agent_id: AgentId;
  version_label: string;
  definition_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string | Date;
  replaced_by_version_id: string | null;
};

type ApprovalRequestRow = {
  tenant_id: string;
  approval_request_id: string;
  agent_id: AgentId;
  subject_type: string;
  subject_id: string;
  requested_by: string;
  required_approvers: string[];
  status: ApprovalRequestRecord["status"];
  payload: Record<string, unknown>;
  created_at: string | Date;
  resolved_at: string | Date | null;
  escalated_at: string | Date | null;
  escalation_count: number;
};

type ApprovalDecisionRow = {
  tenant_id: string;
  approval_decision_id: string;
  approval_request_id: string;
  approver_id: string;
  decision: ApprovalDecision;
  rationale: string;
  payload: Record<string, unknown>;
  created_at: string | Date;
};

type ExecutionRow = {
  tenant_id: string;
  execution_id: string;
  agent_id: AgentId;
  agent_version_id: string;
  correlation_id: string;
  request_source: string;
  requested_by: string;
  subject_type: string;
  subject_id: string;
  status: ExecutionStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  failure_class: string | null;
  failure_message: string | null;
  approval_request_id: string | null;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | Date | null;
  dead_lettered_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type EvalRunRow = {
  tenant_id: string;
  eval_run_id: string;
  agent_id: AgentId;
  agent_version_id: string;
  suite_name: string;
  status: EvalRunRecord["status"];
  score_summary: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | Date | null;
  dead_lettered_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
  completed_at: string | Date | null;
};

type ExecutionStepRow = {
  tenant_id: string;
  execution_step_id: string;
  execution_id: string;
  step_name: string;
  step_order: number;
  status: ExecutionStepStatus;
  payload: Record<string, unknown>;
  created_at: string | Date;
};

type OrchestrationBundleExportRow = {
  tenant_id: string;
  export_id: string;
  execution_id: string;
  exported_by: string;
  payload_hash: string;
  signature: string;
  sealed_at: string | Date;
  bundle_snapshot: Record<string, unknown>;
  created_at: string | Date;
};

type WorkerHeartbeatRow = {
  tenant_id: string;
  worker_heartbeat_id: string;
  worker_id: string;
  worker_kind: string;
  agent_id: AgentId | null;
  status: WorkerHeartbeatRecord["status"];
  details: Record<string, unknown>;
  observed_at: string | Date;
};

type OrchestrationAlertAckRow = {
  tenant_id: string;
  alert_ack_id: string;
  alert_code: string;
  acknowledged_by: string;
  reason: string;
  details: Record<string, unknown>;
  created_at: string | Date;
};

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildScopedId(prefix: string, parts: string[]): string {
  return [prefix, ...parts].join(":");
}

function mapAgentRow(row: AgentRow): AgentRecord {
  return {
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    displayName: row.display_name,
    taskDomain: row.task_domain,
    workflowRole: row.workflow_role,
    policyProfileId: row.policy_profile_id,
    memoryPartitionId: row.memory_partition_id,
    lifecycleProfileId: row.lifecycle_profile_id,
    evalProfileId: row.eval_profile_id,
    currentVersionId: row.current_version_id,
    currentStatus: row.current_status,
    prohibitedDomains: row.prohibited_domains,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    retiredAt: row.retired_at ? toIsoString(row.retired_at) : null
  };
}

function mapAgentVersionRow(row: AgentVersionRow) {
  return {
    tenantId: row.tenant_id,
    agentVersionId: row.agent_version_id,
    agentId: row.agent_id,
    versionLabel: row.version_label,
    definitionSnapshot: row.definition_snapshot,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    replacedByVersionId: row.replaced_by_version_id
  };
}

function mapApprovalRequestRow(row: ApprovalRequestRow): ApprovalRequestRecord {
  return {
    tenantId: row.tenant_id,
    approvalRequestId: row.approval_request_id,
    agentId: row.agent_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requestedBy: row.requested_by,
    requiredApprovers: row.required_approvers,
    status: row.status,
    payload: row.payload,
    createdAt: toIsoString(row.created_at),
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    escalatedAt: row.escalated_at ? toIsoString(row.escalated_at) : null,
    escalationCount: row.escalation_count
  };
}

function mapApprovalDecisionRow(row: ApprovalDecisionRow): ApprovalDecisionRecord {
  return {
    tenantId: row.tenant_id,
    approvalDecisionId: row.approval_decision_id,
    approvalRequestId: row.approval_request_id,
    approverId: row.approver_id,
    decision: row.decision,
    rationale: row.rationale,
    payload: row.payload,
    createdAt: toIsoString(row.created_at)
  };
}

function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    tenantId: row.tenant_id,
    executionId: row.execution_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    correlationId: row.correlation_id,
    requestSource: row.request_source,
    requestedBy: row.requested_by,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    status: row.status,
    inputPayload: row.input_payload,
    outputPayload: row.output_payload,
    failureClass: row.failure_class,
    failureMessage: row.failure_message,
    approvalRequestId: row.approval_request_id,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at ? toIsoString(row.next_retry_at) : null,
    deadLetteredAt: row.dead_lettered_at ? toIsoString(row.dead_lettered_at) : null,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapEvalRunRow(row: EvalRunRow): EvalRunRecord {
  return {
    tenantId: row.tenant_id,
    evalRunId: row.eval_run_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    suiteName: row.suite_name,
    status: row.status,
    scoreSummary: row.score_summary,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at ? toIsoString(row.next_retry_at) : null,
    deadLetteredAt: row.dead_lettered_at ? toIsoString(row.dead_lettered_at) : null,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null
  };
}

function mapOrchestrationBundleExportRow(row: OrchestrationBundleExportRow): OrchestrationBundleExportRecord {
  return {
    tenantId: row.tenant_id,
    exportId: row.export_id,
    executionId: row.execution_id,
    exportedBy: row.exported_by,
    payloadHash: row.payload_hash,
    signature: row.signature,
    sealedAt: toIsoString(row.sealed_at),
    bundleSnapshot: row.bundle_snapshot,
    createdAt: toIsoString(row.created_at)
  };
}

function mapWorkerHeartbeatRow(row: WorkerHeartbeatRow): WorkerHeartbeatRecord {
  return {
    tenantId: row.tenant_id,
    workerHeartbeatId: row.worker_heartbeat_id,
    workerId: row.worker_id,
    workerKind: row.worker_kind,
    agentId: row.agent_id,
    status: row.status,
    details: row.details,
    observedAt: toIsoString(row.observed_at)
  };
}

function mapOrchestrationAlertAckRow(row: OrchestrationAlertAckRow): OrchestrationAlertAckRecord {
  return {
    tenantId: row.tenant_id,
    alertAckId: row.alert_ack_id,
    alertCode: row.alert_code,
    acknowledgedBy: row.acknowledged_by,
    reason: row.reason,
    details: row.details,
    createdAt: toIsoString(row.created_at)
  };
}

function mapExecutionStepRow(row: ExecutionStepRow): ExecutionStepRecord {
  return {
    tenantId: row.tenant_id,
    executionStepId: row.execution_step_id,
    executionId: row.execution_id,
    stepName: row.step_name,
    stepOrder: row.step_order,
    status: row.status,
    payload: row.payload,
    createdAt: toIsoString(row.created_at)
  };
}

export class AgentLifecycleStateError extends Error {
  constructor(
    public readonly agentId: AgentId,
    public readonly from: AgentLifecycleStatus,
    public readonly to: AgentLifecycleStatus
  ) {
    super(`illegal_agent_lifecycle_transition:${agentId}:${from}->${to}`);
  }
}

export class AgentOsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly runWithTenant: RunWithTenant = withTenant
  ) {}

  async provisionFoundation(args: {
    tenantId: string;
    createdBy: string;
    versionLabel: string;
    createdAt?: string;
  }): Promise<{ agents: AgentRecord[] }> {
    const bundle = buildAgentOsFoundationBundle(args);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      for (const agent of bundle.agents) {
        await client.query(
          `
          INSERT INTO agents (
            tenant_id, agent_id, display_name, task_domain, workflow_role,
            policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
            current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12::text[], $13, $14, $15
          )
          ON CONFLICT (tenant_id, agent_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            task_domain = EXCLUDED.task_domain,
            workflow_role = EXCLUDED.workflow_role,
            policy_profile_id = EXCLUDED.policy_profile_id,
            memory_partition_id = EXCLUDED.memory_partition_id,
            lifecycle_profile_id = EXCLUDED.lifecycle_profile_id,
            eval_profile_id = EXCLUDED.eval_profile_id,
            current_version_id = EXCLUDED.current_version_id,
            prohibited_domains = EXCLUDED.prohibited_domains,
            updated_at = EXCLUDED.updated_at
          `,
          [
            agent.tenantId,
            agent.agentId,
            agent.displayName,
            agent.taskDomain,
            agent.workflowRole,
            agent.policyProfileId,
            agent.memoryPartitionId,
            agent.lifecycleProfileId,
            agent.evalProfileId,
            agent.currentVersionId,
            agent.currentStatus,
            agent.prohibitedDomains,
            agent.createdAt,
            agent.updatedAt,
            agent.retiredAt
          ]
        );
      }

      for (const version of bundle.versions) {
        await client.query(
          `
          INSERT INTO agent_versions (
            tenant_id, agent_version_id, agent_id, version_label,
            definition_snapshot, created_by, created_at, replaced_by_version_id
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
          ON CONFLICT (tenant_id, agent_version_id) DO UPDATE SET
            definition_snapshot = EXCLUDED.definition_snapshot,
            replaced_by_version_id = EXCLUDED.replaced_by_version_id
          `,
          [
            version.tenantId,
            version.agentVersionId,
            version.agentId,
            version.versionLabel,
            JSON.stringify(version.definitionSnapshot),
            version.createdBy,
            version.createdAt,
            version.replacedByVersionId
          ]
        );
      }

      for (const profile of bundle.policyProfiles) {
        await client.query(
          `
          INSERT INTO agent_policy_profiles (
            tenant_id, policy_profile_id, agent_id, allowed_capabilities,
            denied_capabilities, profile_snapshot, created_at
          ) VALUES ($1, $2, $3, $4::text[], $5::text[], $6::jsonb, $7)
          ON CONFLICT (tenant_id, policy_profile_id) DO UPDATE SET
            allowed_capabilities = EXCLUDED.allowed_capabilities,
            denied_capabilities = EXCLUDED.denied_capabilities,
            profile_snapshot = EXCLUDED.profile_snapshot
          `,
          [
            profile.tenantId,
            profile.policyProfileId,
            profile.agentId,
            profile.allowedCapabilities,
            profile.deniedCapabilities,
            JSON.stringify(profile.profileSnapshot),
            profile.createdAt
          ]
        );
      }

      for (const partition of bundle.memoryPartitions) {
        await client.query(
          `
          INSERT INTO agent_memory_partitions (
            tenant_id, partition_id, agent_id, namespace,
            owned_collections, shared_access, partition_snapshot, created_at
          ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8)
          ON CONFLICT (tenant_id, partition_id) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            owned_collections = EXCLUDED.owned_collections,
            shared_access = EXCLUDED.shared_access,
            partition_snapshot = EXCLUDED.partition_snapshot
          `,
          [
            partition.tenantId,
            partition.partitionId,
            partition.agentId,
            partition.namespace,
            partition.ownedCollections,
            partition.sharedAccess,
            JSON.stringify(partition.partitionSnapshot),
            partition.createdAt
          ]
        );
      }
    });

    return { agents: bundle.agents };
  }

  async listAgents(tenantId: string): Promise<AgentRecord[]> {
    const res = await this.runWithTenant(this.pool, tenantId, (client) =>
      client.query<AgentRow>(
        `
        SELECT tenant_id, agent_id, display_name, task_domain, workflow_role,
               policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
               current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
        FROM agents
        ORDER BY agent_id
        `
      )
    );

    return res.rows.map(mapAgentRow);
  }

  async getAgent(args: { tenantId: string; agentId: AgentId }): Promise<AgentRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AgentRow>(
        `
        SELECT tenant_id, agent_id, display_name, task_domain, workflow_role,
               policy_profile_id, memory_partition_id, lifecycle_profile_id, eval_profile_id,
               current_version_id, current_status, prohibited_domains, created_at, updated_at, retired_at
        FROM agents
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId]
      )
    );

    return res.rows[0] ? mapAgentRow(res.rows[0]) : null;
  }

  async createAgentVersion(args: {
    tenantId: string;
    agentId: AgentId;
    versionLabel: string;
    definitionSnapshot: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const agentVersionId = `${args.agentId}:${args.versionLabel}`;

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO agent_versions (
          tenant_id, agent_version_id, agent_id, version_label,
          definition_snapshot, created_by, created_at, replaced_by_version_id
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL)
        `,
        [
          args.tenantId,
          agentVersionId,
          args.agentId,
          args.versionLabel,
          JSON.stringify(args.definitionSnapshot),
          args.createdBy,
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      agentVersionId,
      agentId: args.agentId,
      versionLabel: args.versionLabel,
      definitionSnapshot: args.definitionSnapshot,
      createdBy: args.createdBy,
      createdAt,
      replacedByVersionId: null
    };
  }

  async listAgentVersions(args: { tenantId: string; agentId: AgentId }) {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<AgentVersionRow>(
        `
        SELECT tenant_id, agent_version_id, agent_id, version_label,
               definition_snapshot, created_by, created_at, replaced_by_version_id
        FROM agent_versions
        WHERE tenant_id = $1 AND agent_id = $2
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId]
      )
    );

    return res.rows.map(mapAgentVersionRow);
  }

  async promoteAgentVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
    promotedBy: string;
    reason: string;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const currentAgent = await client.query<{ current_version_id: string; current_status: AgentLifecycleStatus }>(
        `SELECT current_version_id, current_status FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const versionRes = await client.query<AgentVersionRow>(
        `
        SELECT tenant_id, agent_version_id, agent_id, version_label,
               definition_snapshot, created_by, created_at, replaced_by_version_id
        FROM agent_versions
        WHERE tenant_id = $1 AND agent_version_id = $2 AND agent_id = $3
        `,
        [args.tenantId, args.agentVersionId, args.agentId]
      );

      const current = currentAgent.rows[0];
      const promoted = versionRes.rows[0];
      if (!current || !promoted) {
        throw new Error("agent_or_version_not_found");
      }

      await client.query(
        `
        UPDATE agents
        SET current_version_id = $3, updated_at = $4
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId, args.agentVersionId, createdAt]
      );

      await client.query(
        `
        UPDATE agent_versions
        SET replaced_by_version_id = $4
        WHERE tenant_id = $1 AND agent_version_id = $2 AND agent_id = $3
        `,
        [args.tenantId, current.current_version_id, args.agentId, args.agentVersionId]
      );

      const lifecycleEventId = buildScopedId("lifecycle", [args.agentId, "replacement", createdAt]);
      await client.query(
        `
        INSERT INTO agent_lifecycle_events (
          tenant_id, lifecycle_event_id, agent_id, from_status, to_status,
          actor_id, reason, metrics_snapshot, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8::jsonb, $9)
        `,
        [
          args.tenantId,
          lifecycleEventId,
          args.agentId,
          current.current_status,
          current.current_status,
          args.promotedBy,
          args.reason,
          JSON.stringify({
            replacedVersionId: current.current_version_id,
            promotedVersionId: args.agentVersionId
          }),
          createdAt
        ]
      );

      return {
        promotedVersion: mapAgentVersionRow(promoted),
        previousVersionId: current.current_version_id
      };
    });
  }

  async appendLifecycleEvent(args: {
    tenantId: string;
    agentId: AgentId;
    toStatus: AgentLifecycleStatus;
    actorId: string;
    reason: string;
    metricsSnapshot?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<AgentLifecycleEventRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const currentRes = await client.query<{ current_status: AgentLifecycleStatus }>(
        `SELECT current_status FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );

      const current = currentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      if (!isLifecycleTransitionAllowed(args.agentId, current.current_status, args.toStatus)) {
        throw new AgentLifecycleStateError(args.agentId, current.current_status, args.toStatus);
      }

      const lifecycleEventId = buildScopedId("lifecycle", [args.agentId, createdAt]);
      await client.query(
        `
        INSERT INTO agent_lifecycle_events (
          tenant_id, lifecycle_event_id, agent_id, from_status, to_status,
          actor_id, reason, metrics_snapshot, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
        `,
        [
          args.tenantId,
          lifecycleEventId,
          args.agentId,
          current.current_status,
          args.toStatus,
          args.actorId,
          args.reason,
          JSON.stringify(args.metricsSnapshot ?? {}),
          JSON.stringify(args.metadata ?? {}),
          createdAt
        ]
      );

      await client.query(
        `
        UPDATE agents
        SET current_status = $3, updated_at = $4
        WHERE tenant_id = $1 AND agent_id = $2
        `,
        [args.tenantId, args.agentId, args.toStatus, createdAt]
      );

      return {
        tenantId: args.tenantId,
        lifecycleEventId,
        agentId: args.agentId,
        fromStatus: current.current_status,
        toStatus: args.toStatus,
        actorId: args.actorId,
        reason: args.reason,
        metricsSnapshot: args.metricsSnapshot ?? {},
        metadata: args.metadata ?? {},
        createdAt
      };
    });
  }

  async createApprovalRequest(args: {
    tenantId: string;
    agentId: AgentId;
    subjectType: string;
    subjectId: string;
    requestedBy: string;
    requiredApprovers: string[];
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ApprovalRequestRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const approvalRequestId = buildScopedId("approval", [args.agentId, args.subjectId, createdAt]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO approval_requests (
          tenant_id, approval_request_id, agent_id, subject_type, subject_id,
          requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], 'PENDING', $8::jsonb, $9, NULL, NULL, 0)
        `,
        [
          args.tenantId,
          approvalRequestId,
          args.agentId,
          args.subjectType,
          args.subjectId,
          args.requestedBy,
          args.requiredApprovers,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      approvalRequestId,
      agentId: args.agentId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      requestedBy: args.requestedBy,
      requiredApprovers: args.requiredApprovers,
      status: "PENDING",
      payload: args.payload ?? {},
      createdAt,
      resolvedAt: null,
      escalatedAt: null,
      escalationCount: 0
    };
  }

  async recordApprovalDecision(args: {
    tenantId: string;
    approvalRequestId: string;
    approverId: string;
    decision: ApprovalDecision;
    rationale: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ApprovalDecisionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const approvalDecisionId = buildScopedId("decision", [args.approvalRequestId, args.approverId, createdAt]);
    const requestStatus = args.decision === "APPROVE" ? "APPROVED" : "REJECTED";

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO approval_decisions (
          tenant_id, approval_decision_id, approval_request_id,
          approver_id, decision, rationale, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        `,
        [
          args.tenantId,
          approvalDecisionId,
          args.approvalRequestId,
          args.approverId,
          args.decision,
          args.rationale,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );

      await client.query(
        `
        UPDATE approval_requests
        SET status = $3, resolved_at = $4
        WHERE tenant_id = $1 AND approval_request_id = $2
        `,
        [args.tenantId, args.approvalRequestId, requestStatus, createdAt]
      );
    });

    return {
      tenantId: args.tenantId,
      approvalDecisionId,
      approvalRequestId: args.approvalRequestId,
      approverId: args.approverId,
      decision: args.decision,
      rationale: args.rationale,
      payload: args.payload ?? {},
      createdAt
    };
  }

  async listApprovalRequests(args: {
    tenantId: string;
    agentId?: AgentId;
    status?: ApprovalRequestRecord["status"];
  }): Promise<ApprovalRequestRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR agent_id = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId ?? null, args.status ?? null]
      )
    );

    return res.rows.map(mapApprovalRequestRow);
  }

  async getApprovalRequest(args: { tenantId: string; approvalRequestId: string }): Promise<{
    request: ApprovalRequestRecord;
    decisions: ApprovalDecisionRecord[];
  } | null> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const requestRes = await client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1 AND approval_request_id = $2
        `,
        [args.tenantId, args.approvalRequestId]
      );
      const request = requestRes.rows[0];
      if (!request) return null;

      const decisionsRes = await client.query<ApprovalDecisionRow>(
        `
        SELECT tenant_id, approval_decision_id, approval_request_id, approver_id,
               decision, rationale, payload, created_at
        FROM approval_decisions
        WHERE tenant_id = $1 AND approval_request_id = $2
        ORDER BY created_at ASC
        `,
        [args.tenantId, args.approvalRequestId]
      );

      return {
        request: mapApprovalRequestRow(request),
        decisions: decisionsRes.rows.map(mapApprovalDecisionRow)
      };
    });
  }

  async listStaleApprovalRequests(args: {
    tenantId: string;
    olderThanIso: string;
    agentId?: AgentId;
    limit?: number;
  }): Promise<ApprovalRequestRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        SELECT tenant_id, approval_request_id, agent_id, subject_type, subject_id,
               requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        FROM approval_requests
        WHERE tenant_id = $1
          AND status = 'PENDING'
          AND escalated_at IS NULL
          AND created_at <= $2
          AND ($3::text IS NULL OR agent_id = $3)
        ORDER BY created_at ASC
        LIMIT $4
        `,
        [args.tenantId, args.olderThanIso, args.agentId ?? null, args.limit ?? 100]
      )
    );

    return res.rows.map(mapApprovalRequestRow);
  }

  async markApprovalEscalated(args: {
    tenantId: string;
    approvalRequestId: string;
    escalatedAt?: string;
  }): Promise<ApprovalRequestRecord> {
    const escalatedAt = args.escalatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ApprovalRequestRow>(
        `
        UPDATE approval_requests
        SET escalated_at = $3,
            escalation_count = escalation_count + 1
        WHERE tenant_id = $1
          AND approval_request_id = $2
        RETURNING tenant_id, approval_request_id, agent_id, subject_type, subject_id,
                  requested_by, required_approvers, status, payload, created_at, resolved_at, escalated_at, escalation_count
        `,
        [args.tenantId, args.approvalRequestId, escalatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("approval_request_not_found");
    }

    return mapApprovalRequestRow(res.rows[0]);
  }

  async createEvalRun(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    scores: Array<{ metric: string; score: number; metadata?: Record<string, unknown> }>;
    createdAt?: string;
  }): Promise<{ evalRun: EvalRunRecord; scores: EvalScoreRecord[] }> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const agentDefinition = getAgentDefinition(args.agentId);
    const evalProfile = AGENT_EVAL_PROFILES[args.agentId];
    const evalRunId = buildScopedId("eval", [args.agentId, args.suiteName, createdAt]);

    const scoreRows: EvalScoreRecord[] = args.scores.map((scoreInput) => {
      const spec = evalProfile.metrics.find((metric) => metric.metric === scoreInput.metric);
      const passed = spec
        ? (spec.minScore === undefined || scoreInput.score >= spec.minScore) &&
          (spec.maxScore === undefined || scoreInput.score <= spec.maxScore)
        : false;

      return {
        tenantId: args.tenantId,
        evalScoreId: buildScopedId("eval-score", [evalRunId, scoreInput.metric]),
        evalRunId,
        metric: scoreInput.metric,
        score: scoreInput.score,
        thresholdMin: spec?.minScore ?? null,
        thresholdMax: spec?.maxScore ?? null,
        passed,
        metadata: scoreInput.metadata ?? {},
        createdAt
      };
    });

    const scoreSummary = {
      total: scoreRows.length,
      passed: scoreRows.filter((row) => row.passed).length,
      failed: scoreRows.filter((row) => !row.passed).length,
      lifecycleProfileId: AGENT_LIFECYCLE_PROFILES[args.agentId].profileId,
      evalProfileId: agentDefinition.evalProfileId
    };

    const { agentVersionId } = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );

      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      await client.query(
        `
        INSERT INTO eval_runs (
          tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
          status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at, created_by, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6::jsonb, 0, 2, NULL, NULL, $7, $8, $9)
        `,
        [
          args.tenantId,
          evalRunId,
          args.agentId,
          current.current_version_id,
          args.suiteName,
          JSON.stringify(scoreSummary),
          args.createdBy,
          createdAt,
          createdAt
        ]
      );

      for (const scoreRow of scoreRows) {
        await client.query(
          `
          INSERT INTO eval_scores (
            tenant_id, eval_score_id, eval_run_id, metric, score,
            threshold_min, threshold_max, passed, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          `,
          [
            scoreRow.tenantId,
            scoreRow.evalScoreId,
            scoreRow.evalRunId,
            scoreRow.metric,
            scoreRow.score,
            scoreRow.thresholdMin,
            scoreRow.thresholdMax,
            scoreRow.passed,
            JSON.stringify(scoreRow.metadata),
            scoreRow.createdAt
          ]
        );
      }

      return { agentVersionId: current.current_version_id };
    });

    return {
      evalRun: {
        tenantId: args.tenantId,
        evalRunId,
        agentId: args.agentId,
        agentVersionId,
        suiteName: args.suiteName,
        status: "COMPLETED",
        scoreSummary,
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        createdBy: args.createdBy,
        createdAt,
        completedAt: createdAt
      },
      scores: scoreRows
    };
  }

  async getLatestEvalRunForVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
  }): Promise<EvalRunRecord | null> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        SELECT tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
               status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
               created_by, created_at, completed_at
        FROM eval_runs
        WHERE tenant_id = $1
          AND agent_id = $2
          AND agent_version_id = $3
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [args.tenantId, args.agentId, args.agentVersionId]
      )
    );

    return res.rows[0] ? mapEvalRunRow(res.rows[0]) : null;
  }

  async createExecution(args: {
    tenantId: string;
    agentId: AgentId;
    correlationId: string;
    requestSource: string;
    requestedBy: string;
    subjectType: string;
    subjectId: string;
    inputPayload: Record<string, unknown>;
    status?: ExecutionStatus;
    approvalRequestId?: string | null;
    createdAt?: string;
  }): Promise<ExecutionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      const executionId = buildScopedId("execution", [args.agentId, args.subjectId, createdAt]);
      const status = args.status ?? "QUEUED";
      const startedAt = status === "RUNNING" ? createdAt : null;

      await client.query(
        `
        INSERT INTO executions (
          tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
          request_source, requested_by, subject_type, subject_id, status,
          input_payload, output_payload, failure_class, failure_message, approval_request_id,
          retry_count, max_retries, next_retry_at, dead_lettered_at,
          started_at, completed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11::jsonb, NULL, NULL, NULL, $12,
          0, 2, NULL, NULL,
          $13, NULL, $14, $15
        )
        `,
        [
          args.tenantId,
          executionId,
          args.agentId,
          current.current_version_id,
          args.correlationId,
          args.requestSource,
          args.requestedBy,
          args.subjectType,
          args.subjectId,
          status,
          JSON.stringify(args.inputPayload),
          args.approvalRequestId ?? null,
          startedAt,
          createdAt,
          createdAt
        ]
      );

      return {
        tenantId: args.tenantId,
        executionId,
        agentId: args.agentId,
        agentVersionId: current.current_version_id,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.requestedBy,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        status,
        inputPayload: args.inputPayload,
        outputPayload: null,
        failureClass: null,
        failureMessage: null,
        approvalRequestId: args.approvalRequestId ?? null,
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        startedAt,
        completedAt: null,
        createdAt,
        updatedAt: createdAt
      };
    });
  }

  async appendExecutionStep(args: {
    tenantId: string;
    executionId: string;
    stepName: string;
    stepOrder: number;
    status: ExecutionStepStatus;
    payload?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ExecutionStepRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const executionStepId = buildScopedId("execution-step", [args.executionId, String(args.stepOrder), createdAt]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO execution_steps (
          tenant_id, execution_step_id, execution_id, step_name,
          step_order, status, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        `,
        [
          args.tenantId,
          executionStepId,
          args.executionId,
          args.stepName,
          args.stepOrder,
          args.status,
          JSON.stringify(args.payload ?? {}),
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      executionStepId,
      executionId: args.executionId,
      stepName: args.stepName,
      stepOrder: args.stepOrder,
      status: args.status,
      payload: args.payload ?? {},
      createdAt
    };
  }

  async completeExecution(args: {
    tenantId: string;
    executionId: string;
    outputPayload: Record<string, unknown>;
    completedAt?: string;
  }): Promise<void> {
    const completedAt = args.completedAt ?? new Date().toISOString();
    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        UPDATE executions
        SET status = 'COMPLETED',
            output_payload = $3::jsonb,
            failure_class = NULL,
            failure_message = NULL,
            completed_at = $4,
            updated_at = $4
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId, JSON.stringify(args.outputPayload), completedAt]
      );
    });
  }

  async getExecution(args: { tenantId: string; executionId: string }): Promise<{
    execution: ExecutionRecord;
    steps: ExecutionStepRecord[];
  } | null> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const executionRes = await client.query<ExecutionRow>(
        `
        SELECT tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
               request_source, requested_by, subject_type, subject_id, status,
               input_payload, output_payload, failure_class, failure_message, approval_request_id,
               retry_count, max_retries, next_retry_at, dead_lettered_at,
               started_at, completed_at, created_at, updated_at
        FROM executions
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId]
      );
      const execution = executionRes.rows[0];
      if (!execution) return null;

      const stepsRes = await client.query<ExecutionStepRow>(
        `
        SELECT tenant_id, execution_step_id, execution_id, step_name, step_order, status, payload, created_at
        FROM execution_steps
        WHERE tenant_id = $1 AND execution_id = $2
        ORDER BY step_order ASC, created_at ASC
        `,
        [args.tenantId, args.executionId]
      );

      return {
        execution: mapExecutionRow(execution),
        steps: stepsRes.rows.map(mapExecutionStepRow)
      };
    });
  }

  async createOrchestrationBundleExport(args: {
    tenantId: string;
    executionId: string;
    exportedBy: string;
    payloadHash: string;
    signature: string;
    sealedAt: string;
    bundleSnapshot: Record<string, unknown>;
    createdAt?: string;
  }): Promise<OrchestrationBundleExportRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const exportId = buildScopedId("bundle-export", [args.executionId, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationBundleExportRow>(
        `
        INSERT INTO orchestration_bundle_exports (
          tenant_id, export_id, execution_id, exported_by,
          payload_hash, signature, sealed_at, bundle_snapshot, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING tenant_id, export_id, execution_id, exported_by,
                  payload_hash, signature, sealed_at, bundle_snapshot, created_at
        `,
        [
          args.tenantId,
          exportId,
          args.executionId,
          args.exportedBy,
          args.payloadHash,
          args.signature,
          args.sealedAt,
          JSON.stringify(args.bundleSnapshot),
          createdAt
        ]
      )
    );

    return mapOrchestrationBundleExportRow(res.rows[0]!);
  }

  async listOrchestrationBundleExports(args: {
    tenantId: string;
    executionId: string;
  }): Promise<OrchestrationBundleExportRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationBundleExportRow>(
        `
        SELECT tenant_id, export_id, execution_id, exported_by,
               payload_hash, signature, sealed_at, bundle_snapshot, created_at
        FROM orchestration_bundle_exports
        WHERE tenant_id = $1 AND execution_id = $2
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.executionId]
      )
    );

    return res.rows.map(mapOrchestrationBundleExportRow);
  }

  async listExecutions(args: {
    tenantId: string;
    agentId?: AgentId;
    status?: ExecutionStatus;
  }): Promise<ExecutionRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        SELECT tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
               request_source, requested_by, subject_type, subject_id, status,
               input_payload, output_payload, failure_class, failure_message, approval_request_id,
               retry_count, max_retries, next_retry_at, dead_lettered_at,
               started_at, completed_at, created_at, updated_at
        FROM executions
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR agent_id = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.agentId ?? null, args.status ?? null]
      )
    );

    return res.rows.map(mapExecutionRow);
  }

  async recordWorkerHeartbeat(args: {
    tenantId: string;
    workerId: string;
    workerKind: string;
    agentId?: AgentId;
    status: WorkerHeartbeatRecord["status"];
    details?: Record<string, unknown>;
    observedAt?: string;
  }): Promise<WorkerHeartbeatRecord> {
    const observedAt = args.observedAt ?? new Date().toISOString();
    const workerHeartbeatId = buildScopedId("worker-heartbeat", [args.workerId, observedAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<WorkerHeartbeatRow>(
        `
        INSERT INTO worker_heartbeats (
          tenant_id, worker_heartbeat_id, worker_id, worker_kind,
          agent_id, status, details, observed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING tenant_id, worker_heartbeat_id, worker_id, worker_kind,
                  agent_id, status, details, observed_at
        `,
        [
          args.tenantId,
          workerHeartbeatId,
          args.workerId,
          args.workerKind,
          args.agentId ?? null,
          args.status,
          JSON.stringify(args.details ?? {}),
          observedAt
        ]
      )
    );

    return mapWorkerHeartbeatRow(res.rows[0]!);
  }

  async listWorkerHeartbeats(args: {
    tenantId: string;
    workerKind?: string;
    agentId?: AgentId;
  }): Promise<WorkerHeartbeatRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<WorkerHeartbeatRow>(
        `
        SELECT tenant_id, worker_heartbeat_id, worker_id, worker_kind,
               agent_id, status, details, observed_at
        FROM worker_heartbeats
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR worker_kind = $2)
          AND ($3::text IS NULL OR agent_id = $3)
        ORDER BY observed_at DESC
        `,
        [args.tenantId, args.workerKind ?? null, args.agentId ?? null]
      )
    );

    return res.rows.map(mapWorkerHeartbeatRow);
  }

  async acknowledgeOrchestrationAlert(args: {
    tenantId: string;
    alertCode: string;
    acknowledgedBy: string;
    reason: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<OrchestrationAlertAckRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const alertAckId = buildScopedId("alert-ack", [args.alertCode, createdAt]);
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationAlertAckRow>(
        `
        INSERT INTO orchestration_alert_acks (
          tenant_id, alert_ack_id, alert_code, acknowledged_by,
          reason, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING tenant_id, alert_ack_id, alert_code, acknowledged_by, reason, details, created_at
        `,
        [
          args.tenantId,
          alertAckId,
          args.alertCode,
          args.acknowledgedBy,
          args.reason,
          JSON.stringify(args.details ?? {}),
          createdAt
        ]
      )
    );

    return mapOrchestrationAlertAckRow(res.rows[0]!);
  }

  async listOrchestrationAlertAcks(args: {
    tenantId: string;
    alertCode?: string;
  }): Promise<OrchestrationAlertAckRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<OrchestrationAlertAckRow>(
        `
        SELECT tenant_id, alert_ack_id, alert_code, acknowledged_by, reason, details, created_at
        FROM orchestration_alert_acks
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR alert_code = $2)
        ORDER BY created_at DESC
        `,
        [args.tenantId, args.alertCode ?? null]
      )
    );

    return res.rows.map(mapOrchestrationAlertAckRow);
  }

  async claimQueuedExecutions(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
    startedAt?: string;
  }): Promise<ExecutionRecord[]> {
    const startedAt = args.startedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        WITH queued AS (
          SELECT execution_id
          FROM executions
          WHERE tenant_id = $1
            AND status = 'QUEUED'
            AND (next_retry_at IS NULL OR next_retry_at <= $4)
            AND ($2::text IS NULL OR agent_id = $2)
          ORDER BY created_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE executions e
        SET status = 'RUNNING',
            started_at = $4,
            updated_at = $4
        FROM queued
        WHERE e.tenant_id = $1
          AND e.execution_id = queued.execution_id
        RETURNING e.tenant_id, e.execution_id, e.agent_id, e.agent_version_id, e.correlation_id,
                  e.request_source, e.requested_by, e.subject_type, e.subject_id, e.status,
                  e.input_payload, e.output_payload, e.failure_class, e.failure_message, e.approval_request_id,
                  e.retry_count, e.max_retries, e.next_retry_at, e.dead_lettered_at,
                  e.started_at, e.completed_at, e.created_at, e.updated_at
        `,
        [args.tenantId, args.agentId ?? null, args.limit]
      )
    );

    return res.rows.map(mapExecutionRow);
  }

  async scheduleExecutionRetry(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    nextRetryAt: string;
    updatedAt?: string;
  }): Promise<ExecutionRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'QUEUED',
            failure_class = $3,
            failure_message = $4,
            retry_count = retry_count + 1,
            next_retry_at = $5,
            updated_at = $6
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, args.nextRetryAt, updatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async deadLetterExecution(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    deadLetteredAt?: string;
  }): Promise<ExecutionRecord> {
    const deadLetteredAt = args.deadLetteredAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'FAILED',
            failure_class = $3,
            failure_message = $4,
            dead_lettered_at = $5,
            completed_at = $5,
            updated_at = $5
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, deadLetteredAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async requeueExecution(args: {
    tenantId: string;
    executionId: string;
    updatedAt?: string;
  }): Promise<ExecutionRecord> {
    const updatedAt = args.updatedAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<ExecutionRow>(
        `
        UPDATE executions
        SET status = 'QUEUED',
            failure_class = NULL,
            failure_message = NULL,
            next_retry_at = NULL,
            dead_lettered_at = NULL,
            started_at = NULL,
            completed_at = NULL,
            updated_at = $3
        WHERE tenant_id = $1 AND execution_id = $2
        RETURNING tenant_id, execution_id, agent_id, agent_version_id, correlation_id,
                  request_source, requested_by, subject_type, subject_id, status,
                  input_payload, output_payload, failure_class, failure_message, approval_request_id,
                  retry_count, max_retries, next_retry_at, dead_lettered_at,
                  started_at, completed_at, created_at, updated_at
        `,
        [args.tenantId, args.executionId, updatedAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("execution_not_found");
    }

    return mapExecutionRow(res.rows[0]);
  }

  async failExecution(args: {
    tenantId: string;
    executionId: string;
    failureClass: string;
    failureMessage: string;
    completedAt?: string;
  }): Promise<void> {
    const completedAt = args.completedAt ?? new Date().toISOString();
    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        UPDATE executions
        SET status = 'FAILED',
            failure_class = $3,
            failure_message = $4,
            completed_at = $5,
            updated_at = $5
        WHERE tenant_id = $1 AND execution_id = $2
        `,
        [args.tenantId, args.executionId, args.failureClass, args.failureMessage, completedAt]
      );
    });
  }

  async storeMemoryEntry(args: {
    tenantId: string;
    partitionId: string;
    agentId: AgentId;
    collection: string;
    entryKey: string;
    entryValue: Record<string, unknown>;
    classification: "owned" | "shared_policy";
    createdBy: string;
    createdAt?: string;
  }): Promise<MemoryEntryRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const memoryEntryId = buildScopedId("memory", [args.partitionId, args.collection, args.entryKey]);

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO agent_memory_entries (
          tenant_id, memory_entry_id, partition_id, agent_id, collection_name,
          entry_key, entry_value, classification, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, partition_id, collection_name, entry_key) DO UPDATE SET
          entry_value = EXCLUDED.entry_value,
          classification = EXCLUDED.classification,
          created_by = EXCLUDED.created_by,
          updated_at = EXCLUDED.updated_at
        `,
        [
          args.tenantId,
          memoryEntryId,
          args.partitionId,
          args.agentId,
          args.collection,
          args.entryKey,
          JSON.stringify(args.entryValue),
          args.classification,
          args.createdBy,
          createdAt,
          createdAt
        ]
      );
    });

    return {
      tenantId: args.tenantId,
      memoryEntryId,
      partitionId: args.partitionId,
      agentId: args.agentId,
      collection: args.collection,
      entryKey: args.entryKey,
      entryValue: args.entryValue,
      classification: args.classification,
      createdBy: args.createdBy,
      createdAt,
      updatedAt: createdAt
    };
  }

  async listMemoryEntries(args: {
    tenantId: string;
    partitionId: string;
    collection?: string;
  }): Promise<MemoryEntryRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      return client.query<{
        tenant_id: string;
        memory_entry_id: string;
        partition_id: string;
        agent_id: AgentId;
        collection_name: string;
        entry_key: string;
        entry_value: Record<string, unknown>;
        classification: "owned" | "shared_policy";
        created_by: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
        SELECT tenant_id, memory_entry_id, partition_id, agent_id, collection_name, entry_key,
               entry_value, classification, created_by, created_at, updated_at
        FROM agent_memory_entries
        WHERE tenant_id = $1
          AND partition_id = $2
          AND ($3::text IS NULL OR collection_name = $3)
        ORDER BY updated_at DESC, entry_key ASC
        `,
        [args.tenantId, args.partitionId, args.collection ?? null]
      );
    });

    return res.rows.map((row) => ({
      tenantId: row.tenant_id,
      memoryEntryId: row.memory_entry_id,
      partitionId: row.partition_id,
      agentId: row.agent_id,
      collection: row.collection_name,
      entryKey: row.entry_key,
      entryValue: row.entry_value,
      classification: row.classification,
      createdBy: row.created_by,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    }));
  }

  async queueEvalRun(args: {
    tenantId: string;
    agentId: AgentId;
    suiteName: string;
    createdBy: string;
    createdAt?: string;
  }): Promise<EvalRunRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const evalRunId = buildScopedId("eval", [args.agentId, args.suiteName, createdAt]);

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const agentRes = await client.query<{ current_version_id: string }>(
        `SELECT current_version_id FROM agents WHERE tenant_id = $1 AND agent_id = $2`,
        [args.tenantId, args.agentId]
      );
      const current = agentRes.rows[0];
      if (!current) {
        throw new Error("agent_not_found");
      }

      await client.query(
        `
        INSERT INTO eval_runs (
          tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
          status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at, created_by, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', '{}'::jsonb, 0, 2, NULL, NULL, $6, $7, NULL)
        `,
        [args.tenantId, evalRunId, args.agentId, current.current_version_id, args.suiteName, args.createdBy, createdAt]
      );

      return {
        tenantId: args.tenantId,
        evalRunId,
        agentId: args.agentId,
        agentVersionId: current.current_version_id,
        suiteName: args.suiteName,
        status: "PENDING",
        scoreSummary: {},
        retryCount: 0,
        maxRetries: 2,
        nextRetryAt: null,
        deadLetteredAt: null,
        createdBy: args.createdBy,
        createdAt,
        completedAt: null
      };
    });
  }

  async completeEvalRun(args: {
    tenantId: string;
    evalRunId: string;
    scoreSummary: Record<string, unknown>;
    scores: Array<{
      metric: string;
      score: number;
      thresholdMin?: number | null;
      thresholdMax?: number | null;
      passed: boolean;
      metadata?: Record<string, unknown>;
    }>;
    completedAt?: string;
  }): Promise<{ evalRun: EvalRunRecord; scores: EvalScoreRecord[] }> {
    const completedAt = args.completedAt ?? new Date().toISOString();

    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const runRes = await client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'COMPLETED',
            score_summary = $3::jsonb,
            completed_at = $4
        WHERE tenant_id = $1
          AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, JSON.stringify(args.scoreSummary), completedAt]
      );

      const run = runRes.rows[0];
      if (!run) {
        throw new Error("eval_run_not_found");
      }

      const scoreRows: EvalScoreRecord[] = [];
      for (const score of args.scores) {
        const evalScoreId = buildScopedId("eval-score", [args.evalRunId, score.metric]);
        await client.query(
          `
          INSERT INTO eval_scores (
            tenant_id, eval_score_id, eval_run_id, metric, score,
            threshold_min, threshold_max, passed, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          ON CONFLICT (tenant_id, eval_score_id) DO UPDATE SET
            score = EXCLUDED.score,
            threshold_min = EXCLUDED.threshold_min,
            threshold_max = EXCLUDED.threshold_max,
            passed = EXCLUDED.passed,
            metadata = EXCLUDED.metadata
          `,
          [
            args.tenantId,
            evalScoreId,
            args.evalRunId,
            score.metric,
            score.score,
            score.thresholdMin ?? null,
            score.thresholdMax ?? null,
            score.passed,
            JSON.stringify(score.metadata ?? {}),
            completedAt
          ]
        );
        scoreRows.push({
          tenantId: args.tenantId,
          evalScoreId,
          evalRunId: args.evalRunId,
          metric: score.metric,
          score: score.score,
          thresholdMin: score.thresholdMin ?? null,
          thresholdMax: score.thresholdMax ?? null,
          passed: score.passed,
          metadata: score.metadata ?? {},
          createdAt: completedAt
        });
      }

      return {
        evalRun: mapEvalRunRow(run),
        scores: scoreRows
      };
    });
  }

  async claimPendingEvalRuns(args: {
    tenantId: string;
    agentId?: AgentId;
    limit: number;
  }): Promise<EvalRunRecord[]> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        WITH queued AS (
          SELECT eval_run_id
          FROM eval_runs
          WHERE tenant_id = $1
            AND status = 'PENDING'
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND ($2::text IS NULL OR agent_id = $2)
          ORDER BY created_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        UPDATE eval_runs e
        SET status = 'RUNNING'
        FROM queued
        WHERE e.tenant_id = $1
          AND e.eval_run_id = queued.eval_run_id
        RETURNING e.tenant_id, e.eval_run_id, e.agent_id, e.agent_version_id, e.suite_name,
                  e.status, e.score_summary, e.retry_count, e.max_retries, e.next_retry_at, e.dead_lettered_at,
                  e.created_by, e.created_at, e.completed_at
        `,
        [args.tenantId, args.agentId ?? null, args.limit]
      )
    );

    return res.rows.map(mapEvalRunRow);
  }

  async scheduleEvalRetry(args: {
    tenantId: string;
    evalRunId: string;
    nextRetryAt: string;
  }): Promise<EvalRunRecord> {
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'PENDING',
            retry_count = retry_count + 1,
            next_retry_at = $3
        WHERE tenant_id = $1 AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, args.nextRetryAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("eval_run_not_found");
    }

    return mapEvalRunRow(res.rows[0]);
  }

  async deadLetterEvalRun(args: {
    tenantId: string;
    evalRunId: string;
    deadLetteredAt?: string;
  }): Promise<EvalRunRecord> {
    const deadLetteredAt = args.deadLetteredAt ?? new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, (client) =>
      client.query<EvalRunRow>(
        `
        UPDATE eval_runs
        SET status = 'FAILED',
            dead_lettered_at = $3,
            completed_at = $3
        WHERE tenant_id = $1 AND eval_run_id = $2
        RETURNING tenant_id, eval_run_id, agent_id, agent_version_id, suite_name,
                  status, score_summary, retry_count, max_retries, next_retry_at, dead_lettered_at,
                  created_by, created_at, completed_at
        `,
        [args.tenantId, args.evalRunId, deadLetteredAt]
      )
    );

    if (!res.rows[0]) {
      throw new Error("eval_run_not_found");
    }

    return mapEvalRunRow(res.rows[0]);
  }
}
