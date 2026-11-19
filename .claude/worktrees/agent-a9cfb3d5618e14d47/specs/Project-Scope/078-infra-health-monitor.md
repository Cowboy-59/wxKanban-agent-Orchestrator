# SCOPE-078 — Infrastructure Health Monitor

**Scope Number**: SCOPE-078
**Status**: `draft`
**Created**: 2026-06-28
**Last Reviewed**: 2026-06-28
**Depends On**: SCOPE-064 (sysadmin Overview surface + scheduled-worker mechanism), SCOPE-069 (launch observability — complementary; owns CloudWatch alarms + SNS/Pushover paging), `wxkanban-apprunner-instance-role` (read-only CloudWatch/RDS/App Runner IAM — gating prerequisite), `src/db/client.ts`, `src/server/index.ts → app.ts`. Conventions authority: `CLAUDE.md`.
**Related Scopes**: complementary to SCOPE-069 (SCOPE-078 owns the in-app dashboard view + solution text; SCOPE-069 owns external paging).
**Source**: `specs/Project-Scope/078-infra-health-monitor.md` (materialized from wxKanban DB doc `b0e8c0dd-5598-43e7-8e9b-1d6f14046423`, spec id `348d1d2a-0873-4f82-8ca0-5431dda89f30`; createSpecs stored this online-only — this file is the on-disk mirror)

---

## Overview

The wxKanban platform runs on a single RDS Postgres instance (today db.t3.small, a ~225-connection ceiling) plus two App Runner services whose autoscaling quietly consumes those connections. This scope adds a standing background agent that periodically reads live infrastructure numbers, evaluates a small set of health rules, and posts a plain-language warning together with the recommended fix to the sysadmin dashboard whenever a rule trips. The operator sees actionable guidance ("Database connections at 78% of the ceiling — resize to db.r6g.large or add RDS Proxy, and confirm App Runner instance count stays within the connection budget") rather than a raw graph.

## Business Problem

Capacity problems are currently invisible until something breaks — no one sees connection headroom shrinking, memory getting tight, storage filling, or that raising App Runner's instance ceiling would push the platform past a safe number of database connections. The recent RDS scale-up exercise produced a clear operating model for exactly this (thresholds, a connection-budget formula, concrete remediations), but that knowledge lived in a one-off plan that evaporates once the task closes. The intended outcome is that infrastructure capacity/health risks surface proactively on the sysadmin dashboard, each paired with a specific, vetted solution — closing the gap between "the metric exists in CloudWatch" and "someone knew to act on it."

## Actors

Primary: the sysadmin / platform operator who reads the dashboard, receives the warnings, and acts on the recommended solution. They are the sole actor for any remediation.

Secondary: the monitor agent itself (a scheduled, non-human background process that reads metrics and writes warnings without a human trigger), AWS CloudWatch / RDS / App Runner as the read-only upstream systems of record, future on-call engineers who rely on self-explanatory solution text, and end users as indirect beneficiaries who avoid outages from connection exhaustion or a full disk.

Explicit non-actor: the agent never acts on infrastructure — it does not resize, reboot, or change App Runner. It only observes and advises.

## Scope Boundary (In Scope) — the four v1 checks

Check 1 — RDS connection headroom. Reads current DatabaseConnections against effective max_connections. Caution near 70% of ceiling, urgent near 85%. Solution: resize to a larger instance (proven path db.r6g.large) and/or add RDS Proxy, plus cap application pool sizes.

Check 2 — RDS memory & CPU. Reads FreeableMemory (caution when sustained low vs instance RAM) and CPUUtilization (caution on sustained high). Solution: right-size to a memory-optimized Graviton class; check for connection-driven memory pressure; burstable CPU-credit exhaustion is called out for the current t3 family.

Check 3 — RDS storage. Reads FreeStorageSpace as a percentage of allocated, plus whether storage autoscaling is enabled and how close usage is to the autoscaling ceiling. Warns before the disk fills (a full disk is a hard outage). Solution: raise max-allocated-storage / confirm gp3 autoscaling is on; investigate growth.

