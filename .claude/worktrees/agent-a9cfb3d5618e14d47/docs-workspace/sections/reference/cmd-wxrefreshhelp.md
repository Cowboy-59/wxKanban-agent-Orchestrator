---
id: cmd-wxrefreshhelp
part: command-reference
audience: internal
sources: _wxAI/commands/wxRefreshHelp.md
generated: true
---

# /wxRefreshHelp

> **Not in the Customer edition.** Maintains wxKanban's own help; not part of the customer kit.

refresh BOTH help surfaces after a feature lands: author the gaps, recapture the English manual (site + PDF), and rebuild the in-app Help in all 6 languages.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxRefreshHelp` |
| **Stage** | Any stage |

## How to run it

```text
/wxRefreshHelp                          # reads the marker, then walks all seven steps
/wxRefreshHelp "SCOPE-111 test suite"   # names the feature up front
/wxRefreshHelp --no-capture             # prose changed but the UI did not; skip re-screenshotting
```

## What it calls

| Command | How |
|---|---|
| [/wxHelpGenerate](cmd-wxhelpgenerate.md) | Runs it as one of its steps |
| [/wxRegenHelp](cmd-wxregenhelp.md) | Runs it as one of its steps |
| [/help](cmd-help.md) | Mentions it as related |
| [/help-catalog](cmd-helpcatalog.md) | Mentions it as related |

## What calls it

None.

**Read from:** `_wxAI/commands/wxRefreshHelp.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**Points at retired commands:** /wxRegenHelp, /help, /help-catalog
