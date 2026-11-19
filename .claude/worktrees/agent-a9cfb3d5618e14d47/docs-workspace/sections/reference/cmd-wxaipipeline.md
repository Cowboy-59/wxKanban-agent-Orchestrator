---
id: cmd-wxaipipeline
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-pipeline.md
generated: true
---

# /wxAI-pipeline

> **Not in the Customer edition.** Replaced by /createSpecs.

Run the full spec pipeline: specify → clarify → plan → tasks.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-pipeline` |
| **Stage** | Any stage |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/audit-tasks](cmd-audittasks.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Runs it as one of its steps |
| [/scope-import](cmd-scopeimport.md) | Runs it as one of its steps |
| [/validateScope](cmd-validatescope.md) | Runs it as one of its steps |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Runs it as one of its steps |
| [/wxAI-pipeline-normalizer](cmd-wxaipipelinenormalizer.md) | Runs it as one of its steps |
| [/wxAI-lifecycle](cmd-wxailifecycle.md) | Suggests it as a next step |
| [/wxG-O-D](cmd-wxgod.md) | Suggests it as a next step |
| [/wxAI-pipeline-mandatory-database](cmd-wxaipipelinemandatorydatabase.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-pipeline.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)
