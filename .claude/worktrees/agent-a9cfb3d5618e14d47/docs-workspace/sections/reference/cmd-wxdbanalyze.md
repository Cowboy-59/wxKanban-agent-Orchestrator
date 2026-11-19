---
id: cmd-wxdbanalyze
part: command-reference
audience: customer
sources: _wxAI/commands/wxDBAnalyze.md, _wxAI/skills/wxDBAnalyze/SKILL.md
generated: true
---

# /wxDBAnalyze

Senior-DBA review of a project's database — schema integrity, referential integrity, data health, performance/index strategy, and maintenance/bloat today (Phase 2 Batch A), with conventions, security, availability and…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxDBAnalyze` |
| **Stage** | Implementation |

## How to run it

```text
/wxDBAnalyze                          # full audit of every implemented dimension, read-only
/wxDBAnalyze --dimension performance,integrity   # run a subset of the five implemented dimensions
/wxDBAnalyze --impact                 # Batch B — not yet implemented
/wxDBAnalyze --apply                  # guarded additive apply, per-statement approval
/wxDBAnalyze --dry-run                # plan only, touches nothing
/wxDBAnalyze --engine mssql --url …   # Batch B — non-postgres engines still refuse
```

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/wxDBAnalyze.md`, `_wxAI/skills/wxDBAnalyze/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