Check 4 — App Runner instance ceiling vs connection budget. The cross-system check. Takes current App Runner max_instances per service and per-instance pool size, applies the budget rule (sum of pool size times max instances across app and MCP services must stay at or below max_connections minus a reserve of about 50), and warns when the configured ceiling already exceeds, or nears, that budget — catching the danger before someone raises max_instances for launch and silently overruns the DB. Solution: lower the instance ceiling, lower pool sizes, or raise DB capacity first.

Cadence and surfacing: the agent runs on a periodic schedule, persists the current set of results, and the sysadmin dashboard renders warnings with their solutions. A healthy check produces no warning (optionally a green OK status).

## Out of Scope

Automated remediation (no AWS write calls; humans perform every fix). One-click "apply the fix" buttons (solutions are copy-able guidance, not executable actions). External alerting/paging — routing to email/Slack/SNS/Pushover is deferred to and sequenced against SCOPE-069 (launch observability), not duplicated here; v1 surfaces on the dashboard only. The separate hosted-MCP database — v1 covers the app wxkanban RDS instance and the two App Runner services; the hosted-MCP DB's location still needs confirming and is a fast follow, not built blind. Non-RDS/non-App-Runner infrastructure (SES, S3, Route53, CloudFront, queues, cost anomalies) — the data model stays general but no such checks ship in v1. Historical trends/charts/forecasting — v1 reports current state; CloudWatch already retains history. Multi-region / multi-environment — single account, us-east-1, production only.

## Functional Behavior

Runs as a scheduled background job (default every 5 minutes, configurable) on the existing background-worker mechanism (same as the SES newsletter job), not new infrastructure. Each run is self-contained: read metrics, evaluate rules, write the result set, exit. A failed run logs and exits cleanly (fail-open) — never blocks the app, never writes partial/wrong warnings; the next cadence retries.

A run, in order: (1) pull current readings — RDS metrics via CloudWatch GetMetricStatistics plus the instance's configured max_connections; allocated/used storage and autoscaling ceiling via RDS describe; App Runner max_instances and known per-service pool sizes; (2) evaluate the four checks; (3) assign each a status of ok / caution / urgent; (4) replace the stored result set (current-state model, not an append log).

Warning + solution model: every non-ok result is a structured record with a stable check key (idempotent updates), severity (caution/urgent), a short human title, a one-line explanation of the actual numbers ("connections 176 of 225, 78%"), and a solution — plain-language remediation plus the specific command/config change, written for someone who did not run the original exercise. Severity drives ordering and color.

Operator view: a sysadmin-dashboard panel listing current warnings urgent-first, each showing title, live numbers, and its solution. When all healthy, a single green "all infrastructure checks passing" state with a last-checked timestamp. Each result shows when it was last evaluated; if the newest evaluation is older than about two cadences, the panel self-flags "monitor may not be running." Thresholds, cadence, and the connection-budget reserve are configurable. A manual "re-evaluate now" trigger lets the operator confirm a warning clears after applying a fix without waiting for the next cadence.

## Data Requirements

Primary entity infrahealthchecks (plural, lowercase, concatenated; UUID v7 PK). One row per check key, upserted every run (current-state model). Fields: id (UUID v7); checkkey (stable rule identifier, unique — drives idempotent upsert); resource (what was measured, e.g. the wxkanban RDS instance or the app App Runner service); status (ok/caution/urgent); title; detail (live numbers in words); solution (remediation text + command/config change, null when ok); readings (raw numbers + thresholds applied, as JSON); evaluatedat (drives stale-monitor detection); createdat.

Thresholds and cadence config (caution/urgent percentages, cadence, connection-budget reserve) are runtime-configurable — stored as a single configuration record (reusing the platform settings mechanism if one exists, otherwise one small infrahealthsettings row with defaults). The per-service pool sizes and instance ceilings the budget check needs are read from existing config/env, not stored here.

## API Routes

