**Team**  
*Team name; member names and GitHub usernames; project name and repository link*  
Project: Medusa  
Repo: [https\://github.com/CSCI-435-SE/medusa](https://github.com/CSCI-435-SE/medusa)  
Team Perseus:

- Nicholas Piombino \- njpiombino  
- Logan Fecko \- lefecko  
- Muhammad Ali \- maali-ux  
- Alex Grapsas \- angrapsas

**Sprint overview**  
*Brief narrative: what the team set out to do and what was actually delivered. Be honest about scope changes*  
The team worked on a lot of quality of life issues for store admins. Some issues were extensions of existing standards and functionality, including CSV import for promotions and edit access. We also added functionality for duplicating both products and promotions. Further, a new guard was added to prevent an incorrect product id to be provided upon product variant deletion. Additional admin functionality to allow failed workflows to be kept and configure how long they are kept. We once again did not focus on fixing issues with tests, which has been an intent of ours for a while but has not made it to the backlog yet.

**Sprint 1 carryovers**  
*Brief section on Sprint 1 carryovers and what changed*  
We continued with having an early meeting to refine, point, and assign issues this sprint, which was very helpful for beginning our work early in the sprint. We were not able to have an additional meeting during the final week, however this was counteracted by the team completing issues earlier and reviewing each others’ issues earlier than our previous sprints. Although we did not do much design work, we were able to do a lot of our intended work regarding admin features and functionality. Also, Issue \#41 (promotion CSV import) was carried over from Sprint 1, where it was claimed by Muhammad, and was taken over and completed by Alex in Sprint 2\. Issue \#17 (CSV export for customers) was carried over from Sprint 1 and completed by Muhammad in Sprint 2 with PR \#35. Issues \#70 and \#73 were closed without changes because the tracking number and tracking link were already shown in the order's fulfillment section.

**Sprint backlog**  
*Link to the Sprint 2 GitHub Milestone; table of issues (title, owner, estimated points, scope, status)*  
Milestone: [https\://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+2%22](https://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+2%22)  
Issue backlog: [https\://github.com/CSCI-435-SE/medusa/issues](https://github.com/CSCI-435-SE/medusa/issues)  
Sprint 2 issues:

| Title | Owner | Estimated Points | Scope | Status |
| :---- | :---- | :---- | :---- | :---- |
| Add import promotions from csv file \#41 | Alex Grapsas | 5 | Medium | Done |
| Enforce product ID when deleting a product variant \#59 | Nicholas Piombino | 5 | Medium | Done |
| Keep failed and reverted workflow executions by default \#66 | Nicholas Piombino | 5 | Medium | Done |
| Let stores configure how long failed workflow executions are kept \#67 | Nicholas Piombino | 2 | Small | Done |
| Add Edit Product button to allow full product editing  \#8 | Logan Fecko | 5 | Medium | Done |
| Duplicate a product \#65 | Logan Fecko | 5 | Medium | Done |
| Handle inventory errors distinctly when completing a cart \#58 | Alex Grapsas | 5 | Medium | Done |
| Duplicate a promotion \#63 | Alex Grapsas | 2 | Small | Done |
| Add CSV export for customers \#17 | Muhammad Ali | 3 | Small | Done |
| \#29a: Add tracking number field to order detail view \#70 | Muhammad Ali |  | Small | Closed (already implemented) |
| \#29b: Add carrier name to order detail view \#71 | Muhammad Ali |  | Small | Done |
| \#29c: Add tracking status badge to order detail view \#72 | Muhammad Ali |  | Small | Done |
| \#29d: Add clickable tracking link to carrier website \#73 | Muhammad Ali |  | Small | Closed (already implemented) |

**Requirements & design**	  
*Were specs complete before coding started? Any surprises? Key design decisions and brief rationale*  
Specs were completed before any code started for each issue. We also ensured that we clarified any questions over the specs before implementation, using a mix of comments/questions in the issue and team discussions.   
One design decision encountered was for issue \#67: whether changing the option affects runs that are already kept. Each row's retention was fixed when the run finished. After someone lowered the option from 7 days to 1, runs kept before the restart still lasted 7 days. The scenario said "failed executions now disappear after a day," which suggests the old rows change too. Making them change would mean changing the cleanup, and the issue lists that as out of scope. Therefore, we decided to stick with applying the new retention time to new failures only.  
Another design decision encountered was for issue \#8: how to save the full product editing. The decision was made to save changes in a sequence of calls, rather than building a new backend workflow to save all in one request. This could cause minor issues if a downstream save fails, but we decided that a new workflow would be out of scope and thus could be left for a future sprint.  
For issue \#58, the decision was how the complete cart route should recognize an out of stock error. The error is NOT\_ALLOWED, the same type as the promotion limit error, so adding that type to the list of errors that return the cart would have caught both. Instead, the existing INSUFFICIENT\_INVENTORY code was added to the inventory error, and the route checks for that code.

**Completed issues**  
*Table: issue title, issue owner, all associated PRs (PR link, author, reviewer(s), status), brief description of changes*

| Title | Owner | PR Link | PR Author | PR Review | PR Status | Description |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Add promotion CSV import \#84 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/84 | angrapsas | njpiombino | Done | Adds an Import button and drawer on the promotions list with a template download. Each row creates one promotion with its rules. Every row is checked first, and if any row is invalid nothing is created and the drawer lists the failing rows by row number. |
| Add Edit Product Button to Allow Full Product Editing \#79 | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/79 | lefecko | njpiombino | Done | Introduces a button on the products detail page that allows for full product editing at the same time. |
| Feat/issue 65 duplicate product \#82 | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/82 | lefecko | njpiombino | Done | Adds a "Duplicate" action for products (closes \#65). From the product detail page or a product list row menu, an admin opens a drawer that asks for a title and handle, pre-filled with \<title\> (Copy) and \<handle\>-copy. Submitting creates a copy and redirects to it with a success toast. The original is unchanged. |
| Implement product id enforcement when deleting a product variant- \#77 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/77 | njpiombino | lefecko | Done | Modifies DELETE /admin/products/:id/variants/:variant\_id to now check that the variant belongs to the product in the URL before deleting it. |
| Implement keep failed and reverted executions- \#80 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/80 | njpiombino | lefecko | Done | Both workflow engines now keep failed and reverted workflow executions for 7 days by default, instead of deleting them as soon as they finish. Store managers can open them in Settings \> Workflows and see which step failed and what was rolled back. |
| Implement configurable workflow expiration- \#86 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/86 | njpiombino | lefecko | Done | Both workflow engines accept a new failedExecutionRetentionTime module option, in seconds. It sets how long failed and reverted executions are kept, or turns keeping them off. |
| Return cart with inventory errors when completing a cart \#83 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/83 | angrapsas | lefecko | Done | When completing a cart fails because an item ran out of stock, the store API now returns a 200 with the cart and the error, the same as payment errors, instead of a 400 with no cart. The storefront can show which item is out of stock and let the shopper remove it.  |
| Add duplicate action for promotions \#85 | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/85 | angrapsas | njpiombino | Done | Adds a Duplicate action to the promotions list row menu and the promotion detail page. A drawer asks for a new code, and the copy keeps the original's settings and rules but starts as a draft with a usage count of 0 and no campaign.  |
| feat: add CSV export for customers (\#17) \#35 | Muhammad Ali | https\://github.com/CSCI-435-SE/medusa/pull/35 | maali-ux | lefecko | Done | Adds CSV export for customers, so store managers can download customer data from the customers list in the admin dashboard. |
| feat: add carrier name and tracking status to shipments (\#71, \#72) \#89 | Muhammad Ali | https\://github.com/CSCI-435-SE/medusa/pull/89 | maali-ux | angrapsas | Done | Adds carrier name and tracking status fields to the shipment form and shows them in the order's fulfillment section, with the status as a colored badge. Also fixes the shipment workflow dropping the metadata it was given. |

**Test strategy**  
*What kinds of tests were written? Were there changes you couldn't test automatically? Why?*  
This sprint included HTTP tests because there were features that only touched the API implemented. Unit tests and integration tests were similarly written for new features. All changes were able to be tested automatically.

**AI tool usage**  
*Per member: tools used, sessions logged, link to AI log folder. Notable patterns vs. Sprint 1*  
Nicholas Piombino \- claude code, logged with SpecStory, 6 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/njpiombino](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/njpiombino)  
I used a similar pattern of using claude code to evaluate different design patterns and tradeoffs that can be used to implement the fix. Further, I used claude code before and after implementing the issue to evaluate the description and AC, as well as clean up and test edge cases. Adding these extra steps ensured my PR started in better shape, with consistently less fixes needed for my PRs than past sprints.  
Logan Fecko \- claude code, logged with SpecStory, 8 sessions  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/lefecko](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/lefecko)   
For PR review, I’m using the built in medusa /review-PR command more and more, as it is quite accurate, saves time, and then all I have to do is take a quick look at the diff before drawing up my review. For issues, I’m putting a greater emphasis on a planning stage, making sure I talk through everything with Claude before implementing in manual approval mode.  
Alex Grapsas \- Claude Code, logged with SpecStory, 1 session. [https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/angrapsas](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/angrapsas)  
Compared to Sprint 1, I kept all three issues in one long session instead of one per issue, since \#41 and \#63 both worked on promotions and shared a lot of the same code. I had it walk through the code before writing each design section, which showed me the out of stock error in \#58 came from the inventory module and not from confirm-inventory.ts like I first thought. I also had it run the tests before and after each fix, which caught that my \#58 change broke two reservation tests I would have missed.  
Muhammad Ali \- Claude (claude.ai chat) alongside Claude Code, 1 session logged.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/maali-ux](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint2/maali-ux)  
Compared to Sprint 1, where I only used the claude.ai chat, I used the chat together with Claude Code this sprint. I used the chat to plan and explain things, pasted Claude Code's output into it, and ran some of the search commands myself in WSL to save tokens. Before writing any code, I used it to look at how the order page already handles tracking, which showed the tracking number (\#70) and the clickable tracking link (\#73) were already implemented. So I closed those two and focused on the carrier name and tracking status (\#71, \#72).

**Deliverables summary**  
*Include entries for the UML diagrams (D6) and the mid-sprint check-in (D7)*

| Name | UML | Mid-sprint check-in |
| :---- | :---- | :---- |
| Nicholas Piombino | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-class.mmd](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-class.mmd) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-class.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-class.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-sequence.mmd](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-sequence.mmd) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-sequence.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino-sequence.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/59-njpiombino.md) | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/njpiombino.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/njpiombino.md) |
| Logan Fecko | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko-class.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko-class.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko-sequence.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko-sequence.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/8-lefecko.md)  | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/lefecko.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/lefecko.md)  |
| Alex Grapsas | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-class.puml](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-class.puml) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-class.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-class.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-sequence.puml](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-sequence.puml) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-sequence.png](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas-sequence.png) [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/diagrams/58-angrapsas.md)  | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/angrapsas.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/angrapsas.md)  |
| Muhammad Ali |  | [https\://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/maali-ux.md](https://github.com/CSCI-435-SE/medusa/blob/develop/docs/sprint2/checkin/maali-ux.md) |

**Release**  
*Tag name and link to the Sprint 2 release on GitHub*  
v2.17.2-csci435-s2  
[https\://github.com/CSCI-435-SE/medusa/releases/tag/v2.17.2-csci435-s2](https://github.com/CSCI-435-SE/medusa/releases/tag/v2.17.2-csci435-s2)

**Risks and retrospective**  
*What went well? What slowed you down? What would you do differently in Sprint 3?*  
Having the mid-sprint check-in was helpful in setting an earlier deadline to keep us prepared throughout the sprint. We once again had a meeting in the beginning of the sprint to refine issues, point issues, and assign issues. This meeting was extremely helpful in getting the team together and in sync with each other, and we plan on continuing this in future sprints. We did lose a member, which caused us to face some difficulties with taking over the affected issues. We were also slowed down by the new tech showcase, which took a lot of time away from the beginning of the sprint, and the sprint 1 lightning talk. Hopefully in sprint 3 we work on the new tech showcase as a team as early as possible to get it out of the way.

**Sprint 3 plan**  
*Initial ideas for Sprint 3; any Sprint 2 issues to carry over*  
Although we made some extra issues in sprint 2, we will need a few more. I plan on making a few more issues for the sprint, including issues for duplicating items similar to the ones we implemented in sprint 2\. We should also make some bugs for our broken tests, which we’ve been putting off for the past few sprints. A couple issues that were completed lend themselves to new issues, like a full backend workflow to resolve the design decision made on issue \#8.