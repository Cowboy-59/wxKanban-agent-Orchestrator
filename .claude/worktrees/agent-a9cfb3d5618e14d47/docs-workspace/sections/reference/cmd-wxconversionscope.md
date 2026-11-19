---
id: cmd-wxconversionscope
part: command-reference
audience: customer
sources: _wxAI/commands/wxConversionScope.md, _wxAI/skills/wxConversionScope/SKILL.md, mcp-server/src/prompts/wxconversionscope.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /wxConversionScope

Generate Scope-of-Project documents from a PCSoft app already converted by /wxConversion — acting as a Systems & Business Analyst, one scope per page/report plus overall Program, Database, and Backend/API scopes, Buil…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/wxConversionScope` · `wxkanban-agent wxconversionscope` |
| **Stage** | Conversion |

## How to run it

```text
/wxConversionScope            # resume or start scope generation over the converted artifacts
/wxConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## What it calls

| Command | How |
|---|---|
| [/wxConversion](cmd-wxconversion.md) | Runs it as one of its steps |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxConversion](cmd-wxconversion.md) | Suggests it as a next step |
| [/wxConversionParity](cmd-wxconversionparity.md) | Suggests it as a next step |
| [/cwConversionScope](cmd-cwconversionscope.md) | Mentions it as related |
| [/vbConversionScope](cmd-vbconversionscope.md) | Mentions it as related |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/wxConversionScope.md`, `_wxAI/skills/wxConversionScope/SKILL.md`, `mcp-server/src/prompts/wxconversionscope.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
