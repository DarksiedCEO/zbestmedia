import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendAuditLedgerEntry } from "../src/audit/ledger";
import { exportAuditBundle } from "../src/audit/exportBundle";

describe("audit bundle export", () => {
  it("exports deterministic manifest and required files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-export-"));
    const outDir = path.join(root, "bundle");
    const files = [
      "ops/contracts/slo_contracts.json",
      "ops/contracts/slo_contracts.sig.json",
      "ops/keys/keyring.json"
    ];
    for (const rel of files) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "{}", "utf8");
    }
    const ledgerPath = path.join(root, "ops/audit/ledger.jsonl");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    appendAuditLedgerEntry({
      ledgerPath,
      type: "slo_event",
      targetId: "prod/us-west/policy",
      payload: { x: 1 },
      now: new Date("2026-03-01T00:00:00.000Z")
    });

    const result = exportAuditBundle({
      rootDir: root,
      from: "2026-02-28T00:00:00.000Z",
      to: "2026-03-02T00:00:00.000Z",
      targetId: "prod/us-west/policy",
      outDir
    });
    expect(fs.existsSync(result.manifestPath)).toBe(true);
    expect(result.manifest.ledger_entry_count).toBe(1);
    expect(result.manifest.files).toContain("ops/audit/ledger.jsonl");
    expect(fs.existsSync(path.join(outDir, "README.verify.md"))).toBe(true);
  });
});