GET /api/admin/infra-health (admin-only) — returns infrahealthchecks rows plus a derived overall status and the newest evaluatedat; follows the existing GET /api/admin/doc-status pattern. POST /api/admin/infra-health/refresh (admin-only) — triggers an immediate re-evaluation so the operator can confirm a warning clears after applying a fix.

## Frontend Components

An Infrastructure Health panel on the existing sysadmin Overview surface (the rollup from SCOPE-064), not the per-company Admin Dashboard. It lists warnings urgent-first with title, live numbers, and solution; shows a green "all infrastructure checks passing" state with last-checked timestamp when healthy; self-flags "monitor may not be running" when the newest evaluatedat exceeds about two cadences; and offers a manual "re-evaluate now" button.

## Integration Context

Runs on the same scheduled-worker infrastructure as the SES newsletter job (SCOPE-064/065); server-side under the production entrypoint chain (src/server/index.ts to app.ts); reads/writes via src/db/client.ts. AWS read access (the one real infra dependency): CloudWatch GetMetricStatistics, rds:DescribeDBInstances / DescribeDBParameters, apprunner:DescribeService — read-only permissions granted to the App Runner instance role (wxkanban-apprunner-instance-role); a gating prerequisite. Complementary to SCOPE-069 (which owns CloudWatch alarms and SNS/Pushover notification); SCOPE-078 owns the in-app dashboard view and the solution text. The Check-4 budget inputs (app/MCP pool sizes, App Runner max_instances) come from the same config the Phase-1 RDS work makes explicit (PG_POOL_MAX, Terraform max_instances in infra/variables.tf), keeping a single source of truth.

## Constraints & Risks

Read-only blast radius (hard constraint): describe/read AWS permissions only, no write calls — worst case is "shows wrong advice," never "took a wrong action." CloudWatch cost/rate (low): 5-minute polling of a few metrics is negligible; the configurable cadence is the control. Metric lag/smoothing: CloudWatch is delayed (~1–5 min) and period-averaged, so this is a proactive headroom monitor, not a real-time breaker. Effective max_connections discovery: Check 1 must resolve the formula (DBInstanceClassMemory/9531392) to a number from instance class and re-resolve after a resize; prefer a pinned max_connections once the Phase-1 custom parameter group sets one (1500). Stale-agent false confidence: a silently stopped monitor looks green — mitigated by the evaluatedat freshness flag. IAM prerequisite ordering (delivery risk): the instance-role policy must land before deploy or every run fails open. Single account/region assumption (constraint): us-east-1 production and the wxkanban identifier are configuration. Solution-text accuracy: fixes are only as good as the exercise behind them — solution text is reviewed content versioned with the scope, not buried in code.

## Open Questions

- Where does the separate hosted-MCP production database live? Only one RDS instance (wxkanban) is visible under the current profile/region; confirm whether the MCP DB is a different database on the same instance (covered by this work) or a different host/account (needs its own follow-up). Deferred per Out of Scope.
- Thresholds/cadence config storage: reuse an existing platform settings mechanism if one exists, or introduce a single-row infrahealthsettings record? One small implementation choice that does not change scope.
- Whether any warning should later also page out via SCOPE-069's SNS/Pushover — deferred and sequenced against SCOPE-069, not decided here.

## Success Metrics

- Coverage every cycle: all four checks produce a status (ok/caution/urgent) on every run; infrahealthchecks always holds four rows whose evaluatedat is within one 5-minute cadence — target 100% of cycles.
- Run reliability >= 99% of scheduled runs complete successfully over a representative week; failed runs fail open (no partial/wrong writes) and are logged.
- Actionability: 100% of non-ok rows carry a non-empty solution containing at least one concrete command or config change.
- Proactive budget catch: raising an App Runner max_instances value past the connection budget produces a Check-4 warning before the database is at risk (verified in a controlled test).
- Freshness honesty: stopping the agent surfaces "monitor may not be running" within about 2 cadences (~10 minutes).
- Time-to-visibility: from a threshold being crossed to the warning appearing on the dashboard is <= about 6 minutes (one 5-minute cadence plus CloudWatch lag).
