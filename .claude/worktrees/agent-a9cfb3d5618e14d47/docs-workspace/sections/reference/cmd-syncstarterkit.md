---
id: cmd-syncstarterkit
part: command-reference
audience: internal
sources: _wxAI/commands/sync-starter-kit.md
generated: true
---

# /sync-starter-kit

> **Not in the Customer edition.** Retired kit-sync tool: no live caller.

Synchronize the current project with the wxKanban starter kit using MCP Project Hub tools, updating templates, commands, and configuration files while preserving project-specific customizations and capturing all opera…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/sync-starter-kit` |
| **Stage** | Any stage |

## How to run it

```text
/sync-starter-kit <args>
```

## What it calls

None.

## What calls it

None.

**Read from:** `_wxAI/commands/sync-starter-kit.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.create_task`, `project.link_doc_to_task`, `project.list_open_items`, `project.update_task_status`, `project.upsert_document`
