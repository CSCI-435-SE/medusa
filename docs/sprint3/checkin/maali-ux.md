# Sprint 3 Mid-Sprint Check-in — maali-ux

**Note:** Submitted late (Nov 19). Mid-sprint check-in was due Nov 12.

## 1. What have you implemented so far, and what remains?

As of the check-in date (Nov 12) I had not yet claimed an issue for Sprint 3
or begun implementation. This check-in is submitted late (Nov 19). By the
actual deadline I had no code PR open, which does not meet the D7 requirement.
My Sprint 3 implementation (issue #122, PR #123) was completed on Nov 19.

## 2. What is one thing you learned about testing in your project?

I learned that the dashboard test environment has a React 18/19 version
conflict in `@medusajs/design-system/icons` that causes tests rendering
`Thumbnail` to fail with "Objects are not valid as a React child." The
workaround is to stub `Thumbnail` in specs that render product cells.

## 3. What is one risk to finishing your work by Nov 19, and what will you do about it?

The main risk was time — starting the issue late left little margin. I
mitigated it by scoping the issue as small as possible (frontend-only, one
component file, no backend changes) and using Claude Code for mechanical
tasks to move faster.

**PR:** https://github.com/CSCI-435-SE/medusa/pull/123
