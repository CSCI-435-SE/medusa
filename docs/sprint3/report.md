**Team**  
*Team name; member names and GitHub usernames; project name and repository link*  
Project: Medusa  
Repo: [https\://github.com/CSCI-435-SE/medusa](https://github.com/CSCI-435-SE/medusa)  
Team Perseus:

- Nicholas Piombino \- njpiombino  
- Logan Fecko \- lefecko  
- Muhammad Ali \- maali-ux

**Sprint overview**  
*Brief narrative: what the team set out to do and what was actually delivered. Be honest about scope changes*  
The team set out to complete issues that introduced new functionality to Medusa. We set out to create new issues, some pertaining to tech debt and fixing tests, and although we created these issues, these were not all addressed in our development. We were forced to adjust by picking up and splitting one of the new large issues, which we decided on the bundle functionality. We chose it because it was assigned some time into the sprint when we had already decided on and assigned a lot of our sprint issues, so we had to spend time splitting and delegating tasks for this new issue, and we thought this would be the smaller of the two. However, it still ended up being a bit bigger than I initially thought, mostly due to some backend changes that were needed on partial returns.

**Sprint backlog**  
*Link to the Sprint 3 GitHub Milestone; table of issues (title, owner, estimated points, scope, status)*  
Milestone: [https\://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+3%22](https://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+3%22)  
Issue backlog: [https\://github.com/CSCI-435-SE/medusa/issues](https://github.com/CSCI-435-SE/medusa/issues)  
Sprint 3 issues:

| Title | Owner | Estimated Points | Scope | Status |
| :---- | :---- | :---- | :---- | :---- |
| Add Configurable Low-Stock Thresholds and Warnings \#61 | Nicholas Piombino | 5 | Medium | Done |
| Add a Low-Stock Inventory Monitoring Dashboard \#62 | Nicholas Piombino | 5 | Medium | Done |
| Handle bundles at checkout and allow returning a single item from a bundle \#113 | Nicholas Piombino | 5 | Medium | Done |
| Add API to create and manage product bundles \#112 | Logan Fecko | 5 | Medium | Done |
| Cancel a stuck workflow execution \#68 | Logan Fecko | 5 | Medium | Done |
| Show bundle badge on product list table \#122  | Muhammad Ali | 3 | Small | Done |
| Export promotions to CSV \#97 | Alex Grapsas | 5 | Medium | Done |
| Add Selective Product Duplication Options \#103 | Alex Grapsas | 3 | Small | Done |
| Add bundle create, edit, display and return screens to the admin dashboard \#114 | Alex Grapsas | 5 | Medium | Done |

**Requirements & design**  
*Were specs complete before coding started? Any surprises? Key design decisions and brief rationale*  
Specs were completed before any code started for each issue. We also ensured that we clarified any questions over the specs before implementation, using a mix of comments/questions in the issue and team discussions. An example of this is for issue \#101, where I split the issue up into three subissues following the spec, and asked for clarifications on the original issue to finalize the scope of the issue, and by extension, subissues I created before we started working on them. One surprise was that we would need to support functionality for partial returns of a bundle, which caused the decision that a single-item return is a normal return line on the bundle's order line, with the returned item and its refund in the line's metadata. The refund is booked as an order credit line when the item is received. The rationale is that it uses Medusa's existing extension points (metadata on return items and actions, credit lines), keeps order history intact, and needs no data migration.

**Completed issues**  
*Table: issue title, issue owner, all associated PRs (PR link, author, reviewer(s), status), brief description of changes*

| Title | Owner | PR Link | PR Author | PR Review | PR Status | Description |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Add configurable low stock threshold- \#104 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/104 | njpiombino | lefecko | Done | Adds a configurable low-stock threshold to inventory items, and stock warnings in the admin inventory list. |
| Feat/issue 62 low stock dashboard- \#115 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/115 | njpiombino | lefe cko | Done | Store managers can now list only low-stock or out-of-stock inventory items from the existing admin inventory list. Results are sorted by lowest available quantity first. |
| Implement bundles checkout and returns- \#117 | Nicholas Piombin o | https\://github.com/CSCI-435-SE/medusa/pull/117 | njpiombino | maali-ux | Done | Part 2 of product bundles (\#101): bundles now work from checkout through returns. |
| Cancel a stuck workflow execution \#109 | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/109 | lefecko | njpiombino | Done | Adds a place under settings in the admin dashboard that allows store owners to cancel an order fulfillment workflow.  |
| Add API to create and manage product bundles \#116 | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/116 | lefecko | njpiombino | Done | Part 1 of product bundles (\#101): Adds backend support for the bundles. |
| Show bundle badge on product list table \#122  | Muhammad Ali | https\://github.com/CSCI-435-SE/medusa/pull/123  | maali-ux | njpiombino  | Done  | Adds a "Bundle" badge next to bundle products in the admin product list table, reading from product.metadata.bundle established by \#112.  |
| Export promotions to CSV \#97 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/108 | angrapsas | lefecko | Done | Adds a background CSV export of promotions in the same format the import reads, with an Export action on the Promotions list that carries the list's filters. |
| Add Selective Product Duplication Options \#103 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/119 | angrapsas | njpiombino | Done | Lets the owner choose which attributes a duplicate copies: images, variants, prices and inventory settings, with the dependencies between them handled in the form.  |
| Add bundle create, edit and display screens \#114 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/126 | angrapsas | njpiombino | Done | Part 3 of product bundles (\#101): admin screens to create and edit bundles, components on the product and order pages, and the bundles listed when a deletion is blocked. Acceptance criteria 1 to 7; the return form, 8 to 10, is scoped to Sprint 4\.  |

**Test strategy**  
*What kinds of tests were written? Were there changes you couldn't test automatically? Why?*  
During this sprint, we created integration, unit, manual, and mutation tests. There were some frontend changes that we verified through manual testing, both to ensure correct functionality and that it looks correct visually. The addition of mutation tests was helpful to find unnoticed issues with some of our tests, which helped us improve our test suite and improve security.

One type of change we couldn’t test automatically was in issue \#112, implementing the backend for the larger bundles issue. For AC 12, I was attempting to test whether past orders keep working after the bundle is edited or deleted. However, without a shipped order, this was impossible. The shipped bundles order feature was to be made in a future issue, so it was impossible to test this functionality.

**AI tool usage**  
*Per member: tools used, sessions logged, link to AI log folder. Notable patterns vs. Sprint 2*  
Nicholas Piombino \- claude code, logged with SpecStory, 6 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/njpiombino](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/njpiombino)  
I used a similar pattern of using claude code to evaluate different design patterns and tradeoffs that can be used to implement the fix. Further, I used claude code before and after implementing the issue to evaluate the description and AC, as well as clean up and test edge cases. Adding these extra steps ensured my PR started in better shape, with consistently less fixes needed for my PRs than past sprints. I additionally used Claude Code to assist with setting up mutation tests and Stryker, which was very helpful because I did not have experience with mutation tests.

Logan Fecko \- claude code, logged with SpecStory, 5 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/lefecko](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/lefecko)   
I used the same type of claude code usage that I had used in sprint 2\. Once again, I was using the built in review command that medusa has, which makes reviewing PRs super smooth. That with the diff is all that is needed to make a decision when reviewing. As for issues, I once again implemented an extensive planning session, which helps determine how the issue is implemented without letting claude take over completely. Like Nicholas, I also used claude code to help with the mutation testing (both setup and running), as I had no prior experience with Stryker or mutation testing in general.

Muhammad Ali \- claude.ai (web), 1 session. https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/maali-ux I used Claude.ai web to scope the issue, write the D2 spec and D3 design decisions, plan the implementation approach, write the PR description, and analyze mutation testing results. Claude Code handled mechanical tasks (file edits, running StrykerJS, commits). I reviewed all AI output against the acceptance criteria before submitting. 

Alex Grapsas \- claude code, logged with SpecStory, 4 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/angrapsas](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint3/angrapsas)  
My pattern changed this sprint. Instead of one long session per issue, I ran a  
planning session that held the sprint context and used it to direct separate  
implementation sessions, each in its own git worktree, so \#97, \#103 and \#114  
could progress in parallel without fighting over the checkout. The planning  
session's job was to verify rather than trust: when an implementation session  
reported that five mutations of the export converter each broke a test, I  
re-ran all five from the planning session before that claim went into a PR  
description, and when one reported 32 new i18n failures I checked and found  
those locales already failed on develop, which changed the PR from admitting a  
rule violation to recording a pre-existing one. Mutation testing was new to me  
and found a real gap: a rule missing an attribute or operator was untested  
because every fixture I had written was a well-formed promotion.

