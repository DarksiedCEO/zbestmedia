import { z } from "zod";

export const targetIdSchema = z.string().regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+){1,2}$/i, "target_id must be env[/region]/service");

export type TargetId = z.infer<typeof targetIdSchema>;

export const DEFAULT_TARGET_ID = "prod/us-west/policy" as const;

export type TargetParts = {
  env: string;
  region: string | null;
  service: string;
  targetId: TargetId;
};

export function parseTargetId(input: string): TargetId {
  return targetIdSchema.parse(input);
}

export function splitTargetId(input: string): TargetParts {
  const targetId = parseTargetId(input);
  const parts = targetId.split("/");
  if (parts.length === 2) {
    return {
      env: parts[0]!,
      region: null,
      service: parts[1]!,
      targetId
    };
  }
  return {
    env: parts[0]!,
    region: parts[1]!,
    service: parts[2]!,
    targetId
  };
}
