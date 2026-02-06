import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  root: path.resolve(__dirname),
  test: {
    include: ["test/**/*.test.ts"],
  },
  cacheDir: "../../node_modules/.cache/vitest/artifact-registry",
  resolve: {
    alias: {
      "@zbest/brand-trinity-schemas": path.resolve(__dirname, "../../packages/brand-trinity-schemas/src/index.ts"),
      "@zbest/eval-gates-schemas": path.resolve(__dirname, "../../packages/eval-gates-schemas/src/index.ts"),
      "@zbest/brand-events-contracts": path.resolve(__dirname, "../../packages/brand-events-contracts/src/index.ts"),
      "@zbest/id-core": path.resolve(__dirname, "../../packages/id-core/src/index.ts"),
    }
  }
}));
