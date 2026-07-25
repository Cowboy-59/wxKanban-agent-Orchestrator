# Output formats — coverage summary, TEST-PLAN, TEST-REPORT, and the three signoffs

The artifacts, in order. The **coverage summary** is presented for approval before any item body
exists (Phase 2A). The **plan** is the ISTQB-shaped management document (Phase 2B). In EXECUTE mode
the run produces a **report** plus **three signoff gates** — smoke, CRUD & execute, and a final
user-verification signoff. Every number in the report and the signoffs comes from the runner JSON
(`tests/testplans/<target>/.last-run.json` for vitest, `.last-run.e2e.json` for Playwright) and from
`tests/testplans/<target>/test-items.json`, **never** from memory or terminal scrollback.

Item records themselves live in `tests/testplans/<target>/test-items.json` per `test-item-schema.md`.
Markdown here is a *rendering* of that file — when they disagree, the JSON wins.

All of these documents get the wxKanban generated-output watermark if the project requires it
(`npm run watermark -- <file>` from the repo root).

---

## Severity rubric

Apply to issues in the report and in the signoffs. Severity is about **consequence**, not how hard
the fix looks.

| Severity | Meaning | Examples in this codebase |
|---|---|---|
| **Critical** | Data loss, silent corruption, credential/secret exposure, or an insecure connection a config change alone can trigger | `users.passwordhash` serialized into an API response; a JWT secret or `DATABASE_URL` reaching a log or error body; SQL built by string concatenation in a route handler; `DELETE /projects/:id` that ignores the ownership check and removes another company's rows; `sslmode` downgrade accepted where a production connection should refuse it |
| **High** | Wrong results returned to a caller, a mutation that half-applies with no record, or an auth/audit control that doesn't fire | `POST /billing/webhook` marking a subscription active on an unverified Stripe signature; a list route returning another company's projects (tenant leak); `requireAuth` / role gate bypassed on a mutating route; invoice generation that writes some `timeentries` as billed then errors, leaving no `companyauditlogs` row |
| **Medium** | Contract or robustness defect with a workaround; missing validation; unhelpful failure | a zod body schema that admits an invalid value and lets it reach the database; a `500` `TypeError` where a clean `400` was owed; a null `duedate` serialized as the string `"null"` |
| **Low** | Cosmetic, log noise, naming, dead code, or a merely unclear message | inconsistent error-message wording; a duplicated helper; a Pino warn that fires twice per request |

`SPEC-GAP` findings take the severity of the *worst plausible* behavior the gap permits — an
undefined partial-failure contract on a mutating fan-out (e.g. a multi-step invoice run or a
PM-system sync) is High, not Low.

---

## Artifact 1 — Coverage summary (Phase 2A, for approval)

Counts and titles only. **No steps, no test data, no expected results.** Present it in chat and as
`## 0. Coverage summary` at the top of the draft plan.

```markdown
## 0. Coverage summary — FOR APPROVAL

Inventory: <N> units (<F> files) · Caps: HIGH 12 / MEDIUM 8 / LOW 3 per unit · Global ceiling 250

| Area | Units | happy | boundary | negative | permission | concurrency | recovery | Items |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| AUTH (routes) | | | | | | | | |
| PROJECTS / TASKS (routes) | | | | | | | | |
| TIME / INVOICES (routes + services) | | | | | | | | |
| BILLING (Stripe routes + webhook) | | | | | | | | |
| PM INTEGRATIONS (services) | | | | | | | | |
| UI FLOWS (React routes + navigation, Playwright) | | | | | | | | |
| DB (drizzle tables — CRUD targets) | | | | | | | | |
| MCP TOOLS (optional surface) | | | | | | | | |
| **Total** | | | | | | | | **<T>** |

**Tier split**: unit-mocked <n> · live-readonly <n> · manual <n> · not-testable <n>
  (the CRUD signoff gate exercises real writes within the live/non-prod tier — see Phase 0 DB posture)
**Priority split**: P1 <n> · P2 <n> · P3 <n>
**Cap pressure**: <n> units hit their cap; <n> items deferred as `DEFERRED-CAP` — listed below.
**Against the ceiling**: <T> of 250. <If over: DO NOT EXPAND. Options presented instead.>

### Variant exemptions by code
| Code | Count | Representative reason |
|---|---:|---|
| N/A-READ-ONLY | | pure GET path, no shared mutable state |
| N/A-NO-AUTH | | route mounts no auth middleware by design |
| DEFERRED-CAP | | <what was dropped and its risk — never left blank> |

### Deferred by cap — what we are choosing not to test
| Unit | Variant dropped | Risk if it breaks |
|---|---|---|

### Sample of the 15 highest-priority item titles
1. `TC-BILL-004` `POST /billing/webhook` rejects a body whose Stripe signature fails verification
2. `TC-AUTH-002-P1` `GET /projects` returns 401 with no `authtoken` cookie
3. `TC-UI-001` login → dashboard navigation lands on `/dashboard` and renders the project list
4. …

### Clarifications Required (blocks item authoring)
| ID | Unit | Question | Blocks | Severity if wrong |
|---|---|---|---|---|
| CLAR-01 | | | | |

**Decision needed**: approve as-is · raise the ceiling · narrow scope · drop the deferred tail ·
authorize the CRUD/live tier and name the non-prod DB (MCP-UAT verified, or `TEST_DATABASE_URL`) yes/no
```

