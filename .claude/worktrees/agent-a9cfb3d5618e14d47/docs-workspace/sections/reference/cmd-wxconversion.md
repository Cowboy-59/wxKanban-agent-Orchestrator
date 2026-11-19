---
id: cmd-wxconversion
part: command-reference
audience: customer
sources: _wxAI/commands/wxConversion.md, _wxAI/skills/wxConversion/SKILL.md, mcp-server/src/prompts/wxconversion.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /wxConversion

Convert a legacy PCSoft WinDev / WebDev app into a modern React + Tailwind + shadcn/ui rebuild scaffold by working FROM its generated technical-documentation PDF — per-element Markdown, regenerated stack-native pages…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/wxConversion` · `wxkanban-agent wxconversion` |
| **Stage** | Conversion |

## How to run it

```text
/wxConversion <path-to-doc.pdf>     # e.g. conversion/docs/WW_Newsletter_Documentation.pdf
```

## What it calls

| Command | How |
|---|---|
| [/wxConversionScope](cmd-wxconversionscope.md) | Suggests it as a next step |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/vbConversion](cmd-vbconversion.md) | Runs it as one of its steps |
| [/wxConversionScope](cmd-wxconversionscope.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Mentions it as related |
| [/cwConversion](cmd-cwconversion.md) | Mentions it as related |
| [/wxConversionParity](cmd-wxconversionparity.md) | Mentions it as related |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/wxConversion.md`, `_wxAI/skills/wxConversion/SKILL.md`, `mcp-server/src/prompts/wxconversion.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
