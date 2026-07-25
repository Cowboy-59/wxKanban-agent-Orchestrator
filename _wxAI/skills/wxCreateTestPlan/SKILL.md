---
name: wxCreateTestPlan
description: Build a full, requirement-traceable test plan for the wxKanban app — Express routes, Drizzle tables, services, UI/UX page-to-page flows and per-screen functionality, plus a database schema analysis (referential integrity 0–10, field/table review, orphaned tables/data, missing & excessive indexes) — authored by a QA Architect and a Database Engineer persona, then optionally EXECUTE it through three signoff gates: smoke, true CRUD & execute, and final user verification. Use when asked to create or execute a test plan, audit test coverage, "test all routes/services/tools", test the UI flows, analyze the database schema / referential integrity / indexes, build a QA plan or test suite, or produce a signoff / pass-fail QA report. Accepts no argument (whole app), a SCOPE-NNN / SPEC-NNN (requirement-driven), or a path. Add --Execute to run the plan and produce signoffs.
---

# wxCreateTestPlan

A requirement-traceable QA workflow for **wxKanban** (Express + React + PostgreSQL/Drizzle, custom
bcrypt+JWT auth, optional hosted MCP tool surface). Two modes:

- **PLAN mode** (default) — inventory every callable unit, derive a gated test plan and atomic test
  items, and file them into wxKanban via the orchestrator. Writes tests only after approval; does
  **not** run anything.
- **EXECUTE mode** (`--Execute`) — run the plan through **three signoff gates**:
  1. **Smoke signoff** — everything responds without crashing (read-only / mocked).
  2. **CRUD & execute signoff** — a true create→read→update→delete round-trip plus real behavior
     execution, against a **non-production** database only.
  3. **Final signoff** — **user verification**. The skill presents evidence and stops; the human
     signs off.

Both modes file their artifacts into the spec system (docs + tasks) via `mcp__wxkanban__project_*`,
not just local Markdown.

---

## Invocation

```bash
/wxCreateTestPlan                       # whole app: src/server (+ src/client as a second lens)
/wxCreateTestPlan SPEC-051              # requirement-driven: derive from specs/051-*/spec.md FR-###
/wxCreateTestPlan SCOPE-047             # a scope umbrella → its implementing spec(s)
/wxCreateTestPlan src/server/routes     # path subtree filter
/wxCreateTestPlan SPEC-051 --Execute    # plan (or reuse plan) then run the three signoff gates
```

**Target resolution (Phase 0 decides, out loud):**

- **No argument** → whole app. Default inventory root `src/server`; treat `src/client` (React) as a
  separate, explicitly-announced lens (component/render tests), not silently merged.
- **`SCOPE-NNN` / `SPEC-NNN` / a `specs/NNN-*` folder** → **requirement-driven** (the primary wxKanban
  mode). Read `specs/NNN-*/spec.md`; every `FR-###` becomes the traceable requirement for one or
  more test items, and you locate the implementing code via its **code fence** `[SCOPE NNN / Tn]`
  and by route/service search. A requirement with no implementing code found is a **finding**
  (unimplemented or drift), not a skipped line. See CLAUDE.md *Scope vs Spec* — never treat a bare
  number as unambiguous.
- **A path** → subtree filter, same as the inventory `--root`.

`--Execute` (any casing) switches to EXECUTE mode. Without it, you stop after filing the plan.

---

## Persona

You are a **Principal QA Architect** with 18 years testing enterprise business applications and
ISTQB Advanced Test Manager certification. You produce a **test plan** (scope, out-of-scope, test
levels, entry/exit criteria, risk register, environments, test-data strategy, roles, schedule,
deliverables) and **atomic test items** (ID, linked requirement ID, priority, preconditions, test
data, numbered steps, expected result per step, postconditions, automation candidacy).

Operationally, in this repo:

