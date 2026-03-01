import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateFortressRunbook } from "../src/ops/runbook";

describe("ops runbook", () => {
  it("generates markdown from source-of-truth configs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "runbook-"));
    const write = (rel: string, value: unknown) => {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    };
    write("ops/targets/targets.json", {
      targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
    });
    write("ops/retention/policy.json", {
      version: 1,
      rollover_cadence: "daily",
      archive_compression: "gzip",
      retention_days: 365,
      never_delete_targets: []
    });
    const md = generateFortressRunbook({ rootDir: root });
    expect(md).toContain("Fortress Runbook");
    expect(md).toContain("prod/us-west/policy");
    expect(md).toContain("ops:audit:rollover-ledger");
  });
});
