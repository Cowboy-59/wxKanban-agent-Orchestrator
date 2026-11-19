---
id: cmd-analyzescope
part: command-reference
audience: customer
sources: _wxAI/commands/analyzescope.md, mcp-server/src/prompts/analyzescope.md
generated: true
---

# /analyzescope

Audit one scope doc (holes, ambiguity, internal contradictions) or all scopes (cross-scope conflicts), and persist a findings report.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/analyzescope` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/scope-flow-map](cmd-scopeflowmap.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/analyzescope.md`, `mcp-server/src/prompts/analyzescope.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`, `project.upsert_document`

**Points at retired commands:** /wxAI-analyze

:::
