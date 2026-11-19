---
id: cmd-wxuiuxcodereview
part: command-reference
audience: customer
sources: .claude/skills/wxUIUXCodeReview/SKILL.md, _wxAI/commands/wxUIUXCodeReview.md, mcp-server/src/prompts/wxuiuxcodereview.md
generated: true
---

# /wxUIUXCodeReview

Combined code + UI/UX review of a diff, PR, branch, the current changes, or a whole codebase (--audit) — targeted at the stack declared in stack.md, not wxKanban's defaults.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxUIUXCodeReview` |
| **Stage** | Implementation |

## How to run it

```text
/wxUIUXCodeReview --audit                                   # review a whole codebase one surface at a time
/wxUIUXCodeReview --audit --collect-only [--out <file>]     # unattended single pass; writes a findings file (default docs/brainstorms/analyze/findings/wxUIUXCodeReview.json); no questions, no edits
```

## What it calls

| Command | How |
|---|---|
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/wxConversionParity](cmd-wxconversionparity.md) | Mentions it as related |
| [/wxDesigner](cmd-wxdesigner.md) | Mentions it as related |

:::internal
**Read from:** `.claude/skills/wxUIUXCodeReview/SKILL.md`, `_wxAI/commands/wxUIUXCodeReview.md`, `mcp-server/src/prompts/wxuiuxcodereview.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_command_prompt`, `project.help`

:::
