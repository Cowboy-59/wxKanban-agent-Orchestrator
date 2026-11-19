---
id: cmd-compliancescan
part: command-reference
audience: customer
sources: _wxAI/commands/compliance-scan.md
generated: true
---

# /compliance-scan

Retroactive compliance analysis.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/compliance-scan` |
| **Stage** | Implementation |

## How to run it

```text
/compliance-scan                        # Scan all scopes and specs for this project
/compliance-scan --scope NNN            # Scan one specific scope
/compliance-scan --framework hipaa      # Check one framework only
/compliance-scan --mode report          # Report only — no changes to any files
```

## What it calls

None.

## What calls it

| Command | How |
|---|---|
| [/wxG-O-D](cmd-wxgod.md) | Mentions it as related |

:::internal
**Read from:** `_wxAI/commands/compliance-scan.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

**MCP tools it uses:** `project.create_specs`, `project.get_audit_config`, `project.get_compliance_context`

:::
