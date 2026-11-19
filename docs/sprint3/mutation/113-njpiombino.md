# Mutation testing: Issue #113 -- Handle bundles at checkout and allow returning a single item from a bundle

**PR(s):** [#117](https://github.com/CSCI-435-SE/medusa/pull/117)  **Tool:** StrykerJS 10.1.1 with the Jest runner (`@stryker-mutator/core`, `@stryker-mutator/jest-runner`)  **Config:** [stryker.config.json](../../../packages/core/core-flows/stryker.config.json) (based on my own #62 setup, simplified for plain unit tests)  **Command:** `cd packages/core/core-flows && npx stryker run` (no database needed)
**Reports:** [before](reports/113-njpiombino-before.json) · [after](reports/113-njpiombino-after.json)
**Mutation score:** before 89.75% (324 of 361 killed) → after 96.95% (350 of 361 killed)

**Scope.** Mutated: the two files #113 added that hold its rules:
- `packages/core/core-flows/src/order/utils/bundle-refunds.ts`: splitting the price paid into refund shares, rounding, the refund for each returned item, and the checks on what can be returned or received.
- `packages/core/core-flows/src/cart/utils/insufficient-inventory-error.ts`: working out and wording the out-of-stock message.

Tests run: `src/order/utils/__tests__/bundle-refunds.spec.ts` and `src/cart/utils/__tests__/insufficient-inventory-error.spec.ts` (69 tests before, 83 after).

Not mutated:
- The steps, workflows and API routes that call these files. They only load data and pass it through, and they are tested by the HTTP suite (`integration-tests/http/__tests__/order/store/bundle-checkout-returns.spec.ts`), which starts a full server against built packages and takes minutes per run, far too slow to run once per mutant.
- The order module's handling of single-item return actions (`packages/modules/order/src/utils/bundle-component.ts` and the four action files). It's a separate package with its own unit tests (`bundle-component-returns.spec.ts`); I kept the D6 scope to the core-flows logic.
- The inventory module's one-loop fix and the type files, which have no runtime logic.

**Setup notes.** These tests run on `src/` through swc, so this config needs none of the #62 workarounds (no rebuild, no decorator fix, no database). Two settings remain:
- `inPlace: true`, because Stryker's sandbox copy breaks `jest.config.js`'s relative `require("../../../define_jest_config")`.
- `coverageAnalysis: "perTest"` works here, because these suites have normal `describe` names.

Each run reports 7 `RuntimeError` mutants in `bundle-refunds.ts`. They remove the mapping callbacks around the BigInt maths, so the code throws a "Cannot mix BigInt" error. Stryker leaves runtime errors out of the score, and the scores above follow that rule: (killed + timeout) / (killed + timeout + survived + no coverage).

## Surviving mutants

All 37 mutants that survived the before run (none had no coverage). Line numbers are in the files named; the source is identical in both reports and matches the committed files.

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
|---|---|---|---|
| insufficient-inventory-error.ts:60 (#13) | `variants?.length` → `variants.length` | Test gap, **killed after** | A product loaded without its variant list would crash the error message. No test named such a variant. |
| insufficient-inventory-error.ts:60 (#14) | `variant.product?.variants` → `variant.product.variants` | Equivalent | `product` was checked two lines above (`if (!productTitle) return`), so it is always defined here. |
| insufficient-inventory-error.ts:100 (#33) | `shortage.bundle ?? ""` → `shortage.bundle && ""` in the duplicate check | Test gap, **killed after** | The key loses the bundle name, so the same component short in two different bundles is listed only once. No test had two bundles. |
| insufficient-inventory-error.ts:100 (#34) | `""` → `"Stryker was here!"` | Equivalent | Only changes the internal key text for items that aren't in a bundle. Keys stay unique and are never shown. |
| insufficient-inventory-error.ts:190 (#88) | query `fields` list → `[]` | Test gap, **killed after** | The mocked query returned the same data whatever fields were asked for, so no test noticed. A real query without these fields returns no titles. |
| insufficient-inventory-error.ts:191-196 (#89-#94) | each field (`"id"`, `"title"`, `"product.title"`, `"product.metadata"`, `"product.variants.id"`, `"inventory_items.inventory_item_id"`) → `""` | Test gap, **killed after** | Same gap as #88, for each single field. |
| insufficient-inventory-error.ts:205 (#96) | `let variants = []` → `["Stryker was here"]` | Equivalent | The starting list is only kept when no line has a variant ID. Then every line is skipped before any variant is looked up, so the generic message is returned either way. |
| insufficient-inventory-error.ts:220 (#114) | entity `"variant"` → `""` in the components query | Test gap, **killed after** | The test checked the filters of the second query but not the entity. |
| insufficient-inventory-error.ts:257 (#123) | `""` → `"Stryker was here!"` in the stock check's location key | Equivalent | The key is built the same way here and at line 280 and is never shown; lines without a location still share one key. |
| insufficient-inventory-error.ts:280 (#138) | same literal at the lookup | Equivalent | Same as #123. |
| bundle-refunds.ts:114 (#154) | fall back to splitting by quantity when **every** price is 0 → when **any** price is 0 | Test gap, **killed after** | No test had one free component next to priced ones. By the owner's rule (shares by normal price), a free component gets nothing. |
| bundle-refunds.ts:124 (#168) | remainder `total * weight - shares[i] * totalWeight` → `+` | Test gap, **killed after** | The leftover cent then goes to the larger share instead of the larger remainder. The rounding tests happened to have the same winner both ways. |
| bundle-refunds.ts:124 (#170) | `shares[i] * totalWeight` → `/` | Test gap, **killed after** | Same as #168. |
| bundle-refunds.ts:129 (#178) | tie check `a.remainder === b.remainder` → `false` | Equivalent | `Array.prototype.sort` is a stable sort that only asks whether an element sorts before another. On a tie the mutant answers "no" (1), which keeps the original order, the same result as "earlier component first". |
| bundle-refunds.ts:129 (#180) | tie-break `a.i - b.i` → `a.i + b.i` | Equivalent | Same as #178: a positive answer on a tie keeps the original order. |
| bundle-refunds.ts:129 (#183) | `a.remainder > b.remainder` → `>=` | Equivalent | Equal remainders are handled by the tie branch first, so this comparison never sees equal values. |
| bundle-refunds.ts:193 (#208) | saved shares valid when **every** component has one → when **any** has one | Equivalent | The code saves a share for every component of a line or for none, so a line with only some shares can't exist (except by editing the order's metadata by hand). |
| bundle-refunds.ts:326 (#244) | bundles touched `units / component.quantity` → `*` | Test gap, **killed after** | Every test bundle held 1 of each component, where `/` and `*` give the same result. |
| bundle-refunds.ts:339 (#249) | `orderItem?.metadata?.[KEY]` → `orderItem?.metadata[KEY]` | Test gap, **killed after** | An order line with `null` metadata would crash every return. No test had one. |
| bundle-refunds.ts:342 (#255) | early return for lines that aren't bundles → `false` | Equivalent | Such a line then takes the whole-bundle path, which does no check (no saved shares) and returns the same item. Only an internal count changes. |
| bundle-refunds.ts:358 (#268) | `if (savedComponents)` → `true` | Test gap, **killed after** | A whole-bundle return of a bundle ordered before shares were saved would crash. AC 19 says those still work. No test covered it. |
| bundle-refunds.ts:360 (#272) | whole bundles left `fulfilled - wholeTaken - ...` → `fulfilled + wholeTaken - ...` | Test gap, **killed after** | No test combined an earlier whole-bundle return with a returned item, so `wholeTaken` was always 0. |
| bundle-refunds.ts:368 (#280) | `Math.max(available, 0)` → `Math.min(available, 0)` in the error message | Test gap, **killed after** | Every rejection test had 0 bundles left, where both give 0. |
| bundle-refunds.ts:375 (#282) | whole bundles in this request `+ quantity` → `- quantity` | Test gap, **killed after** | No test returned a whole bundle and an item of the same line in one request. |
| bundle-refunds.ts:375 (#283) | `?? 0` → `&& 0` | Test gap, **killed after** | Same as #282. |
| bundle-refunds.ts:406 (#308) | items left `bundles * component.quantity` → `/` | Test gap, **killed after** | Same as #244: every component had quantity 1. |
| bundle-refunds.ts:486 (#336) | match return item on `candidate.item_id === item.id` → `true` | Test gap, **killed after** | No test had the same component returned from two order lines, so receiving could pick the other line's return item and its refund. |
| bundle-refunds.ts:487 (#340) | `getReturnedBundleComponent(...)?.variant_id` → without `?.` | Test gap, **killed after** | A return holding a whole bundle and a single item of the same line would crash on receive. No test had one. |
| bundle-refunds.ts:493 (#343) | `!returnItem \|\| !component` → `&&` | Equivalent | `component` is read from the matched return item, and items only match if they have a component, so `component` is missing exactly when `returnItem` is. |
| bundle-refunds.ts:512 (#360) | received in this request `+ quantity` → `- quantity` | Test gap, **killed after** | No test received the same item twice in one request, so receiving more than was returned went unnoticed. |
| bundle-refunds.ts:512 (#361) | `?? 0` → `&& 0` | Test gap, **killed after** | Same as #360. |
| bundle-refunds.ts:517 (#364) | `item.metadata ?? {}` → `item.metadata && {}` | Test gap, **killed after** | The admin's own metadata on a received item would be dropped. No test sent any. |

## New or strengthened test

Commit: [d42aab0](https://github.com/CSCI-435-SE/medusa/commit/d42aab0d0b77057ac5cd833170af25278bc8390a) · Tests in `packages/core/core-flows/src/order/utils/__tests__/bundle-refunds.spec.ts`:
- `computeBundleRefundShares › gives a free component no share when the others have prices (AC 7)` kills #154 (bundle-refunds.ts:114).
- `computeBundleRefundShares › gives the leftover cent to the larger remainder, not the larger share (AC 9)` kills #168 and #170 (bundle-refunds.ts:124).
- `prepareBundleReturnItems › returns every unit of a component that a bundle holds several of` kills #308 (:406).
- `prepareBundleReturnItems › counts a bundle as touched once any of its several units of a component is returned` kills #244 (:326) and #280 (:368).
- `prepareBundleReturnItems › names how many bundles are left to return whole` kills #272 (:360) and also #280.
- `prepareBundleReturnItems › counts a whole-bundle return earlier in the same request` kills #282 and #283 (:375).
- `prepareBundleReturnItems › returns a bundle ordered before shares were saved as a whole (AC 19)` kills #268 (:358).
- `prepareBundleReturnItems › leaves items of lines without metadata unchanged` kills #249 (:339).
- `prepareBundleReceiveItems › receives the component of the right line when two lines return it` kills #336 (:486).
- `prepareBundleReceiveItems › finds the component when the return also has a whole bundle of the same line` kills #340 (:487).
- `prepareBundleReceiveItems › counts the same component twice in one receive request` kills #360 and #361 (:512).
- `prepareBundleReceiveItems › keeps the client's metadata on a received component` kills #364 (:517).

In `packages/core/core-flows/src/cart/utils/__tests__/insufficient-inventory-error.spec.ts`:
- `getVariantDisplayName › uses the product title when the product's variants weren't loaded` kills #13 (insufficient-inventory-error.ts:60).
- `resolveInventoryShortages › lists the same component once per bundle it's short in` kills #33 (:100).
- `buildInsufficientInventoryError › loads the bundle and its components, and names the short component` was strengthened to check the exact query (entity and fields). It kills #88-#94 (:190-196) and #114 (:220).

All 26 show as `Killed` in the after report.

## Questions

1. **What did the surviving mutants reveal about your tests?** The tests covered the issue's main example well: one Camera kit with one of each item, returned one item at a time. Most gaps (26 of 37) came from inputs outside that example:
   - a bundle holding several of one component (#244, #308);
   - a free component next to priced ones (#154);
   - rounding where the larger share and the larger remainder differ (#168, #170);
   - a whole-bundle return combined with single items in one request, or after earlier returns (#272, #280, #282, #283);
   - the same item returned from two order lines, or a whole bundle and an item of the same line in one return (#336, #340);
   - receiving the same item twice in one request (#360, #361);
   - data shapes the tests never built: `null` metadata, a bundle ordered before shares were saved, a product without its variant list (#249, #268, #13).

   Several of these would have crashed or refunded the wrong amount. The other gap was in the mocked query: the unit tests didn't check which fields the error message loads (#88-#94, #114). The HTTP suite covers that against a real database, but Stryker can't run it. The 11 equivalent survivors are internal key text, sort tie-breaking that a stable sort already handles, and data states the code never writes.

2. **Did any surviving mutant point to an assertion whose expected value was not based on the requirements?** Yes, in three places:
   - #280 is in the error message, and the expected messages ("only 1 can be returned whole …", "Cannot return 2 of "Bag" …") use wording I chose; the issue only says a request must be rejected with a clear error.
   - The query fields asserted for #88-#94 come from what the code needs to build a name, not from the issue.
   - The rounding tests for #168 and #170 use the largest-remainder rule (the earlier component wins a tie). The issue only asks that leftover cents go to "specific components chosen by a fixed rule"; the rule itself is my choice, recorded in the PR's design decisions.

   The other expected values come from the requirements: the shares 666.67 / 250 / 83.33 from the owner's example (the bag is 1/12 of the kit), shares adding up exactly to the price paid (AC 9), splitting by quantity when a price is missing (AC 12), rejecting more than was bought (AC 19), and whole-bundle returns still working for older orders (AC 19).

3. **AI use.** Claude Code (Claude Opus 5.5) did the following:
   - wrote the Stryker config for this package, starting from my #62 setup, and found that the sandbox copy breaks the relative require in `jest.config.js` (fixed with `inPlace`);
   - ran both passes, classified every survivor, and wrote the 14 new tests and the strengthened one;
   - for #168 and #170, searched small inputs with a script to find a case that tells the real rounding apart from the mutants, and checked the expected shares by hand (0.02 split 1:2 gives exact shares of 0.0067 and 0.0133, and the cent goes to the larger remainder);
   - argued the equivalence of the tie-break mutants from how a stable sort uses its comparator. The same search found no input on which they differ.

   What was verified:
   - Both runs were made on the same, formatted source, and the reports' embedded source matches the committed files.
   - The scores in this doc were recomputed from the committed JSON reports.
   - The "before" run used the test files with only the 14 new tests removed and the strengthened assertion restored to its earlier, weaker form.
   - After each run, both files were checked to contain no instrumentation (`stryNS`).

   Verified by me: I reran `npx stryker run` myself with this config, and I reviewed this whole document: the setup notes, every row of the surviving-mutants table, the new tests and the answers above.
