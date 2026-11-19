---
id: cmd-aisession
part: command-reference
audience: customer
sources: _wxAI/commands/ai-session.md
generated: true
---

# /ai-session

Open and manage the **spec-level AI session** that captures all AI-driven dev work for a given spec.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/ai-session` |
| **Stage** | Any stage |

## How to run it

```text
/ai-session start    <spec-id>
/ai-session task     <spec-id> <task-id>
/ai-session overhead <spec-id> <minutes>
/ai-session close    <spec-id>
/ai-session status   <spec-id>
```

## What it calls

| Command | How |
|---|---|
| [/track-time](cmd-tracktime.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/track-time](cmd-tracktime.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/ai-session.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
