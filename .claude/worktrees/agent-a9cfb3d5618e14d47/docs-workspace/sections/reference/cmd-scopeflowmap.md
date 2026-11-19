---
id: cmd-scopeflowmap
part: command-reference
audience: customer
sources: .claude/skills/scope-flow-map/SKILL.md
generated: true
---

# /scope-flow-map

Build one overall Mermaid dependency map of the whole wxKanban build from specs/Project-Scope/*.md — showing how scopes connect across different processes and flows, including connections that no single scope doc refl…

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/scope-flow-map` |
| **Stage** | Design |

## What it calls

| Command | How |
|---|---|
| [/analyzescope](cmd-analyzescope.md) | Mentions it as related |

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Runs it as one of its steps |

:::internal
**Read from:** `.claude/skills/scope-flow-map/SKILL.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
