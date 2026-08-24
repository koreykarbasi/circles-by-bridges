/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1",
    "^jose$": "<rootDir>/__tests__/mocks/jose.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  watchPathIgnorePatterns: ["/node_modules/", "/.cache/"],
  modulePathIgnorePatterns: ["/.cache/"],
};
