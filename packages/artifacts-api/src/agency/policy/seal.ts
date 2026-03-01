import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) throw new Error("Cyclic JSON not supported");
    seen.add(v as object);

    if (Array.isArray(v)) {
      return v.map((item) => normalize(item));
    }

    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalize(obj[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
}

export function sealPolicyVersion(input: {
  tenantId: string;
  scopeType: "global" | "client" | "campaign";
  scopeId: string | null;
  clientId: string | null;
  policyKey: string;
  version: number;
  status: string;
  effectiveAt: string;
  expiresAt: string | null;
  valueJson: unknown;
  changeReason: string;
  createdBy: string;
}): string {
  const payload = canonicalJson({
    tenantId: input.tenantId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    clientId: input.clientId,
    policyKey: input.policyKey,
    version: input.version,
    status: input.status,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    valueJson: input.valueJson,
    changeReason: input.changeReason,
    createdBy: input.createdBy
  });

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
