// Android component checks need JSX emission. Leave the shared test/app config alone.
const base = require("../jest.config.js");
const path = require("path");

module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, ".."),
  testMatch: ["**/__tests__/android-orbit-rendering.spec.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        module: "CommonJS",
        moduleResolution: "node",
        esModuleInterop: true,
        strict: true,
        jsx: "react-jsx",
      },
    }],
  },
};
