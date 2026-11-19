---
id: cmd-wxaitasks
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-tasks.md
generated: true
---

# /wxAI-tasks

> **Not in the Customer edition.** Replaced by /createSpecs, which runs the tasks step itself.

Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-tasks` |
| **Stage** | Any stage |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/scope-import](cmd-scopeimport.md) | Runs it as one of its steps |
| [/wxAI-analyze](cmd-wxaianalyze.md) | Runs it as one of its steps |
| [/wxAI-implement](cmd-wxaiimplement.md) | Suggests it as a next step |
| [/audit-tasks](cmd-audittasks.md) | Mentions it as related |
| [/wxAI-implement-normalizer](cmd-wxaiimplementnormalizer.md) | Mentions it as related |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-tasks.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)
