# Plan: Code Fencing — Spec/Task Traceability Markers

**Spec Number**: 026
**Date**: 2026-05-13

## Implementation Plan

### Phase 1 — Schema Foundation (T001–T004)
Four Drizzle tables (`taskfences`, `taskfencemodifications`, `taskfencehistory`, `taskfenceslegacy`) plus their migration and schema-validation tests. Nothing else can land until these exist because every subsequent module writes to one of them.

### Phase 2 — Fence-Emitter Core (T005–T008)
Stand-alone module under `wxkanban-agent/core/orchestrator/` that knows the language matrix (FR-005), detects top-level declarations (FR-002), and applies the create-new / MODIFIED-BY / full-replacement / drift rules (FR-001/003/004/010). Pure-function design so it can be unit-tested without DB or AI.

### Phase 3 — `implement` Command (T009–T016)
Net-new command — does not exist today in `command-handlers/`. Skeleton + arg parsing + gating first (T009), then AI provider integration (T010), then fence-emitter wiring + DB writes (T011), then flag handling and idempotency (T012), then `tasks.md` checkbox flip (T013), then registration (T014). Tests last (T015, T016).

### Phase 4 — `auditfences` Command (T017–T021)
Runs in parallel with Phase 3. Scanner + error classes (T017), warnings (T018), flags (T019), tests (T020), registration (T021). Both Phase 3 and Phase 4 share the fence-emitter from Phase 2.

### Phase 5 — Other Emission Sites (T022–T024)
`createtesttasks`, `dbpush` migration generator, `runqa` each call the same fence-emitter. Depends on Phase 3 because they piggyback on the wiring `implement` exercises.

### Phase 6 — Kit Packaging (T025–T032)
Templates (T025), migration bundling and applier (T026), `verify-install.ts` updates (T027), pack script (T028), README + docs (T029–T031), version bump (T032). Depends on Phases 3–5 because the kit can't ship a half-built feature.

### Phase 7 — wxKanban Repo Rollout (T033–T035)
`CLAUDE.md` injection (T033), one-time `--baseline` run (T034), CI gating (T035). Depends on Phase 6 because rollout requires the published kit v0.2.0.

### Phase 8 — QA Integration Tests (T036–T041)
QT-1 through QT-6 run alongside Phases 3–5 as features land. All must pass before T042.

### Phase 9 — Lifecycle Close (T042)
AC verification, status flip to `Released`, `projectlifecycle.md` regenerated.

## Critical Path

T001–T004 → T005–T008 → T009–T016 → T025–T032 → T033–T035 → T042.

Phase 4 (auditfences), Phase 5 (other emission sites), and Phase 8 (QA tests) hang off the critical path but do not extend it provided Phase 3 finishes first.

## Known Issues

### Issue P-1 — `implement` command does not currently exist
The CLAUDE.md "Orchestrator-First" table lists `implement` under the Implementation stage, but `wxkanban-agent/core/orchestrator/command-handlers/` has no `implement.ts`. This spec treats `implement` as a first-class deliverable (Prerequisite section). T009–T016 build it from scratch.

### Issue P-2 — Existing un-fenced code in this repo and consumer repos
Per project memory, the wxKanban codebase contains substantial un-fenced code authored before this spec. `auditfences --baseline` (T034) captures the current hash set into `taskfenceslegacy` so legacy files are reported as info-only. Retroactive fencing is explicitly out of scope.

### Issue P-3 — Kit consumer DBs must not pick up the wxKanban author DB
Per project memory BUG-10, consumer projects detect and ignore the embedded wxKanban PG creds. The new migration bundling in T026 must apply migrations to the **consumer's** `DATABASE_URL`, not the author's. `verify-install.ts` (T027) covers this with a runtime check.

### Issue P-4 — 80% replacement heuristic is a default, not a law
T038 verifies the threshold but operators can always override with `--replace` / `--modify`. Future tuning to the threshold is a non-spec patch within ±10% of 80%.

### Issue P-5 — Migration to consumer DB may fail on insufficient privileges
`verify-install.ts` runs the migration in a transaction and rolls back on permission error, reporting the exact GRANT statement needed. Mitigation, not blocker.

## Dependencies on Other Specs

- **Spec 019 — Agent Orchestrator Kit**: CLI gateway, policy engine, lifecycle stages, AI provider adapters. This spec layers on top.
- **CLAUDE.md (project)**: Orchestrator-First and SPEC-FIRST rules. Reinforced — not changed — by this spec.

## Out-of-Band Issues to Track Separately

- Spec 019 `implement` documentation must be updated when this spec releases (note in CHANGELOG).
- `feedback_orchestrator_cli_broken.md` (project memory) should be cleared after T014 confirms `implement` works end-to-end via the CLI.
