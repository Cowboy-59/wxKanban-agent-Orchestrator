---
id: cmd-createspecs
part: command-reference
audience: customer
sources: _wxAI/commands/createSpecs.md, mcp-server/src/prompts/createspecs.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /createSpecs

full spec pipeline (capture → specify → clarify → plan → tasks → lifecycle) via the MCP project.create_specs tool.

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/createSpecs` · `wxkanban-agent createspecs` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/cwConversionScope](cmd-cwconversionscope.md) | Suggests it as a next step |
| [/vbConversionScope](cmd-vbconversionscope.md) | Suggests it as a next step |
| [/wxBrainstorm](cmd-wxbrainstorm.md) | Suggests it as a next step |

:::internal
**Read from:** `_wxAI/commands/createSpecs.md`, `mcp-server/src/prompts/createspecs.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`, `project.list_open_items`, `project.validatescope`

:::
