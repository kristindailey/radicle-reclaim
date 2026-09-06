/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  // Resolve `core` to its built output, the same compiled reconcile engine the
  // fixture harness runs. Build core first (`pnpm --filter core build`, run by
  // the pretest hook).
  moduleNameMapper: {
    "^core$": "<rootDir>/../core/dist/index.js",
  },
};
