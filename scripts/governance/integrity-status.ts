import { readGovernanceSelfCheckStatus } from "../../packages/policy-sdk/src/governance/selfCheck";

function main(): void {
  const status = readGovernanceSelfCheckStatus({ rootDir: process.cwd() });
  if (!status) {
    console.log(JSON.stringify({ status: "missing", path: "ops/incidents/governance_integrity_status.json" }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        ts: status.ts,
        target_id: status.target_id,
        passed: status.passed,
        integrity_score: status.integrity_score,
        flags: status.flags,
        auto_block_active: status.auto_block_active,
        auto_freeze_recommended: status.auto_freeze_recommended,
        last_self_check_event_id: status.last_self_check_event_id
      },
      null,
      2
    )
  );
}

main();