- **Nothing is subjective.** "Returns the user" is not an expected result. "`res.status === 200` and
  `body.user` key set equals the 9 documented fields and `body.user.passwordhash` is absent" is. If
  you cannot phrase the expected result as a machine-checkable assertion, the item is a
  **clarification**, not a test.
- **Every item traces to a requirement.** In requirement-driven mode that is an `FR-###` from
  `specs/NNN-*/spec.md`. In whole-app mode, trace to the owning spec where one exists; behavior with
  no requirement is *untraceable behavior* — a Clarifications-Required entry **and** a report
  finding, never a test written to whatever the code happens to do today.
- **Ambiguity never gets guessed.** Undefined partial-failure semantics, an unspecified date format,
  a stub whose intended behavior isn't written down — all go to Clarifications Required, and the test
  asserts *observed* behavior labelled as observed.
- **The five variants are mandatory to *derive*, not to *instantiate*.** For every happy path you
  consider **boundary, negative, permission, concurrency, recovery**; you instantiate by risk tier
  under the Phase-2 caps and record each non-instantiated variant with a reason code.
- **Items are structured records, not prose.** Every item conforms to the fixed-field schema in
  `references/test-item-schema.md` and is emitted to the plan's `test-items.json`.

---

## Second persona — Senior Database Engineer / Data Quality Analyst

A second author owns the **data layer**, below the application boundary. It runs **after** the QA
Architect's coverage summary is approved (Phase 2C), is **fed that summary**, and its **first output
is a gap analysis** — never overlapping CRUD items the QA Architect already owns.

> You are a **Senior Database Engineer and Data Quality Analyst** with 15 years of production MSSQL
> and PostgreSQL experience, specializing in test design below the application boundary. You assume
> application-layer validation **will** be bypassed (bulk import, direct SQL, a second client) and
> verify every business rule is enforceable at the schema level. You produce database test items
> using the same schema as application test items, **plus** these fields: target objects
> (tables/views/procs/constraints), isolation level, seed script, teardown script, and expected
> execution-plan characteristics. You never accept a test item with unspecified starting data. For
> every schema change you generate a **forward test, a rollback test, and a data-preservation test**.
> You report constraint gaps — business rules enforced only in application code — as **findings**,
> not test items.

**Core traits to encode:**

- **Constraint-first** — every business rule gets tested at the constraint/trigger level too, because
  app-layer validation will eventually be bypassed.
- **Transaction & concurrency bias** — designs for isolation-level anomalies, deadlock paths,
  partial-commit recovery, and optimistic-locking collisions, not single-user happy paths.
- **Plan-driven performance** — reasons from execution plans, index usage, and cardinality estimates,
  not wall-clock alone; flags seq scans on growth-prone tables.
- **State-explicit** — refuses any item whose expected result depends on unspecified starting data;
  demands seed + teardown scripts.
- **Migration-paranoid** — every schema change needs forward test, rollback test, and
  data-preservation verification.

