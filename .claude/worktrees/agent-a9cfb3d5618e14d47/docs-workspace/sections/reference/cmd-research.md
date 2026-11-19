---
id: cmd-research
part: command-reference
audience: customer
sources: _wxAI/commands/research.md, mcp-server/src/prompts/research.md
generated: true
---

# /research

Research & PRD generation — landscape research, synthesis, and a phased PRD for a feature.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/research` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |

## What calls it

None.

:::internal
**Read from:** `_wxAI/commands/research.md`, `mcp-server/src/prompts/research.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`

:::
