# Mutation testing: Issue #62 -- Add a Low-Stock Inventory Monitoring Dashboard

**PR(s):** #TODO  **Tool:** StrykerJS 10.1.1 with the Jest runner (`@stryker-mutator/core`, `@stryker-mutator/jest-runner`)  **Config:** [stryker.config.json](../../../packages/modules/inventory/stryker.config.json) and its build step [stryker-build.cjs](../../../packages/modules/inventory/stryker-build.cjs) (my own setup; no teammate setup existed)  **Command:** `cd packages/modules/inventory && npx stryker run` (Postgres running)
**Reports:** [before](reports/62-njpiombino-before.json) · [after](reports/62-njpiombino-after.json)
**Mutation score:** before 77.78% (56 of 72 killed) → after 84.72% (61 of 72 killed)

**Scope.** Mutated: the 111 lines that #62 added to `packages/modules/inventory/src/services/inventory-module.ts` (lines 443-553: the `stock_status` handling in `listInventoryItems` / `listAndCountInventoryItems` and the SQL helper `listIdsByStockStatus_`). That is where all of the PR's filtering, sorting and paging logic lives. Not mutated:
- the type files, which have no runtime code;
- `validators.ts`, a two-value zod enum covered only by the HTTP suite, which boots a full server against built packages;
- the dashboard files, which are tested with Vitest, not Jest.

Tests run: `packages/modules/inventory/integration-tests/__tests__/inventory-module-service.spec.ts` (44 tests before, 48 after).

**Setup problems solved:**
- The module tests load `dist/`, not `src/`. The config therefore rebuilds the package after Stryker instruments the file (`buildCommand`), and runs `inPlace` because the sandbox copy breaks the package tsconfig's relative `extends`.
- Babel, which Stryker uses to instrument the file, drops parameter decorators on parameters with a default value. Every `@MedusaContext() context: Context = {}` lost its decorator, so 8 existing tests failed in the initial run. This happens in both Babel 8 (Stryker 10) and Babel 7.29 (Stryker 9). `stryker-build.cjs` restores the 35 decorators before building.
- `moduleIntegrationTestRunner` wraps suites in `describe("")`, so Stryker's per-test coverage IDs never match Jest's test names, and every mutant was reported as uncovered. `coverageAnalysis` is set to `all`, so every test runs against every mutant.
- `concurrency` is 1 because every test run uses the same test database name.

## Surviving mutants