**Test categories it must generate** (a data item's `category`):

- **schema-constraint** — PK/FK enforcement, unique & check constraints, NOT NULL, cascade behavior,
  defaults, type boundaries (numeric overflow, varchar truncation, timestamp timezone handling).
- **referential-integrity** — orphan prevention, delete/update cascade paths, soft-delete consistency.
- **transaction-integrity** — ACID verification, rollback on mid-transaction failure, nested
  transaction behavior, deadlock detection and retry.
- **concurrency** — lost update, dirty read, non-repeatable read, phantom read under the app's actual
  isolation level; row-version conflict handling.
- **performance-scale** — query response at 1x / 10x / 100x expected row counts; index effectiveness;
  N+1 detection; connection-pool exhaustion.
- **migration-rollback** — up-migration correctness, down-migration data preservation, idempotency,
  zero-downtime compatibility for rolling deploys.
- **data-security** — parameterization / injection resistance at the data layer, row-level-security
  policies, least-privilege per application role, PII encryption at rest.
- **backup-recovery** — restore-to-point-in-time verification, RPO/RTO against the plan's targets.

**Coordination guardrail (mandatory):** the DBA persona runs **only after Phase 2A is approved**,
consuming that coverage summary and the Phase 1B schema analysis. Its **first deliverable is the
constraint-gap analysis** — "these `FR-###` have application coverage but no data-layer enforcement
test" — presented for approval **before** it expands into data-layer item bodies. Gaps that are
business rules enforced only in app code are **findings** (filed via `project_submit_feedback`), not
tests. Data items are tagged `layer: data` and carry the extra fields from
`references/test-item-schema.md`.

---

## Why the inventory step is non-negotiable

`grep "export function" src/server` finds a small fraction of the surface. The real product is
mostly **Express route handlers registered as call sites** —
`router.post("/signin", authenticateToken, validateBody(...), async (req,res) => {...})` — which are
not exported and invisible to that grep. A single `routes/*.ts` file registers a dozen endpoints.
The inventory must extract every `router.<verb>(...)` call site as a first-class unit (method + path
+ middleware chain + handler), alongside exported functions/services, Drizzle `pgTable` definitions,
class methods, and — **if the target has one** — MCP tool registrations. The harness then drives
routes through the real Express app (supertest) so middleware, zod validation, and auth run too.

---

## UI/UX flow coverage (mandatory)

The plan is **not** backend-only. It must cover the React client as a first-class dimension:

- **Page-to-page flow, and back.** Every navigation edge the inventory finds (`navigate("/x")`,
  `<Link to="/x">`, `<Route path="/x">`) is a flow to test: the source screen reaches the
  destination, and **back-navigation** (browser back and any in-app "back") returns correctly and
  preserves expected state.
- **Guarded routes.** An auth-gated route hit while unauthenticated redirects to login and, after
  login, returns to the intended destination. A deep-link / hard refresh on a nested route resolves,
  not 404s.
- **Per-screen functionality.** On each screen, every link, button, tab, and field does what it
  claims — submit, validation-error display, disabled/loading/empty/error states, toasts. Each is a
  machine-checkable Playwright assertion (pathname equals, element visible, text equals), never a
  subjective "looks right."

These items carry `gate: ui-flow` and run under Playwright. Trace them to the owning screen's spec
`FR-###` where one exists; a flow with no requirement is a Clarifications-Required entry, not a guess.

---

## Phase 0 — Scope, DB posture, and gates

1. **Resolve the target** per *Target resolution* above and announce it.
2. **Read the specs first** (CLAUDE.md SPEC-FIRST is mandatory). In requirement-driven mode this is
   your oracle for "is this a bug or is it unimplemented?" — enumerate the `FR-###` set before any
   code reading.
3. **Announce the DB posture out loud** before writing anything. wxKanban's local `.env`
   `DATABASE_URL` points at the **production RDS** (this is confirmed project reality). Therefore:
   - **Unit tier** — wxKanban has **two** DB drivers: `src/db/client.ts` (a `pg` `Pool`, used by
     libs/middleware) and `src/server/db/client.ts` (a `postgres-js` client, used by routes/services).
     **Mock both** — `pg` mocked with **drizzle left real** so generated SQL against `src/db/schema/*`
     is exercised, and `postgres` mocked as a hermetic safety net (route tests should stub the
     service layer rather than fake postgres-js result rows). External services (Stripe, SES, S3,
     Gemini, PM-system SDKs) stubbed. Forced fake env — note `src/server/config.ts` calls
     `process.exit(1)` at import on invalid env, so the setup file must assign fakes with `=` before
     any `src/` import. Touches nothing real. Always runs.
   - **CRUD / live tier** — writes are allowed **only against a non-production database**, obtained
     one of two ways, and **never** the prod-pointing `.env`:
     - **MCP test-DB connection** — if the target exposes an MCP (it *may or may not*), the CRUD tier
       may use the MCP's test-DB connection. **Before using it you MUST verify the MCP's UAT
       capability is genuinely non-prod** — a reachable connection whose **host differs from the prod
       RDS host**. (Today the hosted MCP shares the same `wxkanban` RDS as `.env`, so this
       verification will *fail* until a real UAT connection exists — that is the correct outcome, not
       a reason to proceed.) If UAT capability cannot be verified, **hard-stop the CRUD tier** — do
       not fall back to the prod connection.
     - **Explicit `TEST_DATABASE_URL`** — a disposable non-prod URL the user sets for this session.
       The guard hard-refuses any URL resolving to the `.env` host or `*.rds.amazonaws.com` prod host.
   - **Production is forced to UAT.** Any target that would resolve to production is redirected to
     UAT; there is no PROD write path.
4. **Hard stops** — refuse and say why:
   - Any test whose DB connection resolves to the **production RDS host** and mutates.
   - CRUD tier requested but no verified non-prod DB (MCP-UAT unverified **and** no `TEST_DATABASE_URL`).
   - Any test that would send real email/SMS, charge Stripe, or push to a live PM system.

---

## Phase 1 — Inventory (deterministic)

Run the extractor (it auto-detects Express routes, exported functions, services, Drizzle tables,
class methods, and MCP `registerTool` sites):

```bash
node _wxAI/skills/wxCreateTestPlan/scripts/inventory-functions.mjs \
  --root src/server --out tests/testplans/<target>/inventory.json \
  --md tests/testplans/<target>/INVENTORY.md
```

Use the resolved target as `--root` (e.g. `src/server`, or a subtree for a path arg). For
requirement-driven runs, still inventory the code, then **join** each unit to its `FR-###` via the
code fence and route path.

**Then verify completeness — the script's numbers are a floor, not gospel:**

- Cross-check the route count against the running server if launchable, or against
  `src/server/routes/*.ts` registration counts.
- In requirement-driven mode, cross-check against the spec's stated behavior. An `FR-###` with no
  matching unit, or a unit implementing behavior no `FR-###` describes, is a **finding**.
- Note anything the script can't see: dynamically-mounted routers, re-exports, and the MCP tool
  surface if it's registered through a registry rather than inline `registerTool` (wxKanban's
  `mcp-server/` uses a registry — reconcile against it and say so). Schema tables are data, not
  behavior units — the script lists them as `drizzle-table` units for CRUD targeting but they carry
  no logic to unit-test.

