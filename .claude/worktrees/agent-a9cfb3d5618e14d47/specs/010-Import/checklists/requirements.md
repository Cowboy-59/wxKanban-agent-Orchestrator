# Requirements Checklist: Scope Import — Spec-to-wxKanban Synchronizer (Spec 010)

**Feature**: `specs/Project-Scope/010-scope-import.md`
**Command Artifact**: `.claude/commands/scope-import.md`
**Generated**: 2026-02-21
**Last Updated**: 2026-02-21

---

## Pipeline Phase Status

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Specify | ✅ Complete |
| Phase 2 | Clarify | ✅ Complete |
| Phase 3 | Plan | ✅ Complete |
| Phase 4 | Tasks | 🔄 In Progress |
| Phase 5 | QA Testing | ⏳ Pending |
| Phase 6 | Human Testing | ⏳ Pending |

---

## Specification Quality (Phase 1)

### Functional Requirements

- [x] All functional requirements are numbered (FR-001 through FR-012)
- [x] No gaps in FR numbering (FR-012 added for duplicate NNN prefix handling)
- [x] Each FR has a clear, imperative verb ("MUST", "SHOULD")
- [x] Each FR has a measurable outcome or verifiable condition
- [x] FR-004 (tasks.md parsing) specifies case-insensitive checkbox matching explicitly
- [x] FR-006 specifies `status='completed'` (not `done` or `closed`) for completed tasks
- [x] FR-011 includes performance targets (≤317 tasks / 10 min; single-spec / 2 min)
- [x] FR-012 specifies alphabetical suffix assignment for duplicate NNN prefixes

### User Scenarios

- [x] US1 (Initial Import) has a complete scenario and expected outcome
- [x] US2 (Idempotent Re-run) has a complete scenario
- [x] US3 (Dry Run) has a complete scenario with zero side-effect guarantee
- [x] US4 (Single Spec Import) has a complete scenario
- [x] US5 (Scaffold Discovery) has a complete scenario
- [x] All user scenarios reference correct wxKanban status (`completed`, not `done` or `closed`)

### Success Criteria

- [x] All 7 success criteria are measurable and verifiable
- [x] SC #1: count-verifiable (`wxk_task_list({ spec_number: "009" })`)
- [x] SC #2: idempotency verifiable (re-run creates 0 new tasks)
- [x] SC #3: dry-run zero-write verifiable (`wxk_stats` count unchanged)
- [x] SC #4: single-spec scope verifiable (other spec tasks unaffected)
- [x] SC #5: human-duty flag verifiable (`wxk_task_list` with human filter)
- [x] SC #6: uses correct status `completed` (not `done` or `closed`)
- [x] SC #7: coverage table accuracy verifiable by comparing to filesystem

---

## Clarification Quality (Phase 2)

- [x] Spec-to-task model clarified: `specid` FK link (not `--parent` flag or `bd dep add`)
- [x] Duplicate NNN prefix handling clarified: alphabetical suffix (spec-005a, spec-005b)
- [x] Both clarifications encoded back into spec (FR-006, FR-012)
- [x] No outstanding `[NEEDS CLARIFICATION]` markers in spec
- [x] Spec status updated from `draft` to `clarified`

---

## Plan Quality (Phase 3)

- [x] `plan.md` exists with all 6 key decisions documented
- [x] `research.md` exists with wxk_* MCP tool findings (7 findings)
- [x] `quickstart.md` exists with 6 test scenarios covering all user stories
- [x] `lifecycle.json` exists with correct phase states
- [x] Constitution Check section completed in plan.md
- [x] §I exception documented: command files are instruction artifacts, not application code
- [x] All phases: Phase 0 (research) and Phase 1 (design) complete

---

## Tasks Quality (Phase 4)

- [x] `tasks.md` exists with 13 tasks (T001–T013)
- [x] All AI tasks (T001–T006, T012–T013) have clear file targets and success conditions
- [x] All human tasks (T007–T011) have specific verification commands
- [x] Dependency block correctly models task ordering
- [x] Parallel execution opportunities identified (T002–T006 in Phase 2)
- [x] MVP scope defined (P0: T001–T005, P1: T007–T009, P2: T010–T011, P3: T006, T012)
- [ ] T001–T006 AI tasks implemented (in progress)
- [ ] T007 HUMAN: Dry-run verification passed
- [ ] T008 HUMAN: Spec-009 live import verified
- [ ] T009 HUMAN: Idempotency verified
- [ ] T010 HUMAN: Scaffold stubs verified
- [ ] T011 HUMAN: Full import verified

---

## Command Artifact Quality

- [x] `.claude/commands/scope-import.md` exists
- [x] All 4 flags documented: `--dry-run`, `--spec NNN`, `--skip-scaffold`, `--skip-db`
- [x] Step 3.3 uses `wxk_scope_import` for atomic spec + task creation
- [x] Step 3.5 uses `wxk_task_create` with `specid` link + `wxk_task_close` for completed tasks
- [x] Step 3.2.5 added for duplicate NNN prefix detection and alphabetical suffix assignment
- [x] Status uses `completed` consistently (`done` and `closed` removed throughout)
- [x] Idempotency: duplicate detection by `[NNN-TXXX]` name prefix documented
- [x] Dry-run: all write operations guarded by `NOT --dry-run` check
- [x] Error handling documented for all failure modes
- [x] Behavior Rules section summarizes all key invariants

---

## Idempotency Verification

- [x] Spec states idempotency as a hard requirement (FR-008)
- [x] Command detects existing tasks by `[NNN-TXXX]` name prefix (Step 3.5)
- [x] Spec dedup by `specnumber='NNN'` in `specifications` table (Step 3.3)
- [x] Duplicate `taskdependencies` inserts are skipped silently (Step 3.6)
- [ ] T009 HUMAN: Re-run test confirms 0 created / N skipped

---

## Dry-Run Verification

- [x] Spec states dry-run produces zero write side effects (FR-009)
- [x] Command guards all `wxk_task_create` calls with `NOT --dry-run` (Step 3.3, 3.5)
- [x] Command guards all `taskdependencies` inserts with `NOT --dry-run` (Step 3.6)
- [x] Command guards all file writes with `NOT --dry-run` (Step 2.1)
- [x] Dry-run banner printed at start (Pre-Flight Step 2)
- [ ] T007 HUMAN: Dry-run test confirms zero wxKanban tasks created

---

## Security & Constitution Compliance

- [x] No secrets or credentials used — `wxk_*` MCP reads from PostgreSQL via `DATABASE_URL` env var
- [x] No TypeScript code — §I–§IV inapplicable (documented in plan.md)
- [x] §V security: no sensitive data, no env vars modified
- [x] §VII lifecycle: `lifecycle.json` created, phases tracked correctly
- [x] Command is non-destructive: never modifies `tasks.md` or spec artifacts

---

## Overall Status

**Specification**: ✅ READY — All FRs covered, all USs complete, success criteria measurable
**Command Artifact**: ✅ READY — All correctness bugs fixed (T002–T004)
**Lifecycle**: ✅ TRACKED — `lifecycle.json` Phase 1 complete, Phase 2 in_progress
**Human Tests**: ⏳ PENDING — T007–T011 require human execution