All 16 mutants that were not killed in the before run (13 survived, 3 had no coverage). Line numbers are in `packages/modules/inventory/src/services/inventory-module.ts`. The source file is identical in both reports.

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
|---|---|---|---|
| inventory-module.ts:450 (#3) | `!filters.stock_status` → `false` in `listInventoryItems` | Equivalent | `listInventoryItems` then always calls `listAndCountInventoryItems`, which runs the same check and returns the same items without the filter. Only an extra count query is added. |
| inventory-module.ts:450 (#4) | early-return block → `{}` | Equivalent | Falls through to the same `listAndCountInventoryItems` path as #3. |
| inventory-module.ts:476 (#12) | `!sortedIds.length` → `false` | Equivalent | With no ids, the intersection query gets `id: []`, which matches nothing, so the result is still `[[], 0]`. The early return only saves two queries. |
| inventory-module.ts:476 (#13) | early-return block → `{}` | Equivalent (no coverage before, survived after) | Same reasoning as #12: falling through produces `[[], 0]`. |
| inventory-module.ts:477 (#14) | `return [[], 0]` → `return []` | Test gap, **killed after** | No test had zero items with the status in the database, so the early return never ran. A caller destructuring `[items, count]` would get `undefined`. |
| inventory-module.ts:477 (#15) | `[]` → `["Stryker was here"]` | Test gap, **killed after** | Same gap as #14: would return a fake item. |
| inventory-module.ts:482 (#18) | `{ id: sortedIds }` → `{}` in the intersection query | Equivalent | The next line filters to `sortedIds` again in memory, so narrowing in SQL only reduces rows read. |
| inventory-module.ts:483 (#19) | `{ select: ["id"] }` → `{}` | Equivalent | Only `id` is read from the result. Selecting all fields gives the same ids. |
| inventory-module.ts:483 (#20) | `["id"]` → `[]` | Equivalent | An empty select loads default fields, which include `id`. |
| inventory-module.ts:483 (#21) | `"id"` → `""` | Equivalent | The query still returns the primary key, the only field used. |
| inventory-module.ts:492 (#27) | `config.take == null` → `true` (ignore `take`) | Test gap, **killed after** | The only paging test used `skip: 1, take: 1` with 2 matches, which returns 1 item even when `take` is ignored. No test limited the first page. |
| inventory-module.ts:494 (#33) | `!pageIds.length` → `false` | Equivalent | Fetching `id: []` returns no items, so the result is `[[], count]` either way. |
| inventory-module.ts:494 (#34) | early-return block → `{}` | Equivalent | Same as #33. |
| inventory-module.ts:499 (#37) | `{ id: pageIds }` → `{}` for the page fetch | Equivalent | The page is rebuilt from `pageIds` through a map, so extra rows are ignored. Only a performance difference. |
| inventory-module.ts:500 (#38) | config `{ ...config, skip, take, order }` → `{}` | Test gap, **killed after** | Dropping the caller's `select` / `relations` was not detected because the module tests only compared ids. The API depends on the requested fields being returned. |
| inventory-module.ts:531 (#57) | `join(", ")` → `join("")` in the error message | Test gap, **killed after** | The tests only passed one invalid status, so the separator never appeared in the message. |

## New or strengthened test

Commit: [TODO] · Tests, all in `packages/modules/inventory/integration-tests/__tests__/inventory-module-service.spec.ts`:
- `Inventory Module Service › stock_status filter › limits the first page to take` kills #27 (inventory-module.ts:492).
- `› stock_status filter › keeps the requested relations` kills #38 (inventory-module.ts:500).
- `› stock_status filter without matching items › returns nothing when no item has the status` kills #14 and #15 (inventory-module.ts:477).
- `› stock_status filter › names every unknown stock status` kills #57 (inventory-module.ts:531).

All five show as `Killed` in the after report.

## Questions

1. **What did the surviving mutants reveal about your tests?** Most survivors (11 of 16) were equivalent. They remove shortcuts such as early returns and narrower queries that only save database work, which no test can observe through results. The five real gaps were all edge cases at the boundaries of the paging code:
   - a first page limited by `take`;
   - the case where nothing in the database has the status;
   - the caller's `relations` / `select` being passed through;
   - more than one invalid value.

   The tests checked the main behaviour (which items, in what order, how many) well. They did not check that the filter leaves the rest of the list contract (paging and requested fields) intact.

2. **Did any surviving mutant point to an assertion whose expected value was not based on the requirements?** Yes, partly. #57 is in the error message text, and the expected messages in "rejects an unknown stock status" and "names every unknown stock status" come from wording I chose in the code, not from the issue. The issue only implies that invalid input should be rejected; the HTTP test checks the requirement-level behaviour (a 400 error). The other expected values (which items are low or out of stock, the sort order, counts, an empty result) come from the acceptance criteria, the threshold rule agreed in #61, and the sort order agreed in the #62 discussion.

3. **AI use.** Claude Code (Claude Opus 5.5) did the following:
   - installed and configured StrykerJS;
   - found and worked around the three setup problems above: the module tests load `dist/`, Babel drops parameter decorators (located by capturing the instrumented file during a dry run and reproducing it with Babel directly), and the `describe("")` coverage-ID mismatch;
   - wrote the module-level `stock_status` tests;
   - classified each survivor;
   - wrote the four tests that kill the gap survivors.

   What was verified:
   - The baseline run passed all tests before mutation.
   - After each Stryker run, the source file was checked to contain no instrumentation.
   - The scores in this doc were recomputed from the committed JSON reports.
   - The equivalence claims were checked by reading the code paths described in the table.

   Verified by me: TODO (manual review notes).
