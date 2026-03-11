import { describe, expect, it } from "vitest";
import {
  AGENT_DEFINITIONS,
  AGENT_EVAL_PROFILES,
  AGENT_LIFECYCLE_PROFILES,
  AGENT_MEMORY_PARTITIONS,
  AGENT_POLICY_PROFILES,
  BRAND_PIPELINE_SEQUENCE,
  BRANDYN_TASK_DOMAIN,
  JORDYN_TASK_DOMAIN,
  KOBE_TASK_DOMAIN,
  ORACLE_TASK_DOMAIN,
  canAgentAccessPartition,
  canAgentPerform,
  isAgentDenied,
  isLifecycleTransitionAllowed,
  isValidBrandPipelineProgression
} from "../src/index.js";

describe("agent-os foundation", () => {
  it("locks Brandyn, Jordyn, Kobe, and Oracle to non-overlapping task domains", () => {
    expect(AGENT_DEFINITIONS.brandyn.taskDomain).toBe(BRANDYN_TASK_DOMAIN);
    expect(AGENT_DEFINITIONS.jordyn.taskDomain).toBe(JORDYN_TASK_DOMAIN);
    expect(AGENT_DEFINITIONS.kobe.taskDomain).toBe(KOBE_TASK_DOMAIN);
    expect(AGENT_DEFINITIONS.oracle.taskDomain).toBe(ORACLE_TASK_DOMAIN);
    expect(new Set(Object.values(AGENT_DEFINITIONS).map((agent) => agent.taskDomain)).size).toBe(4);
  });

  it("enforces policy boundaries", () => {
    expect(canAgentPerform("brandyn", "brand_rules.approve_copy")).toBe(true);
    expect(isAgentDenied("brandyn", "posting.direct_outbound")).toBe(true);

    expect(canAgentPerform("jordyn", "visual_rules.validate")).toBe(true);
    expect(isAgentDenied("jordyn", "messaging.rewrite_strategy")).toBe(true);

    expect(canAgentPerform("kobe", "publishing.schedule")).toBe(true);
    expect(isAgentDenied("kobe", "approval.override")).toBe(true);

    expect(canAgentPerform("oracle", "intelligence.analyze_performance")).toBe(true);
    expect(isAgentDenied("oracle", "publishing.execute_campaign")).toBe(true);
  });

  it("isolates memory partitions by agent", () => {
    expect(canAgentAccessPartition("brandyn", AGENT_MEMORY_PARTITIONS.brandyn.partitionId)).toBe(true);
    expect(canAgentAccessPartition("brandyn", AGENT_MEMORY_PARTITIONS.jordyn.partitionId)).toBe(false);
    expect(canAgentAccessPartition("kobe", AGENT_MEMORY_PARTITIONS.brandyn.partitionId)).toBe(false);
    expect(canAgentAccessPartition("oracle", AGENT_MEMORY_PARTITIONS.oracle.partitionId)).toBe(true);
    expect(canAgentAccessPartition("oracle", AGENT_MEMORY_PARTITIONS.kobe.partitionId)).toBe(false);
  });

  it("guards lifecycle transitions", () => {
    expect(isLifecycleTransitionAllowed("brandyn", "draft", "training")).toBe(true);
    expect(isLifecycleTransitionAllowed("brandyn", "validation", "active")).toBe(true);
    expect(isLifecycleTransitionAllowed("brandyn", "draft", "active")).toBe(false);
    expect(isLifecycleTransitionAllowed("kobe", "retired", "active")).toBe(false);
  });

  it("defines required eval metrics for each lifecycle profile", () => {
    expect(AGENT_LIFECYCLE_PROFILES.brandyn.requiredValidationMetrics).toContain("tone_fidelity");
    expect(AGENT_LIFECYCLE_PROFILES.jordyn.requiredValidationMetrics).toContain("design_token_compliance");
    expect(AGENT_LIFECYCLE_PROFILES.kobe.requiredValidationMetrics).toContain("schedule_adherence");
    expect(AGENT_LIFECYCLE_PROFILES.oracle.requiredValidationMetrics).toContain("metric_interpretation_accuracy");
  });

  it("defines measurable eval profiles for each agent", () => {
    expect(AGENT_EVAL_PROFILES.brandyn.metrics.length).toBeGreaterThan(3);
    expect(AGENT_EVAL_PROFILES.jordyn.metrics.some((metric) => metric.metric === "creative_drift_rate")).toBe(true);
    expect(AGENT_EVAL_PROFILES.kobe.metrics.some((metric) => metric.metric === "approval_bypass_rate")).toBe(true);
    expect(AGENT_EVAL_PROFILES.oracle.metrics.some((metric) => metric.metric === "recommendation_relevance")).toBe(true);
  });

  it("locks the brand workflow order", () => {
    expect(
      isValidBrandPipelineProgression([
        "brandyn_direction_approved",
        "jordyn_visual_alignment_approved",
        "kobe_distribution_queued",
        "oracle_performance_evaluated"
      ])
    ).toBe(true);

    expect(
      isValidBrandPipelineProgression([
        "brandyn_direction_approved",
        "kobe_distribution_queued"
      ])
    ).toBe(false);

    expect(BRAND_PIPELINE_SEQUENCE[0]).toBe("brandyn_direction_approved");
    expect(BRAND_PIPELINE_SEQUENCE[3]).toBe("oracle_performance_evaluated");
  });

  it("keeps profile identifiers aligned across agent registry and profile sets", () => {
    expect(AGENT_DEFINITIONS.brandyn.policyProfileId).toBe(AGENT_POLICY_PROFILES.brandyn.profileId);
    expect(AGENT_DEFINITIONS.jordyn.lifecycleProfileId).toBe(AGENT_LIFECYCLE_PROFILES.jordyn.profileId);
    expect(AGENT_DEFINITIONS.kobe.evalProfileId).toBe(AGENT_EVAL_PROFILES.kobe.profileId);
    expect(AGENT_DEFINITIONS.oracle.memoryPartitionId).toBe(AGENT_MEMORY_PARTITIONS.oracle.partitionId);
  });
});
