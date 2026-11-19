# Database Fix List — what to actually do

**Source run:** `docs/db-analysis/latest.md` (2026-08-02, 440 findings)
**Database:** wxKanban production · PostgreSQL 15.17 · 129 tables in `public`

The raw report is 624 KB and lists 440 findings. That is a complete inventory, not a plan. This
file is the plan: what to do, in what order, and — just as importantly — **what not to do**.

Every item here was re-checked by hand against the live database on 2026-08-02. Where the report
and reality disagreed, reality won and the discrepancy is written down.

---

## Read this first: three findings in the report are wrong

A tool that states "severity: critical, urgency: immediate, confidence: proven" and hands you
copy-paste SQL is easy to trust. Trust these three less.

### ⛔ Do NOT add the `mcprequestaudit.customerid` foreign key

The report marks this **critical**, labels the fix **additive-safe**, and gives you:

```sql
-- DO NOT RUN THIS
alter table "mcprequestaudit" add constraint "mcprequestaudit_customerid_fkey"
  foreign key ("customerid") references "customers" ("id") not valid;
```

It is pointed at the wrong table. `customerid` here means **company**, not customer —
`mcpapitokens.customerid` declares `.references(() => companies.id)` for the same concept. The
`customers` table is unrelated and three days old.

| Check | Result |
|---|---|
| Orphans against `customers` | 387,805 of 387,805 — **100%** |
| Orphans against `companies` | **0** |
| Rows in `customers` | 1 |

`NOT VALID` skips *existing* rows but still enforces on every **new** insert. Running this would
make every hosted-MCP request fail its audit write. The correct statement, if you want it, is:

```sql
alter table "mcprequestaudit" add constraint "mcprequestaudit_customerid_fkey"
  foreign key ("customerid") references "companies" ("id");
```

Zero orphans, so it validates immediately. Weigh the per-insert lookup on a 387k-row append-only
hot path before deciding it is worth having.

> **The lesson, not the instance:** a 100% orphan rate against an inferred parent means the
> *inference* is wrong, not that your data is entirely corrupt. Whenever a finding claims
> essentially every row is broken, check the premise before you check the data.

### ⛔ Do NOT "fix" the three cross-tenant feedback findings

`integrity.cross-tenant` fires on 48 + 4 + 1 rows in `feedbacksubmissions` and `companyauditlogs`
and calls it customer data exposure. It is the **feedback sink**: all VS Code feedback deliberately
routes to one Wxperts-owned project (`ba924193…`, "wxKanban Development"). The child row keeps the
submitter's company; the parent project is Wxperts'. The mismatch is the design.

No rows need moving. See the SOC 2 pack for why this is still worth *documenting* even though it
needs no repair.

### ⛔ Do NOT drop the 73 "unused" indexes

`performance.unused-index` counts index scans since statistics were last reset. On this database
that number is unreliable: 88 tables have never been analyzed, and a filtered run
(`--dimension performance`) inflates the count to ~155 by construction. Dropping an index is also
the one action on this list you cannot quietly undo on a large table.

Revisit after step 1 below, with at least a week of accumulated statistics.

---

## Step 1 — `ANALYZE`. Cheap, useful, and **less dramatic than it first looks**.

**88 of 129 tables have never been analyzed** — but check what those tables are before reacting to
the number.

> **Correction, 2026-08-02.** An earlier version of this file called this "the most valuable thing on
> this list" and said the planner was "guessing on 68% of the database". That was measured by *table
> count*, and it was misleading. Verified against production:
>
> | | |
> |---|---|
> | Largest never-analyzed table | **50 rows** |
> | Typical size of the 88 | 2–50 rows |
> | Big tables (e.g. `mcprequestaudit`, 387k rows) | **already analyzed** — merely stale |
>
> These tables have never been analyzed because autovacuum's threshold is
> `autovacuum_analyze_threshold (50) + 10% of rows`. A 20-row table needs ~52 changes to trip it.
> **They have legitimately never earned an analyze — that is autovacuum working correctly, not
> neglect.** On a 20-row table the planner picks a sequential scan whatever the statistics say, and
> it is right to.

```sql
ANALYZE;
```

No locks that block reads or writes; minutes at this size.

**What it actually buys you:**

1. **Refreshes stale statistics on the large tables** — that is where plans genuinely change. The
   report's own `mcprequestaudit` finding shows the cost of stale stats: it quoted a planner estimate
   of ~386,423 rows against an exact count of 387,658.
2. **Makes this report trustworthy.** Every "row count unknown (table has never been analyzed)" in
   the findings, and every `unused-index` count, depends on statistics existing. Run `ANALYZE`, then
   re-run the analysis, then act on Step 3 and the unused-index decision.

Still worth doing first — it is free and it improves the evidence everything else rests on. Just do
not expect a performance change from it.

---

