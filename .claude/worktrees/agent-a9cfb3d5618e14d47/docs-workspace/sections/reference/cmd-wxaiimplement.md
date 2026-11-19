---
id: cmd-wxaiimplement
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-implement.md
generated: true
---

# /wxAI-implement

> **Not in the Customer edition.** Replaced by /implement.

Execute the implementation plan by processing and executing all tasks defined in tasks.md

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-implement` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-tasks](cmd-wxaitasks.md) | Suggests it as a next step |

## What calls it

| Command | How |
|---|---|
| [/audit-check](cmd-auditcheck.md) | Runs it as one of its steps |
| [/audit-run](cmd-auditrun.md) | Runs it as one of its steps |
| [/wxAI-implement-gate](cmd-wxaiimplementgate.md) | Runs it as one of its steps |
| [/wxAI-implement-normalizer](cmd-wxaiimplementnormalizer.md) | Runs it as one of its steps |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Runs it as one of its steps |
| [/wxAI-analyze](cmd-wxaianalyze.md) | Suggests it as a next step |

**Read from:** `_wxAI/commands/wxAI-implement.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-tasks
