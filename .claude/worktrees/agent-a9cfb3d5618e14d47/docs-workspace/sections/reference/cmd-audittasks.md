---
id: cmd-audittasks
part: command-reference
audience: internal
sources: _wxAI/commands/audit-tasks.md
generated: true
---

# /audit-tasks

> **Not in the Customer edition.** Retired: no live caller.

Get pre-implementation compliance task recommendations based on feature keywords

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/audit-tasks` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/audit-report](cmd-auditreport.md) | Runs it as one of its steps |
| [/audit-run](cmd-auditrun.md) | Runs it as one of its steps |
| [/wxAI-pipeline](cmd-wxaipipeline.md) | Runs it as one of its steps |
| [/wxAI-plan](cmd-wxaiplan.md) | Mentions it as related |
| [/wxAI-tasks](cmd-wxaitasks.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/audit-check](cmd-auditcheck.md) | Runs it as one of its steps |

**Read from:** `_wxAI/commands/audit-tasks.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /audit-report, /audit-run, /wxAI-pipeline, /wxAI-plan, /wxAI-tasks
