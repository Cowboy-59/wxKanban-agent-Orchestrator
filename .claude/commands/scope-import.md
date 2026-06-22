---
description: Scan all specs/NNN-* directories, create missing scaffold stubs, and sync every tasks.md task into PostgreSQL via the wxKanban MCP server
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Scope Import — Spec-to-PostgreSQL Synchronizer

This command scans the `specs/` directory tree, creates missing scaffold stubs, and synchronizes every task in each spec's `tasks.md` into the wxKanban PostgreSQL database via the `wxkanban` MCP server. The result is a complete task hierarchy in PostgreSQL — one `specifications` row per spec, one `tasks` row per checklist item — with dependency links from the `tasks.md` dependency graph.

**Spec**: `specs/Project-Scope/010-scope-import.md`
**MCP Server**: `wxkanban` (registered in `.claude/settings.json`)

---

## Pre-Flight

### 1. Parse Arguments

Check `{{args}}` for flags (case-insensitive):

| Flag | Effect |
|------|--------|
| `--dry-run` | Discover and plan everything but write nothing |
| `--spec NNN` | Process only the spec directory matching that number (e.g. `--spec 009`) |
| `--skip-scaffold` | Skip Phase 2 (scaffold stub creation) |
| `--skip-db` | Skip Phase 3 (PostgreSQL sync) |

Store parsed flags. Strip flags from `{{args}}` before further processing.

### 2. Validate Environment

- Confirm `specs/` directory exists in repo root
- Confirm the `wxkanban` MCP server is available (`wxk_stats` call — if it errors, abort Phase 3 with warning)
- If `--dry-run` is active, print:
  ```
  ⚠️  DRY RUN MODE — No files or database rows will be created
  ```

---

## Phase 1: Discover

**Goal**: Build an inventory of all spec directories and their pipeline artifacts.

### Step 1.1 — Scan Spec Directories

List all directories under `specs/` matching `NNN-*`. Sort numerically. Extract:
- Spec number (NNN, zero-padded)
- Spec slug (e.g. `009-task-and-lifecycle`)
- Human title (hyphens → spaces, strip leading NNN, title-case)

Filter to `--spec NNN` if passed.

### Step 1.2 — Check Artifact Presence

For each spec directory, check existence of:

| Artifact | Column Label |
|----------|-------------|
| `spec.md` | Specify |
| `checklists/requirements.md` | Clarify |
| `plan.md` | Plan |
| `tasks.md` | Tasks |

### Step 1.3 — Count Task Completion

For each spec with `tasks.md`:
- Count `- [x]` / `- [X]` (completed)
- Count `- [ ]` (pending)
- Derive completion %

### Step 1.4 — Print Coverage Table

```
============================================
SCOPE IMPORT — PHASE 1: DISCOVERY
============================================
| NNN | Slug                    | Spec | Tasks | Tasks% |
|-----|-------------------------|------|-------|--------|
| 001 | multi-platform-task     | ✅   | ✅    | 100%   |
| 009 | task-and-lifecycle      | ✅   | ✅    | 97%    |
============================================
```

---

## Phase 2: Scaffold

**Goal**: Create stub files for specs missing critical pipeline artifacts.

Skip if `--skip-scaffold` passed.

### Step 2.1 — Missing spec.md Stubs

For any spec dir with no `spec.md`, create a minimal stub:

```markdown
# Spec NNN: <Human Title>

**Status**: draft
**Created**: YYYY-MM-DD

> TODO: Run `/wxAI-pipeline <feature description>` to generate this spec.
```

Do NOT overwrite existing files.

### Step 2.2 — Readiness Notes

For specs with `plan.md` but no `tasks.md`: note `⚡ Spec NNN: ready to run /wxAI-tasks`
For specs with `spec.md` but no `plan.md`: note `📋 Spec NNN: ready to run /wxAI-plan`

### Step 2.3 — Phase 2 Report

```
============================================
SCOPE IMPORT — PHASE 2: SCAFFOLD
============================================
Stubs Created:    N
Readiness Notes:
  ⚡ Spec 004: has plan.md — run /wxAI-tasks
============================================
```

---

## Phase 3: PostgreSQL Sync

**Goal**: For each spec with `tasks.md`, ensure a `specifications` row exists and sync all tasks and dependencies into the `tasks` and `taskdependencies` tables.

Skip if `--skip-db` passed or MCP server unavailable.

### Step 3.1 — Use wxk_scope_import

Call the MCP tool `wxk_scope_import`:

```
wxk_scope_import({ spec_number: "NNN", dry_run: false })
```

- For all specs: omit `spec_number`
- For `--spec NNN`: pass the spec number
- For `--dry-run`: pass `dry_run: true`

The tool handles:
- Finding/creating the `specifications` row for the spec
- Parsing `tasks.md` task lines (task ID, status, description)
- Inserting into `tasks` with `specid` linked
- Parsing `## Dependencies` block and inserting into `taskdependencies`
- Idempotency: skips tasks that already exist (`[NNN-TXXX]` prefix match)

### Step 3.2 — Per-Spec Sync Report

After calling `wxk_scope_import`, show:

```
Spec 009 (task-and-lifecycle):
  Tasks created: 41 | Tasks skipped: 0 | Deps added: 32
```

---

## Phase 4: Final Report

```
============================================
SCOPE IMPORT COMPLETE
============================================
Mode:           <LIVE | DRY RUN>
Filter:         <NNN | all>

PHASE 2 — SCAFFOLD:
  Stubs Created:    N
  Readiness Notes:  M

PHASE 3 — PostgreSQL SYNC:
  Specs Processed:  N
  Tasks Created:    M
  Tasks Skipped:    K (already existed)
  Deps Added:       J
  Errors:           0

NEXT STEPS:
  - Run wxk_task_ready to find unblocked work
  - Run wxk_spec_list to view all specs with task counts
  - Run wxk_stats for a summary dashboard
============================================
```

---

## Behavior Rules

- **Idempotent**: Safe to run multiple times. Never creates duplicate specifications or tasks.
- **Non-destructive**: Never modifies `tasks.md` or spec artifacts.
- **PostgreSQL is authoritative**: Task status in DB may differ from `tasks.md` checkboxes — DB wins.
- **MCP tools replace bd commands**: All task tracking goes through `wxk_*` tools, not `bd`.

---

## Error Handling

- **`specs/` not found**: Print error, halt.
- **MCP server unavailable**: Warn, skip Phase 3, continue with Phases 1–2.
- **`wxk_scope_import` failure**: Log error, continue with remaining specs.
