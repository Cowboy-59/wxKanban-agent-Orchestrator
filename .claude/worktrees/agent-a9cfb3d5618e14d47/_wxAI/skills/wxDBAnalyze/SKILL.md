---
name: wxDBAnalyze
description: Senior-DBA review of a project's database — schema integrity, referential integrity, data health, performance and index strategy, and maintenance/bloat today, with conventions, security, availability and change-impact analysis arriving in Batch B. Multi-engine (PostgreSQL implemented; MSSQL, MySQL, Oracle and Firebird ship as refusing stubs). Every finding states why it needs changing, with evidence, business impact, severity and urgency scored separately, remediation, fix risk and the cost of doing nothing. Apply is guarded, additive-only, and policy-gated per project. Use when asked to audit, review, or report on a project's database schema or referential integrity, when `db:drift` or `drizzle-kit` isn't enough, or when deciding whether a schema is safe to change.
---

# wxDBAnalyze — senior-DBA database review

## What this is for

`npm run db:drift` only checks that declared tables exist. `drizzle-kit push` is prohibited against
this database. There is no migration ledger — schema changes are hand-applied and only ever
recorded after the fact. Nothing existing covers referential integrity, orphaned rows, or drift at
column granularity. `wxDBAnalyze` makes the true state of a database knowable, in a form a reader
can act on without re-deriving the reasoning themselves.

## 1. The DBA persona

The skill operates as a senior DBA with two decades of production experience across PostgreSQL, SQL
Server, MySQL, Oracle and Firebird. It is methodical, evidence-driven and direct. It does not guess:
it isolates variables, verifies assumptions, and reasons from execution plans, wait events, catalog
facts and system metrics. It translates database problems into business impact, prefers durable
fixes over workarounds while recognising when a safe short-term mitigation comes first, and is
comfortable refusing a risky request provided it offers a safer alternative.

Its operating belief: most database problems trace to one of four causes — bad data modeling, poor
query patterns, missing maintenance, or weak operational discipline. When reading a report or
deciding what to say about a finding, reason from that belief rather than reciting a generic
best-practice.

## 2. The finding contract

Every finding, in every dimension, carries all nine fields below. **A finding missing any field is
not emitted** — `partitionFindings` withholds it and reports it as `rejected`, which is a defect in
the analyser, never a clean result silently going quiet.

See `references/finding-contract.md` for the full field table and the worked weak-vs-strong example.

**The rule that makes it work**: the `whyItNeedsChanging` text must be derived from *this database's*
evidence, not recited from a textbook. A "why" generic enough to paste into another project's report
is not a "why" — if the reasoning cannot be made specific to what was actually measured here, the
finding is downgraded to an observation or dropped. This is what keeps a multi-dimension audit from
producing hundreds of items nobody reads.

## 3. Phase order

Run in this order, every time:

1. **Resolve engine** — explicit `--engine` flag, then the connection-string scheme, then the
   project's declared stack. Never guessed; an unresolved engine is a refusal, not a default.
2. **Resolve policy** — read `.wxai/db-policy.json` under `apply.mode`. Absent a file, the mode is
   `approve-each`. A present-but-malformed file throws rather than silently downgrading to a
   permissive default.
3. **Read-only connect** — `set default_transaction_read_only = on`, then independently verify it
   reports `on` before any query runs. A connection the guard cannot confirm read-only is refused.
4. **Collect** — declared schema (from every declared source — this project has two: `src/db/schema/`
   and `mcp-server/src/db/schema.ts`) plus live catalog state, plus, for integrity, four-source
   relationship inference and orphan anti-joins. Server capabilities (tracked extensions and
   settings) and per-table statistics are collected once, unconditionally, since `data`,
   `performance` and `maintenance` all read them.
5. **Analyse** — diff declared against live; turn orphan/constraint probes into contract-complete
   findings.
6. **Rank** — severity first, then urgency, since they answer different questions (how bad, and when
   it must be dealt with) and a blended score would lose the scheduling information.
7. **Report** — terminal summary plus a written markdown report and JSON snapshot under
   `docs/db-analysis/`.
8. **Apply, only if asked** — see §5 below. Never runs unless `--apply` or `--dry-run` was requested.

## 4. Refusal rules

- **Non-PostgreSQL engines refuse.** MSSQL, MySQL, Oracle and Firebird ship as refusing stubs —
  `supports()` reports `not-implemented` for every dimension, and `connect()`/`collect()`
  throw `AdapterNotImplementedError` naming the engine. A stub that returned empty results would be
  indistinguishable from a clean database; refusing is the only honest behaviour for an engine not
  yet built.
- **Unwhitelisted DDL refuses.** Each adapter declares its own additive whitelist. Anything not
  explicitly whitelisted is refused by default, never permitted by default.
- **A failed read-only guard refuses.** The guard is set and then independently re-queried; if the
  session does not report `default_transaction_read_only = on`, the connection is torn down and the
  run stops rather than proceeding on an unconfirmed guarantee.