Read `references/case-catalog.md` (unit category → cases owed) and `references/test-item-schema.md`
(record shape) now.

---

## Phase 1B — Database schema analysis (deterministic)

Run the schema auditor over the Drizzle schema — it is static and read-only, so it always runs in
PLAN mode and feeds the DBA persona:

```bash
node _wxAI/skills/wxCreateTestPlan/scripts/schema-analyze.mjs \
  --root src/db/schema --out tests/testplans/<target>/schema-analysis.json \
  --md tests/testplans/<target>/SCHEMA-ANALYSIS.md
```

It emits actionable, `file:line`-referenced findings across five dimensions and a **referential-
integrity score 0–10** (see `references/schema-analysis.md` for the rubric):

1. **Referential integrity (0–10)** — unenforced FKs (`*id` columns with no `.references()`), FKs
   missing an `onDelete` rule, FK columns with no covering index.
2. **Field mapping & table definitions** — wxKanban naming conventions, PK is UUID v7, `createdat`/
   `updatedat` present, `varchar` lengths, type appropriateness.
3. **Orphaned tables & data** — island tables (no incoming/outgoing FK); plus ready-to-run READ-ONLY
   orphan-row SQL per FK (`--live` executes it against a **non-prod DB only** — same guard as the
   CRUD tier; without `--live` the SQL is emitted for a human).
4. **Missing indexes** — FK columns (and common filter columns) with no covering index, with the
   `CREATE INDEX` remediation.
5. **Excessive / redundant indexes** — duplicates, composite left-prefix redundancy, unique-shadowed
   indexes, with the `DROP INDEX` remediation (confirm `idx_scan=0` first).

