# Mutation testing: Issue #122 -- Show bundle badge on product list table

**PR(s):** #123
**Tool:** StrykerJS 10.1.1 with @stryker-mutator/vitest-runner
**Config:** [`packages/admin/dashboard/stryker.config.json`](../../../packages/admin/dashboard/stryker.config.json)
**Command:** `nvm exec 22 node ../../../node_modules/.bin/stryker run` (run from `packages/admin/dashboard/`; Stryker 10 requires Node 22+, and its binary is only installed at the repo root)
**Reports:** [before](reports/122-maali-ux-before.json) · [after](reports/122-maali-ux-after.json)
**Mutation score:** before 100% → after 100% (no mutant survived and no test changed, so there was nothing to re-run: the after report is a copy of the before report)

## Surviving mutants

No mutants survived. All 12 mutants were killed on the first run.

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
|---|---|---|---|
| N/A | N/A | N/A | All 12 mutants killed; no survivors to analyze |

## New or strengthened test

No new test was needed — all mutants were killed by the existing AC1/AC2
tests. The mutant most likely to have survived (the `!== null` guard on line
11 forced to `true`) was killed by the `bundle: null` case in AC2, which was
included specifically to cover that JavaScript edge case
(`typeof null === "object"`). The other line 11 mutant, which flips the guard
to `=== null`, is killed by AC1, because a real bundle then loses its badge.

Commit: 70634ea02a · Test: `product-title-cell.spec.tsx` › AC2: shows no
badge for a regular product (its `bundle: null` case) · Kills:
`product-title-cell.tsx:11` (`!== null` guard forced to `true`)

## Questions

1. **What did the surviving mutants reveal about your tests?**
   No mutants survived, so the tests did not reveal any gaps through
   survivors. However, the mutation run confirmed that the `bundle: null`
   case in AC2 is load-bearing: it is the only test case that kills the
   mutant forcing the `!== null` guard on line 11 to `true` (the other case
   in AC2, `metadata: null`, can't, because `typeof undefined` is not
   `"object"`). Without it, that mutant would have
   survived, meaning the tests would not catch a regression where a product
   with `metadata.bundle = null` incorrectly receives a badge. The
   100% score reflects that the AC2 test cases were designed to cover
   JavaScript edge cases (`typeof null === "object"`), not just the happy
   path.

2. **Did any surviving mutant point to an assertion whose expected value
   was not based on the requirements?**
   No mutants survived. All expected values in the tests were derived
   from the acceptance criteria in issue #122, not from the code's output.
   The `!== null` check was added after Claude Code identified the
   JavaScript edge case — the expected value (no badge for `bundle: null`)
   was then verified against the requirements before writing the test.

3. **If you used AI to configure the tool, analyze survivors, or write
   tests, what did it produce and what did you verify or correct?**
   Claude Code (via Claude) configured StrykerJS, installed the Vitest
   runner, and wrote the stryker.config.json. I verified that the config
   mutated only the file changed by this PR (`product-title-cell.tsx`) and
   that the Node 22 requirement was handled without changing the project
   default. Claude Code also wrote both AC tests. I verified that their
   expected values matched the acceptance criteria in issue #122 (not
   copied from code output), and that the `bundle: null` test case was
   justified by the JavaScript edge case rather than invented arbitrarily.
   The mutation score was not manipulated — the 100% result reflects
   genuine test coverage of the detection logic.
