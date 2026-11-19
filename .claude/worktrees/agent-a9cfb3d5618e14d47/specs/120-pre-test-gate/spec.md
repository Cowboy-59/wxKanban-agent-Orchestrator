# Spec 120: Pre-Test Gate

**Spec Number**: 120
**Status**: `draft`
**Created**: 2026-08-01
**Depends On**: SCOPE-111 (test suite lifecycle; Amendment B built `clone-test-schema.mjs`), SCOPE-117 (manual DDL workflow), spec 026 (fencing)
**Source**: `specs/Project-Scope/120-pre-test-gate.md`

## Overview

`implement` reports a scope done and hands the operator code that nobody has run. The test-plan
machinery to prevent this already exists and is deliberately wired not to fire: `implement.md`
Phase 5 states verbatim that it is *"advisory and non-blocking — implement is already reported
done — and runs in PLAN mode only (it does not `--Execute`)."*

So the engine was built and never connected to the transmission. `wxCreateTestPlan` writes a
requirement-traceable plan; `clone-test-schema.mjs` (SCOPE-111 Amendment B) can stand up a faithful
disposable schema; the app has 115 test files. None of it runs automatically, and the operator
discovers basic breakage by hand.

This scope adds the missing connection: a `/preTest` command that clones the schema, applies the
scope's pending DDL to the clone, seeds it, boots the real application against it, drives every
feature the scope touched, fixes what it can within a bounded loop, and only then hands the scope
over. `implement` cannot report done until it returns green.

## Business Problem

Measured 2026-08-01 against the working tree:

| Signal | Value | Meaning |
| --- | --- | --- |
| Scopes in `specs/Project-Scope/` | **94** | The build surface |
| Scopes with a filed test plan | **1** (`111-test-suite-lifecycle`) | 1.1% coverage after the plan tooling shipped 2026-07-24 |
| Committed seed fixtures | **0** | Nothing to populate a clone with |
| `implement` phases that execute a test | **0** | Phase 5 is PLAN-mode by written contract |
| Migrations in the tree whose apply-status is unrecorded | **2** (`0059_scope119_customers.sql`, `0060_scope017_connections.sql`) | Answering "is this live?" required querying production by hand |

The last row is the sharpest, and it is worth being precise about **why** — an earlier draft of this
scope asserted these two migrations were *unapplied*, inferring that from their being untracked in
git. That inference was wrong: both had already been hand-applied to production on 2026-07-31, which
`src/db/schema/customer.ts` records in a docstring and nothing else does.

**Untracked in git is not the same as unapplied to production**, and under SCOPE-117 there is no
ledger that distinguishes them. That confusion is itself the defect: determining the true state took
a manual production query, and getting it wrong in either direction is dangerous — re-running a
migration you believe is pending, or shipping code against one you believe is live.

Under SCOPE-117 schema changes are applied to production **by hand**, with no migration ledger, and
the declared-vs-deployed gap has already produced recurring `42P01` production 500s. There is
nowhere to run a migration *first*: the local `.env` `DATABASE_URL` points at production, and the
hosted MCP shares the same RDS instance.

The operator-facing cost is direct and was reported this session: **roughly 30 minutes** spent
manually establishing that a delivered scope worked at all — work that is mechanical, repeatable,
and was already specified as gates 1 and 2 of the `wxCreateTestPlan` signoff model.

That signoff model is the key insight. It already defines three gates:

1. **Smoke** — responds, does not crash
2. **CRUD & execute** — real create→read→update→delete against a non-production database
3. **Final user verification** — filed pending, never self-certified

Gates 1 and 2 are machine work that was left manual. Gate 3 is, correctly, the operator. This scope
does not invent a gate model; it automates the two that a machine should always have run, so the
operator's attention lands only where it is actually needed.

## Actors

- Primary: Developer/operator receiving a completed scope — the person currently doing gates 1 and 2 by hand.
- Secondary: The orchestrator `implement` command, which must block on the result.
- Secondary: Consumer projects that receive `preTest` through the kit release.
- Secondary: Production database, which must remain provably unreachable by any test write.

