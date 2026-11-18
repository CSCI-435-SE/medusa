// Shared Stryker mutation-testing config for the Medusa monorepo.
//
// Setup: Stryker is NOT a committed dependency (it is not in package.json), to
// keep the lockfile untouched. Install it locally without saving it:
//
//   npm install --no-save @stryker-mutator/core@10 @stryker-mutator/jest-runner@10
//
// (or `yarn add -D` the same two packages if you want it in package.json).
// Also build the workspace packages the tests import first, e.g.
//   yarn turbo run build --filter=@medusajs/framework...
//
// Usage: run from INSIDE the package you want to mutate, so Stryker picks up
// that package's own jest.config.js (each package has its own moduleNameMapper
// and transform settings), pointing at this shared file. Call the binary
// directly (`yarn stryker` is not resolvable from a package directory):
//
//   cd packages/core/core-flows
//   node ../../../node_modules/.bin/stryker run ../../../stryker.config.mjs \
//     --mutate "src/product/utils/bundle.ts"
//
// To write the JSON report somewhere specific (the CLI cannot override nested
// options), set STRYKER_JSON_REPORT, e.g.
//   STRYKER_JSON_REPORT=../../../docs/sprint3/mutation/reports/112-lefecko-before.json
//
// Do not run this from the repo root: the root jest.config.js fans out to
// every package as a multi-project config, which would mean mutating (and
// re-testing) the entire monorepo.

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "jest",

  jest: {
    // Use the jest.config.js found in the current working directory (the package).
    configFile: "jest.config.js",
    // Stryker's default injects its own config; keeping this enabled lets it
    // wrap the package config and run tests per mutant.
    enableFindRelatedTests: true,
  },

  // Only mutate source code; skip tests, type declarations, and barrel files.
  mutate: [
    "src/**/*.ts",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/migrations/**",
  ],

  // "perTest" coverage runs only the tests that touch each mutant, which is a
  // large speedup. Jest supports it natively.
  coverageAnalysis: "perTest",

  // "json" writes the machine-readable report required as D6 evidence. The
  // default path below is a scratch location; for the graded runs, set
  // STRYKER_JSON_REPORT (the CLI cannot override nested options) so the file
  // lands in the committed reports folder, e.g.:
  //   STRYKER_JSON_REPORT=../../../docs/sprint3/mutation/reports/112-lefecko-before.json
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: {
    fileName:
      process.env.STRYKER_JSON_REPORT ?? "reports/mutation/mutation.json",
  },

  // Run mutants directly in the package instead of in a copied sandbox.
  // Package jest configs use relative requires such as
  // require("../../../define_jest_config"); a sandbox under
  // <package>/.stryker-tmp/sandbox-xxx is two directories deeper, so that
  // require fails. inPlace avoids the problem; Stryker restores the original
  // files when the run ends, so commit or stash work first in case a run is
  // killed midway (then `git checkout -- .` restores any leftover mutation).
  inPlace: true,

  // Scratch dir for Stryker's backups/state, placed at the repo root (relative
  // to the package cwd) so Jest does not discover the backup copy of the
  // package's tests inside the package and run every test twice. Ignored by git.
  tempDirName: "../../../.stryker-tmp",

  // Thresholds are informational for now (break: null never fails the run).
  thresholds: { high: 80, low: 60, break: null },

  // Mutation runs are CPU heavy; keep parallelism modest on laptops.
  concurrency: 2,
  timeoutMS: 60000,
}
