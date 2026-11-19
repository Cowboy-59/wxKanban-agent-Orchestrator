---
id: cmd-implement
part: command-reference
audience: customer
sources: _wxAI/commands/implement.md, wxkanban-agent/core/policy/adapters/cli-adapter.ts
generated: true
---

# /implement

Execute implementation tasks for a spec using the MCP Project Hub.

| | |
|---|---|
| **Runs in** | AI slash command · Terminal (wxkanban-agent) |
| **How to start it** | `/implement` · `wxkanban-agent implement` |
| **Stage** | Implementation |

## How to run it

```text
/implement <spec-number> [options]
```

## What it calls

| Command | How |
|---|---|
| [wxkanban-agent auditfences](cmd-cli-auditfences.md) | Runs it as one of its steps |
| [/preTest](cmd-pretest.md) | Runs it as one of its steps |
| [/wxConversionParity](cmd-wxconversionparity.md) | Runs it as one of its steps |
| [/wxCreateTestPlan](cmd-wxcreatetestplan.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |
| [/wxDesigner](cmd-wxdesigner.md) | Suggests it as a next step |

:::internal
**Read from:** `_wxAI/commands/implement.md`, `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.capture_event`, `project.get_command_prompt`, `project.list_open_items`, `project.update_task_status`

:::
