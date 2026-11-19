---
id: cmd-buildstack
part: command-reference
audience: customer
sources: _wxAI/commands/buildstack.md
generated: true
---

# /buildstack

Update the project's Stack & Style document (stack.md) from VS Code — a guided, default-first interview that revises the target stack and look-and-feel, then persists the ProjectStack document.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/buildstack` |
| **Stage** | Design |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxCreateTestPlan](cmd-wxcreatetestplan.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Mentions it as related |
| [/createSpecs](cmd-createspecs.md) | Mentions it as related |
| [/cwConversion](cmd-cwconversion.md) | Mentions it as related |
| [/implement](cmd-implement.md) | Mentions it as related |
| [/vbConversion](cmd-vbconversion.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/buildstack.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.upsert_document`

:::
