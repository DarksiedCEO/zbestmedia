import { createHash } from "node:crypto";
import fs from "node:fs";

import { z } from "zod";

import { defaultCiGateThresholds, type CiGateThresholds } from "./ciGate";
import { parseTargetId } from "./target";

const thresholdsSchema = z.object({
  p95InflationRatioCap: z.number(),
  p99InflationRatioCap: z.number(),
  errorRateIncreasePctPointsCap: z.number(),
  timeoutIncreasePctPointsCap: z.number(),
  breakerOpenRateIncreasePctPointsCap: z.number(),
  retryAmplificationIncreaseCap: z.number()
});

const guardrailProfilesSchema = z.object({
  profiles: z.record(z.string(), thresholdsSchema)
});

export type GuardrailProfiles = z.infer<typeof guardrailProfilesSchema>;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function wildcardPatternsForTarget(targetId: string): string[] {
  const parts = parseTargetId(targetId).split("/");
  if (parts.length === 2) {
    const [env, service] = parts;
    return [`${targetId}`, `${env}/*`, `*/${service}`, "*"];
  }
  const [env, region, service] = parts;
  return [
    targetId,
    `${env}/${region}/*`,
    `${env}/*/${service}`,
    `${env}/*`,
    `*/${region}/${service}`,
    `*/*/${service}`,
    "*"
  ];
}

export function parseGuardrailProfiles(input: unknown): GuardrailProfiles {
  return guardrailProfilesSchema.parse(input);
}

export function loadGuardrailProfiles(filePath: string): { profiles: GuardrailProfiles; hash: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseGuardrailProfiles(JSON.parse(raw));
  return {
    profiles: parsed,
    hash: sha256Hex(raw)
  };
}

export function resolveThresholdsForTarget(args: {
  targetId: string;
  profiles: GuardrailProfiles;
}): { thresholds: CiGateThresholds; profileKey: string } {
  const candidates = wildcardPatternsForTarget(args.targetId);
  for (const key of candidates) {
    const hit = args.profiles.profiles[key];
    if (hit) {
      return {
        thresholds: {
          ...defaultCiGateThresholds,
          ...hit
        },
        profileKey: key
      };
    }
  }
  return {
    thresholds: defaultCiGateThresholds,
    profileKey: "default"
  };
}
