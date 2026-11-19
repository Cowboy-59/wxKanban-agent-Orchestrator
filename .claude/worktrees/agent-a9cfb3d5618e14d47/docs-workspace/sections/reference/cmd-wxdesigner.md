---
id: cmd-wxdesigner
part: command-reference
audience: customer
sources: _wxAI/commands/wxDesigner.md, _wxAI/skills/wxDesigner/SKILL.md
generated: true
---

# /wxDesigner

read a scope/spec, design the screen it calls for using the project's existing theme tokens, preview it in the browser, iterate, then SAVE to a page.md carrying the design spec plus ready-to-use TSX.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxDesigner` |
| **Stage** | Design |

## How to run it

```text
/wxDesigner 106                       # SCOPE-106 + every spec that implements it
/wxDesigner 084 "plan comparison"     # a named screen within SCOPE-084
/wxDesigner specs/072-user-home       # start at a spec; walks back to its scope
/wxDesigner 106                       # already designed? reopens that page.md and edits it
```

## What it calls

| Command | How |
|---|---|
| [/implement](cmd-implement.md) | Suggests it as a next step |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Mentions it as related |

## What calls it

None.

:::internal
**Read from:** `_wxAI/commands/wxDesigner.md`, `_wxAI/skills/wxDesigner/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
