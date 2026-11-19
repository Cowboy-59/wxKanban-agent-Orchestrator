---
id: cmd-scopeimport
part: command-reference
audience: internal
sources: _wxAI/commands/scope-import.md
generated: true
---

# /scope-import

> **Not in the Customer edition.** Retired: no live caller.

Scan all specs/NNN-* directories, create missing scaffold stubs, and sync every tasks.md task into PostgreSQL via the wxKanban MCP server

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/scope-import` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-pipeline](cmd-wxaipipeline.md) | Runs it as one of its steps |
| [/wxAI-plan](cmd-wxaiplan.md) | Runs it as one of its steps |
| [/wxAI-tasks](cmd-wxaitasks.md) | Runs it as one of its steps |

## What calls it

None.

**Read from:** `_wxAI/commands/scope-import.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-pipeline, /wxAI-plan, /wxAI-tasks