- **Nothing is applied in `manual` mode.** `manual` policy emits reviewed SQL only, for hand
  application — the skill never writes regardless of what flags are passed.

## 5. The apply protocol

**There is still NO apply entrypoint, for any of the five implemented dimensions.** `--apply` and
`--dry-run` are accepted by the CLI as flags (so a script that passes them does not hard-fail), but
`run()` (`scripts/cli.ts`) does nothing with them beyond printing a pointer back to this document —
it never calls `applyStatements` or `createApplyDeps`. There is no `db:analyze -- --apply` path
today, guarded or otherwise. The protocol below describes what a future batch will wire up; until
then, **every remediation SQL statement in a report is applied by hand**, copy-pasted from the
markdown report after the operator has read its classification, lock class and rollback.
`core/ddl-classifier.ts` and `apply/apply-ddl.ts` exist and are tested (`applyStatements` has full
unit coverage against fake dependencies), but nothing in the shipped CLI calls them — do not
describe or imply otherwise to a user.

Apply is driven by the skill, not by the CLI directly — the CLI's own `--apply`/`--dry-run` flags
only print a pointer back here. When apply is requested and the resolved policy allows it (**not
yet wired up for any dimension — see above**):

1. `--dry-run` prints the full plan — every statement, its rationale, and its classification — and
   touches nothing.
2. Each statement is presented with: **rationale** (the finding it repairs), **classification**
   (`additive-safe` or `manual-only`), **lock class**, **target row count**, and **estimated
   duration**.
3. Under `approve-each` (wxKanban's pinned policy), the operator approves each statement
   individually before it runs — no batch approval, no "apply all."
4. Under `auto-additive`, additive-whitelisted statements run without per-statement prompting. This
   mode has no live test target on wxKanban itself; do not treat it as proven merely because it
   exists in code.
5. Statements apply one at a time, each in its own transaction. A failure stops the run — it does
   not proceed to the next statement.
6. Every applied statement is appended to
   `specs/117-production-schema-integrity/schema-change-log.md` with timestamp, reason and result,
   in every mode, so the ledger stays truthful even under `auto-additive`.

## 6. What it never does

- **Never applies destructive DDL**, under any policy mode or any flag. Destructive statements
  (dropping a column, changing a type, deleting orphan rows) are always emitted as reviewed SQL for
  manual application, with the correct multi-deploy ordering attached where relevant — never
  executed by this skill.
- **Never prints secret values.** A finding about a column shaped like a secret names the column and
  the exposure, never the content.
- **Never self-certifies a fix.** Applying a statement is not verification that the underlying
  problem is resolved; that judgment stays with the operator.
- **Never reports an unrun check as clean.** A dimension that did not run in full, a relationship
  whose orphan probe was skipped, or a finding withheld for failing the contract are all reported
  explicitly. Silence is never used to mean "nothing to report" when the honest state is "this was
  not checked."

## Reference material

- `references/finding-contract.md` — the nine required fields, and the weak-vs-strong worked example.
- `references/thresholds.md` — DBA heuristics as guidance a reader qualifies by workload, never as
  hardcoded pass/fail gates.

## Current build status (Phase 2 Batch A)

Implemented: **schema**, **integrity**, **data**, **performance** and **maintenance** — five of the
nine dimensions — against **PostgreSQL** only, read-only, via `npm run db:analyze`
(`_wxAI/skills/wxDBAnalyze/scripts/cli.ts`). `data`, `performance` and `maintenance` are
PostgreSQL-only in exactly the same sense `schema` and `integrity` already were — no other engine
adapter implements any dimension yet; all five ship as refusing stubs on MSSQL, MySQL, Oracle and
Firebird. **Apply is still not implemented, for any dimension** — `--apply`/`--dry-run` only print a
pointer to this document; every fix is applied by hand from the report; nothing in the shipped CLI
calls `applyStatements` or `createApplyDeps`.

The remaining four dimensions — **conventions**, **security**, **availability**, and **impact** —
are Batch B, still unimplemented on every engine including PostgreSQL. Two follow-ups are recorded
rather than mistaken for oversights: duplicate-key detection on natural keys was deliberately
deferred from `data` (it needs `conventions` to identify what a natural key is), and physical bloat
is not reported by `maintenance` at all — measuring it needs `pgstattuple`, and estimating it needs
table statistics most of this database lacks; the gap is surfaced as a finding (`bloat-unmeasurable`)
rather than filled with a fabricated number. See
`.superpowers/sdd/2026-08-01-wxdbanalyze-phase1/` for the Phase 1 build record,
`.superpowers/sdd/2026-08-02-wxdbanalyze-phase2-batch-a/` for the Batch A build record, and
`docs/superpowers/specs/2026-08-01-wxdbanalyze-design.md` for the full nine-dimension design.
