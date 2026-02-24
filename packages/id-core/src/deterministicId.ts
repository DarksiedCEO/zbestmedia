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
  requestId: string;
  artifactType: string;
  input: unknown;
  attempt: number;
}): string {
  const canon = canonicalize(args.input);
  const raw = `${args.requestId}|${args.artifactType}|${canon}|${args.attempt}`;
  return sha256Hex(raw);
}
