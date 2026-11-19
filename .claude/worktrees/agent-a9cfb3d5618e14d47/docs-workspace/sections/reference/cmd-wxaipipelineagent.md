---
id: cmd-wxaipipelineagent
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-pipeline-agent.md
generated: true
---

# /wxAI-pipeline-agent

> **Not in the Customer edition.** Replaced by /createSpecs.

Pipeline orchestrator agent that manages and executes the full wxAI pipeline workflow with intelligent automation, state persistence, and error recovery

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-pipeline-agent` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-implement](cmd-wxaiimplement.md) | Runs it as one of its steps |
| [/wxAI-pipeline](cmd-wxaipipeline.md) | Runs it as one of its steps |
| [/task-push](cmd-taskpush.md) | Mentions it as related |
| [/wxAI-clarify](cmd-wxaiclarify.md) | Mentions it as related |
| [/wxAI-lifecycle](cmd-wxailifecycle.md) | Mentions it as related |
| [/wxAI-pipeline-normalizer](cmd-wxaipipelinenormalizer.md) | Mentions it as related |
| [/wxAI-plan](cmd-wxaiplan.md) | Mentions it as related |
| [/wxAI-specify](cmd-wxaispecify.md) | Mentions it as related |
| [/wxAI-tasks](cmd-wxaitasks.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxAI-pipeline-normalizer](cmd-wxaipipelinenormalizer.md) | Runs it as one of its steps |

**Read from:** `_wxAI/commands/wxAI-pipeline-agent.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-implement, /wxAI-pipeline, /task-push, /wxAI-clarify, /wxAI-lifecycle, /wxAI-pipeline-normalizer, /wxAI-plan, /wxAI-specify, /wxAI-tasks
