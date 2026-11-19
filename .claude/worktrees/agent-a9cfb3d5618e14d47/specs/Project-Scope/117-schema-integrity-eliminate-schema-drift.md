# Spec 117: Production Schema Integrity

**Spec Number**: 117
**Status**: `draft`
**Created**: 2026-07-31
**Depends On**: None
**Source**: `specs/Project-Scope/117-schema-integrity-eliminate-schema-drift.md`

## Overview

Production database schema is unmanaged. There is no migration ledger in the production
database, so a table or column declared in `src/db/schema/` can ship to production without the
database ever receiving it. Nothing compares declared schema against deployed schema, so
divergence is discovered only when a user hits a route that queries the missing object and
receives a 500.

This scope eliminates the current divergence, restores the diagnostic signal needed to detect it,
and establishes a mechanism that prevents a schema change from reaching production unapplied.

**Origin.** On 2026-07-30 the CloudWatch alarm `wxkanban-cloudfront-5xx` fired at 23:23 UTC.
Investigation traced it to a signed-in consultant opening the Consultant Hub, whose requests
failed with Postgres `42P01` (`relation "complianceflags" does not exist`) and `22P02`
(`invalid input syntax for type uuid: "all"`). The database was healthy throughout — RDS CPU ~3%,
connections flat at 31–36 — and the last deployment had completed 3.7 hours earlier. The failure
was not isolated: "Failed query" bursts occurred **nine times that day** (10:27, 12:04, 12:06,
12:12, 12:53, 15:12, 18:44, 23:13, 23:14 UTC). Only the 23:13 burst crossed the alarm threshold,
because baseline traffic is ~11 requests per 5 minutes and it took 11 errors to exceed 1%.

**Three compounding causes:**

1. Production has no migration tracking table at all, so drift is undetectable.
2. CLAUDE.md documents `npm run db:generate`, but no such script exists in `package.json` — the
   documented workflow was never executable, so migrations were not generated.
3. `error.cause` is discarded at ~233 server log sites and Pino has no serializers, so Drizzle's
   wrapper message `"Failed query: ..."` reaches CloudWatch while the actual Postgres error code
   never does. Diagnosing this incident required replaying the logged SQL against production by hand.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Platform maintainer — the person shipping a schema change to production |
| **Secondary Actors** | Consultant (end user hitting a 500 on a missing object); maintainer triaging a production incident; CI pipeline enforcing the release gate |
| **Key Value** | A schema change either reaches production or fails visibly before release — it can no longer arrive silently broken and be found by a customer. |
| **Scope Boundary** | Reconcile the 6 declared-but-missing tables; reject sentinel values at the request boundary; preserve `error.cause` in logs; establish a baselined migration ledger; add CI-gated drift detection; inventory and protect the 27 orphan tables; restore the missing `db:*` scripts. |

## User Scenarios & Testing

### US1 — Consultant Hub loads cleanly (user-facing fix)

**Actor**: Consultant

**Scenario**:
1. Consultant signs in and opens the Consultant Hub with "All projects" selected.
2. The page issues its compliance-flags, invoice-preview, active-timer and recent-timer requests.
3. All four resolve and the page renders.

**Expected outcome**: All requests return HTTP 200. Zero `42P01` and zero `22P02` in the
application log for that session. The page renders compliance flags and an invoice preview rather
than an error state.

### US2 — A schema change ships correctly (happy path)

**Actor**: Platform maintainer

**Scenario**:
1. Maintainer adds a table to `src/db/schema/` and generates a migration.
2. The change is committed, pushed, and deployed.
3. The migration applies against production.

**Expected outcome**: The migration is recorded in the production ledger; the drift check reports
zero divergence; the new table is queryable in production on first request.

### US3 — A schema change ships WITHOUT its migration (the guard)

**Actor**: Platform maintainer / CI pipeline

**Scenario**:
1. Maintainer declares a table but never generates or applies a migration — exactly what happened
   with `complianceflags`.
2. The change is committed and pushed.
3. The drift check runs in CI.

