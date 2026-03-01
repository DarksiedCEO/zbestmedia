import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendAuditLedgerEntry } from "../src/audit/ledger";
import { rolloverLedger, verifyLedgerWithArchives } from "../src/audit/retention";

describe("audit retention rollover", () => {
  it("rolls over ledger to gzip archive and checkpoint deterministically", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-rollover-"));
    const ledgerPath = path.join(root, "ledger.jsonl");
    const archiveDir = path.join(root, "archive");
    const checkpointsDir = path.join(root, "checkpoints");

    appendAuditLedgerEntry({
      ledgerPath,
      type: "slo_event",
      targetId: "prod/us-west/policy",
      payload: { a: 1 },
      now: new Date("2026-03-01T01:00:00.000Z")
    });
    appendAuditLedgerEntry({
      ledgerPath,
      type: "incident_bundle",
      targetId: "prod/us-west/policy",
      payload: { b: 2 },
      now: new Date("2026-03-01T01:00:01.000Z")
    });

    const rolled = rolloverLedger({
      ledgerPath,
      archiveDir,
      checkpointsDir,
      now: new Date("2026-03-01T02:00:00.000Z")
    });

    expect(fs.existsSync(rolled.archived)).toBe(true);
    expect(fs.existsSync(rolled.checkpoint)).toBe(true);
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe("");
    expect(rolled.line_count).toBe(2);

    const verify = verifyLedgerWithArchives({
      activeLedgerPath: ledgerPath,
      archiveDir,
      checkpointsDir,
      strictSignatures: false
    });
    expect(verify.ok).toBe(true);
    expect(verify.entries).toBe(2);
  });
});
