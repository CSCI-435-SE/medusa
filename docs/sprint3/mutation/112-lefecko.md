# Mutation testing: Issue #112 -- Add API to create and manage product bundles

**PR(s):** #116  **Tool:** StrykerJS 10.1 with the Jest runner  **Config:** [stryker.config.mjs](../../../stryker.config.mjs) (written for this deliverable; no teammate setup was reused)  **Command:** `STRYKER_JSON_REPORT=../../../docs/sprint3/mutation/reports/112-lefecko-before.json node ../../../node_modules/.bin/stryker run ../../../stryker.config.mjs --mutate "src/product/utils/bundle.ts"`, run from `packages/core/core-flows` (`-after.json` for the re-run)
**Reports:** [before](reports/112-lefecko-before.json) · [after](reports/112-lefecko-after.json)
**Mutation score:** before 90.15% → after 97.04%

**Scope.** The tool was run on `packages/core/core-flows/src/product/utils/bundle.ts`, the file with the pure bundle logic that PR #116 added (421 lines, 203 mutants). It ran against the existing unit spec `utils/__tests__/bundle.spec.ts` (43 tests, all passing on unmutated code). The tests import the built `@medusajs/framework`, so the framework packages were built first (`turbo run build --filter=@medusajs/framework...`). Line numbers below refer to `bundle.ts` as of the "before" run.

| | Killed | Survived | No coverage | Score |
|---|---|---|---|---|
| Before | 183 | 19 | 1 | 90.15% |
| After | 197 | 6 | 0 | 97.04% |

## Surviving mutants

All 20 mutants that were not killed in the before run are analyzed (14 test gaps, 6 equivalent).

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
|---|---|---|---|
| bundle.ts:120 | `", "` replaced with `""` in the duplicate-variants message | Test gap | The duplicate-variant test only checked the error type, and one duplicate never shows the separator. Killed. |
| bundle.ts:133 | `(component) => component.variant_id` replaced with `() => undefined` | Test gap | No test read the variant ids out of the invalid-quantity message. Killed. |
| bundle.ts:134 | `", "` replaced with `""` in the invalid-quantity message | Test gap | Same as above: nothing checked a message that lists two variants. Killed. |
| bundle.ts:146 | `", "` replaced with `""` in the variants-not-found message | Test gap | Message was never checked with two missing variants. Killed. |
| bundle.ts:155 | `variant.inventory_items?.length` replaced with `variant.inventory_items.length` | Test gap | No test used a variant with `inventory_items` absent; with the mutant it would crash with a `TypeError` instead of the intended `MedusaError`. Killed. |
| bundle.ts:163 | `variant.product?.metadata` replaced with `variant.product.metadata` | Test gap | No test used a loaded variant without a `product`, which is valid. Killed. |
| bundle.ts:192 | `variant?.inventory_items ?? []` fallback replaced with `["Stryker was here"]` | Test gap | The fallback was never reached (reported as no coverage): no test passed a variant without `inventory_items` to `buildBundleInventoryLinks`. Killed. |
| bundle.ts:192 | `variant?.` replaced with `variant.` | Test gap | No test passed a component whose variant was not loaded. Killed. |
| bundle.ts:222 | default `ignoreBundleIds = []` replaced with `["Stryker was here"]` | Equivalent | No bundle has the id "Stryker was here", so filtering on it removes nothing. No test can distinguish it. |
| bundle.ts:230 | `getBundleComponents(...) ?? []` replaced with `["Stryker was here"]` | Equivalent | The string has no `variant_id`, so `targets.has(undefined)` is false, the same result as an empty array. |
| bundle.ts:248 | default `ignoreBundleIds = []` replaced with `["Stryker was here"]` | Equivalent | Same reasoning as line 222. |
| bundle.ts:257 | `", "` replaced with `""` in the bundles-using-variant message | Test gap | The message was only checked with one bundle, but acceptance criterion 11 requires it to name every bundle. Killed. |
| bundle.ts:279 | `&&` replaced with `\|\|` in `isEmptyMetadataUpdate` | Test gap | A non-empty object was never tested, so it would wrongly count as an empty update. Killed. |
| bundle.ts:279 | `typeof metadata === "object"` forced to `true` | Test gap | Non-object values such as `""` and `0` have no keys and would wrongly count as empty updates. Killed. |
| bundle.ts:280 | `metadata !== undefined` forced to `true` | Equivalent | The `typeof metadata === "object"` check before it already excludes `undefined`, so the condition never changes the result. |
| bundle.ts:319 | `typeof metadata === "object"` forced to `true` in `protectBundleUpdate` | Equivalent (for typed inputs) | `metadata` is typed `Record \| null \| undefined`, and `metadata &&` already excludes `null` and `undefined`, so for every value the type allows the check is redundant. It only differs for a value the type forbids, such as a string. |
| bundle.ts:323 | `metadata[BUNDLE_METADATA_KEY] === undefined` replaced with `false` | Test gap | A marker key that is present but set to `undefined` was never tested, although it also removes the marker. Killed. |
| bundle.ts:331 | `update.metadata !== undefined` forced to `true` | Equivalent | `isEmptyMetadataUpdate(undefined)` is already `false`, so the extra check never changes the result. |
| bundle.ts:398 | `", "` replaced with `""` in the bundle-variant-delete message | Test gap | The message was only checked with one bundle. Killed. |
| bundle.ts:415 | `product.variants?.length ?? 0` replaced with `product.variants?.length && 0` | Test gap | The variant count in the message was never checked. With the mutant, a missing list prints `undefined` and a list of two prints `0`. Killed. |

