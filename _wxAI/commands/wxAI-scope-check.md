---
description: Pre-implementation scope verification gate — checks that a scope exists in the wxKanban database before any code changes are allowed
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-scope-check

**Scope-First Enforcement Gate** — This command MUST be run before any code creation, modification, or deletion. It verifies that the work being requested belongs to a verified scope in the wxKanban database.

## User Input

```text
{{args}}
```

## Purpose

The Scope-First Rule is the foundational governance rule of wxKanban:

> **No AI assistant may create or modify code without a verified scope in the wxKanban database.**

This command enforces that rule. It is called automatically by `wxAI-implement` and can be called manually at any time.

---

## Execution Steps

### Step 1 — Detect Project Type

Check whether `.wxkanban-origin` exists in the project root:

```bash
test -f .wxkanban-origin && echo "SOURCE" || echo "CONSUMER"
```

- **SOURCE project** (`.wxkanban-origin` present): Full edit access. Governance files are editable.
- **CONSUMER project** (no `.wxkanban-origin`): Protected files are READ-ONLY. Enforce document protection rules.

---

### Step 2 — Parse the User Request

Analyze the user's request to extract:
- **What** they want to build or change (feature description)
- **Which files** they want to create or modify (if specified)
- **Keywords** to search for in existing scopes and tasks

If the user provided a scope number explicitly (e.g., `--scope 012`), skip to Step 4.

---

### Step 3 — Search Existing Scopes and Tasks

Search for matching scopes using the wxKanban MCP:

```text
wxk_scope_import({ action: "search", keywords: ["<keyword1>", "<keyword2>"] })
```

Also search the local `specs/` directory:

```bash
grep -r "<keyword>" specs/ --include="*.md" -l
```

Present results in this format:

```
🔍 SCOPE SEARCH RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found 2 potential matches for: "login button navbar"

  [1] Scope 003 — Registration (Phase: Released, 100%)
      Matching tasks: T004 "Login form component", T007 "Auth navbar integration"
      Spec: specs/003-Registration/spec.md

  [2] Scope 006 — Settings (Phase: Implementation, 70%)
      Matching tasks: T012 "User profile navbar link"
      Spec: specs/006-settings/spec.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ask the developer: **"Which scope does this work belong to? Enter the scope number, or type 'new' to create a new scope."**

---

### Step 4 — Verify Scope in Database

Once a scope number is identified, verify it exists in the database:

```text
wxk_scope_import({ action: "verify", spec_number: "<NNN>" })
```

Expected response:
```json
{
  "exists": true,
  "specnumber": "012",
  "title": "Kanban View",
  "status": "in_progress",
  "phase": "Implementation"
}
```

**If scope exists in database** → proceed to Step 6 (PASS).

**If scope NOT in database** → proceed to Step 5 (scope creation required).

---

### Step 5 — Scope Not Found: Enter Training Mode

If no matching scope is found in the database, display:

```
⛔ SCOPE-FIRST BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I cannot proceed with implementation because no verified scope was found
for this work in the wxKanban database.

I searched for: "<keywords>"
Result: No matching scope found.

OPTIONS:
  [1] Create a new scope (I'll guide you through it — takes ~15 minutes)
  [2] Search again with different keywords
  [3] Use emergency override: --force --reason "<explanation>"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If developer chooses **[1] Create a new scope**, run `wxAI-training` to guide them through scope creation.

If developer chooses **[3] Emergency override**, require `--force --reason "<explanation>"` and log the override (see Step 7).

---

### Step 6 — PASS: Scope Verified

Display confirmation and log the interaction:

```
✅ SCOPE VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scope: 012 — Kanban View
Phase: Implementation (50%)
Status: in_progress
Database: ✅ Verified

Proceeding with implementation under Scope 012.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Log to `companyauditlogs`:
```json
{
  "action": "ai_interaction",
  "description": "Scope check passed: Scope 012 verified for implementation",
  "newvalue": {
    "actiontype": "scope_check_pass",
    "scopenumber": "012",
    "provider": "<current AI provider>",
    "sessionid": "<session id>",
    "keywords": ["<search keywords>"]
  }
}
```

---

### Step 7 — Emergency Override Handling

If `--force --reason "<explanation>"` is provided:

1. Log the override to `companyauditlogs`:
```json
{
  "action": "ai_interaction",
  "description": "EMERGENCY OVERRIDE: Scope-first rule bypassed",
  "newvalue": {
    "actiontype": "scope_check_override",
    "reason": "<explanation>",
    "provider": "<current AI provider>",
    "sessionid": "<session id>",
    "timestamp": "<ISO timestamp>"
  }
}
```

2. Insert override record to `projectdocuments`:
```json
{
  "doctype": "override_log",
  "title": "Emergency Override — <date>",
  "content": "Override reason: <explanation>\nProvider: <provider>\nTimestamp: <ISO timestamp>",
  "isgenerated": true
}
```

3. Display warning and proceed:
```
⚠️  EMERGENCY OVERRIDE ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason: <explanation>
Logged: companyauditlogs + projectdocuments (override_log)
Timestamp: <ISO timestamp>

⚠️  This override is visible to management in the AI Audit dashboard.
Proceeding with implementation...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Document Protection (Consumer Projects Only)

If the project has NO `.wxkanban-origin` file, the following files are **READ-ONLY** and MUST NOT be modified:

```
_wxAI/rules/constitution.md
_wxAI/rules/projectrules.md
_wxAI/commands/wxAI-implement.md
_wxAI/commands/wxAI-scope-check.md
_wxAI/commands/wxAI-training.md
_wxAI/commands/wxAI-todo-import.md
_wxAI/commands/wxAI-sync-global.md
_wxAI/commands/wxAI-session-start.md
.wxkanban-version
```

If a developer requests modification of any protected file, display:

```
🔒 PROTECTED FILE — CANNOT MODIFY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: <filename>
Reason: This file is part of the wxKanban governance framework and is
        read-only in consumer projects.

To modify governance rules:
  1. Make changes in the wxKanban source project
  2. Run: wxai sync-global --push
  3. Consumer projects will auto-update on next session start

For an exception, use: --force --reason "<explanation>"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## CLI Usage

```bash
# Check scope for current work (interactive)
wxai scope-check "add login button to navbar"

# Check specific scope number
wxai scope-check --scope 012

# Emergency override
wxai scope-check --force --reason "Production hotfix CVE-2025-001"

# Check only (no implementation, just verify)
wxai scope-check --check-only "email notifications"
```

---

## Integration with wxAI-implement

`wxAI-implement` calls this command automatically at **Step 0** (before any other step). If scope check fails, `wxAI-implement` halts immediately.

The scope check result is passed to `wxAI-implement` as context:
```json
{
  "scopeVerified": true,
  "scopeNumber": "012",
  "scopeTitle": "Kanban View",
  "verificationTimestamp": "<ISO timestamp>"
}
