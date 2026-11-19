---
id: cmd-cwconversionscope
part: command-reference
audience: customer
sources: _wxAI/commands/cwConversionScope.md, _wxAI/skills/cwConversionScope/SKILL.md, mcp-server/src/prompts/cwconversionscope.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /cwConversionScope

Generate Scope-of-Project documents from a Clarion app already converted by /cwConversion — acting as a Systems & Business Analyst, one scope per window/report plus overall Program, Database, and Backend/API scopes, B…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/cwConversionScope` · `wxkanban-agent cwconversionscope` |
| **Stage** | Conversion |

## How to run it

```text
/cwConversionScope            # resume or start scope generation over the converted artifacts
/cwConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## What it calls

| Command | How |
|---|---|
| [/cwConversion](cmd-cwconversion.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Suggests it as a next step |
| [/createSpecs](cmd-createspecs.md) | Suggests it as a next step |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Mentions it as related |
| [/wxConversionScope](cmd-wxconversionscope.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/cwConversion](cmd-cwconversion.md) | Runs it as one of its steps |
| [/vbConversionScope](cmd-vbconversionscope.md) | Mentions it as related |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/cwConversionScope.md`, `_wxAI/skills/cwConversionScope/SKILL.md`, `mcp-server/src/prompts/cwconversionscope.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
