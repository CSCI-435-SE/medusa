# AI Log — Sprint 1 — Muhammad Ali (maali-ux)

## Tool
Claude (claude.ai chat interface)

## Session 1 — PR #35 CSV Export for Customers

**Date:** October 8-16, 2026
**Issue:** #17 — Add CSV export for customers
**PR:** #35

### What I used AI for
- Understanding Logan's code review feedback on PR #35
- Learning the four-layer architecture of Medusa (dashboard → SDK → 
  backend routes → workflows)
- Understanding what each missing piece was and why it was needed
- Planning the fixes needed across all layers
- Understanding the difference between frontend and backend in this codebase
- Learning what a hook, SDK method, workflow, and HTTP route are in 
  the context of this project

### What I did myself
- Navigated to the relevant files independently
- Verified understanding of each planned change before approving it
- Wrote D2 (user story, acceptance criteria, user scenario) for issue #17
- Wrote D3 (design decisions) for issue #17
- Located Alex's PR #52 and #53 as reference patterns

### Key decisions I made (not AI)
- Decided to follow Alex's import pattern as the template for the export
- Decided to implement synchronous export for simplicity given small scope
- Decided to export a fixed set of fields matching existing export patterns

### What I learned
- The difference between frontend (dashboard, SDK) and backend 
  (routes, workflows)
- Why the "all or nothing" transactional guarantee matters for exports
- Why coupling matters — my missing SDK method broke the entire feature
- How to read and respond to a code review constructively

### AI patterns vs Sprint 0
In Sprint 0 I vibe-coded PR #35 without understanding what was being 
generated. In Sprint 1 I used Claude to build understanding first, then 
implement with comprehension. I verified each concept by explaining it 
back before moving forward.