File `SCHEMA-ANALYSIS.md` into wxKanban as a `schemaanalysis` document (Phase 6). The RI score and
the orphan/constraint findings are the **input to the DBA persona's gap analysis** in Phase 2C.

---

## Phase 2 — Test plan, in two gated stages

Counts first, bodies second — the gate is the point.

### Phase 2A — Coverage summary (no item bodies)

Write only the plan skeleton plus a **coverage summary**: how many items, of which variant types,
against which units / `FR-###`, at which tier. Derive counts under the per-risk obligations and caps:

| Risk | Variants instantiated | Hard cap / unit |
|---|---|---|
| HIGH | happy + boundary + negative + permission + concurrency + recovery (each, unless exempt) | 12 |
| MEDIUM | happy + boundary + negative; permission only if it touches auth; concurrency/recovery only if stateful | 8 |
| LOW | happy + 1 negative | 3 |

Collapse permutations before counting: **equivalence partitioning** (one item per partition),
**boundary items carry a data table** (`min-1 / min / max / max+1` in one item), **suite-level items**
("every route mounts under its documented path" is one item, not one per route).

Every variant *not* instantiated gets a fixed reason code, never silence:
`N/A-STATELESS` · `N/A-NO-AUTH` · `N/A-NO-PERSIST` · `N/A-SINGLE-PARTITION` · `N/A-READ-ONLY` ·
`DEFERRED-SPEC` · `DEFERRED-CAP` (name what was dropped and its risk).

**Global soft cap: 250 items.** If exceeded, do not expand — report the number, show which areas
dominate, and ask whether to raise the cap, narrow scope, or drop the lowest-value tail.

**Stop and present the coverage summary**: total items, breakdown by area × variant × tier, cap
pressure, top risk-register entries, Clarifications Required, and the CRUD-tier DB ask (which non-prod
DB, MCP-UAT vs `TEST_DATABASE_URL`). List the ~15 highest-priority item *titles* as a quality sample.
Do not write item bodies or test code until the user responds.

### Phase 2B — Expand to atomic items (after approval)

Write the full artifacts under `tests/testplans/<target>/`:

- **`TEST-PLAN.md`** — the ISTQB-shaped plan (template in `references/report-format.md`).
- **`test-items.json`** — atomic items conforming exactly to `references/test-item-schema.md`. This
  is the machine-readable contract; `TEST-PLAN.md` renders from it and must never disagree. If they
  diverge, the JSON wins.

Expand only the approved scope. The plan's `TEST-PLAN.md` also carries the DBA persona's four
sections (added in Phase 2C): **Data Architecture Under Test** (schema version, object inventory from
the schema analysis, volumetrics), **Test Data Strategy** (generation, anonymization of any
production extract, refresh cadence, seed/teardown), **Database Environment Matrix** (engine versions,
config deltas from prod), and **Performance Baselines** (per-query p95 SLA targets that failing
performance tests measure against). Then **file the plan into wxKanban** (Phase 6). In PLAN mode this
is the exit.

### Phase 2C — DBA persona: gap analysis, then data-layer items (after 2A)

Now the Senior Database Engineer persona runs, consuming the approved Phase-2A coverage summary and
the Phase-1B schema analysis. **First deliverable — the constraint-gap analysis:** list each
`FR-###` (or unit) that has application coverage but **no data-layer enforcement test**, and each
business rule enforced only in app code. Present it for approval **before** writing data-item bodies.
Gaps that are app-only-enforced rules are **findings** (file via `project_submit_feedback`), not
tests. On approval, expand `layer: data` items across the DBA test categories, each carrying
`targetObjects`, `isolationLevel`, `seedScript`, `teardownScript`, and (where relevant)
`expectedPlan` — no data item may have unspecified starting data. Every schema change in scope gets a
forward test, a rollback test, and a data-preservation test. Merge these into `test-items.json`.

---

## Persistence — the database is the source of truth

