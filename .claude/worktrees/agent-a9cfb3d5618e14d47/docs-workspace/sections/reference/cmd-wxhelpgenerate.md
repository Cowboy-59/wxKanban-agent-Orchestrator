---
id: cmd-wxhelpgenerate
part: command-reference
audience: customer
sources: _wxAI/commands/wxHelpGenerate.md, _wxAI/skills/wxHelpGenerate/SKILL.md
generated: true
---

# /wxHelpGenerate

turn a live web app into end-user help by walking it screen by screen, then publish a linked HTML help site + a PDF manual; with --teach, also one AI-agnostic lesson per process for users to learn the app in their own…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxHelpGenerate` |
| **Stage** | Human Testing → Release |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/wxHelpGenerate.md`, `_wxAI/skills/wxHelpGenerate/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /help-catalog

:::
