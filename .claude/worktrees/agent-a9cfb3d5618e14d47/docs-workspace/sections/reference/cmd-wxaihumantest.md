---
id: cmd-wxaihumantest
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-humantest.md
generated: true
---

# /wxAI-humantest

> **Not in the Customer edition.** Does not run: needs a prerequisites script that does not exist. Human test sign-off happens in the web app.

Run Phase 4 (Human Testing) — generate test scenarios, collect feedback, and track resolution

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-humantest` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-beta](cmd-wxaibeta.md) | Runs it as one of its steps |
| [/wxAI-qa](cmd-wxaiqa.md) | Runs it as one of its steps |
| [/wxAI-specify](cmd-wxaispecify.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-beta](cmd-wxaibeta.md) | Runs it as one of its steps |
| [/wxAI-qa](cmd-wxaiqa.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-humantest.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-beta, /wxAI-qa, /wxAI-specify
