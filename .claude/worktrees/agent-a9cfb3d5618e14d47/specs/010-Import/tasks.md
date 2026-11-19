# Tasks: Scope Import — Spec-to-wxKanban Synchronizer (Feature 010)

**Branch**: `project-scope`
**Input**: plan.md, spec.md (010-scope-import.md), research.md, quickstart.md
**Generated**: 2026-02-21
**Total Tasks**: 12
**User Stories**: US1 (Initial Import), US2 (Idempotency), US3 (Dry Run), US4 (Single Spec), US5 (Scaffold Discovery)

**Key Finding**: Command artifact `.claude/commands/scope-import.md` already exists (written in Phase 1). Three correctness bugs found in Phase 2 research: (1) Step 3.5 used `bd label add` post-creation — replaced with `wxk_task_create` atomic call; (2) Step 3.5 used `--status=done` — replaced with wxKanban `status='completed'`; (3) `--parent` flag not used — replaced with `specid` FK link. New FR-012 (duplicate prefix auto-suffix) not yet implemented in command.

---

## Phase 1: Setup

- [x] T001 Read `.claude/commands/scope-import.md` Steps 3.3, 3.5 and `specs/Project-Scope/010-scope-import.md` to confirm exact current state before modifications

---

## Phase 2: Corrections — Command and Spec

_T002–T005 can all run in parallel (different files/sections)._

- [x] T002 [P] Update `.claude/commands/scope-import.md` — Step 3.3: change spec creation to `wxk_scope_import` with spec metadata; update Step 3.1 status parsing: `done` → `completed`
- [x] T003 [P] Update `.claude/commands/scope-import.md` — Step 3.5: replace the three-step bd block with `wxk_task_create` (name, specid, status) + `wxk_task_close` for completed tasks; fix the "consider closing manually" note to say `completed` not `closed`
- [x] T004 [P] Update `.claude/commands/scope-import.md` — Add Step 3.2.5 (between Step 3.2 and 3.3): detect duplicate NNN prefixes (two dirs share same numeric prefix); sort conflicting dirs alphabetically; assign suffix `a`, `b`, `c`... to the label (e.g. `spec-005a`, `spec-005b`); propagate the suffixed label to all subsequent steps for those specs; emit a `⚠️ WARNING: Duplicate prefix NNN — using spec-NNNa / spec-NNNb` line in the Phase 1 coverage table and final report
- [x] T005 [P] Update `specs/Project-Scope/010-scope-import.md` — fix US1 step 6 ("status `done`" → "status `completed`"); fix Success Criteria #6 ("Beads status `done`" → "wxKanban status `completed`"); fix Key Entities table ("child of parent via dependency" → "linked via `specid` FK"); fix spec status field from `draft` to `clarified`

---

## Phase 3: Checklist

- [x] T006 [P] Create `specs/Project-Scope/checklists/requirements.md` — quality checklist for spec 010; mark Phase 1 (Specify) ✅, Phase 2 (Clarify) ✅, Phase 3 (Plan) ✅ as complete; mark Phase 4 (Tasks) in-progress; include checks: all FRs numbered, all US have expected outcomes, success criteria measurable, idempotency verified, dry-run verified, command artifact exists

---

## Phase 4: Testing — Spec 009 First (HUMAN)

_Run T007 before T008 (sequential). T007 requires T002–T005 complete._

- [x] T007 **HUMAN TASK**: Run `/scope-import --dry-run` — verify Phase 1 coverage table shows all 9 specs; verify ⚠️ 005 duplicate warning present; verify "627 would-create" total; confirm no wxKanban tasks were created (`wxk_stats` unchanged); report any discrepancies
- [x] T008 **HUMAN TASK**: Run `/scope-import --spec 009` — verify output: 41 tasks created, 39 completed, 2 open (T008/T040), 2 human-duty flags; run `wxk_task_list({ spec_number: "009" })` = 41 tasks; **dep verification**: run `wxk_task_list({ spec_number: "009", status: "open" })` to confirm 2 open tasks
- [x] T009 **HUMAN TASK**: Re-run `/scope-import --spec 009` — verify 0 created, 41 skipped (idempotency check); run `wxk_task_list({ spec_number: "009" })` must still be 41

---

## Phase 5: Full Import (HUMAN)

_Run after Phase 4 passes._

- [x] T010 **HUMAN TASK**: Run `/scope-import --skip-db` — verify scaffold stubs created for `specs/004-LandingPage/spec.md`, `specs/005-specs-004-landingpage/spec.md`, `specs/005-Time-and-Billing/spec.md`; verify existing files (e.g. `specs/009-task-and-lifecycle/spec.md`) NOT overwritten
- [x] T011 **HUMAN TASK**: Run `/scope-import` (full import, all specs) — verify per-spec counts via `wxk_task_list`: spec-001=317, spec-002=74, spec-003=120, spec-006=24, spec-008=51, spec-009=41; run `wxk_task_ready` and confirm unblocked tasks are visible

---

## Phase 6: Polish

- [x] T012 [P] Run `/wxAI-lifecycle` to regenerate `project-documentation/Lifecycle.md` — spec-010 row should now appear with all pipeline stages marked ✅ and tasks as in-progress (0% — human tests pending)
- [x] T013 [P] `specs/010-Import/lifecycle.json` (pipeline created here, not Project-Scope) — verified: Phase 1 status=`complete`, Phase 2 status=`in_progress`, timestamps 2026-02-21; no update needed

---

## Dependencies

```
T001 → T002, T003, T004, T005 (read before any modifications)
T002, T003, T004, T005 → T006 (command complete before checklist)
T002, T003, T004, T005 → T007 HUMAN (command corrected before testing)
T007 HUMAN → T008 HUMAN (dry run passes before live import)
T008 HUMAN → T009 HUMAN (import before idempotency check)
T009 HUMAN → T010 HUMAN (spec-009 verified before scaffold test)
T010 HUMAN → T011 HUMAN (scaffold verified before full import)
T011 HUMAN → T012 (full import complete before lifecycle update)
T011 HUMAN → T013 (verify lifecycle.json after implementation complete)
```

---

## Parallel Execution Examples

```
# Phase 2 — all independent files:
T002, T003, T004, T005, T006 — launch all in parallel

# Phase 4 — sequential (each depends on prior):
T007 → T008 → T009 (must run in order)

# Phase 5 — sequential:
T010 → T011
```

---

## MVP Scope

**P0 (must fix before any testing)**: T001–T005 (command correctness bugs)

**P1 (core verification)**: T007, T008, T009 (dry run + spec-009 import + idempotency)

**P2 (full coverage)**: T010, T011 (scaffold + full import)

**P3 (housekeeping)**: T006, T012 (checklist + lifecycle)
