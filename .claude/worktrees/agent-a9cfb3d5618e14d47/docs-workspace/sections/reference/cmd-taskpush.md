---
id: cmd-taskpush
part: command-reference
audience: internal
sources: _wxAI/commands/task-push.md
generated: true
---

# /task-push

> **Not in the Customer edition.** Superseded by /dbpush.

Synchronize tasks from a spec's `tasks.md` into the wxKanban database using MCP Project Hub tools, creating tasks with proper event capture and document linking.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/task-push` |
| **Stage** | Any stage |

## How to run it

```text
/task-push <args>
```

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/task-push.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.create_task`, `project.link_doc_to_task`, `project.list_open_items`, `project.upsert_document`
