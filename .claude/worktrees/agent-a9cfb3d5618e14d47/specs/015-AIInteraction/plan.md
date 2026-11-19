# Implementation Plan: AI Interaction Governance Framework (Spec 015)

**Branch**: `015-ai-interaction`
**Date**: 2025-01-28
**Spec**: `specs/015-AIInteraction/spec.md`
**Input**: `specs/Project-Scope/015-AiInteraction.md`, `specs/015-AIInteraction/spec.md`

---

## Summary

Add a comprehensive **AI Interaction Governance Framework** to wxKanban that:

1. Enforces the Scope-First Rule — blocks all code changes without a verified scope in the database
2. Provides scope discovery and creation training for untrained developers
3. Links all TODO files to scopes and tasks in the database automatically
4. Auto-updates governance rules in consumer projects on every project open
5. Logs all AI interactions to `companyauditlogs` for management review
6. Protects governance files from modification in consumer projects

Backend: 2 new wxAI commands, 3 extended existing commands, 1 new audit log action type.
Tooling: 3 new `_wxAI/commands/` files, 2 new marker/version files, 1 IDE extension hook.
No new database tables — extends existing `companyauditlogs` and `projectdocuments`.

---

## Technical Context

**Type**: Tooling / Infrastructure / Governance
**Language/Version**: TypeScript 5.3, Bash, JSON
**Primary Dependencies**: Existing `wxk_scope_import`, `wxk_doc_import`, `wxk_spec_update` MCP tools; existing `companyauditlogs` and `projectdocuments` tables
**Storage**: PostgreSQL — no new tables; extends existing tables with new `actiontype` values
**Testing**: Manual verification via wxAI command execution + database query verification
**Target Platform**: IDE extension (VSCode/Blackbox) + CLI
**Performance Goals**: Scope discovery search < 2 seconds; startup version check < 5 seconds
**Constraints**: No new database tables; provider-agnostic; one-way sync only (wxKanban → consumer)

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript only | ✅ Pass | All new CLI/command files use TypeScript |
| No `console.log` | ✅ Pass | Uses Pino logger pattern |
| No `any` types | ✅ Pass | All types explicitly defined |
| Security: no secrets | ✅ Pass | No secrets in governance files |
| Dark/light mode | ✅ N/A | No UI components in this scope |
| No toast messages | ✅ N/A | No UI components in this scope |
| Database naming conventions | ✅ Pass | Uses existing table conventions |

**Gate Result**: PASS

---

## Project Structure

### New Files

```
_wxAI/commands/
├── wxAI-scope-check.md          # Pre-implementation scope verification gate command
├── wxAI-todo-import.md          # Convert existing TODO files to scoped database tasks
└── wxAI-training.md             # Guided onboarding for untrained developers

cli/commands/
├── scope-check.ts               # CLI implementation of scope verification gate
├── todo-import.ts               # CLI implementation of TODO file scanner/importer
└── training.ts                  # CLI implementation of training mode

src/server/services/
└── AiInteractionLogService.ts   # AI interaction audit logging service

src/server/routes/
└── ai-audit.ts                  # GET /api/ai-audit/logs — management review endpoint

.wxkanban-origin                 # ✅ Already created — source project marker
.wxkanban-version                # ✅ Already created — version tracking file
```

### Modified Files

```
_wxAI/commands/wxAI-implement.md          # Add scope-first gate check at top
_wxAI/commands/wxAI-pipeline.md           # Add scope-first gate to Phase 4.5
_wxAI/rules/projectrules.md               # Add scope-first enforcement section
cli/commands/implement.ts                 # Add scope verification gate
src/server/routes/index.ts                # Register /api/ai-audit routes
```

### Renamed Files (Claude → wx prefix)

```
CLAUDE.md                                 # Add note: use wxAI.md for new projects
_wxAI/settings.json                       # Ensure wx prefix in all AI provider configs
```

---

## Key Decisions

### Decision 1: No new database tables

**Chosen**: Extend existing `companyauditlogs` with new `actiontype` values (`ai_interaction`, `rules_sync`) and extend `projectdocuments` with `doctype = 'override_log'`.
**Rationale**: The existing audit infrastructure already handles structured logging. Adding new tables would duplicate functionality.
**Alternative**: New `ai_interaction_logs` table — rejected (unnecessary duplication).

### Decision 2: Scope-First gate implemented in wxAI commands (not database triggers)

**Chosen**: Gate logic lives in `_wxAI/commands/wxAI-scope-check.md` and `cli/commands/scope-check.ts`. AI reads the command before implementing.
**Rationale**: Database triggers cannot intercept AI file operations. The gate must be at the AI instruction level.
**Alternative**: Database trigger on file system events — rejected (not feasible for AI file operations).

### Decision 3: Auto-update uses file hash comparison (not just version number)

**Chosen**: `.wxkanban-version` stores version number AND file hashes. Sync triggers if either version OR any file hash differs.
**Rationale**: Version numbers can be forgotten to increment. Hash comparison catches any file change regardless of version bump.
**Alternative**: Version number only — rejected (too easy to miss incrementing).

