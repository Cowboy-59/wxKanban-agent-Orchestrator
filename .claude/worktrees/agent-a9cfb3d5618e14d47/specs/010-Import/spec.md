# Spec 010: Scope Import — Spec-to-wxKanban Synchronizer

**Branch**: `project-scope`
**Type**: tooling / developer workflow
**Status**: clarified
**Created**: 2026-02-21

---

## Overview

The `scope-import` command scans the `specs/` directory tree, creates missing scaffold stubs, and synchronizes every task in each spec's `tasks.md` into the wxKanban PostgreSQL database via the `wxk_*` MCP tools. The result is a complete task hierarchy in wxKanban — one `specifications` row per spec, one `tasks` row per checklist item — with dependency links wired from the `tasks.md` dependency graph.

---

## User Scenarios & Testing

### US1 — Initial Import: Seed wxKanban from All Specs

**Actor**: Developer starting a new session after multiple wxAI pipeline runs have generated `tasks.md` files but no corresponding wxKanban tasks exist.

**Scenario**:
1. Developer runs `/scope-import`
2. Command scans all `specs/NNN-*` directories
3. For each spec with `tasks.md`, a `specifications` row is created in wxKanban
4. For each task line in `tasks.md`, a `tasks` row is created with `[NNN-TXXX]` prefix linked to the spec
5. Dependency links are added between tasks matching the `tasks.md` dependency block
6. Human tasks are flagged; completed tasks `[x]` are created with status `completed`
7. Final report shows counts of tasks created and dependency links added

**Expected outcome**: `wxk_task_list({ spec_number: "009" })` returns 41 tasks. `wxk_stats` shows spec-009 task counts.

---

### US2 — Idempotent Re-run: No Duplicates

**Actor**: Developer re-runs import after previously running it (or after partial run).

**Scenario**:
1. Developer runs `/scope-import` a second time
2. Command detects existing issues with matching `[NNN-TXXX]` prefix
3. No duplicate issues are created
4. Any newly added tasks (tasks.md was updated) are synced in
5. Report shows "NN skipped (already exist), M created"

---

### US3 — Dry Run: Preview Without Writing

**Actor**: Developer wants to see what would be created before committing.

**Scenario**:
1. Developer runs `/scope-import --dry-run`
2. Full coverage table and would-create list is printed
3. No wxKanban tasks are created, no scaffold files are written
4. Report clearly marks all rows as `(dry run — not written)`

---

### US4 — Single Spec Import

**Actor**: Developer just completed a wxAI pipeline run for spec 009 and wants to seed only that spec's tasks into wxKanban.

**Scenario**:
1. Developer runs `/scope-import --spec 009`
2. Command processes only `specs/009-*` directory
3. All 41 tasks from `tasks.md` are created as wxKanban tasks
4. Other specs are not touched

---

### US5 — Scaffold Discovery: Find Missing Pipeline Artifacts

**Actor**: Developer wants to audit which specs are missing `tasks.md`, `plan.md`, etc.

**Scenario**:
1. Developer runs `/scope-import --skip-db`
2. Command scans all spec directories
3. Reports a coverage matrix: which artifacts are present/missing per spec
4. Notes "ready for `/speckit.tasks`" for specs that have `plan.md` but no `tasks.md`
5. Creates stub `spec.md` for spec directories missing it entirely

---

## Functional Requirements

### FR-001 — Spec Directory Scan
The command MUST scan `specs/` for all directories matching `NNN-*` pattern (NNN = zero-padded integer), sorted numerically.

### FR-002 — Artifact Coverage Check
For each spec directory, check presence of: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, `checklists/requirements.md`. Output a coverage table.

### FR-003 — Scaffold Stub Creation
For specs missing `spec.md`, create a minimal stub (title from directory name, status: draft). Never overwrite existing files.

