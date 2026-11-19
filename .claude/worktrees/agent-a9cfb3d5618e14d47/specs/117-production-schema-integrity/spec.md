# Spec 117: Production Schema Integrity

## Overview

Production database schema is unmanaged. There is no migration ledger in the production database, so a table or column declared in `src/db/schema/` can ship to production without the database ever receiving it. Nothing compares declared schema against deployed schema, so divergence is discovered only when a user hits a route that queries the missing object and receives a 500. This spec eliminates the current divergence, restores the diagnostic signal needed to detect it, and establishes a mechanism that prevents a schema change from reaching production unapplied.

## Business Problem

On 2026-07-30 the CloudWatch alarm `wxkanban-cloudfront-5xx` fired at 23:23 UTC. Investigation traced it to a signed-in consultant opening the Consultant Hub, whose requests failed with Postgres `42P01` (relation "complianceflags" does not exist) and `22P02` (invalid input syntax for type uuid: "all"). The database was healthy throughout — RDS CPU around 3 percent, connections flat at 31 to 36 — and the last deployment had completed 3.7 hours earlier, so neither load nor a release explains it.

The failure is not isolated. "Failed query" bursts occurred nine times that day at 10:27, 12:04, 12:06, 12:12, 12:53, 15:12, 18:44, 23:13 and 23:14 UTC. Only the 23:13 burst crossed the alarm threshold, because baseline traffic is about 11 requests per 5 minutes and it took 11 errors to exceed 1 percent. The same class of failure caused the 2026-07-28 incident.

Three compounding causes: production has no migration tracking table at all, so drift is undetectable; CLAUDE.md documents `npm run db:generate` but no such script exists in package.json, so the documented workflow was never executable and migrations were never generated; and `error.cause` is discarded at roughly 233 server log sites with no Pino serializers, so Drizzle's wrapper message reaches CloudWatch while the actual Postgres error code never does. Diagnosing this incident required replaying the logged SQL against production by hand.

## Actors

- Primary: Platform maintainer — the person shipping a schema change to production.
- Secondary: Consultant — the end user whose Consultant Hub requests return 500 when a declared table is missing from production.
- Secondary: Maintainer triaging a production incident from CloudWatch logs.
- Secondary: CI pipeline enforcing the pre-release schema drift gate.

## Success Metrics

1. Zero `42P01` and zero `22P02` errors in the application log across 7 consecutive days after deploy, against a measured baseline of 9 error bursts on 2026-07-30 alone.
2. For 1 consultant account with "All projects" selected, all 4 Consultant Hub page requests — compliance flags, invoice preview, active timer, recent timer — return HTTP 200.
3. The drift detector exits non-zero and names all 6 missing tables when run against production before remediation, and exits 0 after. A detector only ever seen passing is unproven.
4. (AMENDED 2026-07-31) Every schema change applied to production is recorded with what changed, when, and who applied it. Measured by: 1 recorded entry for the 2026-07-31 change set, and 0 schema changes reaching production without a corresponding entry. The original criterion — a fresh `db:generate` producing an empty diff after baselining — is withdrawn along with the migration ledger it depended on.
5. Production table count goes from 125 to exactly 131 — 6 added, 0 removed — with `marketingcontacts` remaining at 1006 rows and `capabilityindex` at 4002 rows, captured as explicit before and after snapshots.
6. An induced `42P01` in a non-production environment produces a single-line JSON log record containing the Postgres error code and relation name, reducing time from log inspection to root-cause identification to under 2 minutes.
7. The schema check runs in CI on every push to main and blocks merge on divergence, verified by 1 intentional divergence commit that must fail the build.

## Scope Boundary

Reconcile the 6 declared-but-missing tables into production via tracked migration: `complianceflags`, `gitcommandlogs`, `gitcommandstats` (both renamed from underscore form before creation to satisfy the naming convention), `mcpdriftevents`, `mcpparityconfig`, `mcpupdateadoptions`. Reject non-UUID sentinel values at the request boundary so "all" never reaches a UUID-typed column, and audit every route accepting a `projectid` parameter for the same leak. Preserve `error.cause` — Postgres code and detail — in server error logging for database-backed paths. Establish a migration ledger in production, baselined against current state, additive only, rehearsed against a restored non-production copy first. Add schema drift detection as a `--schema` flag on the existing `auditfences` command, considering both the app and MCP schemas, CI-gated only. Inventory and protect the 27 orphan tables, and declare `marketingcontacts` so no reconcile-to-declared operation can target its 1006 live rows. Restore the missing `db:generate` and `db:migrate` scripts and reconcile CLAUDE.md.

## Out of Scope

