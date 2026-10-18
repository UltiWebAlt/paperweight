/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/analysis/", "/dist/", "/out/"],
  modulePathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/out/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "website/src/components/irl/signals.ts",
    "website/src/utils/breach.ts",
    "website/src/components/Generator.tsx",
    "website/src/components/irl/LiveCaptureDemo.tsx",
    "website/src/components/LayoutSelector.tsx",
    "website/src/app/api/license/route.ts",
    "scripts/lib/brave.ts",
    "scripts/lib/llm.ts",
    "scripts/release-stats.ts",
    "!src/**/*.d.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "json-summary", "json"],
  coverageThreshold: {
    "./src/main/providers/microsoft.ts": { lines: 85 },
    "./src/main/services/sync.ts": { lines: 90 },
    "./src/renderer/pages/Profile.tsx": { lines: 80 },
    "./src/renderer/hooks/usePiiValueActions.ts": { lines: 95 },
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "tsconfig.test.json" },
    ],
  },
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@/(.*)$": "<rootDir>/website/src/$1",
    "^@paperweight/analysis/contracts$": "<rootDir>/analysis/src/contracts.ts",
    "^@paperweight/analysis/country$": "<rootDir>/analysis/src/country.ts",
    "^@paperweight/analysis/received-address$": "<rootDir>/analysis/src/received-address.ts",
    "^@paperweight/analysis/profile-values$": "<rootDir>/analysis/src/profile-values.ts",
    // DELIBERATE asymmetry: the bundler and tsc resolve @paperweight/analysis to
    // the engine's index.ts, but the real module imports ESM (htmlparser2, franc)
    // that the CJS jest runner cannot load. So tests point at the html-to-text
    // submodule as a resolvable target and MUST jest.mock("@paperweight/analysis")
    // with a factory for anything they actually call (analyzeMessage,
    // analyzeText, regionFromDomain). Real detection/extraction/classification
    // is covered by the analysis vitest suite; app tests only verify the
    // handoff and the persistence/aggregation wiring around it.
    "^@paperweight/analysis$": "<rootDir>/analysis/src/extract/html-to-text.ts",
  },
};