## Success Metrics

1. Operator time to establish that a delivered scope functions drops from approximately **30 minutes** of manual work to **0** — the evidence arrives with the handoff.
2. `implement` cannot report done on an unverified scope: **100%** of implement runs either produce a green pre-test result or a recorded, explicit `--skip-pretest` waiver.
3. Schema changes are rehearsed before production: **0** migrations authored after this ships whose first execution is against the production database, and every migration's live-status answerable in **1** command rather than a manual production query (verified 2026-08-01 — `apply-ddl.mjs` reported **7 of 7** statements in `0059` already live, in one run).
4. Test writes reaching the `public` schema: **0**, proven by an assertion that `current_schema()` resolves to a `wxktest_` prefix plus a canary row confirmed invisible from `public` — not by convention.
5. Scopes carrying a filed test plan rises from **1 of 94** toward **1 per scope implemented after this ships** — every new scope leaves a plan and a seed behind.
6. The bounded fix loop terminates: **maximum 3** repair rounds, after which the run reports red with what was attempted, and **0** runs go green by weakening an assertion.
7. Test-item drift is answerable: every pre-test run reports counts of test items **added**, **updated**, and **proposed for retirement**, with **0** items deleted without operator approval.
8. Clone hygiene: **0** `wxktest_` schemas orphaned beyond the run that follows them, enumerable at any time via `--list`.

## Scope Boundary

Deliver a `/preTest <SCOPE-N>` command and skill that owns a complete verification run: compute the
test-item delta from the fences the change touched, clone the live schema into a disposable
`wxktest_` schema, apply the scope's pending DDL to that clone, seed it with scope-sized
deterministic data, boot the real application against it, drive every route and screen the scope
touched, repair failures within a bounded loop, record gates 1 and 2 as passed in the wxKanban
database, and hand the operator a live environment to inspect.

Author seeds as a committed, composable artifact per scope, produced by `implement` alongside the
test plan, so a scope's fixtures build on prior scopes' rather than re-inventing a company and a
user each time.

Wire `implement` to invoke `/preTest` and block its done-report on the result, with a single loud,
recorded waiver for the case where no database is reachable.

Reuse `clone-test-schema.mjs` where it stands rather than relocating working, fenced code.

Ship the command through the normal three-channel release so it reaches the Cockpit and consumer
projects rather than existing only in this repository.

## Out of Scope

Cross-scope blast-radius detection — a shared-module change that breaks a different scope is caught
by that scope's own pre-test when it next runs, and building predictive impact analysis now is
speculative machinery. Replacing or restructuring `wxCreateTestPlan`, which continues to own
requirement analysis and plan authoring. Provisioning a second database host; schema-level
isolation is the deliberate answer. Retro-fitting pre-test runs onto the 93 scopes that predate
this one. Changing the three-gate signoff model, the fencing convention, or the manual production
DDL workflow established by SCOPE-117. Automating gate 3 — final verification remains the operator's.

## Open Questions

1. What is the correct disposition of a clone when a run goes red — the design leaves it standing
   for inspection, but an unattended red run then leaks a schema until the next run drops it. Is a
   time-based sweep needed, or is `--list` plus next-run-drops-predecessor sufficient?
2. Does the seed for a scope belong in `tests/seeds/<NNN-name>/` alongside the code, or filed to the
   wxKanban database as the plan and items are? Filing it centrally would make it visible in the
   product; keeping it on disk makes it reviewable in the diff that introduces it.
3. How should `preTest` behave for a scope whose surface is entirely non-HTTP and non-UI — a CLI or
   kit-only change, where gates 1 and 2 have no route or screen to drive?
4. FR-002 applies the scope's pending SQL to the clone. If that SQL is later corrected before being
   applied to production, is the corrected version re-verified automatically, or does that require a
   fresh pre-test run the operator must remember to trigger?

## Functional Requirements

