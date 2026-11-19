---
id: cmd-taskdone
part: command-reference
audience: internal
sources: _wxAI/commands/task-done.md
generated: true
---

# /task-done

> **Not in the Customer edition.** Superseded by /dbpush.

Mark one or more tasks as completed in both the local `tasks.md` and the wxKanban database using MCP Project Hub tools.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/task-done` |
| **Stage** | Any stage |

## How to run it

```text
/task-done <args>
```

## What it calls

None.

## What calls it

None.

**Read from:** `_wxAI/commands/task-done.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.list_open_items`, `project.update_task_status`
