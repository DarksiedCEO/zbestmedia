import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildFortressReport } from "../src/ops/fortressReport";

describe("ops fortress report", () => {
  it("bundles required proof files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fortress-report-"));
    const out = path.join(root, "out");
    const write = (rel: string, content = "{}") => {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    };
    write("ops/contracts/slo_contracts.json");
    write("ops/contracts/slo_contracts.sig.json");
    write("ops/keys/keyring.json");
    write("ops/slo/summary.md", "# summary");
    write("ops/readiness/2026-03-01__readiness.json");
    write("ops/drills/2026-03-01/drill.json");
    write("ops/audit/checkpoints/2026-03-01.head.json");

    const result = buildFortressReport({
      rootDir: root,
      outDir: out,
      targetId: "prod/us-west/policy"
    });

    expect(result.files).toContain("ops/contracts/slo_contracts.json");
    expect(result.files).toContain("ops/keys/keyring.json");
    expect(fs.existsSync(path.join(out, "fortress_report.json"))).toBe(true);
  });
});
