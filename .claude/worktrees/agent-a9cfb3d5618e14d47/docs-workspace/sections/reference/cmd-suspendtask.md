---
id: cmd-suspendtask
part: command-reference
audience: internal
sources: _wxAI/commands/suspend-task.md
generated: true
---

# /suspend-task

> **Not in the Customer edition.** Retired: no live caller.

Mark a task as `blocked` or `suspended` with a required reason.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/suspend-task` |
| **Stage** | Any stage |

## How to run it

```text
/suspend-task <task-id> --status <blocked|suspended> --reason "<text>"
```

## What it calls

None.

## What calls it

None.

**Read from:** `_wxAI/commands/suspend-task.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)
