---
id: cmd-synccpl
part: command-reference
audience: internal
sources: _wxAI/commands/sync-cpl.md
generated: true
---

# /sync-cpl

> **Not in the Customer edition.** Retired kit-sync tool: no live caller.

Synchronize the Current Project Lineage (CPL) with the wxKanban database using MCP Project Hub tools, ensuring all specs, tasks, and dependencies are properly tracked with full audit trail.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/sync-cpl` |
| **Stage** | Any stage |

## How to run it

```text
/sync-cpl <args>
```

## What it calls

None.

## What calls it

None.

**Read from:** `_wxAI/commands/sync-cpl.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.create_task`, `project.link_doc_to_task`, `project.list_open_items`, `project.upsert_document`