FR-001 — A `/preTest <SCOPE-N>` command exists and owns the verification run end to end. It is
independently runnable, not merely a phase of `implement`, because the operator's working cycle is
inspect the running app, change something, re-verify — and that cycle must not cost a full
re-implement. It reports a single unambiguous result: green, red with what was attempted, or
refused with why.

FR-002 — The run executes against a clone, never production, and the scope's pending DDL is applied
to that clone first. `clone-test-schema.mjs` creates a `wxktest_` schema and is refused unless the
clone is faithful — table and foreign-key counts matching source — because a clone that quietly
lost constraints lets a test pass that production would reject. The scope's reviewed-but-unapplied
SQL is then applied to the clone. Any DDL may be executed freely inside a `wxktest_` schema without
per-statement approval; nothing outside that boundary may be touched. This makes migrations
testable before production sees them, which the SCOPE-117 manual workflow currently has no way to do.

FR-003 — Each scope leaves behind a committed, deterministic seed. `implement` authors
`tests/seeds/<NNN-name>/seed.ts` alongside the test plan, populating only the rows that scope's
features need. Identifiers are deterministic so screens are reproducible and assertions can name
known rows. Seeds compose — a scope requiring a company and a consultant user imports the seed that
already establishes them rather than re-authoring the world, which is how per-scope fixtures
otherwise drift apart.

FR-004 — The application is driven, not merely compiled. Smoke establishes that the app boots
against the clone and that every route the scope's fences touched returns non-5xx. Execute performs
real create→read→update→delete per functional requirement via supertest against `createApp()` with
genuine JWTs, and walks the scope's screens with Playwright — page-to-page navigation and back,
guarded-route redirect and return, deep-link and refresh, and each interactive element. This makes
the standing "endpoint test every feature change" rule automatic rather than remembered.

FR-005 — Failures are repaired within a bounded loop that cannot cheat. On red the run diagnoses,
fixes, and re-runs only the affected items, for at most three rounds. Application code may be
corrected. An assertion may never be weakened to produce green — a test lowered to pass is worse
than a test that failed, because it converts a known defect into a false guarantee. After the cap
the run reports red with the repairs attempted.

FR-006 — Test items are reconciled against the change rather than accumulating. The fences the
change touched resolve through `[SCOPE N / Tnnn]` to their tasks and onward to `FR-###` via the
existing task-to-spec links. A touched requirement with no filed items yields proposed new items; a
requirement whose text changed since its items were filed yields proposed updates; a filed item
whose requirement no longer appears in the spec is proposed for retirement. Retirement is proposed
only and never automatic, because silently dropping coverage is how a suite rots into
green-but-meaningless.

FR-007 — `implement` blocks on the result. A new phase invokes `/preTest` for the scope and
`implement` cannot report done until it returns green. A single `--skip-pretest` waiver exists for
the case where no database is reachable; it prints a loud warning and records the waiver against the
scope, so a bypass is visible afterward rather than indistinguishable from a pass.

FR-008 — Production unreachability is proven, not assumed. Before any write, the run asserts that
`current_schema()` resolves to a name carrying the `wxktest_` prefix, then writes a canary row and
confirms it is invisible from `public`. A `search_path` that silently resolves to `public` is the
one failure mode that must be impossible rather than unlikely, given that `DATABASE_URL` on this
machine is production.

FR-009 — A green run hands over a live environment. The clone is left standing with the connection
details printed, because the purpose of the gate is that the operator opens the application and
looks at real screens holding known data. Teardown is explicit, the next pre-test for a scope drops
its predecessor first, and `--list` enumerates anything left behind.

FR-010 — Gates 1 and 2 are recorded as passed in the wxKanban database on a green run, leaving gate
3 — final user verification — filed pending exactly as the existing signoff model defines. The
command ships through the normal three-channel release: application, kit, and Cockpit VSIX, so it
surfaces as a command rather than existing only in this repository.

## Data Requirements

No production tables are added, modified, or removed. The run creates and drops transient
PostgreSQL schemas named `wxktest_*` within the existing database; these are disposable by
construction and carry no production data. Test plans, test items, signoff records, and skip-waivers
persist to the existing wxKanban tables through the established MCP surface. Seed fixtures are
source files under `tests/seeds/`, not database rows.

