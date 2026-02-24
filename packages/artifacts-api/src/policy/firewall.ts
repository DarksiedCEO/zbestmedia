import type { Env } from "../config/env";
import type { PolicyAction, PolicyDecision, PolicyViolation } from "./types";

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function countJsonKeys(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.reduce((acc, v) => acc + countJsonKeys(v), 0);
  if (typeof value !== "object") return 0;

  const obj = value as Record<string, unknown>;
  let total = 0;
  for (const k of Object.keys(obj)) {
    total += 1;
    total += countJsonKeys(obj[k]);
  }
  return total;
}

function stringifyForScan(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

export class PolicyFirewall {
  private readonly forbiddenTypes: Set<string>;
  private readonly forbiddenPhrases: string[];
  private readonly artifactTypeRe = /^[a-z0-9_.-]{1,128}$/;

  constructor(private readonly env: Env) {
    this.forbiddenTypes = new Set(parseCsv(env.FORBIDDEN_ARTIFACT_TYPES));
    this.forbiddenPhrases = parseCsv(env.FORBIDDEN_PHRASES).map((p) => p.toLowerCase());
  }

  validateArtifactWrite(args: {
    action: PolicyAction;
    tenantId: string;
    actorId: string;
    artifactType: string;
    payload: unknown;
  }): PolicyDecision {
    const violations: PolicyViolation[] = [];

    if (!this.artifactTypeRe.test(args.artifactType)) {
      violations.push({
        code: "artifact_type_invalid",
        message: "artifactType must match ^[a-z0-9_.-]{1,128}$",
        meta: { artifactType: args.artifactType }
      });
    }

    if (this.forbiddenTypes.has(args.artifactType)) {
      violations.push({
        code: "artifact_type_forbidden",
        message: "artifactType is forbidden by policy",
        meta: { artifactType: args.artifactType }
      });
    }

    const payloadStr = stringifyForScan(args.payload);
    const payloadBytes = Buffer.byteLength(payloadStr, "utf8");
    if (payloadBytes > this.env.MAX_POLICY_PAYLOAD_BYTES) {
      violations.push({
        code: "payload_too_large",
        message: `payload exceeds MAX_POLICY_PAYLOAD_BYTES (${this.env.MAX_POLICY_PAYLOAD_BYTES})`,
        meta: { bytes: payloadBytes, limit: this.env.MAX_POLICY_PAYLOAD_BYTES }
      });
    }

    const payloadKeyCount = countJsonKeys(args.payload);
    if (payloadKeyCount > this.env.MAX_POLICY_PAYLOAD_KEYS) {
      violations.push({
        code: "payload_too_many_keys",
        message: `payload exceeds MAX_POLICY_PAYLOAD_KEYS (${this.env.MAX_POLICY_PAYLOAD_KEYS})`,
        meta: { keyCount: payloadKeyCount, limit: this.env.MAX_POLICY_PAYLOAD_KEYS }
      });
    }

    if (payloadStr) {
      const lower = payloadStr.toLowerCase();
      for (const phrase of this.forbiddenPhrases) {
        if (phrase && lower.includes(phrase)) {
          violations.push({
            code: "payload_forbidden_phrase",
            message: "payload contains forbidden phrase",
            meta: { phrase }
          });
        }
      }
    }

    return {
      allowed: violations.length === 0,
      policyVersion: this.env.POLICY_VERSION,
      violations
    };
  }
}
