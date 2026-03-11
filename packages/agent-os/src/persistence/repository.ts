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
  MemoryEntryRecord
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
          requested_by, required_approvers, status, payload, created_at, resolved_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], 'PENDING', $8::jsonb, $9, NULL)
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
      resolvedAt: null
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
          status, score_summary, created_by, created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6::jsonb, $7, $8, $9)
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
        createdBy: args.createdBy,
        createdAt,
        completedAt: createdAt
      },
      scores: scoreRows
    };
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
          started_at, completed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11::jsonb, NULL, NULL, NULL, $12,
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
}
