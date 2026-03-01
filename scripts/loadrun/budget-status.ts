import { getBudgetStatus } from "../../packages/policy-sdk/src/loadrun/budget";

function main(): void {
  const status = getBudgetStatus();
  console.log(JSON.stringify(status, null, 2));
}

main();
