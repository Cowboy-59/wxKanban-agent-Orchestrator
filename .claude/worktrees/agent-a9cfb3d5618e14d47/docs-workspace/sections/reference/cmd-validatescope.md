---
id: cmd-validatescope
part: command-reference
audience: customer
sources: _wxAI/commands/validateScope.md, mcp-server/src/prompts/validatescope.md
generated: true
---

# /validateScope

Validate Scope of Project documents against wxKanban quality criteria

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/validateScope` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxBrainstorm](cmd-wxbrainstorm.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/validateScope.md`, `mcp-server/src/prompts/validatescope.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`, `project.validatescope`

**Points at retired commands:** /wxAI-pipeline

:::
