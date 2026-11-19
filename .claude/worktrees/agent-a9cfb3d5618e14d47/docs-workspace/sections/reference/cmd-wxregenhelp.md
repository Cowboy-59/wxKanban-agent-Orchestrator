---
id: cmd-wxregenhelp
part: command-reference
audience: internal
sources: _wxAI/commands/wxRegenHelp.md
generated: true
---

# /wxRegenHelp

> **Not in the Customer edition.** Maintains wxKanban's own help; not part of the customer kit.

regenerate the end-user help (HTML site + PDF manual) in one of the 6 supported languages.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxRegenHelp` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/help-catalog](cmd-helpcatalog.md) | Mentions it as related |
| [/wxHelpGenerate](cmd-wxhelpgenerate.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxRefreshHelp](cmd-wxrefreshhelp.md) | Runs it as one of its steps |

**Read from:** `_wxAI/commands/wxRegenHelp.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /help-catalog
