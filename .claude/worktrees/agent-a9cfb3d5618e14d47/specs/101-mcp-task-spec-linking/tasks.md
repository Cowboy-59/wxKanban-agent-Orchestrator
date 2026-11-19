# Task Breakdown: MCP Task Spec Linking

**Feature**: MCP Task Spec Linking
**Spec**: 101
**Date Generated**: 2026-08-04
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)
**Source scope**: `specs/Project-Scope/101-mcp-task-spec-linking.md` (including Amendment A)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Expose specId on the create_task published schema | critical | done |
| 2 | LinkTaskToSpecInputSchema and TaskSpecLinkSchema | critical | done |
| 3 | link_task_to_spec handler, registration and permission | critical | done |
| 4 | UpdateSpecStatusInputSchema and SpecStatusSchema | high | done |
| 5 | update_spec_status handler, registration and permission | high | done |
| 6 | Schema regression tests for both new tools | high | done |
| 7 | phase2Compare resolves specs by identity, not title parsing | critical | todo |
| 8 | list_open_items publishes each task's owning spec | critical | todo |
| 9 | Complete matching under paging, truncation reported | high | todo |
| 10 | Indeterminate comparison state refuses rather than inserts | high | todo |
| 11 | Separator-tolerant document title matching in pushExistingSpec | medium | todo |
| 12 | Regression tests for the classification contract | high | todo |
| 13 | UpdateTaskInputSchema and DeleteTaskInputSchema | high | done |
| 14 | update_task handler, registration and permission | high | done |
| 15 | delete_task guarded handler, registration and permission | high | done |
| 16 | Regression tests and live read-only guard verification | high | done |

**T001–T006 shipped before this spec existed** and were verified live on 2026-08-04, not merely
claimed: `create_task` accepted `specId`, `link_task_to_spec` returned `linked: 1`, and
`update_spec_status` transitioned specs 112 and 113 from `planned` to `implementing`. Their fences
`[SCOPE 101 / T001..T006]` were hand-authored because the orchestrator `implement` path is
non-functional, and now have DB task rows to resolve against under `auditfences --strict`.

**T007–T012 are Amendment A** and are not started. **Two deployment surfaces:** T008 is hosted-MCP
and reaches production on a push to `main`; T007 and T009–T012 are kit source and reach consumers
only via `sync-to-orchestrator --release`.

---

## Task Details

### T001 — Expose specId on the create_task published schema

Add optional `specId` (uuid) to the `project.create_task` published `inputSchema`. The handler and `CreateTaskInputSchema` already accept and persist it; only the advertised schema hid it. FR-001.

### T002 — LinkTaskToSpecInputSchema and TaskSpecLinkSchema

Add the batch link schemas to `utils/schemas.ts`, enforcing exactly-one-of `specId`/`specNumber` via `.refine`. FR-002.

### T003 — link_task_to_spec handler, registration and permission

Case handler, tool registration and `PERMISSION_MATRIX` entry (`editor`/`admin`). Resolves specs via `selectScoped` and mutates via `updateScoped`. FR-002, FR-004.

### T004 — UpdateSpecStatusInputSchema and SpecStatusSchema

Lifecycle transition schemas locking the canonical vocabulary: `draft`, `planned`, `implementing`, `qa`, `human_testing`, `beta`, `released`. FR-003.

### T005 — update_spec_status handler, registration and permission

Case handler, tool registration and `PERMISSION_MATRIX` entry. Records a `document_updated` event best-effort; returns `previousStatus` and `status`. FR-003, FR-004.

### T006 — Schema regression tests for both new tools

Pure-Zod contract tests locking exactly-one-of identifiers, rejection of an empty `links` array, and the status vocabulary. FR-006.

### T007 — phase2Compare resolves specs by identity, not title parsing

Replace the `knownSpecNumbers` derivation in `wxkanban-agent/dbpush.ts`. Today it reads `t.specNumber ?? parseScopeFromTaskTitle(t.title)` from `list_open_items`; **the field does not exist and titles carry no scope number**, so the set is always empty, `isNew` is true for every spec, and everything routes to `pushNewSpec`. Resolve from an authoritative spec listing; populate `knownTaskIdsBySpec` from a complete task read **including completed tasks**. FR-007.

**Why not `cockpit_summary` alone:** it returns only *incomplete* tasks, so every task already marked done would look absent and dbpush would recreate it. The cheap fix solves spec matching and breaks task matching.

### T008 — list_open_items publishes each task's owning spec

Expose the owning spec identity per task. `projecttasks.specid` is already populated and is what `cockpit_summary` groups on; it is simply not returned by this endpoint. Measured baseline: **0 of 100** task rows carry any spec identity. Read-only addition; no permission-matrix change. FR-008.

### T009 — Complete matching under paging, truncation reported

Remove the single-page bound. Today `maxItems: 100` with no paging, so a spec whose tasks fall beyond the cap is indistinguishable from one that does not exist. Include completed tasks. Residual truncation must be reported, never silent. FR-009.

### T010 — Indeterminate comparison state refuses rather than inserts

Make the `unreachable` flag three-state (`ok` / `empty` / `indeterminate`) so an unusable read stops collapsing into "this project contains nothing". An empty result from a failed or truncated read blocks the push and names the failed read; a genuinely empty project still permits a first push; `--force` may override and says what it overrides. **This is the recurrence guard** — without it the same landmine rearms on the next read-path change. FR-010.

### T011 — Separator-tolerant document title matching in pushExistingSpec

Normalise document title matching across em-dash, colon and hyphen separators. **VERIFY BEFORE FIXING** — this defect was recorded in SCOPE-101 but has never been observed, because `pushExistingSpec` never executed. Confirm it is real before changing code. FR-011.

### T012 — Regression tests for the classification contract

Failing-first tests: a spec present in the DB is classified as existing (must fail against current code); an unusable read refuses rather than inserting; a schema test locks the added field on `list_open_items`. Per the standing rule that unit-green plus build-green has shipped fatal bugs, **T007 and T010 must also be proven by an actual `dbpush --dry-run --spec 112` reporting `updated: 1 / created: 0` against the live database.** FR-012.

### T013 — UpdateTaskInputSchema and DeleteTaskInputSchema

**Amendment B** (feedback `edd34387`). `UpdateTaskInputSchema` takes `taskId` plus any of `title`, `descriptionMarkdown`, `priority`, `dueDate` (nullable), `assignedToId` (nullable UUID), and at least one field is required. `DeleteTaskInputSchema` takes `taskId`. FR-014, FR-015.

### T014 — update_task handler, registration and permission

Patch only the fields sent, through `scoped.updateScoped`. Validate `assignedToId` against the project's company or its `projectusers` rows before writing. Declare `assignedToId` → `assignedtoid` on the MCP `projecttasks` mirror (the column exists in production). Gate `editor`/`admin`. FR-014, FR-016.

### T015 — delete_task guarded handler, registration and permission

In one transaction: lock the task row `FOR UPDATE` (predicated on id and projectid), then count cascade-victims: time entries, sync records, dependencies (both sides), compliance flags and state overrides. Any non-zero count refuses and names the blockers. Otherwise delete, return a snapshot, and report the set-null unlinks (AI proposals, test-plan items). Replace the stale admin-only placeholder with `editor`/`admin`. FR-015, FR-016.

### T016 — Regression tests and live read-only guard verification

Schema tests for both inputs, the parity test, and a read-only run of the blocker query against a real task with time entries. After deploy: one live `update_task` and one refused `delete_task` against the hosted server. FR-017.
