import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";

import { BrandTrinitySchemas } from "../packages/brand-trinity-schemas/src/index";
import { EvalGatesSchemas } from "../packages/eval-gates-schemas/src/index";
import { BrandEventSchemas } from "../packages/brand-events-contracts/src/index";

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

type SchemaMap = Record<string, any>;

function writeSchemaFile(outPath: string, schema: any) {
  const json = zodToJsonSchema(schema, { target: "jsonSchema7" });
  const serialized = JSON.stringify(json, null, 2) + "\n";

  if (checkOnly) {
    if (!fs.existsSync(outPath)) {
      throw new Error(`Missing schema file: ${outPath}`);
    }
    const current = fs.readFileSync(outPath, "utf8");
    if (current !== serialized) {
      throw new Error(`Schema mismatch: ${outPath}`);
    }
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized, "utf8");
}

function writeSchemaSet(pkgName: string, schemas: SchemaMap) {
  const outDir = path.join(root, "packages", pkgName, "schemas");
  for (const [name, schema] of Object.entries(schemas)) {
    const outPath = path.join(outDir, `${name}.json`);
    writeSchemaFile(outPath, schema);
  }
}

function writeEventSchemas() {
  const outDir = path.join(root, "packages", "brand-events-contracts", "schemas");
  for (const [eventName, versions] of Object.entries(BrandEventSchemas)) {
    for (const [version, schema] of Object.entries(versions)) {
      const outPath = path.join(outDir, `${eventName}.v${version}.json`);
      writeSchemaFile(outPath, schema);
    }
  }
}

try {
  writeSchemaSet("brand-trinity-schemas", BrandTrinitySchemas);
  writeSchemaSet("eval-gates-schemas", EvalGatesSchemas);
  writeEventSchemas();
  if (!checkOnly) {
    // eslint-disable-next-line no-console
    console.log("Schemas generated.");
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
