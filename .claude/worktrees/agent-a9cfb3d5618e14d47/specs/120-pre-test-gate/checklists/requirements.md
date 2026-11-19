# Requirements Checklist: Spec 120 — Pre-Test Gate

**Spec Number**: 120
**Created**: 2026-08-01
**Source**: `specs/120-pre-test-gate/spec.md`
**Scope**: `specs/Project-Scope/120-pre-test-gate.md`
**Preflight Score**: 100 / 100 (`valid`) — 0 blocking issues, 0 warnings

---

## Specification Quality

- [x] Overview states WHAT and WHY, not HOW
- [x] Business problem is measured, not asserted (94 scopes / 1 filed plan / 0 seeds / 129 prod tables)
- [x] Corrected 2026-08-01: the "2 unapplied migrations" claim was false — both were already live
- [x] Actors use canonical `- Primary:` / `- Secondary:` labels
- [x] Functional requirements numbered FR-001 … FR-010
- [x] Success criteria measurable — every metric carries a number
- [x] Scope boundary and out-of-scope both explicit
- [x] Open questions recorded rather than papered over
- [x] No TODO / TBD / NEEDS CLARIFICATION markers

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] Every FR traced to at least one task
- [x] Every task traced back to an FR or named as validation
- [x] Constraints recorded with their reasons, not only their rules
- [x] Compliance controls mapped (SOC2 CC8.1, CC7.1, CC6.1)
- [x] Integration context names the four mechanisms this must not duplicate

## Design Decisions Recorded

- [x] Gate lives in a separate `/preTest`, not inside `implement` — the inspect-change-reverify cycle must not cost a re-implement
- [x] Failure handling is bounded auto-fix, capped at 3 rounds
- [x] Seeds are per-scope, deterministic, committed, and composable
- [x] Test delta is fence + FR driven, using links that already exist
- [x] Clone is left standing on green so the operator can open the app
- [x] DDL is unrestricted inside `wxktest_`, prohibited outside — boundary is the schema prefix
- [x] Cross-scope blast-radius detection explicitly deferred

## Safety Verification (blocking — must be demonstrated before T016)

- [ ] Run pointed at `public` is **refused**, naming the schema
- [ ] Clone with a removed foreign key **fails** the faithfulness check
- [ ] Canary row visible from `public` **aborts** the run
- [ ] Repair loop **cannot** reach green by weakening an assertion
- [ ] Requirement deleted from a spec yields a **proposal**, and the item still exists after an unapproved run
- [ ] Unreachable database **degrades** to a recorded waiver rather than wedging `implement`
- [ ] `public` row counts unchanged across a full end-to-end run

## Delivery

- [ ] T021 passes against SCOPE-119 before T016 makes the gate blocking
- [ ] Both `_wxAI/commands/implement.md` and `.claude/commands/implement.md` updated
- [ ] Command surfaces in the VS Code Cockpit (`helpCatalog.ts` + `install-claude-commands.mjs`)
- [ ] Shipped through all three channels: app, kit release, VSIX
- [ ] Consumer safety verified against at least one consumer project

## Known Open Items

- [ ] OQ-1 — Disposition of a clone left standing by an unattended red run
- [ ] OQ-2 — Seeds on disk vs filed to the wxKanban DB
- [ ] OQ-3 — Behaviour for a scope with no HTTP or UI surface
- [ ] OQ-4 — Re-verification when pending SQL is corrected after a run