After the re-run, the 6 survivors are exactly the 6 equivalent mutants above (lines 222, 230, 248, 280, 319 and 331). The `-after.json` report shows no other survivors and no previously killed mutant that stopped being killed.

## New or strengthened test

Commit: [5dec1f5653](https://github.com/CSCI-435-SE/medusa/commit/5dec1f5653) · Test file: `packages/core/core-flows/src/product/utils/__tests__/bundle-edge-cases.spec.ts` (14 tests, 57 in the folder in total)

Representative tests and the mutants they kill (all are `Killed` in `-after.json`):

| Test (file › test name) | Kills |
|---|---|
| bundle-edge-cases.spec.ts › validateBundleComponents error messages › lists every duplicated variant, separated by commas | bundle.ts:120 |
| › validateBundleComponents optional fields › rejects a variant with no inventory items as a normal error | bundle.ts:155 |
| › isEmptyMetadataUpdate edge cases › is false for an object with keys | bundle.ts:279 (`&&` to `\|\|`) |
| › isEmptyMetadataUpdate edge cases › is false for non-object values | bundle.ts:279 (`typeof` forced to `true`) |
| › protectBundleUpdate marker removal › rejects an update that sets the bundle marker to undefined | bundle.ts:323 |
| › getBundleVariantId error message › reports 0 variants when the list is missing | bundle.ts:415 |

## Questions

1. **What did the surviving mutants reveal about your tests?**
   The existing 43 tests checked that the right error type was thrown, but not what the error said. Seven of the 14 gaps were list separators and variant ids inside messages (lines 120, 133, 134, 146, 257, 398, 415). These messages only ever showed a single item in the tests, so a list of several items was untested, even though acceptance criterion 11 says the error must name every bundle. The other 7 were edge cases around absent optional fields (`inventory_items`, `product`, an unloaded variant) and non-object or `undefined` metadata. The suite was good at the main paths and weak at inputs that are valid but unusual. The 6 equivalent mutants are defensive defaults and redundant checks, where no test could tell the difference.

2. **Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.**
   No existing assertion had a wrong expected value. The survivors came from assertions that were missing, not from assertions with incorrect values. The reverse is true of the tests I added: the separator tests expect messages such as `"A" (b1), "B" (b2)` and `a, b`. Those exact strings come from how `bundle.ts` formats its messages, not from a requirement. Requirement 11 only demands that every bundle is named, so a different separator would still meet the requirement and would fail these tests. The tests check the "every item is listed" behavior, but they also pin the comma-and-space format, which is stricter than the requirements.

3. **If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?**
   AI (Claude Code) was used for all three. It installed `@stryker-mutator/core` and `@stryker-mutator/jest-runner`, wrote `stryker.config.mjs`, classified the 20 survivors, and wrote `bundle-edge-cases.spec.ts`. What was corrected or checked along the way:
   - The first config attempt failed because Stryker's CLI cannot override nested options, so the report path is now read from the `STRYKER_JSON_REPORT` environment variable. The sandbox copy also broke the package's relative `require("../../../define_jest_config")`, so the run uses `inPlace: true`, and the temp directory sits at the repo root so Jest does not find a second copy of the tests.
   - The first mutation run was on the wrong feature: files from an uncommitted activity-log branch had been labeled as issue 112. This was caught by checking the issue 112 branch, and those reports were discarded and redone on `bundle.ts`.
   - The AI's survivor classification was checked mechanically: after adding the tests, the re-run killed 14 more mutants (183 to 197 killed), matching the 14 gaps, and left exactly the 6 mutants classified as equivalent. The 14 new tests, the `-before.json` and `-after.json` scores, and the 43 existing tests were all run, and the scores in this file were computed from the reports, not copied from the terminal.
   - TODO (author to complete before submitting): add what you personally reviewed or changed, for example whether you agreed with each "equivalent" ruling, and whether any test needed rewording.
