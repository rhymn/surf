const config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.test.json"
      }
    ]
  },
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^src/(.*)": "<rootDir>/src/$1",
    "^(\.{1,2}/.*)\.js$": "$1"
  }
};

module.exports = config;
