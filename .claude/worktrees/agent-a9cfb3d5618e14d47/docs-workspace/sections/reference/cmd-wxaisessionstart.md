---
id: cmd-wxaisessionstart
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-session-start.md
generated: true
---

# /wxAI-session-start

> **Not in the Customer edition.** Retired: no live caller.

Run at the start of every AI session — checks governance version, scope context, and unlinked TODOs

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-session-start` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |

## What calls it

None.

**Read from:** `_wxAI/commands/wxAI-session-start.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`, `project.mcp_health`
