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
The team set out to make changes that impacted store owners, allowing them to have an expanded list of capabilities, while also looking to parody capabilities across the admin store that existed in one section but not others. This included a dashboard, which shows summary statistics for the store upon login. In addition, we gave the customer new features to make more purchases with more convenience. For example, we gave the customers the ability to purchase an item as a recurring purchase, as well as allowing the customer to see and purchase suggested items that are recommended based off of the category of their current purchase.  
Additionally, work was begun on a CSV export feature for customers, giving store managers the ability to extract customer data directly from the admin dashboard.

**Sprint backlog**  
*Link to the Sprint 1 GitHub Milestone; table of issues (title, owner, estimated points, scope, status)*  
Milestone: [https\://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+1%22](https://github.com/CSCI-435-SE/medusa/issues?q=milestone%3A%22Sprint+1%22)  
Issue backlog: [https\://github.com/CSCI-435-SE/medusa/issues](https://github.com/CSCI-435-SE/medusa/issues)  
Sprint 1 issues:

| Title | Owner | Estimated Points | Scope | Status |
| :---- | :---- | :---- | :---- | :---- |
| Suggest Purchases Upon Checkout \#37 | Nicholas Piombino | 3 | Medium | Done |
| Suggest Relevant Related Items During Checkout \#38 | Nicholas Piombino | 3 | Medium | Done |
| Add Product Subscriptions \#6 | Nicholas Piombino | 5 | Medium | Done |
| Add Business Analytics to Medusa Admin Dashboard Home Page \#42 | Logan Fecko | 3 | Medium | Done |
| Add time interval sorting to sales analytics overview in the admin dashboard home page \#30 | Logan Fecko | 3 | Medium | Done |
| Add CSV export for customers \#17  | Muhammad Ali | 3 | Small | In progress |
| Add import promotions from CSV file \#41  | Muhammad Ali | 5 | Medium | In progress |
| Show customer groups on the customers list \#32  | Alex Grapsas | 2 | Small | Done |
| Add import customers from csv file \#40          | Alex Grapsas | 5 | Medium | Done |
| Add import inventory from csv file \#11  | Alex Grapsas | 5 | Medium | Done |

**Requirements & design**	  
*Were specs complete before coding started? Any surprises? Key design decisions and brief rationale*  
Specs were complete for each story that was claimed before development began on that story. We ran into a couple of issues regarding the scope of some stories, largely in regards to what should be included in the implementation.  
We made the decision that although we could not directly alter the customer’s view of the store, we decided that we would make changes to what the admin is able to provide to the customers. For example, the admin is able to decide whether or not the customer is able to purchase a product with a subscription, and separately designed a feature for allowing the customer to see similar products to the ones in their cart. This is because we want to be able to give the customer more abilities to make transactions, benefitting both the customer and the store owner. We decided that this could be implemented by both enabling the customer to make additional purchases as well as giving the owner the ability to set up future purchases through subscriptions.

**Completed issues**  
*Table: issue title, issue owner, all associated PRs (PR link, author, reviewer(s), status), brief description of changes*

| Title | Owner | PR Link | PR Author | PR Review | PR Status | Description |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Feat/issue 37 suggest purchases \#43 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/43 | njpiombino | lefecko | Done | Storefronts can show a checkout upsell without writing their own selection logic. This is also the base for the blocked category-based suggestions story. The feature allows store owners to provide suggested purchases to customers, encouraging customers to find and make more purchases. |
| Feat/issue 38 relevant suggestions \#46 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/46 | njpiombino | lefecko | Done | Suggestions are more relevant to what the customer is buying. The shipping check also closes a gap from \#37, where a suggestion could be added to the cart but couldn't be checked out in the customer's region. Now suggests the top-selling product from the categories of the products in the cart, instead of the top seller across the whole catalog. |
| Feat/issue 6 product subscriptions \#48 | Nicholas Piombino | https\://github.com/CSCI-435-SE/medusa/pull/48 | njpiombino | lefecko | Done | Customers can buy a product variant as a recurring subscription (weekly, monthly or yearly), and Medusa places and charges a renewal order at each interval. Store managers can sell products on a schedule without customers placing a new order each time. |
| Feat/issue \#42 add business analytics to admin dashboard | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/45 | lefecko | njpiombino | Done | Adds analytics to admin dashboard: total revenue, total order count, and top-selling products. Store managers can now see stats more at a glance |
| Feat/issue \#30 add time interval to sales dashboard | Logan Fecko | https\://github.com/CSCI-435-SE/medusa/pull/49 | lefecko | angrapsas | Done | Builds upon \#42, adding a time interval to the analytics dashboard. Adds an option for Last 7 days, 30 days, 3 months, and 12 months, and a custom range up to 1 year.  |
| Show customer groups on the customers list | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/51 | angrapsas | lefecko | Done | Adds a Groups column to the customers list showing up to two group names and "+ N more" with a tooltip, and fixes the group detail page to show 0 instead of "-" for an empty group.  |
| Add customer CSV import | Alex Grapsas | https\://github.com/CSCI-435-SE/medusa/pull/52 | angrapsas | njpiombino | Done | Adds an Import button and drawer on the customers list with a template download. A new route checks every row and creates all customers in one workflow call, or none if any row fails, listing each failing row.  |
| Add inventory CSV import | Alex Grapsas | [https\://github.com/CSCI-435-SE/medusa/pull/53](https://github.com/CSCI-435-SE/medusa/pull/53) | angrapsas | lefecko | done | Same approach as the customer import for inventory items, including stocked quantity at a named stock location.  |

**Test strategy**  
*What kinds of tests were written? Were there changes you couldn't test automatically? Why?*  
This sprint included more HTTP tests because there were more api features implemented. Unit tests and integration tests were similarly written for new features. All changes were able to be tested automatically.

**AI tool usage**  
*Per member: tools used, sessions logged, link to AI log folder. Notable patterns vs. Sprint 0*  
Nicholas Piombino: Claude Code, logged with SpecStory, 5 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint1/njpiombino](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint1/njpiombino)  
I wanted to challenge myself to get better at using agentic tools such as Claude Code for this sprint, so I decided to use Claude Code to assist me with the bigger issues I implemented this sprint. I had a more consistent approach, using Claude Code to plan out changes and scope before any code was touched. However, I tried something different from last sprint by attempting to reason with Claude Code to discuss different implementation approaches, which was especially helpful for bigger issues. I walked through the pros and cons of different possibilities to find the one I felt best suited the project and the AC. I also tried to reason through more possible points of failure after completing development to see if any further improvements could be made before making the PR.

Alex Grapsas: Claude Code, logged with SpecStory. 4 sessions, https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint1/angrapsas. Compared to Sprint 0, I used separate sessions per issue plus a planning session, and ran some in parallel in separate git worktrees. I located the code myself first and used AI to check my understanding. I also caught AI mistakes before they landed, such as a validation rule that went beyond the spec and would have rejected valid decimal weights.

Logan Fecko: Claude Code, logged with SpecStory. 6 sessions.  
[https\://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint1/lefecko](https://github.com/CSCI-435-SE/medusa/tree/develop/ai-logs/sprint1/lefecko)   
Last sprint, I didn’t trust the agentic agent as much. This time around, I was much busier and looking for efficiency, so I used claude code quite a bit more. The biggest change was using the built in PR review feature that is outlined in the claude docs maintained by medusa. This made review a lot easier, giving me an overview before I dove into the code diffs. As far as the bigger features went, I still put on the safe mode, approving all the changes one at a time. I feel this helps me understand the changes as they are happening, rather than just when I’m writing the PR for a feature.

Muhammad Ali: Claude (claude.ai chat interface), 1 session.   
Used Claude to understand reviewer feedback on PR \#35, plan fixes across the SDK, UI, translation, and test layers, and to understand patterns established by teammates' PRs. Given my limited practical software engineering background, I used Claude to bridge the gap between understanding what needed to be done conceptually and how to actually implement it in an unfamiliar TypeScript monorepo. Rather than having Claude generate code directly, I used it to explain each layer of the codebase in plain terms, verify my own understanding before committing to changes, and plan a step-by-step implementation approach I could execute myself. AI log to be added   
to repo upon PR completion.

**Release**  
*Tag name and link to the Sprint 1 release on GitHub*  
v2.17.2-csci435-s1  
https\://github.com/CSCI-435-SE/medusa/releases/tag/v2.17.2-csci435-s1

**Risks and retrospective**  
*What went well? What slowed you down? What would you do differently in Sprint 2?*  
One of the things that seemed to go a lot better was having a more structured team setup. Nicholas took the lead, as he is taking the grad version of the class and this led to more streamlined work. He led our meeting where we assigned story points and delegated tasks for the sprint. We have some other students taking the grad version, so they might take the lead in the future.

Similarly to sprint 1, we were slowed down by other work. I think that the midterm season played an especially large role in this. I think this was partially mitigated by slight increases in team communication and everyone having more familiarity with the flow of a sprint.

I think in sprint 2 we will keep the team structure, whether that be with Nicholas as our leader or someone else. Hopefully, as midterms are ending, people will be able to start work earlier. We also held meetings which was a success, but we weren’t able to get everyone to the same meeting due to schedule conflicts.

**Sprint 2 plan**  
*Initial ideas for Sprint 2; any Sprint 1 issues to carry over*  
For Sprint 2, ideally we keep a similar meeting schedule to this sprint, however maybe with an additional one on the last week, which is something we missed this sprint. In regards to the issues for Sprint 2, we still have a few in the backlog, including additional admin capabilities for editing product information and workflow changes. New ideas and focuses for Sprint 2 might include new admin functionality such as additional features to customize the customer experience. Maybe additional work on the design of the dashboard, since it’s a bit bland.