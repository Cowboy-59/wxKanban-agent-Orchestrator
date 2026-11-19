---
id: cmd-wxgod
part: command-reference
audience: customer
sources: .claude/skills/wxG-O-D/SKILL.md, _wxAI/commands/wxG-O-D.md, mcp-server/src/prompts/wxgod.md, mcp-server/src/prompts/wxgod/references/business-rules.md, mcp-server/src/prompts/wxgod/references/data-integrity.md, mcp-server/src/prompts/wxgod/references/database-options.md, mcp-server/src/prompts/wxgod/references/document-templates.md, mcp-server/src/prompts/wxgod/references/flow-diagrams.md, mcp-server/src/prompts/wxgod/references/god-persona.md, mcp-server/src/prompts/wxgod/references/interview.md, mcp-server/src/prompts/wxgod/references/new-project.md, mcp-server/src/prompts/wxgod/references/review-and-brainstorm.md
generated: true
---

# /wxG-O-D

Guru of Development: reads your project tree or named folders (plus ProjectOverview.md, stack.md, and any WinDev/VB6/Clarion conversion output), goes over the findings with you section by section at your level (--leve…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxG-O-D` |
| **Stage** | Design |

## How to run it

```text
/wxG-O-D                                                   # whole project tree
/wxG-O-D --customer="Acme Freight"
/wxG-O-D --dir=legacy/src,legacy/docs,db/scripts           # only these folders
/wxG-O-D --dir="customer files/specs","customer files/screens"
/wxG-O-D --level=amateur                                   # explain every idea in plain terms
/wxG-O-D ProjectOverview.md                                # review it; new project → design, then build
```

## What it calls

| Command | How |
|---|---|
| [/autofix-tests](cmd-autofixtests.md) | Runs it as one of its steps |
| [/buildscope](cmd-buildscope.md) | Runs it as one of its steps |
| [/buildstack](cmd-buildstack.md) | Runs it as one of its steps |
| [/createSpecs](cmd-createspecs.md) | Runs it as one of its steps |
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/preTest](cmd-pretest.md) | Runs it as one of its steps |
| [/scope-flow-map](cmd-scopeflowmap.md) | Runs it as one of its steps |
| [/validateScope](cmd-validatescope.md) | Runs it as one of its steps |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Runs it as one of its steps |
| [/wxConversionParity](cmd-wxconversionparity.md) | Runs it as one of its steps |
| [/wxCreateTestPlan](cmd-wxcreatetestplan.md) | Runs it as one of its steps |
| [/wxDBAnalyze](cmd-wxdbanalyze.md) | Runs it as one of its steps |
| [/wxHelpGenerate](cmd-wxhelpgenerate.md) | Runs it as one of its steps |
| [/wxLedger](cmd-wxledger.md) | Runs it as one of its steps |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Runs it as one of its steps |
| [/compliance-scan](cmd-compliancescan.md) | Mentions it as related |
| [/cwConversion](cmd-cwconversion.md) | Mentions it as related |
| [/cwConversionScope](cmd-cwconversionscope.md) | Mentions it as related |
| [/vbConversion](cmd-vbconversion.md) | Mentions it as related |
| [/vbConversionScope](cmd-vbconversionscope.md) | Mentions it as related |
| [/wxConversion](cmd-wxconversion.md) | Mentions it as related |
| [/wxConversionScope](cmd-wxconversionscope.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Runs it as one of its steps |
| [/wxBrainstorm](cmd-wxbrainstorm.md) | Suggests it as a next step |

:::internal
**Read from:** `.claude/skills/wxG-O-D/SKILL.md`, `_wxAI/commands/wxG-O-D.md`, `mcp-server/src/prompts/wxgod.md`, `mcp-server/src/prompts/wxgod/references/business-rules.md`, `mcp-server/src/prompts/wxgod/references/data-integrity.md`, `mcp-server/src/prompts/wxgod/references/database-options.md`, `mcp-server/src/prompts/wxgod/references/document-templates.md`, `mcp-server/src/prompts/wxgod/references/flow-diagrams.md`, `mcp-server/src/prompts/wxgod/references/god-persona.md`, `mcp-server/src/prompts/wxgod/references/interview.md`, `mcp-server/src/prompts/wxgod/references/new-project.md`, `mcp-server/src/prompts/wxgod/references/review-and-brainstorm.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.create_task`, `project.get_command_prompt`, `project.get_compliance_context`, `project.help`, `project.json`, `project.list_open_items`, `project.md`, `project.scope_stage`, `project.submit_feedback`, `project.test_gate_status`, `project.update_task_status`

**Points at retired commands:** /dev-plan, /wxAI-pipeline, /wxAI-beta, /wxAI-humantest, /wxAI-qa, /wxAI-release

:::
