# wxDBAnalyze — Design

**Date**: 2026-08-01
**Status**: Approved (design). Scope doc deliberately skipped by operator decision.
**Deliverable**: a skill (`_wxAI/skills/wxDBAnalyze/`) plus a slash command (`/wxDBAnalyze`).

---

## 1. Purpose

`wxDBAnalyze` performs a comprehensive senior-DBA review of a project's database and reports
findings that each state, explicitly, **why the thing needs changing**.

It exists because the current surface is thin and partial:

- `npm run db:drift` checks only that *declared tables exist*. It says nothing about columns,
  types, constraints, indexes, or data.
- `drizzle-kit push` is prohibited against this database, and `db:generate` is prompt-blocked by
  stale snapshots.
- There is no migration ledger. Schema changes are hand-applied and recorded in
  `specs/117-production-schema-integrity/schema-change-log.md`.
- Nothing at all covers performance, maintenance, security, locking, or referential integrity.

The result is recurring production `42P01` failures and a schema whose true state nobody can state
with confidence. `wxDBAnalyze` makes that state knowable.

## 2. Persona

The skill operates as a senior DBA with two decades of production experience across PostgreSQL,
SQL Server, MySQL, Oracle and Firebird. It is methodical, evidence-driven and direct. It does not
guess: it isolates variables, verifies assumptions, and reasons from execution plans, wait events,
catalog facts and system metrics. It translates database problems into business impact, prefers
durable fixes over workarounds while recognising when a safe short-term mitigation comes first, and
is comfortable refusing a risky request provided it offers a safer alternative.

Its operating belief: most database problems trace to one of four causes — bad data modeling, poor
query patterns, missing maintenance, or weak operational discipline.

## 3. Scope

Nine analysis dimensions across five database engines, producing a ranked findings report and,
optionally, guarded application of additive-only remediation.

**Explicitly out of scope**: rewriting application code, redesigning schemas unprompted, executing
destructive DDL under any circumstance, and self-certifying that a fix worked.

---

## 4. The nine dimensions

### 4.1 Schema integrity

Declared-versus-live at **column granularity**, not merely table existence.

- Declared tables missing from the live database
- Live tables not declared anywhere in code (this database currently has ~19, including
  `marketingcontacts`)
- Per-column presence, data type, precision/scale, nullability, default expression
- Primary key presence, type, and UUID-version conformance where a UUID strategy is declared
- Unique and check constraints
- Index diff (declared versus deployed)
- Enum types, sequences and identity columns
- Views and materialised views
- **Divergence between the project's multiple schema sources.** This repository declares schema in
  both `src/db/schema/` and `mcp-server/src/db/schema.ts`; disagreement between them is its own
  finding class, distinct from code-versus-live drift.

### 4.2 Referential integrity (parent/child)

The highest-value dimension for a hand-applied schema with no migration ledger.

Relationships are inferred from **four independent sources**, then cross-tabulated:

1. `references()` declarations in the ORM schema — what the code believes
2. Live foreign-key constraints in the catalog — what the database actually enforces
3. **Naming convention** — any column matching the project's FK pattern (`<parent>id`, `<Parent>Id`,
   `<parent>_id`) where a plausible parent table exists. This catches relationships nobody ever
   declared anywhere.
4. `data-model.md` relationship tables in the specs — what was designed

A relationship present in sources 1, 3 or 4 but absent from source 2 is an **unenforced parent/child
link**. The probe does not merely report it: it runs the anti-join and counts the orphans that link
is currently permitting. A missing FK with zero orphans is a risk; a missing FK with orphans is an
incident already in progress.

Finding classes:

