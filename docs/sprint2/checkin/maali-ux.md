# Mid-Sprint Check-in — Muhammad Ali (maali-ux) — Sprint 2

## 1. What did you implement so far in the sprint, and what remains?

So far in Sprint 2, I have focused primarily on carrying over 
and completing Sprint 1 work. PR #35 (CSV export for customers, 
issue #17) has been significantly improved — I added the missing 
SDK method (sdk.admin.customer.export()), wired the Export button 
into the customers list UI, added translation keys, inline 
comments, a backend route, an exportCustomersWorkflow, and three 
passing integration tests. The feature is now fully functional 
end-to-end: clicking Export generates a CSV and delivers it via 
notification with a download link.

For Sprint 2 specifically, I have claimed issue #41 (CSV import 
for promotions) and broken up large issue #29 (shipment tracking 
status to order detail view) into four smaller sub-issues, 
claiming all four: tracking number field display, carrier name 
display, tracking status badge, and clickable tracking link to 
carrier website. What remains: implementing PR #41 (CSV import 
for promotions) following Alex's customer import pattern (PR #52), 
implementing the four shipment tracking sub-issues, and getting 
PR #35 re-reviewed and merged by Logan.

## 2. What is one thing you learned about the codebase or about 
software engineering practice?

The most important thing I learned is how a layered architecture 
works in practice. Medusa separates concerns across four layers: 
the Dashboard (React UI), the JS SDK (HTTP bridge), Backend Routes 
(REST API), and Workflows (business logic). Each layer only 
communicates with the layer directly below it — the dashboard 
never touches the database, and the route never contains business 
logic.

This became concrete when I fixed PR #35. My original submission 
was missing the SDK method, which meant the UI had nothing to 
call — a tight coupling problem that broke the entire feature. 
Understanding the layered architecture let me systematically 
identify and fix each missing piece. I also learned the difference 
between synchronous and asynchronous operations: the export uses 
HTTP 202 and a background workflow because it could involve 
thousands of records, while import is synchronous because the 
file size is bounded and immediate error feedback is needed.

## 3. What is one thing you would do differently?

I would write the D2 specification and D3 design decisions before 
touching any code. In Sprint 1, I submitted PR #35 without a 
complete spec or a clear understanding of the codebase 
architecture. The result was a vibe-coded submission that Logan's 
review gave a 3/10 overall — missing the SDK method, unreachable 
component, missing translation keys, no tests, and no inline 
comments.

In Sprint 2, I am applying the spec-first approach: understanding 
which files need to change and why before writing any code, 
verifying each AI-suggested change against existing patterns, and 
ensuring tests are written alongside the implementation. I would 
also engage earlier in the sprint rather than catching up at the 
deadline. Earlier engagement means more time for code review 
iterations and less pressure on teammates to review last-minute 
PRs.