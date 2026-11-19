# Test Plan: Spec 120 — Pre-Test Gate

> This scope builds the machine that runs tests, so its own test plan carries an unusual burden:
> the failure mode is not "the gate is broken" but "the gate reports green while proving nothing."
> Every safety property below is verified **fail-first** — observed rejecting before being trusted
> to accept, the same discipline SCOPE-117 required of its drift detector.

## Unit (Vitest)

| Test | Covers | Assertion |
| --- | --- | --- |
| Clone reports `faithful: false` | FR-002 | `preTest` refuses the run; no seed, no drive |
| Clone reports `faithful: true` | FR-002 | Run proceeds |
| FK count mismatch vs source | FR-002, C-2 | Treated as unfaithful — not a warning |
| `current_schema()` returns `public` | FR-008 | Run refuses **before any write** |
| `current_schema()` returns `wxktest_x` | FR-008 | Run proceeds |
| Canary row visible from `public` | FR-008 | Run aborts and reports the leak |
| DDL targets a non-`wxktest_` schema | FR-002 | Refused regardless of statement content |
| Seed composition, two-level import | FR-003 | Base rows present exactly once, not duplicated |
| Seed re-run on a fresh clone | FR-003 | Identical identifiers — deterministic |
| Repair loop hits round 4 | FR-005 | Stops; reports red with all three attempts listed |
| Repair edit weakens an assertion | FR-005, C-4 | **Refused**, reported as a finding, not applied |
| Repair edit corrects app code | FR-005 | Applied; affected items only are re-run |
| Fence with unresolvable task ID | FR-006 | Reported, not silently dropped from the delta |
| Requirement absent from spec | FR-006 | Item **proposed** for retirement, never deleted |
| Delta with retirements, unapproved | FR-006 | Run does not proceed past the approval gate |
| `--skip-pretest` invoked | FR-007 | Waiver recorded against the scope; warning emitted |
| Database unreachable | FR-007, C-5 | Degrades to recorded waiver; `implement` not wedged |

## Integration — against this repository

Primary evidence for the scope. Baseline captured 2026-08-01.

| Check | Before | Expected after |
| --- | --- | --- |
| Implement phases that execute a test | 0 | 1, blocking |
| Scopes with a filed test plan | 1 of 94 | 1 per scope implemented after ship |
| Committed seed fixtures | 0 | ≥ 1 base + 1 per implemented scope |
| Migrations whose live-status needs a manual prod query | 2 | **0** — one `apply-ddl.mjs` run answers it |
| Migrations authored after ship first executed against prod | n/a | **0** |
| Test writes reaching `public` | unproven | **0**, asserted per run |
| `wxktest_` schemas orphaned past the next run | n/a | **0**, enumerable via `--list` |

## End-to-end — T021, against SCOPE-119

SCOPE-119 sits uncommitted in the tree. It is the proving ground because it exercises every phase-A
and phase-B path on a real in-flight scope.

> **Corrected 2026-08-01.** `0059` and `0060` were already applied to production on 2026-07-31, so
> the DDL step proves the *already-live* classification rather than a first execution. A migration
> authored after this ships will exercise the *applied* path. Both directions are covered in the
> unit table above and were verified on 2026-08-01 with a synthetic new object.

| Step | Expected | Verified 2026-08-01 |
| --- | --- | --- |
| Clone from `public` | Faithful; table and FK counts match | ✅ 129 tables / 201 FKs / 397 indexes |
| Isolation proof | `current_schema()` is `wxktest_*`; canary invisible from `public` | ✅ |
| Apply `0059_scope119_customers.sql` | Reports **already live** (7/7), production untouched | ✅ |
| Seed base fixtures | Rows in clone, **0** fixture rows in `public` | ✅ 1 company / 2 users |
| Smoke the scope's routes | Non-5xx | ✅ 3 driven, 0 failing |
| Seed SCOPE-119 fixtures | Customers present with deterministic IDs, composed on `_base` | ⏳ needs `tests/seeds/119-*/` |
| Route drive | Real C→R→U→D against the clone; rows land in `wxktest_`, never `public` | ⏳ T009 |
| UI drive `ConsultantCustomersPage` | Nav in and back, guarded redirect and return, deep-link, refresh | ⏳ T010 |
| Green handoff | Clone left standing; connection details printed | ✅ |
| Verify afterward | `public` row counts unchanged from the pre-run snapshot | ✅ 0 fixture rows in `public` |

## Fail-first proofs (required before T016)

A gate is only trustworthy once observed rejecting. Each of these must be demonstrated:

1. Point the run at `public` deliberately → it must refuse, naming the schema.
2. Remove a foreign key from the clone → faithfulness check must fail the run.
3. Introduce a genuinely broken route → drive must go red, and the repair loop must not reach green
   by editing the assertion.
4. Delete a requirement from a spec → its items must be **proposed** for retirement, and must still
   exist after the run completes without approval.

## Not tested here

Cross-scope blast-radius detection (out of scope). The three-gate model itself, the fencing
convention, and the SCOPE-117 manual production DDL workflow, all of which this scope leaves
unaltered. Gate 3 — final user verification is the operator's and is never self-certified.
