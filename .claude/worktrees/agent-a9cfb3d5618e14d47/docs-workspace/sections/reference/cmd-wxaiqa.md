---
id: cmd-wxaiqa
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-qa.md
generated: true
---

# /wxAI-qa

> **Not in the Customer edition.** Does not run: needs a prerequisites script that does not exist. QA gates come from /wxCreateTestPlan.

Run Phase 3 (QA Testing) — execute tests mapped to Phase 1 specs and generate coverage report

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-qa` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-humantest](cmd-wxaihumantest.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-humantest](cmd-wxaihumantest.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-qa.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-humantest
