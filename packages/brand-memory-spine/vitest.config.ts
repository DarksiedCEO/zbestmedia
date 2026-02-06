import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(
  rootConfig,
  defineConfig({
    root: path.resolve(__dirname),
    test: {
      include: ["test/**/*.test.ts"]
    },
    cacheDir: "../../node_modules/.cache/vitest/brand-memory-spine"
  })
);
