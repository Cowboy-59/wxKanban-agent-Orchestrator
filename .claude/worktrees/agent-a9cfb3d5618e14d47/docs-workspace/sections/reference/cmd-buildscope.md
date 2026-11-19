---
id: cmd-buildscope
part: command-reference
audience: customer
sources: _wxAI/commands/buildscope.md, mcp-server/src/prompts/buildscope.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /buildscope

Interactive agent for building Scope of Project markdown files with proper structure and wxKanban integration.

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/buildscope` · `wxkanban-agent buildscope` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxBrainstorm](cmd-wxbrainstorm.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/cwConversionScope](cmd-cwconversionscope.md) | Suggests it as a next step |
| [/vbConversionScope](cmd-vbconversionscope.md) | Suggests it as a next step |

:::internal
**Read from:** `_wxAI/commands/buildscope.md`, `mcp-server/src/prompts/buildscope.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.buildscope`, `project.create_specs`, `project.get_command_prompt`, `project.help`, `project.search_capabilities`, `project.validatescope`

**Points at retired commands:** /wxAI-pipeline

:::
