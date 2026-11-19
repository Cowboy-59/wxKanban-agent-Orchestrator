# wxDBAnalyze — Top 5 Features

What the `/wxDBAnalyze` skill actually gives you today (Phase 2 Batch A, PostgreSQL only,
read-only). Source: `_wxAI/skills/wxDBAnalyze/SKILL.md` and `_wxAI/commands/wxDBAnalyze.md`.

---

## 1. Schema integrity at **column** granularity

Diffs every declared schema source against the live catalog — this project declares in two places
(`src/db/schema/` and `mcp-server/src/db/schema.ts`) and both are read.

**Why it matters:** `npm run db:drift` only confirms that declared *tables* exist. It exits 0 while
declared *columns* are missing, which is exactly how the production `42703` errors went undetected.
wxDBAnalyze catches drift one level deeper, in a database that has no migration ledger and where
`drizzle-kit push` is prohibited.

## 2. Referential integrity from four independent signals

Infers relationships from declared FKs, live FKs, naming convention, and the data model — then runs
orphan anti-joins against the real rows.

**Why it matters:** nothing else in the toolchain checks for orphaned rows or for relationships that
exist in the data model but were never enforced by a constraint. A relationship that three of the
four sources agree on but the live catalog doesn't is a missing FK, and it says so.

## 3. Data health profiling

Empty tables, all-null and high-null-density columns, and tables it could not profile at all.

**Why it matters:** it distinguishes "this column is unused" from "this column is broken" from
"this table was never examined" — and reports the third case explicitly rather than letting silence
read as clean.

## 4. Performance and index strategy

Unused, duplicate and invalid indexes; sequential-scan-heavy tables; statement statistics from the
server's tracked extensions.

**Why it matters:** it turns index decisions into evidence from *this* database's access patterns
instead of general best-practice, and names indexes that cost writes while serving no reads.

## 5. Maintenance and bloat exposure

Never-analyzed table coverage, dead-tuple ratio, autovacuum behaviour, transaction freeze age, and
vacuum blockers.

**Why it matters:** freeze age and vacuum blockers are the failures that arrive as an outage with no
warning. Note that *physical* bloat is deliberately **not** reported — measuring it needs
`pgstattuple` and estimating it needs statistics most of this database lacks, so the gap ships as a
finding (`bloat-unmeasurable`) rather than a fabricated number.

---

## What makes all five usable rather than noisy

- **The nine-field finding contract.** Every finding states why it needs changing, the evidence,
  business impact, severity and urgency *scored separately*, remediation, fix risk, and the cost of
  doing nothing. A finding missing any field is withheld and counted as `rejected` — an analyser
  defect, never a quiet pass. The "why" must be derived from this database's measured evidence; a
  reason generic enough to paste into another project's report is dropped.
- **Read-only by default, verified.** The session sets `default_transaction_read_only = on` and then
  independently re-queries it; a connection the guard cannot confirm is refused, not proceeded on.
- **Refuses instead of faking.** MSSQL, MySQL, Oracle and Firebird ship as refusing stubs — an empty
  result set from an unbuilt adapter would be indistinguishable from a clean database.
- **Output** — ranked terminal summary plus `docs/db-analysis/<timestamp>.md`, a stable
  `latest.md`, and a raw JSON snapshot. Exit `0` clean / `1` critical finding / `2` no DB URL or
  unhandled failure / `3` dimension unsupported by the resolved engine.

## Two things it does *not* do yet

- **No apply.** `--apply` and `--dry-run` are accepted as flags but only print a pointer back to the
  skill doc. Every remediation SQL statement is copy-pasted from the report and applied by hand.
  `applyStatements` and `createApplyDeps` exist and are unit-tested, but nothing in the shipped CLI
  calls them.
- **Four dimensions are Batch B** — conventions, security, availability, and change-impact analysis
  are unimplemented on every engine including PostgreSQL. Requesting one is refused loudly.
