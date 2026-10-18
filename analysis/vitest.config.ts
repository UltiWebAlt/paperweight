import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "lcov", "json-summary", "json"],
      thresholds: { statements: 90, branches: 85, functions: 95, lines: 95 },
    },
  },
});
