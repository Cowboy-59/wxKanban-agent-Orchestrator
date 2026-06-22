---
description: Run at the start of every AI session — checks governance version, scope context, and unlinked TODOs
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-session-start

**Session Initialization** — Runs automatically at the start of every AI development session. Establishes governance context, checks version status, identifies unlinked TODOs, and prepares the AI for scope-first development.

## User Input

```text
{{args}}
```

---

## Purpose

This command is the **first thing an AI assistant runs** when a developer opens a project. It:

1. Detects the project type (wxKanban source vs consumer)
2. Checks governance rules version (blocks if critically outdated)
3. Identifies unlinked TODO files
4. Loads the active scope context
5. Greets the developer with a status summary

---

## Execution Steps

### Step 1 — Detect Project Type

```bash
test -f .wxkanban-origin && echo "SOURCE" || echo "CONSUMER"
```

Display the project type clearly:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🚀 wxAI SESSION START                                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
Project: wxKanban (SOURCE)   ← or: MyProject (CONSUMER)
Date:    2025-01-28
AI:      Blackbox AI / Claude / Cursor / Gemini / Mistral
```

---

### Step 2 — Governance Version Check

Run the version check:

```bash
wxai sync-global --check
```

**If version is 2+ major versions behind:**

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⛔ SESSION BLOCKED — GOVERNANCE RULES CRITICALLY OUT OF DATE               ║
╚══════════════════════════════════════════════════════════════════════════════╝
Your governance rules are 2+ major versions behind.

Current: v1.0.0  |  Latest: v3.0.0

AI implementation is BLOCKED until you update.

Run: wxai sync-global --apply
Then restart your session.
```

**HALT** — do not proceed with any implementation until the developer updates.

**If version is 1 major version behind:**

```
⚠️  Governance rules: v1.0.0 (v2.0.0 available)
    Run: wxai sync-global --apply to update
    Implementation is allowed but update is recommended.
```

Continue with session.

**If version is current:**

```
✅ Governance rules: v1.2.0 — Up to date
```

Continue with session.

---

### Step 3 — Scan for Unlinked TODO Files

Scan the project for TODO files not linked to scopes:

```bash
wxai todo-import --dry-run
```

**If unlinked TODOs found:**

```
⚠️  UNLINKED TODO FILES DETECTED

  TODO.md                    — not linked to any scope
  TODO_AUDIT_013.md          — not linked to any scope
  TODO_SYSADMIN_PRODUCTION.md — not linked to any scope

These files contain work items not tracked in the wxKanban database.
Management cannot see this work.

Run: wxai todo-import
to link these files to scopes and insert tasks into the database.
```

**If all TODOs are linked:**

```
✅ All TODO files are linked to scopes
```

---

### Step 4 — Load Active Scope Context

Check if the developer has indicated a scope to work on (from `{{args}}`):

**If scope number provided** (e.g., `wxAI-session-start 015`):

```bash
wxai scope-check --scope 015 --check-only
```

Display scope status:

```
📋 ACTIVE SCOPE: 015 — AI Interaction Rules & Governance Framework
   Phase:    Implementation (Phase 2)
   Progress: 65%
   Tasks:    T001-T015 (8 complete, 7 remaining)
   Next:     T008 — Create AI audit routes
```

**If no scope provided:**

```
📋 NO ACTIVE SCOPE SET

To work on a specific scope:
  wxai scope-check --scope <NNN>

To find a scope for your work:
  wxai scope-check "<description of what you want to build>"

To create a new scope:
  wxai training --new-scope
```

---

### Step 5 — Display Session Summary

Show a complete session status summary:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ✅ SESSION READY                                                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

PROJECT STATUS
  Type:              Consumer Project
  Governance:        v1.2.0 ✅ Up to date
  Unlinked TODOs:    0 ✅
  Active Scope:      015 — AI Interaction Rules

SCOPE-FIRST RULE ACTIVE
  ⚡ All implementation requires a verified scope.
  ⚡ Run: wxai scope-check before any code changes.
  ⚡ Emergency override: wxai scope-check --force --reason "<explanation>"

AVAILABLE COMMANDS
  wxai scope-check "<description>"   — Verify scope before implementation
  wxai todo-import                   — Link TODO files to scopes
  wxai training                      — Developer onboarding
  wxai training --new-scope          — Create a new scope
  wxai sync-global --apply           — Update governance rules
  wxai implement --spec <NNN>        — Start implementation

Ready for development. What would you like to build?
```

---

## Auto-Trigger Configuration

This command should be configured to run automatically when:

1. **IDE opens a project** — via IDE extension or workspace settings
2. **AI session starts** — via `UserPromptSubmit` hook (Claude Code)
3. **Developer explicitly runs** — `wxai session-start`

### Claude Code Hook Configuration

```yaml
# ~/.claude/hooks/session-start.yaml
hooks:
  SessionStart:
    - type: command
      command: wxai session-start
      timeout: 30
```

### Cursor IDE Configuration

```json
// .cursor/settings.json
{
  "ai.sessionStartCommand": "wxai session-start"
}
```

### Blackbox AI Configuration

```json
// .blackbox/settings.json
{
  "sessionStart": "wxai session-start"
}
```

---

## Behavior by Project Type

### SOURCE Project (has `.wxkanban-origin`)

- Governance version check: **skipped** (source is authoritative)
- Protected file check: **skipped** (all files editable)
- Scope check: **normal** (scopes still required)
- TODO linking: **normal** (TODOs still tracked)

### CONSUMER Project (no `.wxkanban-origin`)

- Governance version check: **enforced** (blocks if 2+ major behind)
- Protected file check: **enforced** (protected files are read-only)
- Scope check: **enforced** (scope-first rule active)
- TODO linking: **enforced** (all TODOs must be linked)

---

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `.wxkanban-version` missing | Warn, continue (governance not installed) |
| `specs/` directory missing | Warn, continue (no scopes available) |
| Database unreachable | Warn, continue (use local spec files) |
| Version 2+ behind | **BLOCK** — halt session until updated |
| Unlinked TODOs | Warn, continue (prompt to run todo-import) |
| No active scope | Inform, continue (scope required before implementation) |

---

## Integration with Scope-First Rule

The session start command reinforces the scope-first rule by:

1. **Reminding** the developer of the rule at every session start
2. **Showing** the active scope so the developer knows what they're working on
3. **Warning** about unlinked TODOs that represent untracked work
4. **Blocking** if governance rules are critically outdated

This ensures that every development session begins with full awareness of the governance framework.
