---
description: Senior-DBA review of a project's database — schema integrity, referential integrity, data health, performance/index strategy, and maintenance/bloat today (Phase 2 Batch A), with conventions, security, availability and change-impact analysis arriving in Batch B. Read-only by default; apply is guarded, additive-only, and gated by project policy.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxDBAnalyze — senior-DBA database review

## Purpose

`npm run db:drift` only confirms declared tables exist. `drizzle-kit push` is prohibited against
this database. There is no migration ledger — schema changes are hand-applied and only recorded
after the fact. `wxDBAnalyze` closes that gap: it inspects the live catalog against every declared
schema source, cross-tabulates referential integrity from four independent signals (declared FKs,
live FKs, naming convention, and the data model), and reports every finding with why it needs
changing, its business impact, its fix, and the cost of doing nothing — never a bare metric.

This command **loads and runs the `wxDBAnalyze` skill** (`_wxAI/skills/wxDBAnalyze/SKILL.md`), which
carries the DBA persona, the finding contract, the phase order, the refusal rules and the apply
protocol.

## Usage

```bash
/wxDBAnalyze                          # full audit of every implemented dimension, read-only
/wxDBAnalyze --dimension performance,integrity   # run a subset of the five implemented dimensions
/wxDBAnalyze --impact                 # Batch B — not yet implemented
/wxDBAnalyze --apply                  # guarded additive apply, per-statement approval
/wxDBAnalyze --dry-run                # plan only, touches nothing
/wxDBAnalyze --engine mssql --url …   # Batch B — non-postgres engines still refuse
/wxDBAnalyze --write-conventions      # Batch B — not yet implemented
```

These seven forms are the full command surface from the design (`docs/superpowers/specs/
2026-08-01-wxdbanalyze-design.md` §9). **The first through fifth actually run today** — the
CLI (`npm run db:analyze`, wired from `_wxAI/skills/wxDBAnalyze/scripts/cli.ts`) implements `schema`,
`integrity`, `data`, `performance` and `maintenance` against PostgreSQL only; `--apply`/`--dry-run`
are accepted but only print a pointer back to the skill (there is still no apply entrypoint, for any
dimension). Requesting a Batch B dimension or a non-PostgreSQL engine is refused loudly, never
silently ignored — see the table below.

`/wxDBAnalyze` is independently runnable: point it at any project with a PostgreSQL `DATABASE_URL`
and it audits that database, not only wxKanban's own.

## Dimensions

| # | Dimension | Status |
| --- | --- | --- |
| 1 | Schema integrity (declared vs. live, column granularity) | **Implemented** |
| 2 | Referential integrity (four-source relationship inference, orphan anti-joins) | **Implemented** |
| 3 | Data health (empty tables, all-null / high-null-density columns, unprofiled tables) | **Implemented** |
| 4 | Conventions and design | Batch B |
| 5 | Performance and index strategy (unused/duplicate/invalid indexes, seq-scan-heavy tables, statement stats) | **Implemented** |
| 6 | Maintenance and bloat (never-analyzed coverage, dead-tuple ratio, autovacuum, freeze age, vacuum blockers) | **Implemented** |
| 7 | Security and access | Batch B |
| 8 | Locking, connections and availability | Batch B |
| 9 | Impact analysis (uncommitted schema edits) | Batch B |

Dimensions 3, 5 and 6 are **PostgreSQL-only, exactly as 1 and 2 already were** — no other engine
adapter implements any dimension yet.

Engines: **PostgreSQL is implemented.** MSSQL, MySQL, Oracle and Firebird ship as refusing stubs —
every dimension reports `not-implemented` for them rather than silently returning no findings, which
would read as a clean database that was never actually examined.

## Result contract

- **Terminal** — findings ranked by severity then urgency, grouped by dimension, each with its
  evidence and business impact. The summary line states how many findings were withheld for failing
  the finding contract (an analyser defect, not a clean run) and how many dimensions did not run in
  full — omitted entirely, never printed as "0", when there is nothing to report.
- **Report file** — `docs/db-analysis/YYYY-MM-DDTHH-MM-SS-sssZ.md`, with a stable
  `docs/db-analysis/latest.md` alongside a raw JSON snapshot for the same run.
- **Exit code** — `0` clean, `1` at least one `critical` finding, `2` no database URL resolved or an
  unhandled failure, `3` a requested dimension is unsupported by the resolved engine.

## Safety

- Read-only by default. Every probe runs through a read-only connection guard that is set and then
  independently re-verified before any query runs; a connection the guard cannot confirm read-only
  is refused.
- **`--apply` and `--dry-run` never execute DDL from this command directly** — they hand off to the
  skill, which presents each statement's rationale, classification, lock class and estimated
  duration, and applies only under the project's resolved `.wxai/db-policy.json` mode
  (`manual` / `approve-each` / `auto-additive`; wxKanban pins `approve-each`).
- No destructive DDL is ever applied, under any mode. Destructive statements are always emitted as
  reviewed SQL for manual application.
- Does not run git. Does not push.

## Context

{{args}}
