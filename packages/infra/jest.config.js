/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  passWithNoTests: true,
  // Resolve `core` to its built output, so infra tests run against the same
  // compiled reconcile engine later infra code depends on. Build core first
  // (`pnpm --filter core build`); typecheck already resolves core from `dist`.
  moduleNameMapper: {
    "^core$": "<rootDir>/../core/dist/index.js",
  },
};