### FR-004 — Tasks.md Parsing
Parse each `tasks.md` for checklist lines:
- Pattern: `- [ ] T001 [P] description` or `- [x] T001 [P] description`
- Extract: task ID (T\d+), status (open/closed), parallel flag [P], human flag `**HUMAN TASK**`, description (first 80 chars)
- Checkbox matching MUST be case-insensitive: `[x]` and `[X]` both indicate completed (`closed`) status
- Skip non-task lines (headers, blank lines, dependency blocks)

### FR-005 — Parent wxKanban Specification Record
For each spec with a `tasks.md`, check for an existing `specifications` row with `specnumber='NNN'`. If none found, create one via `wxk_spec_update`: `title="Spec NNN: <dir-title-humanized>"`, status=`tasks_generated`.

### FR-006 — wxKanban Task Records
For each task in `tasks.md`, search existing tasks for name containing `[NNN-TXXX]`. If not found, create via `wxk_task_create`: `name="[NNN-T001] <description>"`, type=task, priority=medium, specid linked to parent spec. Status: `open` for `[ ]`, `completed` for `[x]`. Human tasks flagged with `assignedduty='human'`.

### FR-007 — Task-to-Task Dependency Wiring
Parse the dependency block at the bottom of `tasks.md` for task-to-task inter-dependencies (lines matching `T\d+ → T\d+` or range patterns `T002–T006 → T007`). For each pair, insert into `taskdependencies` via `wxk_scope_import`. Expand range syntax. Skip if dependency already exists.

### FR-012 — Duplicate Spec Number Handling
If two or more directories share the same NNN prefix (e.g., `005-specs-004-landingpage` and `005-Time-and-Billing`), assign alphabetical suffixes to their labels: `spec-005a` for the first alphabetically, `spec-005b` for the second, etc. Report these as warnings in the discovery table and in the final report. The suffix is applied consistently to both the parent issue label and all task issue labels.

### FR-008 — Idempotency
Running the command multiple times MUST NOT create duplicate issues. Match by `[NNN-TXXX]` prefix in title. Report existing issues as "skipped".

### FR-009 — Dry Run Mode
When `--dry-run` flag is passed, perform all discovery and planning steps but skip all write operations (no `wxk_task_create`, no dependency inserts, no file writes). All report rows are marked `(dry run)`.

### FR-010 — Scoped Run
When `--spec NNN` flag is passed, process only the matching spec directory. All other specs are skipped.

### FR-011 — Completion Report
Always emit a structured report: specs scanned, tasks.md found, scaffold changes, issues created/skipped, deps added, errors. Full import of ≤317 tasks SHOULD complete within 10 minutes; single-spec import SHOULD complete within 2 minutes.

---

## Success Criteria

1. After `/scope-import`, `wxk_task_list({ spec_number: "009" })` returns the same count as task items in `specs/009-*/tasks.md`
2. No duplicate tasks created on re-run
3. `--dry-run` produces zero write side effects
4. `--spec NNN` processes exactly one spec
5. Human tasks are flagged with `assignedduty='human'`
6. Completed tasks `[x]` or `[X]` have wxKanban status `completed`
7. Coverage table correctly identifies missing artifacts

---

## Key Entities

| Entity | Description |
|--------|-------------|
| Spec directory | `specs/NNN-<name>/` |
| tasks.md | Checklist-format task list generated by wxAI pipeline |
| wxKanban specification | `specifications` row representing the entire spec |
| wxKanban task | `tasks` row per task line, linked to spec via `specid` |
| spec number | Links all tasks to their spec for filtering (`specnumber='NNN'`) |
| human duty | Marks tasks requiring human execution (`assignedduty='human'`) |

---

## Constraints

- MUST NOT overwrite existing spec artifacts
- MUST NOT create duplicate wxKanban tasks
- MUST NOT insert a `taskdependencies` row if the dependency would be circular
- MUST be idempotent — safe to run on every session start
- Command is read-only when `--dry-run` is passed
