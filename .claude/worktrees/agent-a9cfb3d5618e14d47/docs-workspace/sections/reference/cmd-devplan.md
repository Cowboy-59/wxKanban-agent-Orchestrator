---
id: cmd-devplan
part: command-reference
audience: internal
sources: _wxAI/commands/dev-plan.md
generated: true
---

# /dev-plan

> **Not in the Customer edition.** Replaced by /wxG-O-D --roadmap.

dev-plan (deprecated alias, one release) — runs /wxG-O-D --roadmap, which now writes the build roadmap docs/DEVELOPMENT-PLAN.md and its PDF.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/dev-plan` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/help-catalog](cmd-helpcatalog.md) | Mentions it as related |

**Read from:** `_wxAI/commands/dev-plan.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`
