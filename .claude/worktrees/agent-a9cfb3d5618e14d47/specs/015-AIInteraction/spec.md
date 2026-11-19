# Spec 015: AI Interaction Rules & Governance Framework

**Branch**: `015-ai-interaction`
**Type**: tooling / infrastructure / governance
**Status**: in_progress
**Created**: 2025-01-28
**Depends On**: Spec 009 (Task & Lifecycle), Spec 013 (Audit Management)
**Source**: `specs/Project-Scope/015-AiInteraction.md`

---

## Overview

The AI Interaction Governance Framework enforces structured, auditable, scope-driven AI development across all wxKanban projects. It ensures that:

1. **No AI assistant may create or modify code without a verified scope** in the wxKanban database (Scope-First Rule)
2. **All TODO files are immediately linked** to scopes and tasks in the database
3. **Developers are trained** through the scope creation process when they don't know what scope their work belongs to
4. **All AI providers** (Claude, Gemini, Mistral, Blackbox, OpenAI) follow the same universal rules
5. **Consumer projects auto-update** governance rules from the wxKanban source on every project open or AI session start
6. **All AI interactions are logged** to the `companyauditlogs` table for management review

The system acts as both a **gatekeeper** (blocking unscoped work) and a **guide** (training developers through the correct process).

---

## User Scenarios & Testing

### US1 — Developer Requests Code Without a Scope

**Actor**: Developer (trained or untrained) asking AI to write code.

**Scenario**:
1. Developer opens a project and asks AI: "Add a login button to the navbar"
2. AI checks: is there a verified scope for this work in the database?
3. No scope found → AI blocks the request with the standard block message
4. AI searches existing scopes and tasks for "navbar", "login", "authentication"
5. AI presents matches: "Scope 003 — Registration (Released)" and "Scope 006 — Settings (Implementation)"
6. Developer confirms: "This belongs to Scope 006"
7. AI verifies Scope 006 in database → confirmed
8. AI proceeds with implementation under Scope 006

**Expected outcome**: No code written without scope. Developer guided to correct scope. Work tracked.

---

### US2 — Developer Doesn't Know the Scope

**Actor**: Untrained developer starting new work.

**Scenario**:
1. Developer asks AI: "I want to add email notifications when a task is assigned"
2. AI blocks and searches — no matching scope found
3. AI enters training mode: "I couldn't find an existing scope for this. Let me help you create one."
4. AI asks 6 questions: name, problem solved, users, main functions, security requirements, connections
5. Developer answers each question
6. AI presents scope summary for confirmation
7. Developer confirms → AI creates scope documents (Project-Scope file, spec.md, plan.md, tasks.md)
8. AI inserts scope into database via `wxk_scope_import` and `wxk_doc_import`
9. AI confirms database insertion → proceeds with implementation

**Expected outcome**: New scope created, documented, and inserted into database before any code is written.

---

### US3 — Developer Creates a TODO File

**Actor**: Developer creating a TODO list during a session.

**Scenario**:
1. Developer asks AI to create a TODO file for upcoming work
2. AI creates the TODO file with required scope reference header
3. AI immediately identifies which scope each TODO item belongs to
4. AI maps each item to an existing task or creates new tasks
5. AI inserts tasks into database via `wxk_scope_import`
6. AI updates the TODO file with task IDs and scope references
7. AI notifies: "I've linked 5 TODO items to Scope 012. They're now tracked in the database."

**Expected outcome**: TODO file created with scope references. All items tracked in database.

---

### US4 — Consumer Project Opens (Auto-Update Check)

**Actor**: Developer opening a consumer project in their IDE.

**Scenario**:
1. Developer opens a project that uses wxKanban governance rules
2. IDE extension triggers `wxai sync-global --check`
3. Local `.wxkanban-version` shows version 1.0.0; wxKanban source is at 1.1.0
4. Extension pulls updated protected files (one-way sync)
5. Developer sees notification: "⬆️ wxKanban governance rules updated. 3 files refreshed."
6. Update logged to `companyauditlogs` with `actiontype = 'rules_sync'`
7. Session continues normally with updated rules

