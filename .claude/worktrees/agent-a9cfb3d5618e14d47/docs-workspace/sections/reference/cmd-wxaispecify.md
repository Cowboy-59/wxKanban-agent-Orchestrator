---
id: cmd-wxaispecify
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-specify.md
generated: true
---

# /wxAI-specify

> **Not in the Customer edition.** Replaced by /createSpecs, which runs the specify step itself.

Create or update the feature specification from a natural language feature description.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-specify` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/wxAI-clarify](cmd-wxaiclarify.md) | Runs it as one of its steps |
| [/wxAI-plan](cmd-wxaiplan.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-clarify](cmd-wxaiclarify.md) | Runs it as one of its steps |
| [/wxAI-humantest](cmd-wxaihumantest.md) | Runs it as one of its steps |
| [/wxAI-analyze](cmd-wxaianalyze.md) | Suggests it as a next step |
| [/wxAI-pipeline-agent](cmd-wxaipipelineagent.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-specify.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxAI-clarify, /wxAI-plan