CloudFront access logging and 5xx alarm tuning are excluded; the alarm caught 1 of 9 bursts and access logging is disabled, but detection quality is deliberately deferred. Dropping any orphan table is excluded — all Group B (12 empty, unreferenced) and Group C (14 with data, including `sockettrace` at 505889 rows) cleanup is blocked pending completion of the PPE conversion; declaring `marketingcontacts` is in scope, dropping nothing is. RDS topology is excluded: the instance is single-AZ in us-east-1 while App Runner runs in us-east-2, so every query crosses a region with no automatic failover — real exposure, but a separate infrastructure decision. Redesign of Consultant Hub features beyond making its queries succeed is excluded. Retro-fixing all 233 `error.message`-only log sites beyond the database error paths is excluded. A guaranteed fix for the 2 unexplained timer failures of 2026-07-30 is excluded: their SQL executes successfully against production and the connection-poisoning hypothesis was tested and refuted.

## Open Questions

1. What is the cause of the 2 timer failures observed at 23:13 on 2026-07-30? Their SQL executes successfully against production in isolation, and the shared-connection poisoning hypothesis was tested and refuted. The `error.cause` logging delivered here should identify it on next occurrence; it is tracked, not solved.
2. When does the PPE conversion complete? Orphan table cleanup — 26 tables, including `sockettrace` at 505889 rows — is blocked behind it and cannot be scheduled until that date is known.
3. Do `projecttasknotes` (958 rows) and `projecttasktimelog` (1211 rows) hold pre-conversion history that was never migrated into `projecttimeentries`? If so they carry historical billing evidence and must never be dropped. Requires explicit sign-off before any cleanup.

## Functional Requirements

FR-001 — Missing declared tables reconciled into production. All 6 declared-but-missing tables exist in production with schema matching their declarations, each created via a tracked migration rather than by hand, with columns, types and constraints matching `src/db/schema/`. The underscore-form names are renamed to `gitcommandlogs` and `gitcommandstats` before creation. Verified end-to-end by the Consultant Hub compliance-flags request returning 200.

FR-002 — Sentinel values rejected at the request boundary. A non-UUID filter value never reaches a UUID-typed column. An invoice-preview request with `projectid=all` returns results for all projects rather than a 500; query parameters are parsed through a schema at the boundary with "all" handled as no-filter, consistent with the existing guard at consultantHub.ts line 141; a malformed `projectid` returns 400 rather than 500; and all other routes accepting `projectid` are audited for the same leak.

FR-003 — Database error cause preserved in logs. Database-backed error paths log `error.cause.code` and `.detail` rather than only `error.message`. An induced `42P01` produces a log record containing the code and the relation name. Output remains valid single-line structured JSON via Pino, and no secrets or bound parameter values containing PII are newly exposed.

FR-004 (AMENDED 2026-07-31) — Schema change record. All schema changes are applied MANUALLY by the operator, so this is a record of what was applied rather than a mechanism that applies it. Every production schema change is recorded with what changed, when, and who applied it, in a form that survives outside one person's memory. The record is written alongside the reviewed DDL (see `manual-ddl.sql`) and is what satisfies SOC2 CC8.1. Nothing in this spec applies DDL automatically, and `drizzle-kit push` remains prohibited.

Superseded by this amendment: the original FR-004 required a drizzle migration ledger baselined against production, rehearsed on a restored copy, with `db:generate` producing an empty diff (original SC-4). That presumed migration-based application, which the operator has ruled out. Drift detection (FR-005) becomes the primary safety net instead — with manual DDL it is the only thing that catches a hand-applied change.

FR-005 — Schema drift detection. Implemented as a `--schema` flag on the existing `auditfences` command. It compares declared pgTable definitions against deployed information_schema, considering both `src/db/schema/` and `mcp-server/src/db/schema.ts` so MCP-owned tables do not register as false positives. It reports declared-but-missing objects by name and exits non-zero on divergence. It must reproduce the 2026-07-30 finding against current production by naming the 6 tables, and pass cleanly once FR-001 and FR-004 are complete. It runs in CI only, with no pre-push hook.

FR-006 — Orphan tables inventoried and protected. Each of the 27 orphan tables is classified as live-but-undeclared, legacy-with-data, or empty-and-unreferenced. `marketingcontacts` — 1006 live rows, used via raw SQL in NewsletterSendService and the marketing routes — is declared in the schema so no reconcile-to-declared operation can target it. Drift detection reports orphan tables as informational and never as objects to remove. No tooling path in this spec can drop or alter them, and `marketingcontacts` and `capabilityindex` are verified intact after every step.

FR-007 — Database tooling restored. `db:generate` and `db:migrate` scripts exist in package.json and run successfully, CLAUDE.md is reconciled so the documented command matches the one that exists, running `db:generate` with no schema change produces an empty diff, and the scripts target `src/db/migrations` explicitly so they cannot be confused with `mcp-server/migrations`.