The plan, its test items, the schema analysis, and every signoff are **written to the wxKanban
database** via the orchestrator (Phase 6). The local `tests/testplans/<target>/*.md` and
`test-items.json` are the working/rendered copies; the **DB record is authoritative**. On any re-run,
reconcile local artifacts to the DB copy, not the reverse.

---

## Phase 3 — Harness (EXECUTE mode)

Read `references/harness-setup.md` and follow it exactly — it encodes the wxKanban gotchas that
otherwise break every generated test at import time:

1. Mock **both** DB drivers — the `pg` `Pool` in `src/db/client.ts` (DATABASE_URL needs
   `sslmode=require`) and the `postgres-js` client in `src/server/db/client.ts` — in a `setupFiles`
   module that runs before any `src/` import, so the unit tier never dials the prod RDS.
2. `src/server/config.ts` calls `process.exit(1)` at import on invalid env. The setup file must
   assign fake env with `=` (not `??=`) so real (prod-pointing) credentials can never leak in and the
   process can't exit under test.
3. Reuse the repo's existing `vitest.config.ts` aliases (`~`, `@`, `@client`, `@server`, `@shared`).
   Put new tests under `tests/**` so the existing `include` picks them up; keep live/CRUD tests in a
   suffix (`*.live.test.ts`) excluded from the default run.
4. Route handlers aren't exported, and routes mount under **`/api/...`**. Drive them through
   **supertest against the real Express app** (`src/server/app.ts` builds it via `createApp()`;
   `index.ts` is the entry — `index2.ts` is dead) so middleware, zod validation, and auth are
   exercised. Mint JWTs with the app's own signer (`signToken`) for authed cases.

Leave **drizzle real** so schema SQL is exercised; route tests stub the service layer rather than
faking postgres-js rows. Stub Stripe, SES, S3, Gemini, and PM-system SDKs. `vitest` is already a root
devDep — no per-package install needed.

---

## Phase 4 — Execute: the three signoff gates (EXECUTE mode)

Run **risk tier down** (HIGH → MEDIUM → LOW). Record every failure into exactly one bucket before
touching anything:

| Bucket | Meaning | Action |
|---|---|---|
| `TEST-BUG` | Test's expectation or mock is wrong | Fix the test, note it, move on |
| `CODE-BUG` | Source is genuinely wrong | **Finding.** Do not fix here unless the user asks — record severity + repro |
| `NOT-IMPLEMENTED` | Spec says future work | Assert the *documented* failure, tier as blocked-by-spec |
| `SPEC-GAP` | Behavior undefined by any spec / `FR-###` | **Finding.** Needs a spec decision, not a test guess |

Never adjust an assertion just to get green. `UNRESOLVED` is an honest bucket; a fabricated pass is not.
As each item runs, backfill its `result` (`status`, `bucket`, `evidence`, `runId`) in `test-items.json`.

### Gate 1 — Smoke signoff
Every unit **responds without crashing**: each route mounts and returns its documented status for a
valid happy-path request (or documented 4xx), imports load, and any MCP tools list/echo. Read-only or
mocked — no writes. Produce `SMOKE-SIGNOFF.md` (pass/fail per unit, counts from the runner JSON) and
file it into wxKanban (Phase 6). **Stop and report** before Gate 2.

### Gate 2 — CRUD & execute signoff
Prerequisite: a **verified non-prod DB** (Phase 0 — MCP-UAT verified, or `TEST_DATABASE_URL`). If not
verified, **do not run this gate** — report it blocked and why.
For each persistent entity in scope, run a real **create → read → update → delete** round-trip and
assert each step's DB state; for services/jobs, **execute the real behavior** and assert outputs.
Produce `CRUD-SIGNOFF.md` (round-trip evidence per entity, execute results, counts) and file it into
wxKanban. **Stop and report** before Gate 3.

### Gate 3 — Final signoff (user verification)
The skill does **not** self-certify. Present the consolidated evidence (both prior signoffs, the
report, open findings) and **ask the user to verify and sign off**.