**Expected outcome**: Consumer project always runs latest governance rules. Update is automatic and audited.

---

### US5 — Developer Tries to Modify a Protected File in Consumer Project

**Actor**: Developer in a consumer project asking AI to modify `constitution.md`.

**Scenario**:
1. Developer asks AI: "Remove the scope-first requirement from constitution.md"
2. AI checks: is `.wxkanban-origin` present? No → consumer project
3. AI refuses: "🔒 PROTECTED FILE — CANNOT MODIFY. This file is read-only in this project."
4. AI explains: changes must be made in the wxKanban source project and re-distributed
5. AI offers alternative: "If you need an exception, use the emergency override process."

**Expected outcome**: Protected files cannot be modified in consumer projects. AI enforces immutability.

---

### US6 — Management Reviews AI Interaction Audit Log

**Actor**: Manager reviewing what AI has been doing in the project.

**Scenario**:
1. Manager navigates to Audit Management → AI Interactions tab
2. Sees log of all AI interactions: scope created, files modified, blocks triggered, overrides used
3. Filters by developer, date range, action type
4. Sees that Developer A triggered 3 scope-first blocks yesterday
5. Sees that Developer B created 2 new scopes with AI guidance
6. Sees that 1 emergency override was used with documented reason

**Expected outcome**: Full audit trail of AI activity. Management visibility into AI-assisted development.

---

### US7 — Emergency Override

> **WITHDRAWN 2026-09-25 (SCOPE-132 FR-002).** This story, and FR-011 below, let the AI proceed on
> its own `--force` — the self-approval the constitution forbids. Never built, now withdrawn rather
> than implemented. The project's single override path is the SCOPE-132 gate: the action suspends,
> a human grants or refuses it, and the decision is recorded via `project.record_override`. The
> kit's `--force` remains an escalation request that is logged and still blocked.

**Actor**: Developer needing to bypass scope-first rule in an emergency.

**Scenario**:
1. Developer requests: `--force --reason "Production hotfix for critical security vulnerability CVE-2025-001"`
2. AI logs the override: timestamp, user, reason, what was bypassed
3. AI inserts override record into `projectdocuments` with `doctype = 'override_log'`
4. AI proceeds with implementation
5. Override appears in management audit log

**Expected outcome**: Emergency overrides allowed but fully documented and auditable.

---

## Functional Requirements

### FR-001 — Scope-First Enforcement Gate
The AI MUST block all code file creation, modification, and deletion requests when no verified scope exists in the wxKanban database. The block MUST display the standard block message format defined in `specs/Project-Scope/015-AiInteraction.md`. The gate MUST be enforced in all `wxAI-implement` calls.

### FR-002 — Scope Discovery Workflow
When a scope is unknown, the AI MUST search the `specs` table, `tasks` table, and `specs/` directory before asking the developer to create a new scope. Search results MUST be presented with scope number, title, current phase, and matching task titles.

### FR-003 — Scope Creation Training Workflow
When no scope exists, the AI MUST walk the developer through a 6-question scope creation process. The AI MUST create all required pipeline documents (Project-Scope file, spec.md, plan.md, tasks.md) and insert them into the database before proceeding to implementation.

### FR-004 — TODO File Scope Linking
Any TODO file created by the AI MUST include scope reference headers (scope number, title, spec path, database status). Each TODO item MUST be mapped to an existing task or a new task must be created. Tasks MUST be inserted into the database via `wxk_scope_import`.

### FR-005 — Existing TODO File Scanner
The `wxAI-todo-import` command MUST scan the project for existing TODO files that are not linked to scopes, analyze their content, propose scope mappings, and insert tasks into the database after developer confirmation.