**Release**  
*Tag name and link to the Sprint 3 release on GitHub*  
v2.17.2-csci435-s3  
[https\://github.com/CSCI-435-SE/medusa/releases/tag/v2.17.2-csci435-s3](https://github.com/CSCI-435-SE/medusa/releases/tag/v2.17.2-csci435-s3)

**Risks and retrospective**  
*What went well? What slowed you down? What would you do differently in Sprint 4?*  
I think completing one of our issues early in the sprint for the mid sprint check-in was helpful for keeping us on track early on in the sprint, which partly remedied our consistent issue of saving the bulk of our work for the final week. However, being assigned a large issue a few days into the sprint slowed us down significantly, because we did not plan for it and weren’t able to break it up and assign subtasks until very late in the sprint. In sprint 4, we will be aware that we will have a large issue to complete from the start of the sprint, allowing us to commence the sprint knowing that we need to plan and split the issue.

**Sprint 4 plan**  
*Initial ideas for Sprint 4; any Sprint 3 issues to carry over*  
Sprint 4 should be kept within our current backlog. We have a number of issues to complete, so we will not need to make new issues, which was a problem we faced in the previous two sprints. We still need to develop our hardening issues and test issues, as well as the other large issue assigned to us in sprint 3, holding stock for shoppers during checkout.

**Suite health**  
*(new section). Keep it short:*  
***Baseline table** for the test suites relevant to your team (the packages or areas you work on, not the whole repository). For each suite: the command or CI workflow, and the test runner's summary line (passed, failed, skipped) at your Sprint 2 release tag (-csci435-s2) and at the end of the sprint. Use CI results where available; if you run tests locally, run only the packages you change.*  
***Failures grouped by cause** (for example: environment-specific, already broken upstream, flaky, caused by our changes), with a link to one issue per cause that lists the affected tests.*  
***No failures introduced by your team**. Any test your team's changes broke must be fixed by the end of the sprint. Pre-existing failures only need to be recorded and grouped; fixing them is optional (and can be a hardening issue).*  
***Skipped tests and disabled CI checks**. Skipping a test or disabling a CI check requires a linked issue and a reason in a code comment.*

\#\# Suite health

\*\*Scope:\*\* These are the suites covering code changed in Sprint 3: \#61 (low-stock threshold), \#62 (low-stock dashboard), \#113 (bundle checkout and returns), plus teammates' \#112 (bundle API) and \#68 (cancel workflow executions). That means the inventory, order, core-flows, js-sdk, medusa and dashboard packages, and the HTTP/module integration specs those issues touched.

\*\*Source:\*\* All runs were local. The fork's GitHub Actions have not run since 2026-08-03, so there are no CI results for either ref (see Disabled CI checks below). Both refs were run with Postgres 16\. \`--bail\` was dropped so every summary covers the full suite.

\| Suite \| Command \| S2 tag (\`v2.17.2-csci435-s2\`) \| End of S3 \|  
\|---\|---\|---\|---\|  
\| Inventory unit / integration \| \`jest\` in \`packages/modules/inventory\` \| 1 / 35 passed \| 1 / 52 passed \|  
\| Order unit / integration \| \`jest\` in \`packages/modules/order\` \| 8 / 83 passed \| 14 / 83 passed \|  
\| Core-flows unit \| \`yarn workspace @medusajs/core-flows test\` \| 96 passed \| 222 passed \|  
\| JS SDK unit \| \`yarn workspace @medusajs/js-sdk test\` \| 31 passed \| 31 passed \|  
\| Medusa unit \| \`yarn workspace @medusajs/medusa test\` \| 140 passed \| 140 passed \|  
\| Dashboard (Vitest) \| \`yarn workspace @medusajs/dashboard test\` \| 186 passed \| 224 passed \|  
\| HTTP: inventory, reservations, cart, workflow-engine \| \`jest \_\_tests\_\_/\<dir\>/\` in \`integration-tests/http\` \| 204 passed \| 229 passed \|  
\| HTTP: product \| same \| 200 passed, 24 skipped \| 242 passed, 24 skipped \|  
\| HTTP: order \| same \| 92 passed, 1 skipped \| 122 passed, 1 skipped \|  
\| Modules: cart \| \`jest \_\_tests\_\_/cart/\` in \`integration-tests/modules\` \| 107 passed \| 107 passed \|

\*\*Failures:\*\* None at either ref. Our changes broke no tests, and passing tests went from 1,183 to 1,488 as new tests were added.

\*\*Skipped tests and disabled checks:\*\* All 25 skipped tests were already skipped upstream. This sprint we added no skips and disabled no CI checks.

**Mutation testing:**  
*Links to each member's D6 file.*  
Nicholas Piombino \- njpiombino  
[https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/62-njpiombino.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/62-njpiombino.md)  
[https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/113-njpiombino.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/113-njpiombino.md)  
Logan Fecko \- lefecko  
[https\://github.com/CSCI-435-SE/medusa/blob/90592107cb1d7a4e15e57c4426b9c05435c3fca9/docs/sprint3/mutation/112-lefecko.md](https://github.com/CSCI-435-SE/medusa/blob/90592107cb1d7a4e15e57c4426b9c05435c3fca9/docs/sprint3/mutation/112-lefecko.md)   
Muhammad Ali \- maali-ux  
[https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/122-maali-ux.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/122-maali-ux.md)  
Alex Grapsas \- angrapsas  
[https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/97-angrapsas.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/97-angrapsas.md)  
[https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/103-angrapsas.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint3/mutation/103-angrapsas.md)

**Hardening issues**  
*Which issues they are and where they came from.*  
[https\://github.com/CSCI-435-SE/medusa/issues/102](https://github.com/CSCI-435-SE/medusa/issues/102)  
We did not complete a hardening issue, however one was opened for full product editing with an atomic backend workflow. This is a hardening issue intended to address technical debt introduced by the initial implementation of full product editing (PR \#79). The existing feature saves changes through multiple sequential API requests rather than a single backend workflow. If a later request fails, earlier changes may have already been saved, leaving the product partially updated.

**Carryovers from Sprint 2 and what changed**  
We have a few issues created in sprint 2 that were not completed this sprint, however those will be targeted in sprint 4\. These issues carried over only due to our backlog having a large number of issues, preventing us from tackling all issues in our backlog.