---
id: cmd-wxairelease
part: command-reference
audience: internal
sources: _wxAI/commands/wxAI-release.md
generated: true
---

# /wxAI-release

> **Not in the Customer edition.** Does not run: needs a prerequisites script that does not exist. Scopes advance on their own.

Run Phase 6 (Release) — validate all phases complete, select deployment method, generate release notes

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/wxAI-release` |
| **Stage** | Any stage |

## What it calls

| Command | How |
|---|---|
| [/compliance-scan](cmd-compliancescan.md) | Runs it as one of its steps |

## What calls it

| Command | How |
|---|---|
| [/wxAI-beta](cmd-wxaibeta.md) | Runs it as one of its steps |
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

**Read from:** `_wxAI/commands/wxAI-release.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.get_audit_config`
