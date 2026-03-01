import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { collectAuditImmutableFiles, readAuditStorageConfig } from "../src/audit/storage";

describe("audit storage config", () => {
  it("fails fast for incomplete s3 config", () => {
    expect(() =>
      readAuditStorageConfig({
        AUDIT_SINK: "s3",
        AUDIT_S3_BUCKET: "bucket"
      })
    ).toThrow();
  });

  it("collects immutable files from ops layout", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-storage-"));
    const files = [
      "ops/contracts/slo_contracts.json",
      "ops/contracts/slo_contracts.sig.json",
      "ops/keys/keyring.json",
      "ops/audit/archive/2026-03-01.ledger.jsonl.gz",
      "ops/audit/checkpoints/2026-03-01.head.json"
    ];
    for (const rel of files) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "x", "utf8");
    }
    const out = collectAuditImmutableFiles(root).map((f) => path.relative(root, f)).sort();
    expect(out).toEqual(files.sort());
  });
});