**Expected outcome**: The check **fails loudly and names the divergent object** ("declared but not
deployed: complianceflags"). The failure occurs before a user can reach the route. A non-zero exit
is required — a warning that scrolls past is a failed scenario.

### US4 — Baselining an already-unmanaged production database (one-time, highest risk)

**Actor**: Platform maintainer

**Scenario**:
1. Maintainer establishes the ledger against a production DB with 125 tables, no ledger, and 27
   orphan tables declared by neither the app nor the MCP schema.
2. Current production state is captured as the baseline.
3. Only the 6 missing tables are applied.

**Expected outcome**: The 6 missing tables are created. **No existing table, column, or row is
dropped or altered.** All 27 orphan tables survive untouched. The operation is verified against a
non-production target before it touches production.

### US5 — Triaging a production 500 (restores the lost signal)

**Actor**: Maintainer triaging an incident

**Scenario**:
1. A DB-backed request fails in production.
2. Maintainer opens CloudWatch and locates the error event.

**Expected outcome**: The log record carries the Postgres error code and detail (e.g. `42P01`,
`relation "x" does not exist`) alongside the failing SQL — enough to identify the fault without
replaying the query by hand against production.

## Functional Requirements

### FR-001 — Missing declared tables reconciled into production

All 6 declared-but-missing tables exist in production with schema matching their declarations.

**Acceptance Criteria**:
- [ ] `complianceflags`, `gitcommandlogs`, `gitcommandstats`, `mcpdriftevents`, `mcpparityconfig`,
      `mcpupdateadoptions` all present in `information_schema.tables`
- [ ] `git_command_logs` / `git_command_stats` are renamed to `gitcommandlogs` / `gitcommandstats`
      **before** creation, satisfying the project's no-underscores naming convention
- [ ] Each created via a tracked migration, not by hand
- [ ] Columns, types, and constraints match `src/db/schema/`
- [ ] Consultant Hub compliance-flags request returns 200 (verifies FR-001 end-to-end)

### FR-002 — Sentinel values rejected at the request boundary

A non-UUID filter value never reaches a UUID-typed column.

**Acceptance Criteria**:
- [ ] A Consultant Hub invoice-preview request with `projectid=all` returns results for all
      projects, not a 500
- [ ] Query parameters are parsed through a schema at the boundary; `"all"` is handled as
      "no filter", consistent with the existing guard at `consultantHub.ts` line 141
- [ ] A malformed `projectid` (e.g. `"../"`, empty, arbitrary string) returns 400, not 500
- [ ] Zero `22P02` in the application log across the Consultant Hub surface
- [ ] All other routes accepting `projectid` are audited for the same sentinel leak

### FR-003 — Database error cause preserved in logs

The Postgres error code and detail reach CloudWatch.

**Acceptance Criteria**:
- [ ] DB-backed error paths log `error.cause.code` and `.detail`, not just `error.message`
- [ ] A deliberately induced `42P01` produces a log record containing `42P01` and the relation name
- [ ] Log output remains valid single-line structured JSON (Pino, per project rules)
- [ ] No secrets and no bound parameter values containing PII are newly exposed by this change

### FR-004 — Production migration ledger established

Production tracks which migrations have been applied.

**Acceptance Criteria**:
- [ ] A migration tracking table exists in production and records already-applied history
- [ ] The baseline reflects actual current production state — it does not replay historical
      migrations against live data
- [ ] Establishing the baseline performs **zero** destructive operations: no DROP, no ALTER of
      existing objects
- [ ] Verified against a restored non-production copy before being applied to production
- [ ] After baselining, a fresh `db:generate` produces an empty diff for tables already in production

### FR-005 — Schema drift detection

Divergence between declared and deployed schema is detected before release, not by a user.

**Acceptance Criteria**:
- [ ] Implemented as a flag on the existing command: `wxkanban-agent auditfences --schema`
- [ ] Compares declared `pgTable` definitions against deployed `information_schema`
- [ ] Considers **both** `src/db/schema/` and `mcp-server/src/db/schema.ts`, or it will produce
      false positives on MCP-owned tables
- [ ] Reports declared-but-missing objects by name
- [ ] Exits non-zero on divergence so it can gate a release
- [ ] Reproduces the 2026-07-30 finding when run against current production (names the 6 tables)
- [ ] Passes cleanly once FR-001 and FR-004 are complete
- [ ] Runs in CI only; no pre-push hook (avoids adding latency to every push)

### FR-006 — Orphan tables inventoried and protected

The 27 tables that exist in production without a declaration are classified and cannot be
destroyed by schema tooling.

**Acceptance Criteria**:
- [ ] Each of the 27 is classified: live-but-undeclared, legacy-with-data, or empty-and-unreferenced
- [ ] `marketingcontacts` (1,006 live rows, used via raw SQL in `NewsletterSendService` and the
      marketing routes) is **declared in the schema** so no reconcile-to-declared operation can
      target it
- [ ] Drift detection reports orphan tables as **informational**, never as objects to remove
- [ ] No tooling path in this scope can drop or alter them; any command that would is documented
      as prohibited
- [ ] `marketingcontacts` and `capabilityindex` are explicitly verified intact after every step

### FR-007 — Database tooling restored

The documented migration workflow actually exists and is executable.

**Acceptance Criteria**:
- [ ] `db:generate` and `db:migrate` scripts exist in `package.json` and run successfully
- [ ] CLAUDE.md is reconciled so the documented command matches the one that exists
- [ ] Running `db:generate` with no schema change produces an empty diff
- [ ] The scripts target the app migration directory (`src/db/migrations`) explicitly and cannot be
      confused with `mcp-server/migrations`

## Data Requirements

**Tables created (6)** — all additive, via tracked migration:

| Table | Owner / consumer | Note |
| --- | --- | --- |
| `complianceflags` | `consultantHub.ts` (live route) | The table behind the current production 500s |
| `gitcommandlogs` | `GitCommandMonitor` | Renamed from `git_command_logs` before creation |
| `gitcommandstats` | schema only | Renamed from `git_command_stats` before creation |
| `mcpdriftevents` | `DriftEventService` | Route currently unreachable (registered only in the dead `index2.ts`) |
| `mcpparityconfig` | `ParityGateService` | As above |
| `mcpupdateadoptions` | `UpdateAdoptionService` | As above |

**Tables declared but not created**: `marketingcontacts` — already exists in production with 1,006
rows. This scope adds its **declaration only**; no DDL against the table.

**Tables modified**: none. **Tables dropped**: none (see C-9).

**Ledger**: one migration tracking table created by the migration tooling, baselined against
current production state.

**Baseline snapshot captured 2026-07-30 for verification**: production = 125 tables;
`marketingcontacts` = 1,006 rows; `capabilityindex` = 4,002 rows.

## API Routes

No endpoints are added. Modified only:

| Method | Path | Change |
| --- | --- | --- |
| GET | `/api/consultant-hub` invoice-preview route | Parse `projectid` through a boundary schema; treat `"all"` as no-filter; return 400 on malformed input (FR-002) |
| — | All routes accepting a `projectid` query parameter | Audited for the same sentinel leak; remediated where found (FR-002) |

Error-handling paths on DB-backed routes are modified to preserve `error.cause` (FR-003). No
change to any route's success-path contract or response shape.

## Frontend Components

None. No UI change is required — the Consultant Hub already renders correctly and is being handed
valid data instead of a 500.

## Success Criteria

1. **Error class eliminated**: zero `42P01` and zero `22P02` errors in the application log across
   7 consecutive days after deploy, against a baseline of 9 error bursts on 2026-07-30 alone.
2. **Consultant Hub fully functional**: for one consultant account with "All projects" selected,
   all four page requests (compliance flags, invoice preview, active timer, recent timer) return
   HTTP 200.
3. **Detector proven, not assumed**: `auditfences --schema` exits non-zero and names all 6 missing
   tables when run against production BEFORE remediation, and exits 0 after. A detector only ever
   seen passing is unproven.
4. **Ledger honest**: a migration tracking table exists in production, and a fresh `db:generate`
   immediately after baselining produces an empty diff for all pre-existing tables.
5. **Zero data loss**: production table count goes from 125 to exactly 131 (six added, none
   removed); `marketingcontacts` remains 1,006 rows and `capabilityindex` remains 4,002, captured
   as explicit before/after snapshots.
6. **Diagnosis restored**: a deliberately induced `42P01` in a non-production environment produces
   a single-line JSON log record containing the Postgres error code and relation name; time from
   log inspection to root-cause identification under 2 minutes, versus the multi-hour query-replay
   this incident required.
7. **CI gate live**: the schema check runs in CI on every push to main and blocks merge on
   divergence, verified by an intentional divergence commit that must fail the build.

## Key Entities

| Entity | Description |
| --- | --- |
| **Migration ledger** | The record in the production database of which migrations have been applied. Absent today; created by FR-004. |
| **Declared schema** | The set of tables defined in code — `src/db/schema/` (app) and `mcp-server/src/db/schema.ts` (MCP server). Two independent sources. |
| **Deployed schema** | The tables actually present in the production database, per `information_schema`. |
| **Schema drift** | Any divergence between declared and deployed schema. Declared-but-missing objects are defects; deployed-but-undeclared objects are informational. |
| **Orphan table** | A table present in production and declared by neither schema. 27 exist. Being an orphan does not imply being unused — `marketingcontacts` is an orphan and is live. |
| **Compliance flag** | A record marking a project task as breaching a compliance rule; surfaced in the Consultant Hub. Its table is the one currently missing from production. |

## Compliance Requirements

SOC2 is active on this project. Controls this scope satisfies:

| Control | Requirement | How this scope satisfies it |
| --- | --- | --- |
| **CC7.1** | Regular environment configuration audits — deployed configuration compared against its declared source on a cadence, to catch drift applied by hand | FR-005 drift detection, run on every push to main |
| **CC8.1** | Formal change management; all changes documented in a change tracking system | FR-004 migration ledger makes every schema change to production a recorded, traceable event |
| **CC6.1** | Input validation — every external input parsed through a schema at the boundary rather than trusted and coerced downstream | FR-002 boundary parsing of `projectid` |
| **CC7.2** | Security log monitoring — security-relevant events emit structured log records that can be queried and alerted on | FR-003 preserves the Postgres error code in structured JSON logs |

## Constraints

- **C-1 — DOMINANT RISK: the local `.env` `DATABASE_URL` points at PRODUCTION**, and
  `drizzle.config.ts` reads it. Any `drizzle-kit` command run casually from a dev machine acts on
  production immediately. Every command must have its target verified before execution.
- **C-2 — `drizzle-kit push` is PROHIBITED against production.** It reconciles the database *to*
  the declared schema and would propose dropping all 27 orphan tables, including
  `marketingcontacts`. Migration-based application only.
- **C-3 — Foreign-application tables `alithoprojects`, `chatrooms` and `testPlan` were manually
  dropped by the operator on 2026-07-30**, reducing production from 128 to 125 tables. That drop
  was hand-applied with no migration and no tracked record — precisely the practice this scope
  exists to end, and the kind of change SOC2 CC8.1 requires to be documented. Once the FR-004
  ledger exists, equivalent changes are recorded automatically.
- **C-4 — The documented migration command does not exist.** CLAUDE.md states migrations are
  auto-generated via `npm run db:generate`, but `package.json` contains no `db:*` scripts at all.
  Likely a contributing cause rather than a detail: the documented workflow was never executable.
  Addressed by FR-007.
- **C-5 — Column drops require the 3-deploy sequence.** Drizzle SELECTs every declared column, so
  removing one early causes production 500s (the 2026-07-28 incident). Not triggered here as this
  scope is additive, but binding on follow-up work.
- **C-6 — Near-miss table names are a live hazard.** `profile` / `settings` / `userprofile` are
  orphans, but `userprofiles` (plural) is MCP-declared, live, and backs authentication. Exact names
  matter; a wrong drop takes out login.
- **C-7 — `projecttasknotes` (958 rows) and `projecttasktimelog` (1,211 rows) map onto concepts the
  current system still has.** If they hold pre-conversion history never migrated into
  `projecttimeentries`, dropping them would destroy historical billing evidence. Explicit sign-off
  required — and deferred behind the PPE conversion regardless.
- **C-8 — Pushing to `main` deploys to production**, both the App Runner service and the hosted
  MCP. No push occurs in this scope without explicit operator instruction.
- **C-9 — Legacy table cleanup is BLOCKED on completion of the PPE conversion.** No orphan table is
  dropped in this scope.
- Code changes route through the orchestrator and are fenced per spec 026 via
  `implement <scope>/<task>`. Fences are never hand-authored. TypeScript strict, no `any`; Pino
  only, no `console.log`.

## Out of Scope

- **CloudFront access logging and 5xx alarm tuning.** The alarm caught 1 of 9 bursts and access
  logging is disabled, but detection quality is deliberately excluded.
- **Dropping any orphan table.** Group B (12 empty, unreferenced) and Group C (14 with data,
  unreferenced, including `sockettrace` at 505,889 rows) are blocked pending the PPE conversion.
  Declaring `marketingcontacts` is in scope; dropping nothing is.
- **RDS topology.** The `wxkanban` instance is single-AZ (`MultiAZ=false`) in us-east-1 while App
  Runner runs in us-east-2, so every query crosses a region with no automatic failover. Real
  exposure, separate infrastructure decision.
- **Redesign of Consultant Hub features** beyond making its queries succeed.
- **Retro-fixing all ~233 `error.message`-only log sites** beyond the DB error paths.
- **A guaranteed fix for the two unexplained timer failures** observed on 2026-07-30. Their SQL
  executes successfully against production and the connection-poisoning hypothesis was tested and
  refuted. FR-003 restores the logging that should identify the cause on next occurrence; this
  scope does not claim to fix it.

## Notes

**Deferred work register — orphan tables (blocked on PPE conversion, C-9).** Captured here so the
inventory and its row counts are not lost:

- *Group A — live, do not drop*: `marketingcontacts` (1,006).
- *Group B — empty and unreferenced (12)*: `appauditconfigurations`, `clientgroups`, `collapsexref`,
  `departments`, `fees`, `feesxref`, `openchatlist`, `projectprofilexref`, `schedulerdepartments`,
  `socketdata`, `systemlog`, `timeEntry`.
- *Group C — holds data, unreferenced (14)*: `defaulttasks` (4), `profile` (6), `projectlicenses` (6),
  `kanbansettings` (15), `projectconfigurations` (17), `memberuserprofilexref` (19), `userprofile` (28),
  `membermessage` (37), `favoritetask` (41), `settings` (74), `projectteam` (93),
  `projecttasknotes` (958), `projecttasktimelog` (1,211), `sockettrace` (505,889).

**Not orphans — verified MCP-owned and live**: `capabilityindex` (4,002) and `events` (2,625) are
declared in `mcp-server/src/db/schema.ts`. "Undeclared in `src/db/schema`" does not mean unused.

**Open item carried forward, not solved.** The two timer failures on 2026-07-30 remain unexplained.
Their SQL executes successfully against production, and the connection-poisoning hypothesis was
tested and refuted. If the failure recurs after deploy with a now-visible error code, it becomes
its own item.

**Integration context.** Drift detection folds into the existing `wxkanban-agent auditfences`
command as a `--schema` flag rather than a new command, matching the established
declared-vs-actual pattern and its `--strict` CI mode. Two migration directories exist and are not
interchangeable: `src/db/migrations` (app, per `drizzle.config.ts`) and `mcp-server/migrations`
(MCP server) — always use absolute paths.

## Clarifications

### Session 2026-07-31

| # | Question | Decision |
|---|----------|----------|
| 1 | How far should this fixit scope reach? | Full: fix + detect + prevent. Alarm quality explicitly excluded. |
| 2 | What happens to the latent missing tables? | Create all of them now, renamed where they violate the naming convention. |
| 3 | Rename `git_command_logs` / `git_command_stats` before creation? | Yes — drop the underscores; this is the last cheap moment, before the tables exist in production. |
| 4 | New `auditschema` command or a flag on `auditfences`? | A flag: `auditfences --schema`. Reuses an established pattern rather than inventing a mechanism. |
| 5 | Where does the drift check run? | CI only. No pre-push hook — avoids adding latency to every push. |
| 6 | Observation window for the error-elimination metric? | 7 days. |
| 7 | How many accounts verify the Consultant Hub fix? | One consultant account. |
| 8 | Should the missing `db:generate` scripts be a requirement? | Yes — promoted from a constraint note to FR-007, because requirements get built while notes get read. |
| 9 | Does legacy orphan-table cleanup belong here? | No. Blocked until the PPE conversion is finished. Declaring `marketingcontacts` stays in scope; dropping nothing does. |
| 10 | Scope number? | 117. 115/116 are already taken in the SPEC namespace by SCOPE-114's implementation specs, and 117 matches the DB row. |
