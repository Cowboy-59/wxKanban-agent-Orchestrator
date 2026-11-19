---
id: cmd-wxbrainstorm
part: command-reference
audience: customer
sources: .claude/skills/wxBrainstorm/SKILL.md, _wxAI/commands/wxBrainstorm.md
generated: true
---

# /wxBrainstorm

talk through a customer suggestion, feature request, or idea with a panel of the eleven wxG-O-D agent roles.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxBrainstorm` |
| **Stage** | Design |

## How to run it

```text
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm or analyze sitting (analyzers are not re-run)
/wxBrainstorm --analyze [--dir <app folder>]              # review one built app in one sitting: feature groups, approved analyzer plan (30-minute limit each), item-by-item review; saves a report and data file in docs/brainstorms/analyze/ of that app. A missing folder stops with one error line. Asks once about an optional read-only database check (default no; names and counts only)
/wxBrainstorm --analyze --conversion                      # same, and adds wxConversionParity for a conversion
/wxBrainstorm --analyze --cross-app --dir <app>,<app>     # run in wxKanban only: reads each app's saved data file, never writes into them; a gap in 2+ apps becomes one converter scope proposal
```

## What it calls

| Command | How |
|---|---|
| [/buildscope](cmd-buildscope.md) | Runs it as one of its steps |
| [/validateScope](cmd-validatescope.md) | Runs it as one of its steps |
| [/createSpecs](cmd-createspecs.md) | Suggests it as a next step |
| [/wxG-O-D](cmd-wxgod.md) | Suggests it as a next step |

## What calls it

None.

:::internal
**Read from:** `.claude/skills/wxBrainstorm/SKILL.md`, `_wxAI/commands/wxBrainstorm.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.search_capabilities`

:::