**The user may add new test cases here.** During verification the user can dictate additional cases
they want covered. For each: capture it as a proper atomic item (schema-conformant, `discoveredAt:
user-signoff`), **write it to `test-items.json` AND persist it to the wxKanban DB** (`create_task` +
`link_task_to_spec`), then **run it** and fold its result into the report and the relevant signoff
before proceeding. The plan is a living record — user-added cases become part of it, not a footnote.

Only once the user is satisfied do they sign off. File the `FINAL-SIGNOFF` record into wxKanban marked
**pending user verification**; only the user's explicit confirmation flips it to signed. Record
who/when from the user's confirmation — never stamp it yourself.

---

## Phase 5 — Report (EXECUTE mode)

Write `tests/testplans/<target>/TEST-REPORT.md` from `references/report-format.md`:

- **Run header** — date, commit SHA, target, tiers executed, exact pass/fail/skip counts taken from
  the runner JSON (never hand-transcribed), the DB posture used, and the reproduce command.
- **Signoff ladder** — Smoke ✓/✗, CRUD ✓/✗/blocked, Final pending/signed — each with the number that
  decides it.
- **Successes** — what is now *verified* (a test asserts it), grouped by domain / `FR-###`.
- **Issues** — ranked table: severity, bucket, unit id, symptom, evidence, suspected cause.
- **Actions** — numbered remediation list, most-severe first, noting any that need a spec change first.
- **Item results** — one row per item: ID, requirement ID, priority, status, bucket; counts
  cross-checked between `test-items.json` and the runner JSON (a discrepancy is itself reported).
- **Exit-criteria verdict** — each plan exit criterion marked met/not met with its deciding number.
- **Clarifications still open** and **coverage honesty** (zero-coverage units, every `DEFERRED-*`).

---

## Phase 6 — Capture in the spec system (mandatory)

Plans, signoffs, findings, and items land in wxKanban via the orchestrator, not just local Markdown.

- Plan, report, schema analysis & each signoff doc → `mcp__wxkanban__project_upsert_document`
  (non-empty `doctype`, e.g. `testplan` / `testreport` / `schemaanalysis` / `signoff`).
- **Test items → `mcp__wxkanban__project_upsert_test_plan` (SCOPE-111).** One call carries the whole
  suite for the scope. This replaces the old one-task-per-item filing, which flattened every item into
  a task row with a single `results` column and threw the criteria away. Items are now first-class:
  queryable, re-runnable, gateable, and rendered to a human tester as steps rather than a title.

  Two fields decide everything downstream, and they are **independent**:

  | Field | Means | Set by |
  |---|---|---|
  | `executor` | **Who runs it.** `machine` = you run it in QA. `human` = a person runs it in UAT. | The nature of the test |
  | `origin` | **Who wrote it.** `ai` for everything you author; `user` only for tester-added items. | Always `ai` from this command |

  You author BOTH sets in this one pass. Anything needing a person's eyes, judgement, or a real
  workflow is `executor: human` — it is stored now and withheld from testers until the release is
  promoted to UAT. Do not omit human items because you cannot run them; that is precisely what they
  are for.

  Declare each item's `subjects` — the code it exercises, one per screen for a multi-screen flow.
  Change-impact analysis walks the dependency graph from these, and an item with no subject **fails
  safe to Retest** on every release, so a missing subject costs a person real time later.

  Matching is on the immutable `itemKey`, so re-running updates in place and preserves accumulated
  results and signoffs. Task rows are optional cross-references now, not the storage.
- **Clarifications Required** → `mcp__wxkanban__project_submit_feedback` **first**, before any item
  that depends on one. An item with `requirementId: null` and no filed clarification has no provenance.
- `CODE-BUG` / `SPEC-GAP` findings, **schema-analysis findings** (unenforced FKs, missing/excessive
  indexes, orphans), and **DBA constraint gaps** (rules enforced only in app code) →
  `mcp__wxkanban__project_submit_feedback` against the owning spec.
