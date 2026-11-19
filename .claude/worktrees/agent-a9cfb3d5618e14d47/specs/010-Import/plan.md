# Implementation Plan: Scope Import — Spec-to-wxKanban Synchronizer

**Branch**: `project-scope` | **Date**: 2026-02-21 | **Spec**: [010-scope-import.md](010-scope-import.md)
**Input**: Feature specification from `specs/Project-Scope/010-scope-import.md`

---

## Summary

A command (`.claude/commands/scope-import.md`) that scans all `specs/NNN-*` directories, creates scaffold stubs for missing artifacts, and synchronizes every `tasks.md` task into the wxKanban PostgreSQL database via `wxk_*` MCP tools. One `specifications` row per spec, one `tasks` row per checklist item, task-to-task deps wired from the dependency block. Idempotent, dry-run safe, single-spec scoped.

The command artifact (`.claude/commands/scope-import.md`) was created in Phase 1 and updated in Phase 2. The plan phase documents final decisions and generates test scenarios.

---

## Technical Context

**Type**: Claude command (`.claude/commands/scope-import.md`)
**Language/Version**: Markdown instruction file executed by Claude Code agent
**Primary Dependencies**: `wxkanban` MCP server (`wxk_*` tools), filesystem read/write
**Storage**: PostgreSQL via `wxk_scope_import`, `wxk_task_create`, `wxk_task_close` MCP tools
**Testing**: Manual verification via `wxk_task_list({ spec_number: "NNN" })`, `wxk_stats`
**Target Platform**: Claude Code CLI on wxKanban developer workstations
**Performance Goals**: Full import of 627 tasks across 6 specs in a single session; individual spec import (e.g., spec-009, 41 tasks) should complete in under 2 minutes
**Constraints**: Idempotent — must not create duplicates on re-run; dry-run must produce zero side effects
**Scale/Scope**: 9 spec directories, 627 tasks currently, grows with project

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript only | N/A | Claude command, not application code |
| No console.log | N/A | Command outputs via Claude's text channel |
| No `any` types | N/A | Not TypeScript |
| Security: no secrets | ✅ Pass | No credentials used; wxk_* MCP reads from PostgreSQL via env DATABASE_URL |
| Dark/light mode | N/A | CLI tool |
| No toast messages | N/A | CLI tool |
| Database naming conventions | N/A | Not a database feature |

**Gate Result**: PASS — constitutional constraints do not apply to Claude command files.

**Exception Note (§I)**: Constitution §I mandates the React/Express/PostgreSQL stack for "All development". `.claude/commands/*.md` files are instruction artifacts executed by the Claude Code agent, not application source code. They produce no compiled output, touch no database, and add no npm dependencies. §I–§IV are inapplicable by class; §V (security) and §VII (lifecycle) apply normally.

---

## Project Structure

### Documentation (this feature)

```
specs/Project-Scope/
├── 010-scope-import.md   # Spec
├── plan.md               # This file
├── research.md           # bd CLI findings
├── quickstart.md         # Test scenarios
├── checklists/
│   └── requirements.md   # Quality checklist
└── tasks.md              # Phase 2 output (/tasks command)
```

### Source Code (command artifact)

```
.claude/commands/
└── scope-import.md       # The command implementation (already written)
```

---

## Key Decisions

### Decision 1: `specid` for spec-to-task hierarchy

**Chosen**: `wxk_task_create` with `specid` linking each task to its parent specification row.
**Rationale**: wxKanban PostgreSQL schema uses `specid` foreign key on the `tasks` table to establish spec-to-task hierarchy. `wxk_task_list({ spec_number: "NNN" })` returns all tasks for a spec.
**Alternative**: Flat task list with no spec link — rejected (no filtering or hierarchy possible).

### Decision 2: `specnumber` as idempotency key for specifications

**Chosen**: Check for existing `specifications` row by `specnumber='NNN'` before creating.
**Rationale**: `wxk_scope_import` handles this automatically — idempotent by design.
**Alternative**: Title-based match — less reliable if titles change.

### Decision 3: `status='completed'` for completed tasks

**Chosen**: `wxk_task_create` / `wxk_task_close` sets `status='completed'` for tasks marked `[x]` in tasks.md.
**Rationale**: wxKanban valid statuses are `open`, `in_progress`, `completed`, `orphaned`. Maps directly from `[x]` checkbox.
**Note**: The original command draft used Beads `--status closed` — replaced with wxKanban `status='completed'`.

### Decision 4: Auto-suffix for duplicate NNN prefix conflict

**Chosen**: Alphabetical suffix assignment (spec-005a, spec-005b) for directories sharing a prefix.
**Rationale**: Non-blocking. Import proceeds; user can resolve the naming conflict later. Spec numbers are stable and queryable.
**Alternative**: Halt with error — rejected by user (Phase 2 clarification Q2).

### Decision 5: Task name as idempotency key

**Chosen**: Match existing tasks by name prefix `[NNN-TXXX]` (e.g., `[009-T001]`). `wxk_scope_import` skips tasks that already exist.
**Rationale**: Stable, human-readable, unique within a project. Works even if task UUIDs change (re-import after db wipe).
**Alternative**: UUID-based — not stable across re-imports.

### Decision 6: Scope-import is an AI command, not application code

**Chosen**: Implemented as `.claude/commands/scope-import.md` (instruction file for AI agents).
**Rationale**: The import logic requires reading many files, making many `wxk_*` MCP calls, and adapting to variable spec structure. AI reasoning handles this better than a static script.
**Alternative**: bash script or Node.js CLI — rejected (would need maintenance, error handling for 30+ MCP calls, harder to adapt to format variations).

---

## Phase 0: Research Findings

Research completed. See [research.md](research.md) for full findings.

**Key findings affecting implementation**:
- `wxk_scope_import` handles spec + task creation atomically ✅
- `wxk_task_create` creates individual tasks with `specid` link ✅
- `wxk_task_close` sets `status='completed'` for finished tasks ✅
- `wxk_scope_import` inserts `taskdependencies` rows from dependency block ✅
- `wxk_scope_import` is idempotent — skips existing tasks by `[NNN-TXXX]` name prefix ✅
- `wxk_task_list({ spec_number: "NNN" })` for verification ✅
- `wxk_scope_import` processes all tasks in one MCP call (not individual calls)

---

## Phase 1: Design

No data model or API contracts needed (Claude command, not a software service).

**Quickstart test scenarios** → see [quickstart.md](quickstart.md).

---

## Phase 2: Task Planning Approach

The `/tasks` command will generate `tasks.md` for this feature. Expected tasks:

1. **Update command**: Correct `scope-import.md` command with all Phase 2 clarifications (--parent, --status closed, 005 auto-suffix, labels at creation)
2. **Spec corrections**: Fix US1 and Success Criteria #6 in spec (`done` → `closed`)
3. **Checklist**: Create `checklists/requirements.md` quality checklist
4. **Test spec-009**: Run `/scope-import --spec 009` and verify 41 tasks created in wxKanban
5. **Resolve 005 conflict**: Rename one of the 005 directories to eliminate the prefix collision
6. **Full live import**: Run `/scope-import` for all specs
7. **Verify**: `wxk_task_list({ spec_number: "NNN" })` for each spec, `wxk_stats` for totals
8. **Update spec status**: Mark spec 010 as `in_review`

**Estimated tasks**: 8–10 ordered tasks
**Parallel opportunities**: Spec-009 test and 005 conflict resolution can run independently

---

## Progress Tracking

- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Task planning approach described
- [ ] Phase 3: Tasks generated (`/wxAI-tasks`)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)
