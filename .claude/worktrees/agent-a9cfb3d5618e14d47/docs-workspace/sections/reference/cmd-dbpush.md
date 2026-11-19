---
id: cmd-dbpush
part: command-reference
audience: customer
sources: _wxAI/commands/dbpush.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /dbpush

Validate all local spec files, tasks, and lifecycle data, then push everything to the MCP Project Hub database.

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/dbpush` · `wxkanban-agent dbpush` |
| **Stage** | Implementation |

## How to run it

```text
/dbpush [options]
```

## What it calls

None.

## What calls it

None.

:::internal
**Read from:** `_wxAI/commands/dbpush.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.create_specs`, `project.create_task`, `project.list_open_items`, `project.update_task_status`, `project.upsert_document`

:::
