# Quickstart: Scope Import — Integration Test Scenarios

**Feature**: Spec 010 — Scope Import
**Date**: 2026-02-21
**Prerequisites**: `wxkanban` MCP server available (registered in settings), `specs/` directory present, PostgreSQL database reachable

---

## Scenario 1: Dry Run — Full Preview

**Goal**: Verify discovery and dry-run reporting works without side effects.

```bash
# Step 1: Run dry-run
/scope-import --dry-run

# Expected output:
# - "⚠️  DRY RUN MODE" banner
# - Phase 1 coverage table listing all 9 spec dirs
# - ⚠️ warning for 005 duplicate prefix
# - Phase 2: lists 3 stub files that would be created (dry run)
# - Phase 3: lists issues that would be created (dry run)
# - Final report shows (dry run) on all counts

# Step 2: Verify no tasks were created
wxk_stats
# Expected: same task counts as before (no new tasks)

# Step 3: Verify no files were written
ls specs/004-LandingPage/spec.md
# Expected: file should NOT exist (dry run)
```

**Pass criteria**: Issue count unchanged, no new files created.

---

## Scenario 2: Single-Spec Import — Spec 009

**Goal**: Import spec 009 (41 tasks, known state) and verify task counts.

```bash
# Step 1: Import spec 009 only
/scope-import --spec 009

# Expected output:
# Spec: created/found "Spec 009: Task And Lifecycle" in specifications table
# Tasks: 41 created (39 completed, 2 open)
# Human tasks: 2 (T008, T040) flagged with assignedduty='human'
# Deps: ~50 added to taskdependencies

# Step 2: Verify spec exists in wxKanban
wxk_task_list({ spec_number: "009", status: "open" })
# Expected: 2 open tasks

# Step 3: Verify task count
wxk_task_list({ spec_number: "009" })
# Expected: 41 tasks total

# Step 4: Verify completed tasks
wxk_task_list({ spec_number: "009", status: "completed" })
# Expected: 39 completed tasks

# Step 5: Verify open tasks
wxk_task_list({ spec_number: "009", status: "open" })
# Expected: 2 open tasks (T008 and T040)

# Step 6: Verify overall stats
wxk_stats
# Expected: spec-009 shows 41 tasks, 39 completed
```

**Pass criteria**: All counts match. `wxk_task_list` returns correct task counts per status.

---

## Scenario 3: Idempotency — Re-run Spec 009

**Goal**: Verify no duplicates on second run.

```bash
# Step 1: Run import again (spec 009 already imported)
/scope-import --spec 009

# Expected output:
# Tasks: 0 created, 41 skipped (already existed)
# Deps: 0 added, ~50 skipped (already existed)

# Step 2: Verify count unchanged
wxk_task_list({ spec_number: "009" })
# Expected: still 41 tasks (no duplicates)
```

**Pass criteria**: Zero new issues created. Report shows all as "skipped".

---

## Scenario 4: Scaffold Discovery — Skip DB

**Goal**: Verify scaffold stub creation for specs missing spec.md.

```bash
# Step 1: Confirm 004-LandingPage has no spec.md
ls specs/004-LandingPage/spec.md
# Expected: no such file

# Step 2: Run scaffold-only import (skip PostgreSQL sync)
/scope-import --skip-db

# Expected output:
# Phase 2: stubs created for 004-LandingPage, 005-specs-004-landingpage, 005-Time-and-Billing
# Readiness notes: ⚡ for specs with plan.md but no tasks.md

# Step 3: Verify stub created
cat specs/004-LandingPage/spec.md
# Expected: stub with "TODO: Run /wxAI-pipeline" message

# Step 4: Verify existing spec.md not overwritten
head -1 specs/009-task-and-lifecycle/spec.md
# Expected: original content (not stub)
```

**Pass criteria**: Stubs created only for missing files. Existing files untouched.

---

## Scenario 5: 005 Duplicate Prefix — Auto-Suffix Labels

**Goal**: Verify duplicate NNN prefix produces correctly suffixed labels.

```bash
# Step 1: Run import filtered to 005 specs
/scope-import --spec 005

# Expected output:
# ⚠️ WARNING: Duplicate prefix 005 detected
# 005-specs-004-landingpage → label: spec-005a
# 005-Time-and-Billing → label: spec-005b
# (no tasks.md in either — skip db sync, note readiness)

# Step 2: Verify warning in report
# Expected: "Duplicate NNN prefix: 005 — using spec-005a, spec-005b"
```

**Pass criteria**: Warning emitted, correct suffix labels assigned, no error/halt.

---

## Scenario 6: Full Import — All Specs

**Goal**: Import all 6 specs with tasks.md in a single run.

```bash
# Precondition: Reset test state if Scenario 2 ran
# OR run on fresh wxKanban state (empty tasks table)

# Step 1: Full import
/scope-import

# Expected totals:
# Specs scanned: 9
# With tasks.md: 6 (001, 002, 003, 006, 008, 009)
# Tasks created: 627
# Tasks completed: 163 (all [x] tasks)
# Human tasks: varies (check each spec)

# Step 2: Verify per-spec counts via wxk_task_list
wxk_task_list({ spec_number: "001" })  # Expected: 317 tasks
wxk_task_list({ spec_number: "002" })  # Expected: 74 tasks
wxk_task_list({ spec_number: "003" })  # Expected: 120 tasks
wxk_task_list({ spec_number: "006" })  # Expected: 24 tasks
wxk_task_list({ spec_number: "008" })  # Expected: 51 tasks
wxk_task_list({ spec_number: "009" })  # Expected: 41 tasks

# Step 3: Verify unblocked tasks
wxk_task_ready
# Expected: only open tasks with no incomplete dependencies show up

# Step 4: Verify overall stats
wxk_stats
# Expected: 627 total tasks, 163 completed
```

**Pass criteria**: All counts match. `wxk_task_ready` shows correctly unblocked tasks.
