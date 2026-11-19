---
id: cmd-analyzecode
part: command-reference
audience: customer
sources: _wxAI/commands/analyzecode.md
generated: true
---

# /analyzecode

Run the wxICA architecture review on the current codebase — mechanical drift audit followed by judgment-driven deepening candidates.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/analyzecode` |
| **Stage** | Implementation |

## How to run it

```text
/analyzecode                       # full review: drift audit + deepening exploration
/analyzecode --drift-only          # mechanical drift audit only — stop after step 0
/analyzecode --deepen-only         # skip drift audit, go straight to deepening
/analyzecode --scope <path>        # restrict exploration to a subtree (e.g. <path>)
/analyzecode --since <git-ref>     # tailor the drift audit's "recent diff" to a ref (default: last commit)
/analyzecode --collect-only [--out <file>]  # unattended: steps 0-2 only; writes a findings file (default docs/brainstorms/analyze/findings/analyzecode.json); no questions, no edits
```

## What it calls

None.

## What calls it

None.

:::internal
**Read from:** `_wxAI/commands/analyzecode.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