## API Routes

None added. The scope exercises existing routes through supertest rather than introducing an HTTP
surface of its own.

## Frontend Components

None added. Existing screens are driven through Playwright; no new UI is built. The command surfaces
in the VS Code Cockpit through the existing help catalog and command-install mechanism.

## Integration Context

This scope must align with four existing mechanisms rather than duplicating them:

| Mechanism | Alignment |
| --- | --- |
| `wxCreateTestPlan` (shipped 2026-07-24) | Continues to own requirement analysis and plan authoring. `preTest` consumes its plan and executes its gates 1 and 2. Both depend on `clone-test-schema.mjs`. |
| SCOPE-111 Amendment B | `clone-test-schema.mjs` is reused unmodified at its current path. Relocating working, fenced code for folder tidiness is churn without benefit. |
| SCOPE-117 manual DDL workflow | Unchanged for production. FR-002 inserts a clone-first rehearsal *before* the manual production apply, which is where its value lies. |
| Spec 026 fencing | The fence-to-task-to-requirement chain FR-006 relies on already exists. This scope reads it; it authors no fences by hand. |

## Key Entities

| Entity | Description |
| --- | --- |
| **Pre-test run** | One complete verification pass over a scope: delta, clone, DDL, seed, smoke, drive, repair, handoff. |
| **Test schema** | A disposable `wxktest_`-prefixed PostgreSQL schema cloned from `public`, structurally faithful including foreign keys. |
| **Seed** | A committed, deterministic fixture script per scope, composable with prior scopes' seeds. |
| **Test-item delta** | The added / updated / proposed-for-retirement classification produced by mapping touched fences through tasks to requirements. |
| **Gate** | One of the three existing signoffs. Gates 1 and 2 become machine-executed; gate 3 remains the operator's. |
| **Skip waiver** | The recorded, visible bypass produced by `--skip-pretest`, distinguishing "not tested" from "passed". |

## Constraints

- **C-1** — The local `.env` `DATABASE_URL` points at **production**, and the hosted MCP shares the same RDS instance. Every safety property in FR-008 exists because of this, not as defensive habit.
- **C-2** — `CREATE TABLE (LIKE … INCLUDING ALL)` does not copy foreign keys. The clone reflects them from `pg_constraint` in a second pass. A clone missing FKs would let tests pass that production rejects, so the faithfulness check is blocking, not advisory.
- **C-3** — `pg_dump` and `psql` are not on PATH on this machine. All schema work goes over the ordinary node-postgres connection.
- **C-4** — The bounded fix loop may edit application code. Without FR-005's prohibition on weakening assertions, the loop's cheapest path to green is to lower the bar, which would make the whole gate actively harmful.
- **C-5** — `preTest` ships to consumer projects through the kit. A consumer whose database is unreachable must degrade to the recorded waiver, never wedge their `implement`.
- **C-6** — Fences are authored by the orchestrator only. This scope reads the fence-to-task chain and hand-writes nothing.
- **C-7** — Measured baseline for verification, captured 2026-08-01: 94 scopes, 1 filed test plan, 115 test files, 0 seed fixtures, 2 migrations in the tree with unrecorded apply-status (both since confirmed already live in production), `implement` Phase 5 documented as non-blocking and PLAN-mode-only. Production itself: 129 tables, 201 foreign keys, 397 indexes.
- **C-8** — `supertest` is **not** a dependency of this project, despite `wxCreateTestPlan` assuming one. Routes are driven by booting the app on an ephemeral port and using built-in `fetch`, which adds nothing to `package.json` and exercises the real HTTP stack.
- **C-9** — A pool needs `options=-c search_path=…` in its connection config, **not** `SET search_path`. `SET` binds one session; a pool hands out many, and the others would resolve unqualified writes against `public` — which here is production.

## Compliance Requirements

SOC2 is active on this project.

