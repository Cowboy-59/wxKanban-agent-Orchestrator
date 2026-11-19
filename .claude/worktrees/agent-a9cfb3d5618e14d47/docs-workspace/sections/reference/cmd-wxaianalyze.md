---
id: cmd-wxaianalyze
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-analyze.md
generated: true
---

# /wxAI-analyze

> **Not in the Customer edition.** Replaced by /createSpecs and /analyzescope.

Perform a non-destructive cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md after task generation.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-analyze` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-tasks](cmd-wxaitasks.md) | Runs it as one of its steps |
| [/wxAI-implement](cmd-wxaiimplement.md) | Suggests it as a next step |
| [/wxAI-plan](cmd-wxaiplan.md) | Suggests it as a next step |
| [/wxAI-specify](cmd-wxaispecify.md) | Suggests it as a next step |

## What calls it

| Command | How |
|---|---|
| [/analyzescope](cmd-analyzescope.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-analyze.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-tasks, /wxAI-implement, /wxAI-plan, /wxAI-specify
