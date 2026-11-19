---
id: cmd-wxaiplan
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-plan.md
generated: true
---

# /wxAI-plan

> **Not in the Customer edition.** Replaced by /createSpecs, which runs the plan step itself.

Execute the implementation planning workflow using the plan template to generate design artifacts.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-plan` |
| **Stage** | Any stage |

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/audit-check](cmd-auditcheck.md) | Runs it as one of its steps |
| [/scope-import](cmd-scopeimport.md) | Runs it as one of its steps |
| [/wxAI-clarify](cmd-wxaiclarify.md) | Runs it as one of its steps |
| [/wxAI-specify](cmd-wxaispecify.md) | Runs it as one of its steps |
| [/wxAI-analyze](cmd-wxaianalyze.md) | Suggests it as a next step |
| [/audit-tasks](cmd-audittasks.md) | Mentions it as related |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-plan.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)
