import path from "node:path";

import { defaultsToEnvBlock, loadRuntimeDefaults } from "../../packages/policy-sdk/src/loadrun/defaults";

function main(): void {
  const defaultsPath = path.resolve(process.cwd(), "packages/policy-sdk/src/defaults/runtime.defaults.json");
  const defaults = loadRuntimeDefaults(defaultsPath);
  console.log(defaultsToEnvBlock(defaults));
}

main();
