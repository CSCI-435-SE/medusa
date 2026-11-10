# Ponytail

- **Tool:** [ponytail](https://ponytail.dev)
  ([github.com/DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)),
  MIT license
- **Used with:** Claude Code (also works with Codex, Copilot CLI, Gemini CLI)
- **Tutorial video:** [Watch on YouTube](TODO: add final video link)

## The problem

AI coding agents over-engineer. Ask Claude Code to add a date picker and
it may add a full library, a stylesheet, and timezone handling — when a
plain `<input type="date">` already works. The result is more code to
review, more dependencies to maintain, and higher API costs. A one-off
prompt like "keep it simple" works once; Ponytail applies the same standard
automatically on every turn.

## Why this tool

Ponytail injects a ruleset that makes the agent follow a decision ladder:
use the stdlib, use a native platform feature, reuse existing project code,
before writing anything new. It does not tell the AI how to write better
code — it tells the AI when not to write code at all.

**Published benchmark results (Ponytail's own repo, FastAPI + React):**
- 54% less code on average
- 27% faster
- 20% lower API cost
- Safety kept: validation, error handling, and security are never
  simplified away

<!-- TODO: add any results specific to our Medusa project if available -->

## Setup

```bash
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

The skill is active in every session after install. No config required.

**Key commands:**
- `/ponytail-review` — scan the current diff for over-engineering
- `/ponytail-audit` — scan the whole repo for bloat
- `/ponytail-debt` — log deferred shortcuts so they don't get forgotten

## When to use it

- You use Claude Code to implement features and find yourself deleting
  half of what it generates
- You want lower API costs without changing your workflow
- You want the agent to reuse existing patterns in your codebase

## When not to

- No benefit without an AI coding agent
- May be too aggressive on greenfield projects where new abstractions
  are intentional
- Requires Node.js on your PATH for always-on activation

## Cost

Free and open source (MIT). No account or paid plan needed.