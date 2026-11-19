---
id: cmd-auditreport
part: command-reference
audience: internal
sources: _wxAI/commands/audit-report.md
generated: true
---

# /audit-report

> **Not in the Customer edition.** Retired: no live caller.

Retrieve and display compliance audit reports with detailed findings

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/audit-report` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/audit-run](cmd-auditrun.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/audit-check](cmd-auditcheck.md) | Runs it as one of its steps |
| [/audit-run](cmd-auditrun.md) | Runs it as one of its steps |
| [/audit-tasks](cmd-audittasks.md) | Runs it as one of its steps |

**Read from:** `_wxAI/commands/audit-report.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /audit-run