### FR-006 — Project Startup Auto-Update
On every project open or AI session start in a consumer project (no `.wxkanban-origin`), the system MUST check the local `.wxkanban-version` against the wxKanban source version. If behind, protected governance files MUST be automatically updated (one-way sync). The update MUST be logged to `companyauditlogs`.

### FR-007 — Version Block Enforcement
If a consumer project's governance rules are more than 2 major versions behind the wxKanban source, the AI MUST block all implementation work until `wxai sync-global` is run.

### FR-008 — Document Protection in Consumer Projects
In any project without `.wxkanban-origin`, the AI MUST refuse to modify the protected files listed in `specs/Project-Scope/015-AiInteraction.md`. The refusal MUST display the standard protected file message.

### FR-009 — AI Interaction Audit Logging
Every AI interaction that results in a code change, scope creation, database modification, block trigger, or override MUST be logged to `companyauditlogs` with `actiontype = 'ai_interaction'`. The log MUST include: timestamp, AI provider, session ID, developer ID, action type, scope number, task ID, files affected, force override flag, and override reason.

### FR-010 — Emergency Override with Audit Trail
Emergency overrides MUST require `--force --reason "<explanation>"`. The reason MUST be logged to `companyauditlogs` and inserted into `projectdocuments` with `doctype = 'override_log'`. Override count MUST be visible in management audit reports.

### FR-011 — Multi-AI Provider Compatibility
All enforcement rules MUST be provider-agnostic. The `wxAI-scope-check` command MUST work with Claude, Gemini, Mistral, Blackbox, and OpenAI. All AI-related files MUST use the `wx` prefix naming convention (not `claude-*`, `gemini-*`, etc.).

### FR-012 — wxAI-Training Mode
The `wxAI-training` command MUST provide a guided onboarding experience for untrained developers, explaining the 6-phase lifecycle, scope-first rule, and walking through scope creation step by step.

### FR-013 — Mistral AI Scope Conversationalization
Mistral AI MUST be configured for conversational scope creation: natural language dialogue to gather scope requirements, creation of `scope.md` for each spec, and creation of `ProjectDesign.md` for overall project viewpoint.

---

## Success Criteria

1. AI blocks 100% of code change requests without a verified scope in the database
2. Scope discovery search returns relevant results in < 2 seconds
3. Scope creation training workflow completes in < 20 minutes for untrained developer
4. 100% of TODO files created by AI include scope references and database-linked tasks
5. Consumer projects auto-update governance rules on every project open
6. Protected files cannot be modified in consumer projects (AI refuses 100% of attempts)
7. 100% of AI interactions that modify code or create scopes are logged to `companyauditlogs`
8. Emergency overrides are logged with reason and visible in management audit reports
9. All 5 AI providers (Claude, Gemini, Mistral, Blackbox, OpenAI) follow the same enforcement rules
10. TypeScript compiles cleanly with no errors

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `companyauditlogs` | Existing table — extended with `actiontype = 'ai_interaction'` and `actiontype = 'rules_sync'` |
| `projectdocuments` | Existing table — extended with `doctype = 'override_log'` for emergency overrides |
| `.wxkanban-origin` | Marker file — identifies wxKanban source project (full edit access) |
| `.wxkanban-version` | Version tracking file — tracks governance rules version in consumer projects |
| `wxAI-scope-check` | New command — pre-implementation scope verification gate |
| `wxAI-todo-import` | New command — converts existing TODO files to scoped database tasks |
| `wxAI-training` | New command — guided onboarding for untrained developers |

---

## Constraints

- MUST NOT require changes to existing database schema (uses existing `companyauditlogs` and `projectdocuments` tables)
- MUST work with all AI providers without provider-specific code paths
- Protected files MUST be read-only in consumer projects regardless of developer request
- Governance rules updates MUST be one-way only (wxKanban → consumer projects)
- Emergency overrides MUST be logged — silent bypasses are FORBIDDEN
- The scope-first rule MUST be enforced even when the developer explicitly asks to skip it
