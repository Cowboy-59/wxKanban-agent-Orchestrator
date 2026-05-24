# BUG-2026-05-23 — folderOpen tasks fail with "node not recognized"; PATH collapse in PowerShell profile

**Identified**: 2026-05-23
**Status**: Partially resolved (1 of 3 items fixed)
**Environment**: Windows 10 Pro, PowerShell 7+, VSCode with this repo open

## Symptom

Opening the repo folder in VSCode triggered three `runOn: folderOpen` tasks
from `.vscode/tasks.json` ("Start MCP Server", "Start Orchestrator HTTP
Gateway", "Check kit version"). All three failed with `node: not recognized`.

## Root cause

Not a Node install issue — an operator-precedence bug in the user's
PowerShell profile collapsed `$env:Path` from 70 entries to 2.

The offending line in `C:\Users\ccscowboy\Documents\PowerShell\profile.ps1`:

```powershell
$env:Path = "$scoopShims;" + (($env:Path -split ';') | Where-Object {...}) -join ';'
```

`+` binds before `-join`, so the path-entries array was coerced to a single
space-joined string before the join ever ran. Windows then saw only
`<scoopShims>` plus one garbage "directory" containing every other PATH
entry concatenated with spaces. Nothing in the real PATH (including
`C:\Program Files\nodejs`) was reachable.

## Fix applied

Added the missing parentheses in `profile.ps1` to force `-join` to evaluate
before `+`. Verified PATH restored to 70 entries and `C:\Program
Files\nodejs` resolves.

## Outstanding items

### 1. "Start MCP Server" task pointed at a deleted script — RESOLVED 2026-05-24

`scripts/setup-mcp.mjs` was removed in the v1.1.0 hosted-MCP cutover, but
`.vscode/tasks.json` still tried to run it on every folder open. Even with
PATH restored, the task would have failed because the target file is gone.

**Action taken**: removed the "Start MCP Server" entry from
`.vscode/tasks.json` and dropped 8 broken `kit:*` scripts from root
`package.json` that referenced the same v1.1.0-deleted files
(`setup-mcp.mjs`, `setup-gateway.mjs`, `mcp-health-check.mjs`,
`kit-status.mjs`, `kit-stop.mjs`, `mcp-server/`).

### 2. Two remaining folderOpen tasks may still be too aggressive — OPEN

`.vscode/tasks.json` now auto-runs "Start Orchestrator HTTP Gateway" and
"Check kit version" on every folder open. Confirm this is the intended
default, or move one/both behind explicit commands.

### 3. Spec-028 profile-emitter may regenerate the PATH bug — OPEN

The comment above the broken snippet in `profile.ps1` attributed it to
spec-028. If a provisioning script in this repo (or in wxKanban) emits
that profile fragment, every new machine will regenerate the bug after
the local fix. Grep the repo for the emitter and patch it at source.

Suggested search terms: `$scoopShims`, `profile.ps1`, `scoop shims`,
spec 028 docs.