## Step 2 — Turn on the statistics that are already being collected

```sql
CREATE EXTENSION pg_stat_statements;
```

`pg_stat_statements` is **already preloaded** via `shared_preload_libraries` and has been gathering
query statistics all along. The extension was simply never created, so nothing can read them. This
unlocks "which queries are actually slow" — the question every performance conversation starts with
— at zero cost.

Also available and not installed, if you want them later: `pgstattuple` (physical bloat — currently
unmeasurable, which is why the report reports no bloat rather than a fabricated zero),
`pg_buffercache`, `pgaudit`.

---

## Step 3 — Index the foreign keys (101 findings, the bulk of the report)

This is the largest single group and the safest meaningful change. An unindexed foreign key means
every `DELETE` or key update on the **parent** must sequentially scan the **child** to check for
referencing rows — holding a lock for the whole scan. The cost lands on the parent's writes, which
is why it never shows up when you profile the child.

```sql
CREATE INDEX CONCURRENTLY ON <child> (<fk column>);
```

`CONCURRENTLY` is not optional — without it the build takes a lock that blocks writes for the
duration. It cannot run inside a transaction block, and a failed build leaves an `INVALID` index
you must drop and retry.

Do the busiest parents first: `projecttimeentries` (5), `aispecsessions` (3), then
`tasksyncrecords`, `subassignments`, `signupinvitations` (2 each).

**Cost:** disk, and a small write penalty per insert. 101 indexes is not free — if a child table is
tiny and its parent is never deleted from, you can skip it. Judgement, not obligation.

---

## Step 4 — Investigate before fixing (do not skip to the SQL)

### 35,385 orphaned `mcprequestaudit.projectid` — the report never flagged this

Nine percent of the audit table points at projects that do not exist: **16 distinct project IDs**,
spanning 2026-06-09 through 2026-08-01. That last date means it is **still happening**.

Either projects were deleted without cleaning up their audit rows, or something is writing a
project ID that never existed. Find out which before adding any constraint — a `NOT VALID` FK here
would start failing new writes while the cause is still active.

### 23 `missing-fk` findings — check the parent on each one

Same class as the `customerid` trap above. For each, confirm what the column actually references
before running anything. `companyauditlogs.changedby` → `userprofiles` is genuine (7 orphans of
344) and was verified by hand.

### 20 `source-conflict` — the app and MCP schemas disagree

Two TypeScript schema files declare the same tables with different shapes — e.g.
`appauditconfiguration` where `createdat` is `timestamp` in one and `timestamp with time zone` in
the other. Whichever is wrong will either emit SQL the database rejects or silently accept a value
the other would have refused. **A drift check comparing against either source alone reports clean**,
which is how these survive.

### 10 `type-mismatch` — declared vs deployed

e.g. `companyprojects.status` declared `varchar(20)`, deployed `varchar(50)`. No error is produced;
comparisons can fall back to a cast and defeat the index on the column. Low urgency, real cost.

---

## Step 5 — Structural, needs a decision rather than a command

- **24 undeclared tables** live in the database and are declared by neither schema
  (`clientgroups`, `departments`, `settings`, `systemlog`, `timeEntry`, …). Each is either dead and
  should be dropped, or live and should be declared. Nothing can tell you which from the outside.
  **Never** let `drizzle-kit push` decide — it will propose dropping all of them, including
  `marketingcontacts`.
- **55 empty tables / 36 all-null columns / 35 high-null-density columns** — informational. On a
  young product these are mostly features not yet used. No action; useful as a "what is actually
  in use" map.
- **0 of 129 tables have row-level security.** Every tenant boundary in this system is application
  code. That is a defensible choice, but it means a single missing check in a handler is a
  cross-tenant exposure with nothing underneath it to catch the mistake — which is exactly what
  happened on 2026-08-02. See the SOC 2 pack.

---

## Already done — 2026-08-02

| Item | Evidence |
|---|---|
| `projecttimeentries.phaseid` restored | migration `0062`, verified in `information_schema` |
| `mcprequestaudit.requestedprojectid` added | migration `0061`, verified writing in production |
| Cross-tenant feedback disclosure closed | APP 1.5.291; denial + no-regression both verified live |

---

## How to verify a column change — not with `db:drift`

`npm run db:drift` and `auditfences --schema` compare **tables only**. On 2026-08-02 drift exited 0
while two declared columns were missing from production. Use:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = $1 and column_name = $2;
```

---

## Honest summary

Of six findings the report marked **critical**: two were real and are fixed, one was
misdiagnosed with a remedy that would have caused an outage, three were a deliberate design being
misread — and one real problem of comparable size (the 35,385 orphans) was never raised at all.

Roughly **125 of the 440 findings** are safely mechanical: index the foreign keys, add the missing
columns. That is about 28%, and it is the right 28% to automate. The rest need a person who knows
what the data means.
