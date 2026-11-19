---
id: cmd-wxconversionparity
part: command-reference
audience: customer
sources: _wxAI/commands/wxConversionParity.md, mcp-server/src/prompts/wxconversionparity.md
generated: true
---

# /wxConversionParity

Audit a BUILT conversion against the original legacy app — what did the rebuild lose?

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxConversionParity` |
| **Stage** | Implementation |

## How to run it

```text
/wxConversionParity            # resume or start the parity audit over the built conversion
/wxConversionParity --restart  # discard saved progress and rebuild the element queue
/wxConversionParity --collect-only [--out <file>]  # unattended single pass; writes a findings file (default docs/brainstorms/analyze/findings/wxConversionParity.json); no questions, no edits
```

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/wxConversionScope](cmd-wxconversionscope.md) | Suggests it as a next step |
| [/cwConversion](cmd-cwconversion.md) | Mentions it as related |
| [/vbConversion](cmd-vbconversion.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/wxConversionParity.md`, `mcp-server/src/prompts/wxconversionparity.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`

:::
