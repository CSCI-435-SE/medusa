# Mutation testing: Issue #97 -- Export promotions to CSV

**PR(s):** #108
**Tool:** StrykerJS 10.1.1 with the Jest runner (`@stryker-mutator/core`, `@stryker-mutator/jest-runner`)
**Config:** [packages/core/core-flows/stryker.config.mjs](../../../packages/core/core-flows/stryker.config.mjs), adapted from njpiombino's setup for #62 ([packages/modules/inventory/stryker.config.json](https://github.com/CSCI-435-SE/medusa/blob/develop/packages/modules/inventory/stryker.config.json)) and lefecko's root [stryker.config.mjs](https://github.com/CSCI-435-SE/medusa/blob/develop/stryker.config.mjs) for #112. Credit to both; what I changed and why is under Setup below. Those two links point at `develop`, because this branch is behind it and does not contain either file yet.
**Command:**

```
cd packages/core/core-flows
STRYKER_MUTATE="src/promotion/helpers/export-promotions.ts" \
STRYKER_TEST="src/promotion/helpers/__tests__/export-promotions.spec.ts" \
STRYKER_JSON_REPORT="../../../docs/sprint3/mutation/reports/97-angrapsas-before.json" \
node /tmp/stryker/node_modules/.bin/stryker run stryker.config.mjs
```

(`-after.json` for the re-run; nothing else changes.)

**Reports:** [before](reports/97-angrapsas-before.json) · [after](reports/97-angrapsas-after.json)
**Mutation score:** before 90.63% → after 96.88%

| | Killed | Survived | No coverage | Total | Score |
|---|---|---|---|---|---|
| Before | 58 | 4 | 2 | 64 | 90.63% |
| After | 62 | 1 | 1 | 64 | 96.88% |

**Scope.** Mutated one file: `packages/core/core-flows/src/promotion/helpers/export-promotions.ts`, the row conversion #97 added (76 lines, 64 mutants). It is the only part of the PR that is pure functions with a plain Jest unit spec, so it needs no database and the suite runs in about 1.5 seconds. Not mutated: the step, workflow and route, which are covered by the HTTP integration suite that boots a server against built packages; and the dashboard Export action, which is Vitest, not Jest.

Tests run: `src/promotion/helpers/__tests__/export-promotions.spec.ts`, 11 tests before and 14 after. Verified by `grep` that no other test file imports `export-promotions`, `EXPORT_COLUMNS` or `normalizePromotionForExport`, so restricting the run to this one spec cannot hide a test that would have killed a mutant.

## Setup

The tests in this package run on `src/` through `@swc/jest`, not on `dist/`, so none of njpiombino's build machinery was needed: no `buildCommand`, no decorator restoration (the file has no decorators), no `concurrency: 1` (no database). What carried over from both teammates' configs is `inPlace: true` and a `tempDirName` at the repo root. Both are necessary here for the same reasons they gave: this package's `jest.config.js` does a relative `require("../../../define_jest_config")`, which breaks from a sandbox two directories deeper, and a temp directory inside the package makes Jest discover Stryker's backup copy of the tests and run everything twice.

Two things I had to work out myself:

- **Installing the tool.** `npm install --no-save` inside the repo, which lefecko used, fails here: npm tries to re-resolve the whole yarn-managed tree and hits a pre-existing rollup/vite peer conflict that has nothing to do with Stryker. I installed it into a directory outside the repo and called the binary by path, so `package.json` and `yarn.lock` are untouched.
- **Retargeting.** The file to mutate, the spec to run and the report path all come from environment variables, so pointing this at a second issue's file is three variables and no edit to the config. lefecko's config parameterises the report path the same way, because Stryker's CLI cannot override nested options.

**The `--bail` question.** This workspace's `test` script is `jest --bail --forceExit --passWithNoTests`, so I checked whether bail was hiding or faking survivors before trusting any of the numbers below. It is not, on three pieces of evidence:

1. `--bail` is a CLI flag in the `package.json` script. Stryker's jest-runner loads `jest.config.js` programmatically and never runs that script; the resolved config has no `bail` key (`'bail' in require('./jest.config.js')` is `false`).
2. Both reports record all 11 (then 14) tests, so nothing was skipped in the dry run.
3. As a control I re-ran the before run twice more, once with `bail: 1` forced into the Jest config and once with `coverageAnalysis: "all"` so every test runs against every mutant. Both produced the same 58/4/2 split and the same six non-killed mutants, mutant for mutant.

Bail could not change a verdict in any case: a mutant is killed when at least one test fails, so stopping at the first failure only ends a run whose outcome is already decided, and a survivor is a run in which nothing failed, so bail never fires.

## Surviving mutants

All six mutants that were not killed in the before run, which is every one of them (fewer than 10, so all are analysed). Line numbers are in `export-promotions.ts`; the source is byte-identical in both reports.

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
|---|---|---|---|
| export-promotions.ts:15 (id 3) | `(rules ?? [])` → `(rules ?? ["Stryker was here"])` | Equivalent | The fallback only runs when `rules` is nullish. The injected string has no `attribute` and no `values`, so the guard on line 21 drops it and the column joins to `""`, exactly as an empty array does. No observable difference. |
| export-promotions.ts:17 (id 7) | `(rule.values ?? [])` → `["Stryker was here"]` | Equivalent | Same shape: `"Stryker was here".value` is `undefined`, the filter on line 19 removes it, `values` is empty and the rule is dropped. Reported as no coverage because `values` is required in `PromotionRuleDTO` and the step selects `rules.values.value`, so the fallback is defensive and nothing reaches it. |
| export-promotions.ts:17 (id 5) | drops `.filter((value): value is string => !!value)` | **Test gap, killed after** | `PromotionRuleValueDTO.value` is optional, so a rule value row with no value is valid input. The one existing test for an unreadable rule passes `values: []`, so the filter never ran on a non-empty list. With the mutant a blank value is kept and the rule exports as `attribute:operator:`, which the import rejects. |
| export-promotions.ts:21 (id 15) | `!rule.attribute \|\| !rule.operator` → `false` | **Test gap, killed after** | Removes both guards. A rule missing its attribute or its operator would be written out as `undefined:eq:eur`. No test had a rule missing either field. |
| export-promotions.ts:21 (id 16) | `\|\|` → `&&` between the attribute and operator guards | **Test gap, killed after** | A rule is then dropped only when *both* fields are missing, so a rule missing just one of them is exported. Same untested input as id 15. |
| export-promotions.ts:53 (id 39) | `promotion.code ?? ""` → `?? "Stryker was here!"` | **Test gap, killed after** | `PromotionDTO.code` is optional, so the fallback is reachable, but every promotion in the suite had a code: the "empty cell" test asserts every other column while setting `code: "BARE"`. Low value in practice, since the `code` column is non-nullable in the database, but AC5 covers it and the branch was untested. |

The four gaps are one finding. The function's own contract, in the comment above `serializeRules`, is that a rule missing an attribute, an operator or every value is left out because the import cannot read it back. Only the third of those three was tested. That matters more than a missing assertion: the import's `parseRules` rejects the *whole* rules column when a rule has a blank attribute, an unknown operator or no values, so one incompletely written rule does not degrade gracefully, it makes the entire file fail to import and breaks AC6.

After the re-run the two remaining non-killed mutants are exactly the two classified as equivalent, with no previously killed mutant regressing (checked by diffing the two reports on mutant id, not on line number: ids 13 and 15 are both `ConditionalExpression → "false"` on line 21 and only differ by sub-expression).

## New or strengthened test

Commit: [296a4f4](https://github.com/CSCI-435-SE/medusa/commit/296a4f45992585cf17107414fc24d3a4cdf775fe) on PR #108, which merged on 20 Nov. The three tests belong in #97's own spec rather than on this branch, so they went in there; the after report below was produced with them applied.

Test file: `packages/core/core-flows/src/promotion/helpers/__tests__/export-promotions.spec.ts`

| Test (file › test name) | Kills |
|---|---|
| export-promotions.spec.ts › exported promotions read back through the import › leaves out a rule with no attribute or no operator, so the file still imports | ids 15 and 16 (line 21) |
| › exported promotions read back through the import › leaves out a rule whose only value is blank, so the file still imports | id 5 (line 17) |
| › normalizePromotionForExport › leaves the code cell empty for a promotion that has no code | id 39 (line 53) |

All four show as `Killed` in the after report.

The two rule tests assert the round trip (`errors` is empty and the promotion comes back with the rules that were readable) rather than the exported string. That is AC6's own wording, and it is also the stricter check: it fails for any malformed rule the export emits, whatever formatting the code happens to use.

## Questions

**1. What did the surviving mutants reveal about your tests?**

That the suite tested the function's documented behaviour asymmetrically. `serializeRules` promises to leave out a rule missing an attribute, an operator or every value, and the spec covered only the missing-values case, which is also the easiest to construct. The two mutants on line 21 survived because both the attribute guard and the operator guard were dead weight as far as the tests were concerned, and a mutant could delete them silently. The same for the blank-value filter on line 17, which never ran on a non-empty list because the one unreadable-rule test passed `values: []` and so short-circuited on length instead.

The pattern is that the tests were built from whole, well-formed promotions, with absence modelled as a whole field or a whole list being missing, never as a partly-filled nested object. That is the shape the export actually has to defend against, because the step selects nested rule fields individually and gets back whatever the database holds. The 58 mutants killed on the first run show the main paths and the formatting were covered properly; the gaps were all one level down, inside the rule objects.

The two equivalent survivors are both `?? []` defaults, where the injected array is dropped by the same validation that drops a real unreadable rule. Nothing can distinguish them through the function's output, which is the signature of a guard that exists for safety rather than for behaviour.

**2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements?**

Not among the existing assertions: the gaps were assertions that did not exist, not assertions with wrong expected values. The existing expected values hold up, and the report backs that up in two places. The `":"`, `"|"` and `";"` separator mutants on lines 25 and 28 all died, killed by the AC4 tests whose expected string is AC4's own worked example. Fourteen of the fifteen `StringLiteral` mutants died, almost all of them the `?? ""` fallbacks on lines 54 to 64, killed by the "empty cell" test, which is AC5; that test builds its expectation from `EXPORT_COLUMNS`, but `EXPORT_COLUMNS` is itself pinned to a hand-written header literal by the AC3 test, so the chain ends at a criterion rather than at the code. The round-trip tests likewise write out the expected `CreatePromotionDTO` by hand from the source promotion. Line 53 was the one fallback of that group left uncovered, because the bare promotion in that test still had a code.

The one place worth naming is the test I wrote for id 39. Asserting `row.Code === ""` does pin the empty string, which is a formatting choice, though AC5 states it directly ("anything the promotion doesn't have is an empty cell"), so the expected value traces to a criterion. I deliberately avoided the same shape for the two rule tests: asserting the exported string `"currency_code:eq:eur"` would have killed the same mutants while pinning the export's formatting, so instead they assert that the file imports back with no errors and the right rules, which is what AC6 asks for and does not depend on how the rule is spelled. That distinction is the thing I would not have thought about without the survivors: the stricter-looking string assertion is the weaker test, because it passes for a file no one can import.

A related limitation, recorded as tech debt on #97 and not something mutation testing surfaced: the existing test "does not round trip a rule value containing a delimiter" takes its expected value from what the import parser does today, not from a requirement. It pins known-wrong behaviour on purpose.

**3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?**

Claude Code (Opus 5) set up and ran the tool, classified the six survivors and drafted the three tests. It produced the config, worked out the install problem, and ran the controls described under Setup.

What I checked:

- The dry run passed all 11 tests before any mutation, and the source file contains no leftover instrumentation after each run.
- The `--bail` claim was not taken on reasoning. The two control runs, with bail forced on and with `coverageAnalysis: "all"`, are what settles it, and they agree with the committed before run mutant for mutant.
- The classifications were checked mechanically as well as by reading: the re-run killed exactly the four mutants classified as gaps and left exactly the two classified as equivalent, with no regressions. If a classification had been wrong, that count would not have matched.
- The scores and counts in this document were recomputed from the committed JSON reports rather than copied from the terminal.
- The report diff was redone keyed on mutant id after the first attempt keyed on line and column, which collapsed two distinct `ConditionalExpression` mutants on line 21 and produced a misleading list of which tests killed what.
- One correction worth recording: the first version of the rule tests asserted the exported strings. That would have killed the same mutants, but it pins formatting the requirements do not specify, so the tests were rewritten to assert the round trip instead. The reasoning is in question 2.