---

## Artifact 2 — `tests/testplans/<target>/TEST-PLAN.md`

```markdown
# Test Plan — <target>

**Version** 1.0 · **Date** <YYYY-MM-DD> · **Commit** <sha> · **Author** wxCreateTestPlan (Principal QA Architect persona)
**Inventory** `tests/testplans/<target>/inventory.json` (<N> units / <F> files) · **Items** `tests/testplans/<target>/test-items.json` (<T> items)
**Specs consulted** SPEC-051 localization · SPEC-058 scope checkout · SPEC-090 signup activation · …

## 0. Coverage summary
<the approved Artifact 1 table, verbatim, plus the approval date and any user amendments>

## 1. Scope

In scope, by area, with the requirement IDs each covers. The **UI/E2E flow dimension is first-class**:
React routes, page-to-page navigation (and back), and per-screen element functionality are tested,
not just the API surface behind them.

| Area | Units | Requirements covered | Test levels |
|---|---:|---|---|
| Auth routes (signin, signout, refresh) | 6 routes | FR-090-01 … FR-090-05 | component, system |
| Projects & tasks routes | | FR-058-* | component, integration |
| Time & invoices (routes + services) | | FR-0xx-* | component, integration |
| Billing (Stripe routes + webhook) | | FR-0xx-* | component |
| UI flows — React routes & navigation | screens + edges | FR-0xx-* | system (E2E, Playwright) |
| DB — drizzle tables | tables | (CRUD round-trip targets) | integration |

## 2. Out of scope

| Excluded | Reason | Who owns it instead |
|---|---|---|
| `src/db/schema/*.ts`, relations | Table definitions — data, not callables; exercised indirectly by SQL-shape assertions and by the CRUD round-trips | covered via `TC-DB-*` and drizzle-SQL checks |
| operational scripts (migrations, one-off admin) | Mutating operator scripts — never invoked from a test | manual, operator-run |
| PM-system live mutation paths | No non-production PM (Jira / Monday / Asana / Trello) endpoint exists to write against | deferred; contract-tested only |
| Real email / SMS / Stripe charge / live PM push | Side-effecting external services — stubbed in every tier | manual, operator-run |
| Load / performance / soak | No stated NFR targets in the specs | Clarifications Required CLAR-nn |

## 3. Test levels

| Level | What it covers here | Runner | Notes |
|---|---|---|---|
| Unit | pure functions, config resolvers, `src/server/**` helpers, `src/shared/**` primitives | vitest, mocked | no I/O at all |
| Component | Express route handlers driven through the **real app** via supertest | vitest, `pg` mocked | exercises middleware + zod + auth |
| Integration | drizzle SQL generation against `src/db/schema/*` (pg mocked at the pool boundary) | vitest, mocked | catches column/table drift |
| System (E2E) | React route-to-route flow, navigation edges (forward **and** back), and per-screen element functionality | **Playwright** against the running app | opt-in; login→dashboard→detail→back covered as flows |
| System (live) | live read-only queries against the non-prod DB | vitest live config | opt-in; read-only |
| Acceptance | operator-run scripts / smoke commands | manual | documented commands |

## 4. Entry criteria

| # | Criterion | Status |
|---|---|:-:|
| E1 | `inventory.json` regenerated at the target commit | |
| E2 | Coverage summary approved by the requester | |
| E3 | Harness green: `npx vitest run` collects with zero import errors | |
| E4 | Root devDeps include vitest **and** Playwright; setup files present | |
| E5 | CRUD/live tier explicitly authorized against a **verified non-prod DB**, or formally deferred | |
| E6 | Blocking clarifications (severity High+) answered or assumptions accepted | |

## 5. Exit criteria

| # | Criterion | Threshold |
|---|---|---|
| X1 | P1 items executed | 100% |
| X2 | P1 items passing | 100%, or every failure has a filed `CODE-BUG`/`SPEC-GAP` with an owner |
| X3 | P2 items executed | ≥ 90% |
| X4 | Critical/High findings | zero open without a filed remediation action |
| X5 | Unresolved-bucket failures | ≤ 2, each with a named next diagnostic step |
| X6 | HIGH-risk units with zero coverage | zero, unless listed in §2 with a reason |
| X7 | Core UI flows (login→dashboard, create/edit, and back-navigation) | each has ≥1 passing E2E item |
| X8 | Clarifications | all filed; none silently assumed |
| X9 | Traceability | every executed item has a `requirementId` or a `clarificationId` |

Exit criteria are evaluated in the report (§ *Exit-criteria verdict*) with the deciding number.

## 6. Risk register

Product risk drives priority; project risk drives schedule. Score = likelihood × impact (1–3 each).

| ID | Type | Risk | L | I | Score | Mitigation | Items |
|---|---|---|:-:|:-:|:-:|---|---|
| R1 | Product | Auth/role gate bypassed — a mutating route reachable without a valid `authtoken` | 3 | 3 | 9 | `requireAuth` tests with missing/expired/forged JWT on every mutating route | TC-AUTH-*-P1 |
| R2 | Product | `POST /billing/webhook` trusts an unverified Stripe signature and flips subscription state | 2 | 3 | 6 | Signature-verification negative + replay items | TC-BILL-004… |
| R3 | Product | Tenant leak — a list/read route returns another company's rows | 3 | 3 | 9 | Cross-company permission items on every scoped read | TC-PROJ-*-P2 |
| R4 | Product | Secret or `passwordhash` reaching a response body or a log line | 2 | 3 | 6 | Response key-set assertions + Pino spy across auth/user paths | TC-AUTH-00x |
| R5 | Product | A core UI flow breaks (login→dashboard, create→list) with a green API | 2 | 3 | 6 | Playwright E2E asserting URL + rendered screen elements, incl. back-navigation | TC-UI-001… |
| R6 | Project | CRUD/live tier needs a verified non-prod DB + network; unavailable in CI | 3 | 1 | 3 | Unit + component tiers fully mocked and CI-safe | — |

## 7. Environments

| Env | Purpose | Config | Data | Constraints |
|---|---|---|---|---|
| Local unit/component | all mocked tiers | setup forces a `db.test.invalid` host, fake creds, `PGSSLMODE=require`; `pg` pool mocked, **drizzle left real** | fixtures only | zero network; cannot reach a real host by construction |
| Non-prod DB | CRUD round-trips + live read-only | **MCP UAT connection (capability verified)** or an explicit `TEST_DATABASE_URL` — never the prod-pointing `.env` | non-prod / seeded | writes allowed **only here**; `fileParallelism: false` for CRUD |
| E2E (Playwright) | React route/navigation flows | app started against the non-prod DB (or mocked API), test JWT minted with the app's signer | seeded fixtures | screen-element + navigation assertions only |
| PROD | — | — | — | **prohibited**; any target resolving to production is redirected to UAT; there is no PROD write path |

## 8. Test data strategy

- **Fixtures** are the default, shaped from real `src/db/schema/*` column names; a fixture needing a
  nonexistent column is a finding, not a fixture fix.
- **Synthetic identifiers only** in the mocked tiers. No real customer emails, company names, or
  invoice numbers committed to the repo.
- **CRUD round-trips create their own rows** in the non-prod DB and delete them in teardown; assert on
  DB state, then clean up. The live read-only tier **discovers its own data at runtime** and asserts
  on *shape*, never on a specific row.
- **Boundary data lives in the item's `testData` table** as a partition set, not as separate items.
- **No secrets in fixtures.** Secret-path tests use temp values written and removed by the test.
- **PII**: the app holds customer data. Live-tier and E2E output must not be pasted into reports or
  logs — reference row counts and field shapes instead.

## 8A. Database Engineering plan sections (Senior Database Engineer / Data Quality persona)

Contributed by the second persona. These sit alongside the ISTQB sections above and treat the
schema itself as the unit under test. Their factual inputs — object counts and the
referential-integrity score — are sourced from the **schema-analysis deliverable**
(`tests/testplans/<target>/SCHEMA-ANALYSIS.md`, doctype `schemaanalysis`), never restated from
memory; run counts still come from the runner JSON.

### 8A.1 Data Architecture Under Test

Pins what the plan is asserting against. If the migration head moves, this section is stale and the
plan re-baselines.

- **Schema version**: migration head `<drizzle migration id / hash>` at commit `<sha>`.
- **Object inventory** (from `SCHEMA-ANALYSIS.md`):

| Object kind | Count | Source |
|---|---:|---|
| Tables | | `SCHEMA-ANALYSIS.md` § inventory |
| Views / materialized views | | |
| Indexes | | |
| Constraints (PK / FK / unique / check / not-null) | | |

- **Volumetrics** — row counts per major table at **1x** (baseline expected production scale), with
  growth-prone tables flagged. 1x figures are observed from the non-prod DB or estimated in the
  schema analysis; a `⚠ growth-prone` flag means the table accretes without bound in normal use and
  drives the §8A.4 scale ladder.

| Table | Rows @ 1x | Growth-prone? | Note |
|---|---:|:-:|---|
| `users` | | | bounded by seats |
| `projects` | | | bounded by tenants |
| `tasks` | | ⚠ | grows per project activity |
| `timeentries` | | ⚠ | highest-velocity table |
| `invoices` | | | bounded by billing cycles |
| `companyauditlogs` | | ⚠ | append-only; retention-pruned |
| `pmsystemconnections` | | | bounded by integrations |

### 8A.2 Test Data Strategy (data-layer)

Complements §8 (fixtures) with how *volume* and *production-shaped* data are produced for the
data-layer and scale tiers.

- **Generation approach**: **synthetic-first**. Synthetic rows are generated from the real
  `src/db/schema/*` shapes at the scale factor a test needs. An **anonymized production extract** is
  used *only* when a test requires realistic distribution the synthetic generator cannot mimic.
- **Anonymization / PII masking**: any production-derived data is **masked before it lands in a test
  DB** — emails, names, company names, tokens, and invoice numbers replaced; secrets and
  `passwordhash` never copied. Raw production rows are never committed to the repo and never pasted
  into reports or logs (reference counts and field shapes instead — see §8).
- **Refresh cadence**: seed sets are regenerated at the plan commit; the scale ladder (§8A.4) is
  regenerated per run. Any anonymized extract has a stated expiry and is discarded, not retained.
- **Non-prod DB only**: CRUD and live runs execute against a **non-production database only** — a
  **verified MCP-UAT connection** or a disposable **`TEST_DATABASE_URL`**. Any target resolving to
  production is **forced to UAT**; a **prod-RDS host is hard-refused** by construction. Every
  data-layer item **seeds its own rows and tears them down** (assert DB state, then clean up); there
  is no shared mutable fixture across items.

### 8A.3 Database Environment Matrix

Config deltas between production and the test DB are themselves risk — a test that passes under a
looser test config can mask a production-only failure. Deltas are declared, not discovered later.

| Dimension | Production | Test (non-prod) | Delta risk |
|---|---|---|---|
| Engine version | PostgreSQL `<prod ver>` | PostgreSQL `<test ver>` | a version gap can hide planner/behavior differences |
| Default isolation level | `<read committed / …>` | `<…>` | a stricter/looser default changes concurrency outcomes |
| Connection-pool size | `<prod max>` | `<test max>` | pool exhaustion / contention only reproduces near prod sizing |
| Extensions | `<pgvector, uuid-ossp, …>` | `<…>` | a missing extension makes a dependent path untestable |
| `sslmode` | `require` (refuses downgrade) | `<require / …>` | a downgraded `sslmode` in test is a **Critical**-class posture gap (see rubric) |

Any row where test differs from production is called out in the report's coverage gaps if it
weakens what a passing result proves.

### 8A.4 Performance Baselines

Per-query SLA targets that failing performance items measure against, at **1x / 10x / 100x** the
expected row counts from §8A.1. A performance item fails when observed **p95** exceeds the target at
its tier, or when the plan shows a **sequential scan on a growth-prone table** where an index scan
is required.

| Query / path | Target p95 @ 1x | @ 10x | @ 100x | Index expectation |
|---|---:|---:|---:|---|
| `GET /projects` list (tenant-scoped) | | | | index scan on tenant key; **no seq scan** |
| `tasks` by project | | | | index scan on `projectid`; **no seq scan** |
| `timeentries` range for invoice run | | | | index scan on `(projectid, starttime)`; **no seq scan** |
| `companyauditlogs` retention query | | | | index scan on `createdat`; **no seq scan** |

- **SLA targets** are p95 latencies, stated per tier; a blank target means the SLA is a Clarification
  Required (§13), not silently zero.
- **Index-effectiveness expectation**: growth-prone tables (§8A.1) must be served by an **index
  scan** — an observed **seq scan** on one at 10x/100x is a finding regardless of latency, because it
  degrades with volume.
- Scale-tier runs execute on the **non-prod DB only** (§8A.2); if no verified non-prod DB exists the
  tier is **blocked**, reported as blocked, never as a pass.

## 9. Roles and responsibilities

| Role | Owner | Responsibility |
|---|---|---|
| Test architect / author | this skill | inventory, plan, items, harness, execution, report, signoffs |
| Approver — scope & volume | requester | approves the coverage summary, the ceiling, the CRUD/live tier |
| Spec owner | per `specs/NNN-*` | answers Clarifications Required; rules on `SPEC-GAP` |
| Fix owner | assigned per finding | remediates `CODE-BUG` items; not this skill unless asked |
| Final signoff | **the user** | verifies the evidence and signs the final gate — the skill never self-certifies |
| Release gate | project lifecycle (§ QA Testing phase) | evaluates exit criteria |

## 10. Schedule

Sequenced by risk, not by file order. Effort is relative, not calendar-committed.

| Stage | Work | Depends on | Effort |
|---|---|---|---|
| S1 | Harness + setup files green (vitest + Playwright) | E3, E4 | S |
| S2 | HIGH-risk auth/permission items (auth gates, tenant scoping) | S1 | L |
| S3 | Billing webhook + mutating routes (signature, confirm, audit) | S1 | L |
| S4 | Read-path routes + drizzle SQL shape | S1 | M |
| S5 | Services + shared primitives | S1 | S |
| S6 | UI/E2E flow items (login→dashboard→detail, create/edit, back-nav) | S1 | M |
| S7 | CRUD round-trips on the verified non-prod DB | S4, E5 | M |
| S8 | Report, signoff ladder, exit-criteria verdict, filing | S2–S7 | M |

## 11. Deliverables

| Deliverable | Path | Consumer |
|---|---|---|
| Unit inventory (machine) | `tests/testplans/<target>/inventory.json` | re-run diffing |
| Unit inventory (human) | `tests/testplans/<target>/INVENTORY.md` | review |
| Test plan | `tests/testplans/<target>/TEST-PLAN.md` | requester, release gate |
| Test items | `tests/testplans/<target>/test-items.json` | wxKanban insert, report counts |
| Test suites | `tests/**` (unit/component/integration + `*.e2e.ts`) | CI |
| Harness | `vitest.config.ts`, `playwright.config.ts`, setup/helpers | CI |
| Raw run output | `tests/testplans/<target>/.last-run.json`, `.last-run.e2e.json` | report numbers (gitignored) |
| Smoke signoff | `tests/testplans/<target>/SMOKE-SIGNOFF.md` | requester, release gate |
| CRUD signoff | `tests/testplans/<target>/CRUD-SIGNOFF.md` | requester, release gate |
| Final signoff | `tests/testplans/<target>/FINAL-SIGNOFF.md` | **the user** (signs it) |
| Test report | `tests/testplans/<target>/TEST-REPORT.md` | requester, release gate |
| wxKanban records | documents + tasks + feedback | project management |

## 12. Traceability matrix

| Requirement | Spec ref | Units | Items | Coverage |
|---|---|---|---|---|
| FR-090-01 | SPEC-090 §4.1 | `route:POST /auth/signin` | TC-AUTH-001, -B1, -N1, -N2 | full |
| FR-058-07 | SPEC-058 §4.7 | `route:PATCH /scopes/:id/checkin` | TC-PROJ-007… | partial — concurrency deferred |
| — | — | `route:POST /projects` | TC-PROJ-013 | **untraceable — CLAR-03** |

Requirements with no items, and units with no requirement, are both listed. Neither is acceptable
silently.

## 13. Clarifications Required

Ambiguities that were **not** guessed. Each names what it blocks and what was assumed meanwhile.

| ID | Unit / area | Question | Why it's ambiguous | Blocks | Assumed for now | Severity if wrong |
|---|---|---|---|---|---|---|
| CLAR-01 | `service:generateInvoice` | If invoice line 3 of 6 fails to write, are lines 1–2 rolled back or is a partial invoice the contract? | No transaction spans the loop; spec is silent | TC-INV-011-R1 | Partial write asserted as **observed**, not ratified | High |

## 14. Item index

Rendered from `test-items.json` per `test-item-schema.md` § *Markdown rendering*. Grouped by area,
ordered by priority then ID.
```

---

## Artifact 3 — `tests/testplans/<target>/TEST-REPORT.md`

```markdown
# Test Report — <target>

**Run** <YYYY-MM-DD HH:MM> · **Commit** <sha> · **Branch** <branch> · **Plan** v1.0
**Tiers executed** unit ✅ · component ✅ · E2E ✅ · CRUD/live ⏭ not approved · manual ⏭
**DB posture** unit/component: `pg` mocked, drizzle real · CRUD: <MCP-UAT verified | TEST_DATABASE_URL | not run>
**Reproduce** `npx vitest run` · `npx playwright test`

## 1. Results

| | vitest | Playwright |
|---|---:|---:|
| Test files / specs | | |
| Tests passed | | |
| Tests failed | | |
| Tests skipped | | |
| Duration | | |

Numbers taken verbatim from `tests/testplans/<target>/.last-run.json` and `.last-run.e2e.json`.

**Item status** (from `test-items.json`): pass <n> · fail <n> · skip <n> · blocked <n> · unresolved <n>
**Reconciliation**: <T> items vs <n> executed tests — <equal, or the discrepancy and its cause>.
**Inventory coverage**: <n>/<N> units with ≥1 direct item (<pct>%) · <n> indirect · <n> uncovered (§6)

## 2. Signoff ladder

The three gates, each with the number that decides it. A gate is ✓ only when its deciding count says so.

| Gate | Verdict | Deciding number |
|---|:-:|---|
| **Smoke** — every unit responds without crashing (read-only/mocked) | ✓ / ✗ | <passed>/<total> units responded; <n> import errors |
| **CRUD & execute** — real create→read→update→delete + behavior execution on a non-prod DB | ✓ / ✗ / **blocked** | <entities round-tripped>/<entities in scope>; blocked ⇒ no verified non-prod DB |
| **Final** — user verification | **pending** / signed | filed pending; flips to signed only on the user's explicit confirmation |

If CRUD is **blocked**, say so here and in §6 — a blocked gate is never rendered as a pass.

The schema-analysis deliverable (`tests/testplans/<target>/SCHEMA-ANALYSIS.md`, doctype
`schemaanalysis`) is filed alongside the plan; the data-architecture, referential-integrity, and
constraint-gap figures in this report (§4 *Data-layer coverage*, §8A of the plan) are read from it.

## 3. Exit-criteria verdict

| # | Criterion | Threshold | Actual | Verdict |
|---|---|---|---|:-:|
| X1 | P1 items executed | 100% | | ✅/❌ |
| X2 | P1 items passing | 100% or filed | | |
| X7 | Core UI flows have a passing E2E item | each | | |
| … | | | | |

**Overall**: <MET / NOT MET> — <the one sentence a release gate needs>

## 4. Verified successes

Behavior now backed by a passing assertion. "Verified" means an item asserts it.

### Auth & permissions (SPEC-090)
- ✅ `TC-AUTH-002-P1` — `GET /projects` returns `401` with no `authtoken` cookie and leaks no body.
- ✅ `TC-AUTH-005` — signin response key set omits `passwordhash`.

### API surface
- ✅ `TC-BILL-004` — `POST /billing/webhook` rejects a body whose Stripe signature fails verification.

### UI / E2E flow
- ✅ `TC-UI-001` — login → `/dashboard` navigation lands on the dashboard and renders the project list;
  browser back returns to `/login` without a stale authed view.
- ✅ `TC-UI-006` — create-task screen: submit adds the row to the list and the detail screen shows it.

### Data-layer coverage (DB-engineer persona)

Sourced from the schema-analysis deliverable (`SCHEMA-ANALYSIS.md`) and the data-layer items.

- **Constraint gaps found**: business rules enforced **only in application code**, with no DB
  constraint backing them — reported here as **FINDINGS, not tests** (a gap the schema does not
  guard). Each is filed as a finding (§8 Actions) with its severity from the rubric; e.g. an
  ownership/tenant rule enforced only in a route handler, or a status enum admitted by the column
  but constrained only in zod.

| Rule | Enforced where | Missing DB guard | Sev | Filed as |
|---|---|---|---|---|
| | route/service only | check/FK/unique | | feedback #… |

- **Referential-integrity score**: **`<0–10>` / 10**, from `SCHEMA-ANALYSIS.md` — the proportion of
  relationships backed by an actual FK constraint (orphan-risk indicator). A score below the plan's
  bar is itself a finding.
- **Migration forward / rollback / data-preservation**: results of applying the migration head
  forward, rolling it back, and confirming no data loss across the round-trip on the non-prod DB.

| Migration check | Result | Evidence |
|---|:-:|---|
| Forward apply (clean) | ✅/❌ | migration id `<…>` |
| Rollback (down) | ✅/❌ | |
| Data preservation across forward→rollback | ✅/❌ | row counts equal pre/post |

## 5. Issues

Ranked most severe first.

| # | Sev | Bucket | Item | Unit | Requirement | Symptom | Evidence |
|---:|---|---|---|---|---|---|---|
| 1 | Critical | CODE-BUG | TC-BILL-004 | `route:POST /billing/webhook` | FR-0xx | subscription flipped active on unverified signature | `billing.ts:88` |
| 2 | High | CODE-BUG | TC-UI-001 | `ui:login→dashboard` | FR-0xx | login submits but never navigates; stays on `/login` | e2e trace |

### Detail

#### Issue 1 — Critical — CODE-BUG — `TC-BILL-004` / `route:POST /billing/webhook`
- **What happens**: <observed>
- **Expected**: <quoted from the spec + requirement ID>
- **Repro**: `npx vitest run tests/component/billing/webhook.test.ts -t "TC-BILL-004"`
- **Evidence**:
  ```
  <failing assertion / actual output>
  ```
- **Blast radius**: <who is affected — e.g. any customer, subscription state integrity>
- **Not fixed here because**: <outside this skill's remit / needs a spec decision / user's call>

#### Issue 2 — High — CODE-BUG — `TC-UI-001` / login→dashboard flow
- **What happens**: submit fires the API call but the SPA does not route to `/dashboard`.
- **Repro**: `npx playwright test tests/e2e/auth-flow.e2e.ts -g "TC-UI-001"`
- **Evidence**: Playwright trace / screenshot ref (no PII pasted).

### Unresolved
Failures not attributable to either the test or the source. Listed honestly, not guessed.

| Item | Failure | Why unresolved | Next diagnostic step |
|---|---|---|---|

## 6. Coverage gaps

| Unit | Risk | Why uncovered | Exemption code | What it would take |
|---|---|---|---|---|
| PM-system write paths | HIGH | No non-prod PM endpoint to mutate against | DEFERRED-SPEC | a contract test against the client interface, or a sandbox tenant |
| CRUD round-trips (all entities) | HIGH | CRUD gate blocked — no verified non-prod DB this run | DEFERRED-CAP | verified MCP-UAT connection or `TEST_DATABASE_URL` |
| <screen> back-navigation | MEDIUM | E2E flow item deferred under cap | DEFERRED-CAP | one Playwright item asserting URL + rendered state after back |

Includes every `DEFERRED-CAP` from the approved summary and any **blocked** gate. A gap left out of
this table would read as coverage.

## 7. Clarifications still open

| ID | Question | Blocks | Assumed | Severity if wrong | Filed as |
|---|---|---|---|---|---|

## 8. Actions

Numbered, most severe first, each directly actionable.

| # | Action | Where | Sev | Needs spec change first? | Filed as |
|---:|---|---|---|---|---|
| 1 | Verify the Stripe signature before mutating subscription state | `src/server/routes/billing.ts:88` | Critical | No | feedback #<id> |
| 2 | Fix the login→dashboard client navigation | `src/client/...` | High | No | feedback #<id> |
| 3 | Define the partial-failure contract for multi-line invoice runs | SPEC-0xx | High | **Yes** | feedback #<id> |

## 9. Filed in the spec system

| Artifact | Count | Target | Reference |
|---|---:|---|---|
| Test tasks | | per implementing spec | tasks #… |
| Clarification feedback | | per spec owner | feedback #… |
| Finding feedback | | per spec | feedback #… |
| Documents (plan/report/signoffs) | | project docs | doc #… |
```

---

## Artifact 4 — `tests/testplans/<target>/SMOKE-SIGNOFF.md` (Gate 1)

Every unit **responds without crashing**: each route mounts and returns its documented status for a
valid happy-path request (or documented 4xx), imports load, each React route renders without a thrown
error, and any MCP tools list/echo. Read-only or mocked — **no writes**.

```markdown
# Smoke Signoff — <target>

**Gate** 1 of 3 (smoke) · **Run** <YYYY-MM-DD HH:MM> · **Commit** <sha>
**DB posture** `pg` mocked, drizzle real — nothing real touched
**Reproduce** `npx vitest run` · `npx playwright test --grep @smoke`

## Verdict

**SMOKE: PASS / FAIL** — <units responded>/<units total> responded without crashing; <n> import errors.
Counts from `tests/testplans/<target>/.last-run.json` (+ `.last-run.e2e.json` for UI). Not transcribed.

## Per-unit results

| Unit | Kind | Expected | Got | Pass? |
|---|---|---|---|:-:|
| `route:POST /auth/signin` | express-route | 200 on valid body | | ✓/✗ |
| `route:GET /projects` | express-route | 401 without cookie | | |
| `table:tasks` | drizzle-table | import + SQL-shape builds | | |
| `ui:/dashboard` | ui-route | renders without a thrown error | | |
| `flow:login→dashboard` | ui-flow-edge | navigates, no console error | | |
| `service:generateInvoice` | exported-function | imports + returns on happy input | | |
| `tool:<name>` (if any) | mcp-tool | lists / echoes | | |

## Counts (from runner JSON)

| | vitest | Playwright |
|---|---:|---:|
| Executed | | |
| Passed | | |
| Failed | | |
| Import/collection errors | | — |

## Crashes / import failures (if any)

| Unit | Error | Bucket | Next step |
|---|---|---|---|

**Gate outcome**: <PASS → proceed to Gate 2 | FAIL → stop, file findings, do not run CRUD>
Filed into wxKanban as a `signoff` document + task.
```

---

## Artifact 5 — `tests/testplans/<target>/CRUD-SIGNOFF.md` (Gate 2)

A real **create → read → update → delete** round-trip per persistent entity, plus **real behavior
execution** for services/jobs, run against a **non-production database only**. State which one, and
how it was verified. If no verified non-prod DB exists, this gate is **blocked** — do not run it,
and never fall back to the prod-pointing `.env`.

```markdown
# CRUD & Execute Signoff — <target>

**Gate** 2 of 3 (CRUD & execute) · **Run** <YYYY-MM-DD HH:MM> · **Commit** <sha>
**Non-prod DB**: <MCP-UAT connection — capability VERIFIED at <how> | `TEST_DATABASE_URL` = <redacted host>>
**Production write path**: forced to UAT — none exists.
**Reproduce** `TEST_DATABASE_URL=… npx vitest run --config vitest.live.config.ts`

## Verdict

**CRUD: PASS / FAIL / BLOCKED** — <entities round-tripped>/<entities in scope> completed a full
C→R→U→D with asserted DB state; <services executed>/<services in scope> ran real behavior.
**BLOCKED** ⇒ no verified non-prod DB; nothing was written. Counts from the runner JSON.

## Per-entity CRUD evidence

| Entity | Create | Read | Update | Delete | Cleaned up? | Item | Pass? |
|---|:-:|:-:|:-:|:-:|:-:|---|:-:|
| `projects` | id minted | row read back | field changed + reread | row gone | ✓ | TC-PROJ-CRUD | ✓/✗ |
| `tasks` | | | | | | TC-TASK-CRUD | |
| `timeentries` | | | | | | TC-TIME-CRUD | |
| `invoices` | | | | | | TC-INV-CRUD | |

Each cell names the **asserted DB state** (e.g. "SELECT returns 1 row; `title` == updated value;
final SELECT returns 0"), not just "worked".

## Behavior execution (services / jobs)

| Unit | Input | Real output asserted | Item | Pass? |
|---|---|---|---|:-:|
| `service:generateInvoice` | seeded timeentries | invoice total == Σ line amounts; `companyauditlogs` row written | TC-INV-EXEC | ✓/✗ |

## Counts (from runner JSON)

| | Count |
|---|---:|
| CRUD items executed | |
| Passed | |
| Failed | |
| Blocked (no non-prod DB) | |

## Findings

| # | Sev | Bucket | Item | Symptom | Evidence |
|---:|---|---|---|---|---|

**Gate outcome**: <PASS → proceed to Gate 3 | FAIL/BLOCKED → stop, report, no final signoff>
Filed into wxKanban as a `signoff` document + task.
```

---

## Artifact 6 — `tests/testplans/<target>/FINAL-SIGNOFF.md` (Gate 3 — user verification)

The skill does **not** self-certify. It files this **pending** and presents the consolidated
evidence; only the user's explicit confirmation flips it to signed. **Never fill the signed-by /
date line yourself** — it stays blank until the user provides it.

```markdown
# Final Signoff — <target>

**Gate** 3 of 3 (final — user verification) · **Prepared** <YYYY-MM-DD HH:MM> · **Commit** <sha>
**Status**: PENDING USER VERIFICATION

## Evidence presented to the user

| Gate | Verdict | Deciding number | Document |
|---|:-:|---|---|
| Smoke | <PASS/FAIL> | <passed>/<total> units | `SMOKE-SIGNOFF.md` |
| CRUD & execute | <PASS/FAIL/BLOCKED> | <round-tripped>/<in scope> | `CRUD-SIGNOFF.md` |
| Report | — | <pass>/<fail>/<blocked> items | `TEST-REPORT.md` |

## Open findings the user is accepting or blocking on

| # | Sev | Bucket | Item | Symptom | Filed as |
|---:|---|---|---|---|---|

## Exit-criteria roll-up

<MET / NOT MET> — from the report's § *Exit-criteria verdict*.

## User verification

The skill has **not** signed this. To sign off, the user confirms below.

- **Signed by**: ____________________  (the skill leaves this blank)
- **Date**: ____________________
- **Decision**: [ ] Accepted / signed   [ ] Rejected — see findings above

_Only the user's explicit confirmation flips the wxKanban `signoff` record from **pending** to
**signed**; who and when are recorded from that confirmation, never stamped by the skill._
```

---

## Getting the numbers right

```bash
# vitest (unit / component / integration), from the repo root
npx vitest run --reporter=json --outputFile=tests/testplans/<target>/.last-run.json

# Playwright (UI / E2E flow)
npx playwright test --reporter=json > tests/testplans/<target>/.last-run.e2e.json
```

Read counts from the JSON — vitest: `numTotalTests`, `numPassedTests`, `numFailedTests`,
`numPendingTests`, `testResults[]`; Playwright: the `stats`/`suites` totals — never transcribe
terminal output. Cross-check against `test-items.json` statuses; report any discrepancy rather than
choosing the friendlier number.

If a run errored before collecting (a config or import failure), the report and the smoke signoff say
**"suite failed to run"** with the error. They do not report a pass count. A **blocked** CRUD gate is
reported as blocked with its reason — never as a pass, and never by silently omitting it.
