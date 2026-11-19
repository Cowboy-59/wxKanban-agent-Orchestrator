---
id: cmd-helpcatalog
part: command-reference
audience: internal
sources: .claude/skills/help-catalog/SKILL.md, _wxAI/commands/help-catalog.md
generated: true
---

# /help-catalog

> **Not in the Customer edition.** Maintains wxKanban's own help; not part of the customer kit.

regenerate the subscription-aware in-app Help (refresh per-area articles from the real UI, rebuild the standalone help page, run the tier drift + coverage tests).

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/help-catalog` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/analyzescope](cmd-analyzescope.md) | Mentions it as related |
| [/dev-plan](cmd-devplan.md) | Mentions it as related |
| [/help](cmd-help.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxHelpGenerate](cmd-wxhelpgenerate.md) | Mentions it as related |
| [/wxRefreshHelp](cmd-wxrefreshhelp.md) | Mentions it as related |
| [/wxRegenHelp](cmd-wxregenhelp.md) | Mentions it as related |

**Read from:** `.claude/skills/help-catalog/SKILL.md`, `_wxAI/commands/help-catalog.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /dev-plan, /help
