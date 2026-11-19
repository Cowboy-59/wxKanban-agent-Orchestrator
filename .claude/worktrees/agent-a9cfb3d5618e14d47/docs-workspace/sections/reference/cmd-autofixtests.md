---
id: cmd-autofixtests
part: command-reference
audience: customer
sources: _wxAI/commands/autofix-tests.md
generated: true
---

# /autofix-tests

Automatically detect failing tests, analyze root causes, and apply fixes without human intervention.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/autofix-tests` |
| **Stage** | QA |

## How to run it

```text
/autofix-tests <args>
```

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/autofix-tests.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.list_open_items`, `project.upsert_document`

:::
