---
id: cmd-cwconversion
part: command-reference
audience: customer
sources: _wxAI/commands/cwConversion.md, _wxAI/skills/cwConversion/SKILL.md, mcp-server/src/prompts/cwconversion.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /cwConversion

Convert a legacy SoftVelocity / PCSoft Clarion desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its raw source (TXA/TXD/.clw) — per-element Markdown, regenerated stack-native windows…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/cwConversion` · `wxkanban-agent cwconversion` |
| **Stage** | Conversion |

## How to run it

```text
/cwConversion --txa conversion/<path><App>.txa --txd conversion/<path><App>.txd --clw "conversion/<path>*.clw"
/cwConversion --clw "conversion/<path>*.clw"     # generated-source-only handover
```

## What it calls

| Command | How |
|---|---|
| [/cwConversionScope](cmd-cwconversionscope.md) | Runs it as one of its steps |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/cwConversionScope](cmd-cwconversionscope.md) | Runs it as one of its steps |
| [/vbConversion](cmd-vbconversion.md) | Mentions it as related |
| [/wxConversionParity](cmd-wxconversionparity.md) | Mentions it as related |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/cwConversion.md`, `_wxAI/skills/cwConversion/SKILL.md`, `mcp-server/src/prompts/cwconversion.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
