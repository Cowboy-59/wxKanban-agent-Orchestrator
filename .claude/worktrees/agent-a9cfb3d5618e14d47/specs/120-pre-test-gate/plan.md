# Implementation Plan: Spec 120 — Pre-Test Gate

**Spec**: `specs/120-pre-test-gate/spec.md`
**Phase**: design
**Priority**: high

## Approach

Nearly everything this scope needs already exists. `wxCreateTestPlan` authors requirement-traceable
plans. `clone-test-schema.mjs` stands up a faithful disposable schema. Playwright and its config are
installed. There are 115 test files. The single reason none of it protects anything is that
`implement.md` Phase 5 declares itself *"advisory and non-blocking … PLAN mode only."*

So this is a **connection**, not a construction, and the phases are ordered accordingly: build the
thing that runs, prove it runs, then flip the switch that makes it mandatory. Flipping the switch
first would wedge every implement on machinery that does not exist yet.

### Phase A — Stand up a truthful clone (T001–T008)

The clone must be trustworthy before anything is measured against it. Two properties are blocking,
not advisory:

**Faithfulness.** `CREATE TABLE (LIKE … INCLUDING ALL)` does not copy foreign keys. The script
reflects them from `pg_constraint` in a second pass and compares counts against source. A clone
that quietly lost constraints lets a test pass that production would reject — worse than no clone,
because it manufactures confidence.

**Unreachability.** `DATABASE_URL` on this machine is production. T003 asserts `current_schema()`
resolves to a `wxktest_` prefix and writes a canary row confirmed invisible from `public`, before
any other write happens. A `search_path` that silently falls back to `public` is the one failure
mode that must be impossible rather than unlikely.

T004 applies the scope's pending DDL to the clone. This is the phase's sleeper value: under
SCOPE-117 schema changes are hand-applied to production with no ledger, and there is currently
nowhere to rehearse them.

It also answers a question nothing else in this project can. Two migrations sit in the tree
(`0059`, `0060`) with no recorded apply-status; this plan's first draft assumed they were unapplied
because they were untracked in git. They were not — both had been hand-applied on 2026-07-31.
`apply-ddl.mjs` established that in one run by classifying each statement as *applied* or
*already live*. **Untracked in git is not unapplied to production**, and under a ledgerless
workflow only an actual execution against a faithful clone can tell the two apart.

### Phase B — Drive the application (T009–T012)

Gate 2 of the existing signoff model, automated. Routes through supertest against `createApp()`
with real JWTs; screens through Playwright, covering navigation both ways, guarded-route redirect
and return, deep-link and refresh, and each interactive element.

T012 is the counterweight to T011 and is not optional. A repair loop empowered to edit application
code has one cheap path to green: weaken the assertion. That converts a known defect into a false
guarantee, which is strictly worse than the red it replaced. The loop must be structurally unable
to take that path, not merely instructed against it.

### Phase C — Reconcile test items against change (T013–T014)

The fence-to-task-to-requirement chain already exists; this phase reads it rather than building
anything new. Retirement is proposed only. Silently dropping coverage is how a suite rots into
green-but-meaningless, which is the same pathology as a permanently-red gate wearing different
clothes.

### Phase D — Make the gate mandatory (T015–T020)

The one-word change: non-blocking becomes blocking. T017 and T018 exist because a gate with no
escape hatch wedges rather than protects — a consumer with an unreachable database must degrade to
a *recorded, visible* waiver, so "not tested" never becomes indistinguishable from "passed."

### Validation — T021

Prove A and B against SCOPE-119, which sits uncommitted in the tree. A real in-flight scope exercises the clone, the pending-DDL apply, the seed, and both
drive tiers in the shape they will actually meet. A synthetic fixture would prove considerably less.

## Sequencing constraints

| Order | Reason |
| --- | --- |
| T003 before any write task | Production unreachability must be proven before the first write, not after |
| T002 before T004 | Nothing to apply DDL to until the clone exists and is certified faithful |
| T005 before T006 | The seed contract must exist before `implement` can be taught to author against it |
| T011 with T012 | Shipping the repair loop without the assertion guard is net-negative |
| T021 before T016 | Do not make the gate blocking until it has been proven against a real scope |
| T019, T020 last | A command that does not surface in the Cockpit is invisible to the operator |

## Risks

**The gate goes quiet rather than green.** The same class of failure as SCOPE-118: a check that
stops reporting reads as "clean." Mitigated by T021 proving the drive tiers actually exercise a
real scope before T016 makes anything depend on them.

**The repair loop launders defects.** Addressed structurally by T012 rather than by instruction.

**Clone accumulation.** Green runs deliberately leave the clone standing so the operator can open
the app against it. T008 makes the next run drop its predecessor and surfaces `--list`. Open
question 1 records that an unattended red run still leaks one schema until the following run.

**Consumer wedging.** `preTest` ships to every consumer through the kit. T018 exists specifically
so an unreachable database degrades rather than blocks, and requires verification against at least
one consumer project.

## Out of scope for this plan

Cross-scope blast-radius detection; a second database host; retro-fitting pre-test onto the 93
prior scopes; any change to the three-gate model, the fencing convention, or the SCOPE-117 manual
production DDL workflow.
