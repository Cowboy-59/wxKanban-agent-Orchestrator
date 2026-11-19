---
id: cmd-pretest
part: command-reference
audience: customer
sources: .claude/commands/preTest.md, _wxAI/skills/wxPreTest/SKILL.md
generated: true
---

# /preTest

Verify a scope before the operator ever sees it — clone the schema, apply the scope's pending DDL to the clone, seed it, boot the real app, drive every route and screen the scope touched, repair within a bounded loop,…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/preTest` |
| **Stage** | QA |

## How to run it

```text
/preTest SCOPE-119            # verify one scope end to end
/preTest SCOPE-119 --dry-run  # plan the run; create nothing
/preTest --list               # enumerate any wxktest_ clones present
/preTest --teardown           # drop this scope's clone
```

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/wxCreateTestPlan](cmd-wxcreatetestplan.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `.claude/commands/preTest.md`, `_wxAI/skills/wxPreTest/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
