# Mutation testing: Issue #103 -- Add Selective Product Duplication Options

**PR(s):** #119
**Tool:** StrykerJS 10.1.1 with the Jest runner (`@stryker-mutator/core`, `@stryker-mutator/jest-runner`)
**Config:** [packages/core/core-flows/stryker.config.mjs](../../../packages/core/core-flows/stryker.config.mjs), the same config as my #97 submission, reused unchanged. It is adapted from njpiombino's #62 setup and lefecko's #112 config; credit to both. It is on `develop` as of PR #125.
**Command:**

```
cd packages/core/core-flows
STRYKER_MUTATE="src/product/workflows/duplicate-product.ts:228-337" \
STRYKER_TEST="src/product/workflows/__tests__/duplicate-product.spec.ts" \
STRYKER_JSON_REPORT="../../../docs/sprint3/mutation/reports/103-angrapsas-before.json" \
node /tmp/stryker/node_modules/.bin/stryker run <path-to>/stryker.config.mjs
```

(`-after.json` for the re-run; nothing else changes. Retargeting from #97 to this issue was the three environment variables and no edit to the config, which is what it was written for.)

**Reports:** [before](reports/103-angrapsas-before.json) · [after](reports/103-angrapsas-after.json)
**Mutation score:** before 77.78% → after 100.00%

|        | Killed | Survived | No coverage | Total | Score   |
| ------ | ------ | -------- | ----------- | ----- | ------- |
| Before | 14     | 1        | 3           | 18    | 77.78%  |
| After  | 18     | 0        | 0           | 18    | 100.00% |

Tests run: `src/product/workflows/__tests__/duplicate-product.spec.ts`, 24 tests before and 28 after, both counts recorded in the reports. The source is byte-identical in both, checked programmatically, and no mutant killed in the before run regressed.

## Scope, and why it is a line range

`duplicate-product.ts` is the only source file PR #119 changed that has Jest unit coverage. The others are the dashboard duplicate form (Vitest), the admin route, the validators, the HTTP types and the JS SDK.

Mutating the whole file first, as a probe, produced **27.87% with 69 survivors**, and almost none of those were real. Grouping the 123 mutants by region shows why:

| Lines   | What                                                                   | Mutants | Result                               |
| ------- | ---------------------------------------------------------------------- | ------- | ------------------------------------ |
| 1-105   | `DUPLICATE_PRODUCT_FIELDS`, the field list Query loads the source with | 49      | all survived                         |
| 106-117 | `resolveDuplicateProductInclude`                                       | 20      | all killed                           |
| 118-227 | type and option declarations                                           | 15      | 14 no coverage                       |
| 228-279 | `buildDuplicateProductInput`                                           | 1       | killed                               |
| 286-337 | `buildVariant`                                                         | 17      | 13 killed, 3 no coverage, 1 survived |
| 339-409 | the workflow body                                                      | 21      | 18 survived                          |

The 49 survivors in the field list and the 18 in the workflow body are the "false survivors" the assignment warns about: both are exercised by the HTTP integration test that PR #119 added (`integration-tests/http/__tests__/product/admin/product-duplicate.spec.ts`), which is not part of this run and cannot be, since it boots a server against built packages. Counting them would have reported the unit spec as weak for not covering code it is not responsible for.

So the run is scoped to lines 228-337, `buildDuplicateProductInput` and the `buildVariant` helper it delegates to. I checked the range filter is faithful rather than trusting it: the 18 mutants Stryker reports for the range are identical, mutant for mutant and status for status, to the 18 the whole-file probe put in those lines.

`resolveDuplicateProductInclude` is left out deliberately. It is also unit-tested and also from #119, and all 20 of its mutants are already killed, so including it would have lifted the headline score to about 89% while adding nothing to analyse.

**The `--bail` question.** This workspace's `test` script is `jest --bail --forceExit --passWithNoTests`, so bail could in principle end a run early and distort a verdict. It does not reach Stryker: `--bail` is a CLI flag on that script, and the jest-runner loads `jest.config.js` programmatically, where `'bail' in require('./jest.config.js')` is `false`. As a control I also re-ran the after pass with `--coverageAnalysis all`, so every test runs against every mutant instead of only the covering ones: identical 18/18. In any case bail cannot change a verdict, because a mutant is killed as soon as one test fails, and a survivor is a run in which nothing failed, so bail never fires.

## Surviving mutants

All four mutants that were not killed in the before run, which is every one of them. Line numbers are in `duplicate-product.ts`, all inside `buildVariant`.

| Location (file:line)             | Mutation                                             | Equivalent or test gap?    | Why                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| duplicate-product.ts:316 (id 5)  | `(variant.options ?? [])` → `["Stryker was here"]`   | **Test gap, killed after** | The `?? []` fallback fires only when a variant comes back without `options`. Two tests pass `options: []`, which is empty but not absent, so the fallback never ran. With the mutant the variant's options map becomes `{ undefined: undefined }` instead of `{}`. |
| duplicate-product.ts:317 (id 8)  | `value.option?.title` → `value.option.title`         | **Test gap, killed after** | The optional chain guards an option value that is not linked to its option. Every fixture links it. With the mutant that input throws a `TypeError` inside `transform`, which fails the whole duplication instead of surfacing as a form error.                    |
| duplicate-product.ts:323 (id 10) | `(variant.prices ?? [])` → `["Stryker was here"]`    | **Test gap, killed after** | Same shape as id 5 for prices: tests pass `prices: []` but never omit the key. With the mutant the copy gains one price whose every field is `undefined`.                                                                                                          |
| duplicate-product.ts:329 (id 14) | `(price.price_rules ?? [])` → `["Stryker was here"]` | **Test gap, killed after** | A price's `price_rules` is always supplied by the fixtures, once as `[]` and once populated, so the fallback never ran. With the mutant the price's `rules` becomes `{ undefined: undefined }` instead of `{}`.                                                    |

None are equivalent. All four are the same finding in four places: the spec models absent nested data as an **empty list**, never as a **missing key**. That distinction matters here specifically because the source product is loaded field by field through Query using `DUPLICATE_PRODUCT_FIELDS`, so a relation with no rows can come back absent rather than as `[]`, and an option value can come back without the option row it belongs to. Every one of the four defences in the code was written for that case, and not one of them was tested.

## New or strengthened test

Commit: [2b1a044](https://github.com/CSCI-435-SE/medusa/commit/2b1a0446fddd69c76428b836d0da45d09c8c488d) · Test file: `packages/core/core-flows/src/product/workflows/__tests__/duplicate-product.spec.ts`

Four tests, in a new `describe("nested data the source can come back without")`:

| Test                                                        | Kills            |
| ----------------------------------------------------------- | ---------------- |
| builds empty options for a variant with no options at all   | id 5 (line 316)  |
| builds no prices for a variant with no prices at all        | id 10 (line 323) |
| builds empty rules for a price with no price rules at all   | id 14 (line 329) |
| does not throw on an option value that has no option linked | id 8 (line 317)  |

All four show as `Killed` in the after report, and the score is 100.00% with no survivors and no uncovered mutants.

The expected values come from #103's AC6, that the workflow copies only the selected attributes "while ensuring the duplicated product remains valid", so an absent relation has to produce a valid empty structure rather than a malformed entry. The fourth test asserts only that the call does not throw, because the requirements do not say what an unlinked option value should map to; they do say, in AC9, that a failed duplication surfaces an error on the form, and a `TypeError` thrown inside `transform` is not that.

**The first version of these tests did not work, and mutation testing is what caught it.** They used `toEqual({})`, the re-run came back at 88.89%, and ids 5 and 14 had moved from `NoCoverage` to `Survived`: the tests now reached the mutants but still could not tell them apart. The reason is that Jest's `toEqual` ignores keys whose value is `undefined`, so `{ undefined: undefined }` compares equal to `{}`. Switching those two assertions to `toStrictEqual` killed both. The test that asserts an array (`toEqual([])`, id 10) was unaffected, because the lengths differ.

## Questions

**1. What did the surviving mutants reveal about your tests?**

That the spec covered the selection logic thoroughly and the shape of the data barely at all. #103 is about which groups get copied, so the 24 tests were built around the include flags, and every combination of them is tested: all 20 mutants in `resolveDuplicateProductInclude` were already dead, and 13 of the 17 in `buildVariant`. What survived was the other axis entirely, which is what the source product looks like when it comes back incomplete.

That axis is not incidental to this issue. The copy is assembled from a product loaded field by field through Query, so the function receives whatever the database holds, and the four survivors sit on the four places in `buildVariant` where the author anticipated something missing. Every one of those guards was dead weight as far as the tests were concerned. A mutant could delete any of them and the suite stayed green, which means the suite documented the happy path of a feature whose main risk is partial data.

The subtler point is the difference between `[]` and absent. Two existing tests pass `options: []` and `prices: []` and read naturally as covering the empty case, which is why the gap survived review. They do not reach a `?? []` at all, because an empty array is not nullish. Mutation testing distinguishes those two inputs where reading the tests does not.

**2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements?**

Not among the existing assertions. The 14 mutants killed on the first run include the `include.prices` and `include.inventory_settings` branches and the option-title mapping, and those expected values trace to #103's acceptance criteria: AC3 for prices being copied by default, AC4 for inventory settings being separable from quantities, AC7 for the copy always being a draft.

The honest answer concerns a test I wrote rather than one I found. `toEqual({})` was not a wrong expected value, it was an assertion too weak to detect a wrong one, which the re-run exposed by promoting two mutants from `NoCoverage` to `Survived` rather than to `Killed`. That is the more useful lesson from this exercise: the first run told me which inputs were untested, and the second told me that my new tests, though they ran the right code with the right inputs, could not distinguish correct output from a corrupted one. A mutation score moving from 77.78% to 88.89% when I expected 100% was the only signal that said so.

The fourth test is the one place where the requirements genuinely run out. Neither #103 nor the code says what an option value without its option should become; the original produces a key of `"undefined"`, which is not obviously right, and pinning it would have been inventing a requirement. Asserting that the call does not throw kills the mutant and claims only what AC9 supports.

**3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?**

Claude Code (Opus 5) reused the config from my #97 submission, ran the tool, did the scoping analysis, classified the four survivors and drafted the four tests.

What was checked:

- The scope was not taken on trust. The whole-file probe came first, and the decision to use a line range is justified by the per-region table above, not by preference. The range filter itself was verified by comparing its 18 mutants against the same 18 in the probe, keyed on mutant id.
- The before run's dry run passed all 24 tests before any mutation, and `git status` confirmed the sources were restored after each `inPlace` run.
- The `--bail` claim was checked by loading `jest.config.js` and by the `--coverageAnalysis all` control run, not by reasoning about it.
- The classifications were checked mechanically as well as by reading: the re-run killed exactly the four mutants called gaps, with no regressions, which a wrong classification would not have produced.
- Scores and counts in this document were recomputed from the committed JSON reports rather than copied from the terminal, and the two reports were diffed on mutant id.
- The correction worth recording is the `toEqual` one. The drafted tests passed, and on a suite-only view they looked complete; the re-run is what showed two of them were ineffective. They were rewritten to `toStrictEqual` and the reason is now a comment in the spec, because the next person to add an "empty object" assertion in this file will hit the same thing.