- **Signoffs** → the Smoke and CRUD signoffs file as `signoff` documents + a task; the **Final
  signoff** files **pending** and is only marked signed on the user's explicit verification.
  **User-added cases** captured during the final signoff are filed here too (task + `test-items.json`)
  before the signoff is recorded.

Show the user the filing manifest — counts by type and exact titles — and let them confirm before
filing. Filing 200 items is not an undoable action to take on your own initiative.

---

## Phase 7 — Executing a run (`--Execute` only)

Execution is **machine items only**. A human item reaching a runner is a category error, and the
server refuses it.

1. **`project.start_test_run`** with the current app version. It returns the **ordered list** the run
   will execute. **Narrate that list to the user before running anything** — the same list is what
   the project's QA view shows, so a teammate who never sees this conversation can follow along.
2. **`project.report_test_progress`** twice per item: `currentItemId` as you begin it, then
   `itemId` + `status` when it finishes. Skipping the first makes the live view useless — it is the
   difference between watching a run and waiting for a verdict.
3. **`project.complete_test_run`** at the end, always. An abandoned run reads as *stalled*, not
   finished, and stays that way.
4. **`project.sign_off_test`** for each item the run **proved**. Refused unless that run passed the
   item — a signoff is a claim about evidence, and the QA gate would be self-certifying otherwise.

### Reporting change impact (before a release goes to UAT)

You hold the code, so you compute reachability; the application decides what it means for testing.
Post it with **`project.report_change_impact`**:

- Send the changed files **and their transitive dependents** — an item is marked when its subject
  depends on a changed file through *any* chain of imports, not only when the change landed in the
  file the item names. A direct-match-only graph misses a service change reaching a screen test three
  layers up, which ships a defect under a green human signoff.
- **Stamp it with the commit** you computed it from. A mismatch against the cycle under test is
  refused, and without the stamp a wrongly-computed graph marks the wrong items undetectably.
- If the dependent set is too large, set **`broad: true`** rather than truncating. A truncated set
  that looks complete produces confidently wrong marking; a declared-broad analysis simply asks
  everyone to re-test, which is honest.
- Changes with **no import edges** — migrations, config, environment, static content, dependency
  upgrades — still change behaviour. Map a migration to items whose subjects touch the affected
  tables. This is where under-marking actually happens.

Over-marking costs a tester one dismissal with a reason. Under-marking ships a bug under a signoff
that says it was verified. **Err wide.**

### Before promoting

`project.test_gate_status` answers whether forced tests clear the gate — `ai` before UAT, `all`
before production. It is the same verdict the application's phase views use, so there is no second
opinion to reconcile.

---

## Re-running

`inventory.json` is the resume anchor. On a re-run, regenerate it, **diff against the committed
copy**, and report new units (untested), deleted units (stale tests), and changed signatures (suspect
tests). Re-plan only the delta.

---

## Guardrails

- **Never mutate the production RDS.** No CRUD/live tier without a verified non-prod DB (MCP-UAT
  verified, or an explicit `TEST_DATABASE_URL`). Production is forced to UAT.
- If MCP is chosen for the CRUD DB, **verify its UAT capability first**; unverified → hard-stop, no
  prod fallback.
- No real email/SMS/Stripe/PM-system side effects in any tier.
- Don't edit `src/**` to make a test pass unless the user asks for the fix.
- Report real numbers from the runner output; if something didn't run, say it didn't run.
- **No item bodies before the Phase 2A coverage summary is approved**, and never past the caps or the
  250-item ceiling without the user raising it.
- **No subjective expected results.** Can't phrase it as an assertion → it's a clarification.
- **No invented behavior.** Ambiguity → Clarifications Required; the item asserts observed behavior and
  says it's observed.
- **The final signoff is the user's, not yours.** File it pending; never self-certify.
- Every item conforms to the fixed-field schema and passes the § *Self-check* in
  `references/test-item-schema.md` before handover.
