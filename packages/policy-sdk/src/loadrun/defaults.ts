import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export const runtimeDefaultsSchema = z.object({
  POLICY_BREAKER_FAILURE_THRESHOLD: z.number().int().positive(),
  POLICY_BREAKER_RESET_AFTER_MS: z.number().int().positive(),
  POLICY_RETRY_MAX: z.number().int().min(0),
  POLICY_RETRY_BASE_DELAY_MS: z.number().int().positive(),
  POLICY_RETRY_MAX_DELAY_MS: z.number().int().positive(),
  POLICY_MAX_CONCURRENCY_SAFE: z.number().int().positive()
});

export type RuntimeDefaults = z.infer<typeof runtimeDefaultsSchema>;

export function parseRuntimeDefaults(input: unknown): RuntimeDefaults {
  return runtimeDefaultsSchema.parse(input);
}

export function loadRuntimeDefaults(filePath: string): RuntimeDefaults {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseRuntimeDefaults(JSON.parse(raw));
}

export function writeRuntimeDefaults(filePath: string, defaults: RuntimeDefaults): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
}

export function defaultsToEnvBlock(defaults: RuntimeDefaults): string {
  return [
    `POLICY_BREAKER_FAILURE_THRESHOLD=${defaults.POLICY_BREAKER_FAILURE_THRESHOLD}`,
    `POLICY_BREAKER_RESET_AFTER_MS=${defaults.POLICY_BREAKER_RESET_AFTER_MS}`,
    `POLICY_RETRY_MAX=${defaults.POLICY_RETRY_MAX}`,
    `POLICY_RETRY_BASE_DELAY_MS=${defaults.POLICY_RETRY_BASE_DELAY_MS}`,
    `POLICY_RETRY_MAX_DELAY_MS=${defaults.POLICY_RETRY_MAX_DELAY_MS}`,
    `POLICY_MAX_CONCURRENCY_SAFE=${defaults.POLICY_MAX_CONCURRENCY_SAFE}`
  ].join("\n");
}
