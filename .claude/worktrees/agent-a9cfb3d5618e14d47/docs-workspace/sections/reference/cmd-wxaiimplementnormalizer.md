---
id: cmd-wxaiimplementnormalizer
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-implement-normalizer.md
generated: true
---

# /wxAI-implement-normalizer

> **Not in the Customer edition.** Replaced by /implement.

Translate short "implement …" chat commands into canonical /wxAI-implement invocations

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-implement-normalizer` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-implement](cmd-wxaiimplement.md) | Runs it as one of its steps |
| [/wxAI-tasks](cmd-wxaitasks.md) | Mentions it as related |

## What calls it

None.

**Read from:** `_wxAI/commands/wxAI-implement-normalizer.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-implement, /wxAI-tasks
