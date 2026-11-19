---
id: cmd-wxaipipelinenormalizer
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-pipeline-normalizer.md
generated: true
---

# /wxAI-pipeline-normalizer

> **Not in the Customer edition.** Replaced by /createSpecs.

Translate short "pipeline …" chat commands into canonical /wxAI-pipeline invocations

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-pipeline-normalizer` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-pipeline](cmd-wxaipipeline.md) | Runs it as one of its steps |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-pipeline-normalizer.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-pipeline, /wxAI-pipeline-agent
