import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@zbest/artifacts-api": "/Users/andrelove/Documents/New project/zbestmedia/packages/artifacts-api/src/index.ts",
      "@zbest/brand-trinity-schemas": "/Users/andrelove/Documents/New project/zbestmedia/packages/brand-trinity-schemas/src/index.ts",
      "@zbest/eval-gates-schemas": "/Users/andrelove/Documents/New project/zbestmedia/packages/eval-gates-schemas/src/index.ts",
      "@zbest/brand-events-contracts": "/Users/andrelove/Documents/New project/zbestmedia/packages/brand-events-contracts/src/index.ts",
      "@zbest/id-core": "/Users/andrelove/Documents/New project/zbestmedia/packages/id-core/src/index.ts",
      "@zbest/falcon-rules": "/Users/andrelove/Documents/New project/zbestmedia/packages/falcon-rules/src/index.ts",
      "@zbest/brand-memory-spine": "/Users/andrelove/Documents/New project/zbestmedia/packages/brand-memory-spine/src/index.ts"
    }
  },
  test: {
    include: ["packages/**/test/**/*.test.ts"]
  }
});
