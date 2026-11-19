---
id: cmd-wxcreatetestplan
part: command-reference
audience: customer
sources: _wxAI/commands/wxCreateTestPlan.md, _wxAI/skills/wxCreateTestPlan/SKILL.md
generated: true
---

# /wxCreateTestPlan

Build a requirement-traceable test plan for the stack declared in stack.md (routes/services/commands, data tables, UI page-to-page flows, and any tool surface) — then optionally --Execute it through three signoff gate…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxCreateTestPlan` |
| **Stage** | QA |

## How to run it

```text
/wxCreateTestPlan                        # whole app: <path> (+ <path> UI lens)
/wxCreateTestPlan SPEC-051               # requirement-driven: derive from specs/051-*/spec.md FR-###
/wxCreateTestPlan SCOPE-047              # a scope umbrella → its implementing spec(s)
/wxCreateTestPlan <path>      # path subtree filter
/wxCreateTestPlan SPEC-051 --Execute     # plan (or reuse plan), then run the three signoff gates
```

## What it calls

| Command | How |
|---|---|
| [/buildstack](cmd-buildstack.md) | Runs it as one of its steps |
| [/preTest](cmd-pretest.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `_wxAI/commands/wxCreateTestPlan.md`, `_wxAI/skills/wxCreateTestPlan/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.complete_test_run`, `project.report_change_impact`, `project.report_test_progress`, `project.sign_off_test`, `project.start_test_run`, `project.test_gate_status`

:::