| Class | What it means |
| --- | --- |
| Missing FK constraint | Implied or declared, not deployed — reported with live orphan count as evidence |
| Orphaned child rows | Anti-join run for *every* inferred relationship, constrained or not |
| Undeclared FK | Enforced in the database, absent from the ORM — code has no knowledge of its cascade behaviour |
| Wrong `ON DELETE` action | `CASCADE` where it would silently destroy audit or billing history; `NO ACTION` where orphans accumulate |
| Parent-PK / child-column type mismatch | `uuid` versus `text`/`varchar` — prevents the constraint from ever being created and defeats index usage on joins |
| Unindexed FK column | Every parent delete or key update degrades to a sequential scan and holds locks longer than necessary |
| Nullable FK containing no NULLs | Should be `NOT NULL`; the looseness is unintentional |
| Cross-tenant integrity violation | Child rows whose `companyid`/`projectid` disagrees with their parent's. For a multi-tenant application this is a data-leak class of defect, and **no FK constraint can catch it** |
| Cascade cycles and self-references | Hierarchies where a cascade would be unbounded |

**Remediation** fits the additive-only whitelist on engines that support deferred validation. On
PostgreSQL the safe repair is two-phase: `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` takes only a
brief `SHARE ROW EXCLUSIVE` lock and immediately stops *new* bad rows; `VALIDATE CONSTRAINT` then
scans without blocking writes. Cleaning existing orphans is destructive and is therefore emitted as
reviewed SQL for manual application — correctly so, because deciding whether an orphan is deleted or
re-parented is a business question, not a database one.

### 4.3 Data health

- Exact row counts for small tables; catalog estimates for large ones
- Per-column NULL density; all-NULL columns (dead columns)
- Duplicate rows on natural keys
- Empty tables and never-written tables
- `max(createdat)` staleness — tables that stopped being used
- UUID version distribution where a UUID strategy is declared (v4 versus v7 conformance)
- Table, index and TOAST/LOB sizes

### 4.4 Conventions and design

**Conventions are configuration, not constants.** Resolved in this order:

1. **Explicit config** at `.wxai/db-conventions.json` — naming case (lowercase-concat / snake_case /
   PascalCase), separator policy, table pluralisation, primary-key strategy (UUID v7 / GUID /
   identity int / sequence), FK naming pattern, required audit columns, index naming.
2. **Engine default preset** where no config exists. SQL Server projects conventionally use
   PascalCase and `Id`; MySQL and PostgreSQL lean snake_case. wxKanban's own lowercase-concat rules
   are one preset among several, not the law.
3. **Inferred from the live schema** where neither applies. Determine the dominant convention
   actually in use, report outliers against the project's own de facto standard, and offer to write
   the inferred config for confirmation.

The governing principle: *a consistent schema that disagrees with my preference is healthy; an
inconsistent schema is the actual defect.* The report flags deviation from the project's chosen or
inferred standard and never imposes a house style on someone else's database.

Design smells remain engine-neutral, being modeling problems rather than dialect problems:
delimited lists in text columns, enum-as-unconstrained-text, excessively wide tables, repeated
column groups, missing audit columns.

### 4.5 Performance and index strategy

- Query statistics ranked by total and mean execution time, with an **explicit finding when the
  statistics facility is not enabled** — that absence is itself an operational gap
- Sequential-scan to index-scan ratio per table
- Foreign keys with no supporting index
- Unused indexes, reported with their wasted bytes and the write cost they impose
- Duplicate and overlapping indexes
- Invalid indexes
- Cache hit ratios
- Stale statistics
- Execution plans (without `ANALYZE`, to stay read-only) for the worst offenders

### 4.6 Maintenance and bloat

