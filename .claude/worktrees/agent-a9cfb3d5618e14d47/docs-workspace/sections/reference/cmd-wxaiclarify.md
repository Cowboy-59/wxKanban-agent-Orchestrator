---
id: cmd-wxaiclarify
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-clarify.md
generated: true
---

# /wxAI-clarify

> **Not in the Customer edition.** Replaced by /createSpecs, which runs the clarify step itself.

Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions and encoding answers back into the spec.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-clarify` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-plan](cmd-wxaiplan.md) | Runs it as one of its steps |
| [/wxAI-specify](cmd-wxaispecify.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-specify](cmd-wxaispecify.md) | Runs it as one of its steps |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-clarify.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-plan, /wxAI-specify
