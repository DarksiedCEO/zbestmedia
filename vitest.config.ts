import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      "@zbest/brand-trinity-schemas": path.resolve(__dirname, "packages/brand-trinity-schemas/src/index.ts"),
      "@zbest/eval-gates-schemas": path.resolve(__dirname, "packages/eval-gates-schemas/src/index.ts"),
      "@zbest/brand-events-contracts": path.resolve(__dirname, "packages/brand-events-contracts/src/index.ts"),
      "@zbest/id-core": path.resolve(__dirname, "packages/id-core/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/test/**/*.test.ts", "services/**/test/**/*.test.ts"]
  }
});
