---
id: cmd-vbconversionscope
part: command-reference
audience: customer
sources: _wxAI/commands/vbConversionScope.md, _wxAI/skills/vbConversionScope/SKILL.md, mcp-server/src/prompts/vbconversionscope.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /vbConversionScope

Generate Scope-of-Project documents from a VB6 app already converted by /vbConversion — acting as a Systems & Business Analyst, one scope per form/report plus overall Program, Database, and Backend/API scopes, BuildSc…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/vbConversionScope` · `wxkanban-agent vbconversionscope` |
| **Stage** | Conversion |

## How to run it

```text
/vbConversionScope            # resume or start scope generation over the converted artifacts
/vbConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## What it calls

| Command | How |
|---|---|
| [/vbConversion](cmd-vbconversion.md) | Runs it as one of its steps |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Suggests it as a next step |
| [/createSpecs](cmd-createspecs.md) | Suggests it as a next step |
| [/cwConversionScope](cmd-cwconversionscope.md) | Mentions it as related |
| [/wxConversionScope](cmd-wxconversionscope.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/vbConversion](cmd-vbconversion.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/vbConversionScope.md`, `_wxAI/skills/vbConversionScope/SKILL.md`, `mcp-server/src/prompts/vbconversionscope.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
