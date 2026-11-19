---
id: cmd-auditrun
part: command-reference
audience: internal
sources: _wxAI/commands/audit-run.md
generated: true
---

# /audit-run

> **Not in the Customer edition.** Retired: no live caller.

Trigger and monitor post-implementation compliance audits

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/audit-run` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/audit-report](cmd-auditreport.md) | Runs it as one of its steps |
| [/wxAI-implement](cmd-wxaiimplement.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/audit-check](cmd-auditcheck.md) | Runs it as one of its steps |
| [/audit-report](cmd-auditreport.md) | Runs it as one of its steps |
| [/audit-tasks](cmd-audittasks.md) | Runs it as one of its steps |

**Read from:** `_wxAI/commands/audit-run.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /audit-report, /wxAI-implement