### Decision 4: Mistral AI for conversational scope creation (not Claude)

**Chosen**: Mistral AI handles the conversational scope creation dialogue. Claude/Blackbox handle implementation.
**Rationale**: Mistral's conversational strengths suit the natural language scope gathering process. Separation of concerns between AI providers.
**Alternative**: Single AI provider for all tasks — rejected (misses opportunity for provider specialization).

### Decision 5: Training mode is a separate command, not a flag

**Chosen**: `wxAI-training` is a standalone command that can be invoked explicitly.
**Rationale**: Training mode has a distinct workflow that should be clearly separated from normal implementation flow.
**Alternative**: `--training` flag on `wxAI-implement` — rejected (conflates two different workflows).

### Decision 6: Protected file list stored in `.wxkanban-origin`

**Chosen**: The list of protected files is stored in `.wxkanban-origin` so it travels with the project and is always authoritative.
**Rationale**: Centralizes the protected file list in one place. AI reads `.wxkanban-origin` to know what to protect.
**Alternative**: Hardcoded list in AI instructions — rejected (hard to update, not authoritative).

---

## wxAI Command Specifications

### wxAI-scope-check (New)

**Purpose**: Pre-implementation scope verification gate  
**Trigger**: Called automatically at the start of every `wxAI-implement` execution  
**Logic**:
1. Read spec number from context
2. Query database: spec exists, tasks > 0, documents >= 4, status valid
3. If all pass → return `GATE_PASS`
4. If any fail → return `GATE_FAIL` with specific failure details and remediation steps
5. Log gate result to `companyauditlogs`

### wxAI-todo-import (New)

**Purpose**: Convert existing unlinked TODO files to scoped database tasks  
**Trigger**: Manual invocation or automatic scan on session start  
**Logic**:
1. Scan project root and subdirectories for `TODO*.md` files
2. For each file: check if scope reference header exists
3. If no scope reference: analyze content, search for matching scopes, propose mappings
4. Present proposals to developer for confirmation
5. On confirmation: insert tasks via `wxk_scope_import`, update TODO file with task IDs

### wxAI-training (New)

**Purpose**: Guided onboarding for untrained developers  
**Trigger**: Manual invocation or automatic trigger when developer has no scope context  
**Logic**:
1. Explain the 6-phase lifecycle
2. Explain the scope-first rule and why it exists
3. Walk through scope creation: 6 questions → summary → confirmation → pipeline execution
4. Show developer how to find existing scopes
5. Show developer how to link TODO files to scopes

---

## API Routes

### AI Audit Log Viewer
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/ai-audit/logs` | ADMIN | List AI interaction audit logs with filters |
| GET | `/api/ai-audit/logs/:id` | ADMIN | Get specific AI interaction log entry |
| GET | `/api/ai-audit/summary` | ADMIN | Summary stats: blocks triggered, scopes created, overrides used |
| GET | `/api/ai-audit/overrides` | ADMIN | List all emergency overrides with reasons |

---

## Sync Command Specification

### `wxai sync-global`

| Flag | Description |
|------|-------------|
| `--check` | Dry run — compare versions and file hashes, report what would change |
| (no flag) | Apply updates — pull latest protected files from wxKanban source |
| `--verbose` | Show diff of each changed file |
| `--disable-auto` | Set `auto_update: false` in `.wxkanban-version` |
| `--enable-auto` | Set `auto_update: true` in `.wxkanban-version` |
| `--force` | Force update even if versions match |

**Sync process**:
1. Read local `.wxkanban-version`
2. Fetch wxKanban source `.wxkanban-version` (via git or API)
3. Compare `wxkanban_rules_version` and file hashes
4. If different: download updated files, overwrite local copies
5. Preserve consumer project's `_wxAI/rules/projectrules.md` append section
6. Update local `.wxkanban-version` with new version and timestamp
7. Log sync to `companyauditlogs` with `actiontype = 'rules_sync'`

---

## AI Interaction Log Format

All AI interactions logged to `companyauditlogs`:

```json
{
  "actiontype": "ai_interaction",
  "actiondetails": {
    "ai_provider": "claude|gemini|mistral|blackbox|openai",
    "session_id": "uuid",
    "action_type": "scope_created|implementation_started|file_created|file_modified|override_used|block_triggered|rules_sync",
    "scope_number": "NNN",
    "task_id": "taskid",
    "details": "Human-readable description",
    "files_affected": ["path/to/file"],
    "force_override": false,
    "override_reason": null
  }
}
```

---

## Progress Tracking

- [x] Phase 0: Scope document reviewed (`specs/Project-Scope/015-AiInteraction.md`)
- [x] Phase 1: Design complete (spec.md, plan.md)
- [ ] Phase 2: Tasks generated (tasks.md)
- [ ] Phase 3: Implementation complete
- [ ] Phase 4: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)
