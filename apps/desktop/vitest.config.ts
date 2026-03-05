import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@echo/types": resolve(__dirname, "../../packages/echo-types/src"),
    },
  },
});
