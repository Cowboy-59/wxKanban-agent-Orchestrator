# Test Plan: Project Agent Autopilot

**Spec Number**: 154 (implements SCOPE-132 Amendment H)
**Date Generated**: 2026-11-07
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|---|---|---|
| Schema / DDL | `npm run db:drift` | Both new columns present after manual apply (T001) |
| API | Vitest + supertest-style route tests | Switch route auth, 400 on "Allow remote" off, audit row shape (FR-001) |
| Server logic | Vitest | devplan filter/order (FR-002), missed-heartbeat derivation (FR-008), `agentruns` tagging (FR-009) |
| Bridge / agent | Vitest, run against a worktree fixture | Skip cascade (FR-003), pipeline drive (FR-004), push/production gate reuse (FR-005), failed-unit parking (FR-006), heartbeat posting (FR-007) |
| Contract | `docs/kain-contract.md` fixtures | New line shapes match what the agent emits (FR-013) |
| End-to-end | Full-flow scripted run | T013 scenario: startup list, one skip, one failure, one parked unit, one missed heartbeat |

## Cases

| # | Case | FR | Expected |
|---|------|----|----------|
| 1 | Turn Autopilot on while "Allow remote" is on, as ADMIN | FR-001 | 200; `autopilotenabled` true; one audit row |
| 2 | Turn Autopilot on while "Allow remote" is off | FR-001 | 400; no audit row |
| 3 | Turn "Allow remote" off while Autopilot is on | FR-001 | Autopilot also turns off |
| 4 | Run starts with a server `devplan` present | FR-002, SC-37 | Startup list posted before any unit starts |
| 5 | Run attempted with no server `devplan` available | FR-002 | Run does not start |
| 6 | Owner skips a scope with two dependents | FR-003 | Dependents listed, each marked skipped or partly worked |
| 7 | Owner skips a scope with no dependents | FR-003 | Posts with no dependent list |
| 8 | A scope's gate is already answered by the ledger | FR-004 | Answered automatically via askgate queue, no park |
| 9 | A scope's gate has no approved design to answer it from | FR-004 | Parked as one line: project, scope, question, what it blocks |
| 10 | A unit's own tests point at the production database | FR-005, SC-38 | Parked untouched with one line naming why; run continues |
| 11 | A completed unit | FR-005 | Exactly one local commit in its own worktree; no `git push` executed |
| 12 | A unit fails its tests | FR-006 | Parked with short line; dependents marked waiting; run continues |
| 13 | A unit times out | FR-006 | Same as case 12 |
| 14 | 2-hour seeded run, nothing paused | FR-007, SC-39 | A post (full or heartbeat) in 100% of 15-minute windows |
| 15 | `STATUS` sent mid-run | FR-007 | Same content as the next scheduled heartbeat, returned early |
| 16 | Startup list finishes | FR-007 | One full summary posts |
| 17 | Run still active at 18:00 | FR-007 | One full summary posts |
| 18 | Run paused by the owner | FR-007 | Heartbeat posts "paused"; no alert raised (case 20) |
| 19 | Connection record goes stale during an active, unpaused run | FR-008, SC-40 | One alert line to room and K.A.I.N. |
| 20 | No status post for 20 minutes during an active, unpaused run | FR-008, SC-40 | One alert line; one "back" line on return |
| 21 | Outage during a paused run | FR-008, SC-40 | Zero alerts |
| 22 | A unit completes | FR-009, SC-41 | One `agentruns` row tagged scope+task, no person attribution |
| 23 | Company has no Time and Billing | FR-009 | Run proceeds; no booking attempted; no plan-gate error |
| 24 | Help catalog entry reachable | FR-011 | Visible via Subscription-Aware Help on every plan |
| 25 | Release gate check with all three FR-012 prerequisites confirmed built | FR-012 | Gate passes; switch exposable |
| 26 | Release gate check with any one prerequisite unconfirmed | FR-012 | Gate fails closed; switch stays unexposed |
| 27 | Full-flow scripted run: list, one skip, one failure, one parked production-bound unit, one missed heartbeat | FR-013 | `docs/kain-contract.md` line shapes match; one `agentruns` row per completed unit |

## Evidence

None yet — implementation has not started as of spec creation (2026-11-07). Populate this section
with file:line references as each task lands, per house convention for later specs' tests.md.
