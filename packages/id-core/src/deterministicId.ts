import crypto from "node:crypto";

export function canonicalize(input: unknown): string {
  return JSON.stringify(sortKeysDeep(input));
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: any, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function deterministicArtifactId(args: {
  // Required, not optional: without a tenant/workspace dimension in the
  // hash, two tenants submitting the same caller-generated requestId
  // collide onto the same artifactId — a cross-tenant collision and
  // existence-oracle in one. This field closes that gap at the source.
  workspaceId: string;
  requestId: string;
  artifactType: string;
  input: unknown;
  attempt: number;
}): string {
  const canon = canonicalize(args.input);
  // Length-prefix every field ("<byteLen>:<value>") before joining. A plain
  // "a|b|c" join is ambiguous when a field can itself contain the delimiter
  // (requestId/artifactType are only validated as non-empty strings), letting
  // {requestId:"A|B",artifactType:"C"} and {requestId:"A",artifactType:"B|C"}
  // hash identically. Length-prefixing is unambiguous for arbitrary field
  // contents, so no field value can be confused with a delimiter boundary.
  const raw = [args.workspaceId, args.requestId, args.artifactType, canon, String(args.attempt)]
    .map((field) => `${byteLength(field)}:${field}`)
    .join("|");
  return sha256Hex(raw);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
