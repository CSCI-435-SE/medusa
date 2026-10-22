# Sprint 2 Mid-Sprint Check-in - angrapsas

## What did you implement so far in the sprint, and what remains?

So far this sprint has mostly been planning for me instead of code. I broke down my two large issues from last sprint. #16 turned into #66 (medium) and #67 (small), and #23 turned into #68 and #69, which are both medium. While I was looking through the workflow engines to split #16, I found out they already have a cleanup job that deletes old executions, so the issue ended up being smaller than I originally wrote it. Nicholas has already picked up #66 and #67. I also got my customer and inventory imports from Sprint 1 running locally so I could take screenshots and get my part of the Lightning Talk ready.

What's left is the actual implementation. I'm taking #41 (promotion CSV import), #58 (handle inventory errors when completing a cart) and #63 (duplicate a promotion). I'm starting with #41 since it can reuse the same import setup I built for customers and inventory, then #63, then #58.

## What is one thing you learned about the codebase or about software engineering practice?

I learned how Medusa decides whether a workflow runs right away or in the background. It's the same workflow engine either way. The product import marks a couple of its steps as async, so the workflow pauses there and the route sends back a response right away. Then a separate confirm route picks it back up and the rest gets processed in the background. My imports don't have any async steps, so the route just waits for the whole thing to finish, and since everything gets created in one database transaction, it either all goes in or nothing does.

The bigger thing I learned is that you really have to read the code before you trust an issue's scope. Last sprint #32 turned out to already exist, and this sprint #16 was smaller than I wrote it because the cleanup was already there. Both times I only figured that out by actually looking at the code.

## What is one thing you would do differently?

I would claim my issues right at the start of the sprint instead of halfway through. Last sprint pretty much all of my coding, reviews and merges happened in the last couple days, and I'm kind of doing the same thing again. I spent the first half of this sprint on planning and the presentation, and I'm only now picking up the issues I'm actually going to implement.

Claiming them earlier would have given me time to get my specs looked at before I started coding, which I mostly did late last sprint. It would also give my teammates more time to review instead of me asking for approvals on the day it's due. For the rest of this sprint I'm going to update the specs on #41, #58 and #63 and get someone to look at them before I start, and try to get my first PR up early enough that there's time to fix whatever comes up in review.
