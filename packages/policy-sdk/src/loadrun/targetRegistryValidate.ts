import fs from "node:fs";

import { z } from "zod";

import { parseBaselineRegistry, resolveTargetBaselineEntry, type BaselineRegistry } from "./baselineRegistry";
import { loadGuardrailProfiles, resolveThresholdsForTarget, type GuardrailProfiles } from "./guardrailProfiles";
import { parseTargetId, splitTargetId } from "./target";

const targetRegistrySchema = z.object({
  targets: z
    .array(
      z.object({
        target_id: z.string().min(1),
        base_url_env: z.string().min(1).optional()
      })
    )
    .min(1)
});

export type TargetRegistry = z.infer<typeof targetRegistrySchema>;

export type TargetRegistryValidationResult = {
  passed: boolean;
  errors: string[];
  warnings: string[];
  resolved_profiles: Array<{ target_id: string; profile_key: string; profile_hash: string }>;
  missing_baselines: string[];
  workflow_targets: Record<string, string[]>;
};

export function parseTargetRegistry(input: unknown): TargetRegistry {
  return targetRegistrySchema.parse(input);
}

export function extractTargetIdsFromWorkflow(content: string): string[] {
  const hits = new Set<string>();
  const pattern = /target_id:\s*["']?([a-z0-9-]+(?:\/[a-z0-9-]+){1,2})["']?/gi;
  for (const match of content.matchAll(pattern)) {
    if (match[1]) hits.add(match[1]);
  }
  return [...hits].sort();
}

function validateBaseUrlEnv(name: string): boolean {
  return /^POLICY_BASE_URL_[A-Z0-9_]+$/.test(name);
}

export function validateTargetRegistry(args: {
  registry: TargetRegistry;
  baselineRegistry: BaselineRegistry;
  guardrailProfiles: GuardrailProfiles;
  guardrailsHash: string;
  workflowTargets: Record<string, string[]>;
  strict: boolean;
  allowUnbaselinedStaging: boolean;
}): TargetRegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingBaselines: string[] = [];
  const resolvedProfiles: Array<{ target_id: string; profile_key: string; profile_hash: string }> = [];

  const registryTargets = new Set<string>();
  for (const item of args.registry.targets) {
    let targetId = item.target_id;
    try {
      targetId = parseTargetId(targetId);
    } catch (error) {
      errors.push(`invalid target_id=${item.target_id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (registryTargets.has(targetId)) {
      errors.push(`duplicate target_id=${targetId}`);
      continue;
    }
    registryTargets.add(targetId);

    if (item.base_url_env && !validateBaseUrlEnv(item.base_url_env)) {
      errors.push(`invalid base_url_env for ${targetId}: ${item.base_url_env}`);
    }

    const { env } = splitTargetId(targetId);
    try {
      const baseline = resolveTargetBaselineEntry({
        registry: args.baselineRegistry,
        targetId,
        allowUnbaselinedStaging: args.allowUnbaselinedStaging
      });
      if (baseline.baseline_run_path.length === 0) {
        missingBaselines.push(targetId);
      }
    } catch {
      missingBaselines.push(targetId);
      const message = `missing baseline for target_id=${targetId}`;
      if (args.strict || env !== "staging") {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }

    const resolved = resolveThresholdsForTarget({ targetId, profiles: args.guardrailProfiles });
    resolvedProfiles.push({
      target_id: targetId,
      profile_key: resolved.profileKey,
      profile_hash: args.guardrailsHash
    });
    if (resolved.profileKey === "default") {
      errors.push(`no guardrail profile resolved for target_id=${targetId}`);
    } else if (resolved.profileKey === "*") {
      warnings.push(`target_id=${targetId} resolves to global guardrail profile '*'`);
    }
  }

  for (const [workflow, targets] of Object.entries(args.workflowTargets)) {
    for (const targetId of targets) {
      try {
        parseTargetId(targetId);
      } catch (error) {
        errors.push(`${workflow}: invalid target_id=${targetId}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!registryTargets.has(targetId)) {
        errors.push(`${workflow}: target_id not registered: ${targetId}`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    resolved_profiles: resolvedProfiles.sort((a, b) => a.target_id.localeCompare(b.target_id)),
    missing_baselines: [...new Set(missingBaselines)].sort(),
    workflow_targets: Object.fromEntries(
      Object.entries(args.workflowTargets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, [...value].sort()])
    )
  };
}

export function loadAndValidateTargetRegistry(args: {
  registryPath: string;
  baselineRegistryPath: string;
  guardrailProfilesPath: string;
  workflowPaths: string[];
  strict: boolean;
  allowUnbaselinedStaging: boolean;
}): TargetRegistryValidationResult {
  const registry = parseTargetRegistry(JSON.parse(fs.readFileSync(args.registryPath, "utf8")));
  const baselineRegistry = parseBaselineRegistry(JSON.parse(fs.readFileSync(args.baselineRegistryPath, "utf8")));
  const { profiles, hash } = loadGuardrailProfiles(args.guardrailProfilesPath);

  const workflowTargets: Record<string, string[]> = {};
  for (const workflowPath of args.workflowPaths) {
    const content = fs.readFileSync(workflowPath, "utf8");
    workflowTargets[workflowPath] = extractTargetIdsFromWorkflow(content);
  }

  return validateTargetRegistry({
    registry,
    baselineRegistry,
    guardrailProfiles: profiles,
    guardrailsHash: hash,
    workflowTargets,
    strict: args.strict,
    allowUnbaselinedStaging: args.allowUnbaselinedStaging
  });
}
