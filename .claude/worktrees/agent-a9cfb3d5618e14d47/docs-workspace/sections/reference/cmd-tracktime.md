---
id: cmd-tracktime
part: command-reference
audience: customer
sources: _wxAI/commands/track-time.md
generated: true
---

# /track-time

Start or stop a **manual** consultant time-tracking session on a task.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/track-time` |
| **Stage** | Any stage |

## How to run it

```text
/track-time start <task-id>
/track-time stop  <task-id>
```

## What it calls

| Command | How |
|---|---|
| [/ai-session](cmd-aisession.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/ai-session](cmd-aisession.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/track-time.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
