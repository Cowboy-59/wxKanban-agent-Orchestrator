---
id: cmd-vbconversion
part: command-reference
audience: customer
sources: _wxAI/commands/vbConversion.md, _wxAI/skills/vbConversion/SKILL.md, mcp-server/src/prompts/vbconversion.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /vbConversion

Convert a legacy Visual Basic 6 (Classic VB) desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its text source (.vbp/.frm/.bas/.cls/.ctl) — per-element Markdown, regenerated forms (bou…

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/vbConversion` · `wxkanban-agent vbconversion` |
| **Stage** | Conversion |

## How to run it

```text
/vbConversion --vbp conversion/<path><App>.vbp        # follows the .vbp's form/module list
/vbConversion --src "conversion/<path>*"              # no .vbp — glob the source files
```

## What it calls

| Command | How |
|---|---|
| [/vbConversionScope](cmd-vbconversionscope.md) | Runs it as one of its steps |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/wxConversion](cmd-wxconversion.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |
| [/cwConversion](cmd-cwconversion.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/vbConversionScope](cmd-vbconversionscope.md) | Runs it as one of its steps |
| [/wxConversionParity](cmd-wxconversionparity.md) | Mentions it as related |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/vbConversion.md`, `_wxAI/skills/vbConversion/SKILL.md`, `mcp-server/src/prompts/vbconversion.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_command_prompt`

:::