| Control | Requirement | How this scope satisfies it |
| --- | --- | --- |
| **CC8.1** | Formal change management; changes tested and approved before release | Converts testing from a documented intention into a condition of completion. A scope cannot be reported done without a green run or a recorded waiver. |
| **CC7.1** | Defects tracked to resolution rather than ageing silently | FR-006 reconciles test items against every change, and FR-005 reports unrepaired failures rather than absorbing them. |
| **CC6.1** | Logical access controls protecting production data | FR-008 proves test writes cannot reach production, replacing a convention with an asserted invariant. |

## Notes

**Why this is a connection, not a construction.** Nearly every part already exists — the plan
authoring, the clone script, the gate model, 115 test files. What was missing is that nothing made
them run. The single most consequential change in this scope is one word in `implement.md`:
non-blocking becomes blocking.

**Why the CRUD gate was believed blocked.** `wxCreateTestPlan` originally hard-stopped when no
non-production database existed, and the hosted MCP shares production's RDS. SCOPE-111 Amendment B
solved this with schema-level isolation and the belief that the gate was blocked outlived the fix.
This scope depends on the corrected understanding.

**The migration-rehearsal benefit is larger than it appears.** The recurring `42P01` production 500s
trace to DDL whose first execution was against production. FR-002 gives that DDL somewhere to fail
harmlessly first, which no part of the SCOPE-117 workflow currently offers.

**The tool proved this on its first run, by correcting this document.** An earlier draft asserted
that `0059` and `0060` were unapplied — inferred from their being untracked in git. Running
`apply-ddl.mjs` against a clone answered the question directly: 7 of 7 statements already live,
therefore already applied to production. No other mechanism in this project could answer that
without a hand-written production query. The distinction between "untracked in git" and "unapplied
to production" is exactly the ambiguity SCOPE-117's missing ledger creates, and it is now one
command to resolve.

**Build order.** A: clone, DDL, seed, smoke — already useful alone, since the operator can boot the
app against a clone. B: drive plus the bounded fix loop — the substance. C: the delta engine.
D: `implement` blocking, Cockpit, kit release — what makes the gate mandatory. A and B prove
themselves against SCOPE-119, which sits uncommitted in the tree.

## Clarifications

### Session 2026-08-01

| # | Question | Decision |
|---|----------|----------|
| 1 | Had a test-schema method already been designed? | Yes — SCOPE-111 Amendment B's `clone-test-schema.mjs`. Built, fenced, working, never wired to anything. The gap was the gate, not the capability. |
| 2 | On pre-test failure: auto-fix, or stop and report? | Bounded auto-fix, capped at three rounds, then report red. Stopping on first failure reproduces the manual loop this scope exists to remove. |
| 3 | What data should the clone hold? | A per-scope seed authored by `implement` — scope-sized, deterministic, committed, composable. A shared baseline fixture becomes a second schema to maintain; copying sanitized production rows carries leak risk for no added confidence. |
| 4 | How is the redo/add/retire decision driven? | Fence and requirement driven, using links that already exist. Full re-derivation every run is a whole-app pass for marginal gain. |
| 5 | Where does the gate live — inside `implement`, a separate command, or a `wxCreateTestPlan` mode? | A separate `/preTest` command that `implement` blocks on. The deciding factor is the operator's inspect-change-reverify cycle, which must not cost a full re-implement. |
| 6 | Is DDL on the clone gated per statement? | No. Any DDL may be run freely inside a `wxktest_` schema; the boundary is the schema prefix, not the statement. |
| 7 | Should the clone be torn down on green? | No — it is left standing with connection details, because the point is that the operator opens the app and looks. Teardown is explicit. |
| 8 | Include cross-scope blast-radius detection? | No. Deferred as speculative; a broken sibling scope is caught by its own pre-test. |
| 9 | Were `0059`/`0060` really unapplied, as the first draft claimed? | **No — corrected 2026-08-01.** Both were hand-applied to production on 2026-07-31. The claim came from inferring apply-status from git tracking, which is not a valid inference under SCOPE-117's ledgerless workflow. The rehearsal capability stands; the specific baseline claim did not. |
