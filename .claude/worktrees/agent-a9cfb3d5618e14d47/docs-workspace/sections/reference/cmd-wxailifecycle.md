---
id: cmd-wxailifecycle
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-lifecycle.md
generated: true
---

# /wxAI-lifecycle

> **Not in the Customer edition.** Retired: the lifecycle document has a deterministic generator.

Generate or update the project Lifecycle.md tracking document with spec pipeline status, and completion tracking

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-lifecycle` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-pipeline](cmd-wxaipipeline.md) | Suggests it as a next step |

## What calls it

| Command | How |
|---|---|
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-lifecycle.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-pipeline
