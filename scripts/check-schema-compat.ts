import fs from "node:fs";
import path from "node:path";
import semver from "semver";

const root = path.resolve(__dirname, "..");
const schemaDir = path.join(root, "packages", "brand-events-contracts", "schemas");

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getTopLevel(schema: any) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  return { required, properties };
}

function enumSuperset(prev: any, next: any) {
  if (!Array.isArray(prev) || prev.length === 0) return true;
  if (!Array.isArray(next) || next.length === 0) return false;
  const nextSet = new Set(next.map(String));
  return prev.every((val) => nextSet.has(String(val)));
}

function assertSameMajorCompat(prevSchema: any, nextSchema: any, label: string) {
  const prev = getTopLevel(prevSchema);
  const next = getTopLevel(nextSchema);

  const prevReq = new Set(prev.required);
  const nextReq = new Set(next.required);

  if (prevReq.size !== nextReq.size || [...prevReq].some((k) => !nextReq.has(k))) {
    throw new Error(`Breaking change: required fields changed for ${label}`);
  }

  const prevKeys = Object.keys(prev.properties);
  const nextKeys = new Set(Object.keys(next.properties));
  const missing = prevKeys.filter((k) => !nextKeys.has(k));
  if (missing.length > 0) {
    throw new Error(`Breaking change: removed fields for ${label}: ${missing.join(", ")}`);
  }

  for (const key of prevKeys) {
    const prevProp = prev.properties[key];
    const nextProp = next.properties[key];
    if (prevProp && nextProp && prevProp.enum) {
      if (!enumSuperset(prevProp.enum, nextProp.enum)) {
        throw new Error(`Breaking change: enum narrowed for ${label} field ${key}`);
      }
    }
  }
}

function parseSchemaFile(fileName: string) {
  const match = fileName.match(/^(.*)\.v(\d+\.\d+\.\d+)\.json$/);
  if (!match) return null;
  const eventName = match[1];
  const version = match[2];
  return { eventName, version };
}

function loadSchemas() {
  const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith(".json"));
  const events = new Map<string, { version: string; schema: any }[]>();

  for (const file of files) {
    const parsed = parseSchemaFile(file);
    if (!parsed) continue;
    if (!semver.valid(parsed.version)) {
      throw new Error(`Invalid semver in schema file: ${file}`);
    }
    const fullPath = path.join(schemaDir, file);
    const schema = readJson(fullPath);
    const entry = events.get(parsed.eventName) ?? [];
    entry.push({ version: parsed.version, schema });
    events.set(parsed.eventName, entry);
  }

  return events;
}

try {
  const events = loadSchemas();
  for (const [eventName, versions] of events.entries()) {
    const sorted = versions.sort((a, b) => semver.compare(a.version, b.version));
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (semver.major(prev.version) === semver.major(next.version)) {
        assertSameMajorCompat(prev.schema, next.schema, `${eventName} v${prev.version} -> v${next.version}`);
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log("Schema compatibility checks passed.");
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
