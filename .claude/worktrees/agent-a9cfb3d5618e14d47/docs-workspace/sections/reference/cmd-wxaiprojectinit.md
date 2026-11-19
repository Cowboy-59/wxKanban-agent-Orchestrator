---
id: cmd-wxaiprojectinit
part: command-reference
audience: customer
sources: _wxAI/commands/wxAI-project-init.md
generated: true
---

# /wxAI-project-init

Sets up a local directory structure for a wxKanban project by fetching scaffold data

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-project-init` |
| **Stage** | Any stage |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/analyzescope](cmd-analyzescope.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Runs it as one of its steps |
| [/createSpecs](cmd-createspecs.md) | Runs it as one of its steps |
| [/cwConversion](cmd-cwconversion.md) | Runs it as one of its steps |
| [/research](cmd-research.md) | Runs it as one of its steps |
| [/validateScope](cmd-validatescope.md) | Runs it as one of its steps |
| [/vbConversion](cmd-vbconversion.md) | Runs it as one of its steps |
| [/vbConversionScope](cmd-vbconversionscope.md) | Runs it as one of its steps |
| [/wxConversionParity](cmd-wxconversionparity.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Runs it as one of its steps |
| [/cwConversionScope](cmd-cwconversionscope.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |
| [/wxConversionScope](cmd-wxconversionscope.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/wxAI-project-init.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.currentphase`, `project.description`, `project.id`, `project.init`, `project.json`, `project.name`

:::