- Dead-tuple ratios and garbage-collection backlog
- Last vacuum / analyze / statistics-update times
- Per-table maintenance overrides versus global settings
- Table and index bloat estimates
- Transaction-ID wraparound headroom (or the engine's analogue)
- Long-running transactions and replication slots pinning cleanup
- Checkpoint and write-buffer pressure
- **Size trending across retained snapshots** — growth is measured, not guessed

### 4.7 Security and access

- Roles, attributes and memberships
- Table and schema grants, with `PUBLIC` grants called out
- Default privileges
- **Whether the application's connecting role is over-privileged for what it actually does**
- Row-level security coverage
- Transport encryption enforcement
- Installed extensions as attack surface
- Columns named like secrets checked for plaintext shape
- Statement logging / audit facility posture

Findings only. **No secret value is ever printed** — the finding names the column and the exposure,
never the content.

### 4.8 Locking, connections and availability

- Connections by state, role and application name against the connection ceiling
- Idle-in-transaction sessions, and the oldest one
- Longest-running queries
- Blocking chains
- Deadlock counters
- Dangling prepared / two-phase transactions
- Replication lag and slot health
- Application pool sizing versus server capacity
- **Cloud posture** where the platform exposes it — for this project, RDS via AWS CLI (profile
  `Andy`, `us-east-2`): backup retention, PITR restorable window, Multi-AZ, instance class, storage
  autoscaling, pending maintenance, parameter-group drift

### 4.9 Impact analysis

Input is **uncommitted schema edits** — the working tree diffed against `HEAD` and against live.

- Derive the intended DDL
- Classify each statement additive or destructive
- Per statement: lock class taken, target table row count and size for lock-duration estimation,
  and the routes, services and code fences referencing the affected object
- Safe apply order, including the three-deploys-apart sequence required for column removal (the ORM
  selects every declared column, so dropping a column before the code stops referencing it causes
  production 500s)

---

## 5. Architecture

```text
_wxAI/skills/wxDBAnalyze/
  SKILL.md                        DBA persona, phase order, interpretation doctrine, refusal rules
  scripts/probe.mjs               orchestrates collection -> one JSON snapshot
  scripts/engines/postgres.mjs    reference adapter
  scripts/engines/mssql.mjs
  scripts/engines/mysql.mjs
  scripts/engines/oracle.mjs
  scripts/engines/firebird.mjs
  scripts/probes/schema.mjs       ┐
  scripts/probes/integrity.mjs    │
  scripts/probes/data.mjs         │  one module per dimension; each independently
  scripts/probes/conventions.mjs  │  runnable, each owns its own dimension logic,
  scripts/probes/performance.mjs  │  none capable of writing
  scripts/probes/maintenance.mjs  │
  scripts/probes/security.mjs     │
  scripts/probes/availability.mjs │
  scripts/probes/impact.mjs       ┘
  scripts/cloud/aws-rds.mjs       platform posture
  scripts/apply-ddl.mjs           guarded additive-only apply + ledger append
  references/thresholds.md        DBA heuristics as guidance, never hardcoded gates
  references/report-template.md   report shape
  references/finding-contract.md  the mandatory finding schema

.claude/commands/wxDBAnalyze.md
_wxAI/commands/wxDBAnalyze.md
```

### 5.1 Division of responsibility

Deterministic scripts collect; the skill interprets. Every SQL statement that reaches a production
database is fixed, reviewable text in a file — the model never composes prod-facing SQL on the fly.
Judgment (severity, root cause, tradeoffs, recommended fix) stays live in the skill, because
thresholds like "dead tuples above 20% is a warning" are precisely what a real DBA qualifies by
workload.

### 5.2 Engine abstraction

The nine dimensions are the **contract**; the SQL behind them is engine-specific. Each adapter
implements the same probe interface and returns a normalised snapshot, so `SKILL.md` and the report
format never learn which engine produced the data.

Engine resolution order: explicit `--engine` → connection-string scheme → the project's declared
stack in `.wxai/project.json`.

**Checks are declared capabilities, not assumptions.** Query statistics means `pg_stat_statements`
on PostgreSQL, Query Store / `sys.dm_exec_query_stats` on SQL Server, `performance_schema` on MySQL,
AWR/ASH on Oracle, and live `MON$` monitoring on Firebird. Maintenance means vacuum and wraparound
on PostgreSQL, index fragmentation and statistics staleness on SQL Server, segment/extent growth and
stale optimiser stats on Oracle, and the OAT/OIT gap plus sweep interval on Firebird.

Where an engine has no analogue, the adapter reports **not-applicable-to-engine explicitly**. It
never silently drops a check. A missing check that reads as "clean" is the exact failure mode
SCOPE-118 existed to correct in the fence auditor.

Firebird's known limitation: no persistent query-statistics store, only live monitoring. Dimension
4.5 therefore reports as *sampled* rather than *historical* on that engine, and says so.

### 5.3 Build order

**Phase 1 — PostgreSQL, complete.** All nine dimensions, the finding contract, the report, and the
policy-driven apply path, built and verified against the PostgreSQL adapter. It is the only engine
with a live target today.

**Phase 1 also ships the other four adapters as refusing stubs.** Each of `mssql.mjs`, `mysql.mjs`,
`oracle.mjs` and `firebird.mjs` implements the full adapter interface and **refuses loudly** —
`adapter not implemented for <engine>` — for every probe. This proves the abstraction actually holds
under five implementations rather than one, and guarantees that no unverified SQL can reach a
customer database by accident. A stub that refuses is honest; a stub that returns empty results
reads as "clean."

**Phase 2 — the remaining four adapters**, planned separately, each built against the already-proven
snapshot contract and each independently verifiable as access to a live instance becomes available.

---

## 6. Safety and the apply path

Read and write are **physically separated**. Probes open a read-only transaction and touch only
catalog, information-schema and statistics objects. `apply-ddl.mjs` is the only file permitted to
open a writable connection, and it re-derives the safety classification itself rather than trusting
whatever its caller passed in.

### 6.1 The additive whitelist is per-engine

"Safe" is not portable:

- **PostgreSQL** — `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` takes a brief lock and is safe on
  a live table.
- **Firebird** — has no `NOT VALID`. The same constraint validates immediately and requires
  effectively exclusive access, so on Firebird it is **not** additive-safe and is refused into the
  manual pile.
- **Oracle** — `ADD COLUMN` with a default is cheap on 11g and later but was a full table rewrite
  before that.

Each adapter declares its own whitelist. **Anything not explicitly whitelisted is refused by
default rather than permitted by default.**

### 6.2 Apply policy is per-project

Whether the skill may apply anything at all is **a project's decision, not the skill's**. The mode
is read from `.wxai/db-policy.json` under `apply.mode`:

| Mode | Behaviour |
| --- | --- |
| `manual` | Never applies anything. Emits reviewed SQL only, for hand application. |
| `approve-each` | Additive-whitelisted statements may be applied, but **only after the operator approves each one individually**. |
| `auto-additive` | Additive-whitelisted statements are applied without per-statement prompting. For projects whose operating criteria permit it. |

**wxKanban pins `approve-each`.** On this project the skill always asks before it touches the
database, which keeps it consistent with the manual-apply discipline of SCOPE-117 while still
removing the copy-paste step. `auto-additive` exists for consumer projects whose change-control
criteria allow unattended additive DDL — that is a legitimate posture for some shops and the kit
should not forbid it, but it is never the default and is never inferred. Absent a policy file, the
mode is `approve-each`.

**No mode permits destructive DDL.** `manual`, `approve-each` and `auto-additive` all refuse it
identically. Destructive statements are always emitted as reviewed SQL with the correct multi-deploy
ordering attached, regardless of policy.

### 6.3 Flow

1. `--dry-run` prints the full plan and touches nothing
2. Each statement is shown with its rationale, lock class, target row count and estimated duration
3. Approval per the resolved policy mode above
4. Applied one at a time, each in its own transaction
5. Every applied statement is appended to
   `specs/117-production-schema-integrity/schema-change-log.md` with timestamp, reason and result —
   **in every mode**, so the ledger stays truthful even under `auto-additive`
6. A failure stops the run; it does not proceed to the next statement

### 6.4 Standing constraint

This project's local `.env` `DATABASE_URL` points at **production**. Every default in this skill is
chosen on that assumption.

---

## 7. The finding contract

**Every finding, in every dimension, carries all of the following. A finding missing any field is
not emitted.**

| Field | Requirement |
| --- | --- |
| Observation | What was measured, with the actual numbers |
| Evidence | The exact query that produced it, so the reader can re-run it and disagree |
| **Why it needs changing** | The concrete consequence of leaving it alone, stated as a failure mode with a mechanism: what breaks, under what conditions, and how it will present |
| Business impact | What the failure costs in availability, correctness, latency, spend or compliance exposure |
| Severity **and** urgency, separately | A missing FK on a table nobody writes to is high severity, low urgency; connection saturation is the reverse. Collapsing them loses the scheduling information the reader actually needs |
| Remediation | The SQL or the procedure, classified additive-safe or manual-only |
| Cost and risk of the fix itself | Lock class, duration, rollback path. Some fixes are worse than the finding |
| Consequence of doing nothing | The honest baseline, including "nothing — this is acceptable as-is" |
| Confidence | Proven by direct evidence versus inferred from naming or heuristics. An orphan count is proven; a convention-inferred relationship is not |

### 7.1 The rule that makes it work

**The "why" must be derived from this database's evidence, not recited from a textbook.** If the
reason cannot be made specific to what was actually measured, the finding is downgraded to an
observation or dropped. This rule is what keeps a nine-dimension audit from producing three hundred
items nobody reads.

### 7.2 Worked example

Not this:

> Unused index — consider dropping.

But this:

> `idx_tasks_status` has zero scans across 34 days of accumulated statistics while `tasks` takes
> ~12k inserts/day. Each insert pays maintenance on an index no query reads, and it holds 340 MB.
> **Why it needs changing:** write amplification and buffer-cache pollution on the hottest write
> path, with no read benefit. **Doing nothing:** no outage risk — this is pure ongoing waste, safe
> to defer. **Fix risk:** `DROP INDEX CONCURRENTLY` takes no exclusive lock, but the index cannot be
> recreated cheaply if a future query needs it. Drop is destructive, so it is emitted for manual
> application.

---

## 8. Output

**Terminal** — findings ranked by severity, grouped by dimension, each stating evidence and business
impact rather than a bare metric.

**Report file** — `docs/db-analysis/YYYY-MM-DD-HHMM.md`, with a stable `docs/db-analysis/latest.md`.
Contains every finding in full contract form, its evidence query, its remediation SQL, and the
not-applicable-to-engine list.

**Raw JSON snapshots** retained alongside the reports so dimension 4.6 can trend growth across runs.

No PDF, no DB filing, no task creation. Deliberately kept to two artifacts.

---

## 9. Command surface

```text
/wxDBAnalyze                          full nine-dimension audit, read-only
/wxDBAnalyze --dimension performance,integrity
/wxDBAnalyze --impact                 uncommitted schema edits only
/wxDBAnalyze --apply                  guarded additive apply, per-statement approval
/wxDBAnalyze --dry-run                plan only, touches nothing
/wxDBAnalyze --engine mssql --url …   non-default target
/wxDBAnalyze --write-conventions      persist the inferred convention config
```

---

## 10. Delivery notes

- The probe scripts are code and therefore require orchestrator-authored fences per the fencing
  convention. Given the CLI's current state, fences are expected to be written in-conversation.
- The command must be registered in the Cockpit help catalog and the VSIX rebuilt, or it will not
  be discoverable.
- The command file is duplicated to both `.claude/commands/` and `_wxAI/commands/`, matching every
  existing command in this project.
- A scope document was deliberately skipped by operator decision; this design document stands in its
  place.

---

## 11. Open risks

1. **`auto-additive` is a real capability with no live test target.** wxKanban itself pins
   `approve-each`, so the unattended path will ship exercised only against a clone. It must be
   proven refusing before it is trusted to accept, per the fail-first discipline in §5.2.
2. **Four engines have no live test target.** Mitigated by shipping them in Phase 1 as refusing
   stubs rather than as unverified SQL, and deferring their real implementation to Phase 2 where
   each can be proven against an actual instance.
3. **Probe cost against production.** Bloat estimation and orphan anti-joins are the expensive
   checks. They must be opt-in or sampled on large tables rather than run unconditionally.
