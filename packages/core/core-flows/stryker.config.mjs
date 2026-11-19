// StrykerJS config for D6 mutation testing in @medusajs/core-flows.
//
// Adapted from njpiombino's setup for issue #62
// (packages/modules/inventory/stryker.config.json on develop) and from
// lefecko's root stryker.config.mjs for issue #112. Credit to both; see
// docs/sprint3/mutation/97-angrapsas.md.
//
// Stryker is NOT a committed dependency, so package.json and yarn.lock stay
// untouched. `npm install --no-save` cannot be used in this repo (npm fails to
// re-resolve the yarn-managed tree: a pre-existing rollup/vite peer conflict),
// so install it outside the repo and call its binary by path:
//
//   mkdir -p /tmp/stryker && cd /tmp/stryker
//   npm init -y && npm install @stryker-mutator/core@10 @stryker-mutator/jest-runner@10
//
// Usage: run from THIS directory so Jest picks up this package's jest.config.js.
//
//   STRYKER_MUTATE="src/promotion/helpers/export-promotions.ts" \
//   STRYKER_TEST="src/promotion/helpers/__tests__/export-promotions.spec.ts" \
//   STRYKER_JSON_REPORT="../../../docs/sprint3/mutation/reports/97-angrapsas-before.json" \
//   node /tmp/stryker/node_modules/.bin/stryker run stryker.config.mjs
//
// Retargeting to another file in this package is two env vars and no edit to
// this file. Retargeting to a different Jest package is a copy of this file
// into that package (the paths below are all relative to the package).

const repoRoot = "../../.."

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "jest",

  jest: {
    // Use this package's jest.config.js, which transforms src/ with @swc/jest.
    // These tests run on SOURCE, not on dist/, so no build step is needed
    // before testing (unlike the inventory module tests njpiombino mutated).
    configFile: "jest.config.js",
    // Run only the spec(s) that cover the mutated file. Checked by grep that
    // nothing else imports it, so this cannot hide a killer test.
    config: {
      testMatch: [
        `<rootDir>/${process.env.STRYKER_TEST ?? "src/**/*.spec.ts"}`,
      ],
    },
    // Stryker's own test filtering is used instead of Jest's
    // --findRelatedTests, which resolves against dist/ here.
    enableFindRelatedTests: false,
  },

  // The file(s) the PR changed. Never the whole package.
  mutate: [process.env.STRYKER_MUTATE ?? "src/**/*.ts"],

  // "perTest" only runs the tests that touch each mutant. Verified against a
  // full `coverageAnalysis: "all"` run on this target: identical results, so
  // it is not under-reporting coverage here.
  coverageAnalysis: "perTest",

  // Mutants run in the package itself, not in a copied sandbox: package jest
  // configs use a relative require("../../../define_jest_config"), which breaks
  // from a sandbox two directories deeper. Stryker restores the sources when
  // the run ends; if a run is killed midway, `git checkout -- .` cleans up.
  inPlace: true,

  // Scratch dir at the repo root, so Jest does not discover Stryker's backup
  // copy of this package's tests and run everything twice.
  tempDirName: `${repoRoot}/.stryker-tmp`,

  // "json" is the machine-readable report required as D6 evidence. The CLI
  // cannot override nested options, so the path comes from the environment.
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: {
    fileName:
      process.env.STRYKER_JSON_REPORT ?? "reports/mutation/mutation.json",
  },
  htmlReporter: { fileName: "reports/mutation/index.html" },

  // Informational only; break: null never fails the run.
  thresholds: { high: 80, low: 60, break: null },

  concurrency: 2,
  timeoutMS: 60000,
}
