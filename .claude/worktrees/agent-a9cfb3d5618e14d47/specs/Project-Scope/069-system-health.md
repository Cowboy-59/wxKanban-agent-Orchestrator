# SCOPE-069: In-App System Health (SysAdmin Console)

**Scope Number**: SCOPE-069
**Status**: `draft`
**Created**: 2026-06-23
**Last Reviewed**: 2026-06-23 (4 sections approved in-conversation: sparkline IN for v1; thresholds + ceilings read live from CloudWatch/describe APIs to prevent drift)
**Depends On**: AWS observability provisioned 2026-06-23 — SNS topics `wxkanban-alerts` (us-east-1 + us-east-2) and 8 CloudWatch alarms (RDS connections/CPU/memory/storage/credits, CloudFront 5xx, App Runner instances/5xx). SCOPE-014 (SysAdmin console + role framework).
**Related Scopes**: SCOPE-014 (SysAdmin). The on-AWS alarm/SNS/Pushover safety net is operated directly (not app code) and is this scope's data source, not its responsibility.
**Source**: `specs/Project-Scope/069-system-health.md`

---

## Overview

The only window into production health today is the AWS console. There is no at-a-glance view inside wxKanban, and the people running the product day-to-day should not have to live in CloudWatch to know whether it is healthy. With 1k+ users about to land, the team needs one SysAdmin screen that answers, in a glance: **"is everything healthy, and how much headroom is left before it bites?"**

This scope adds a **read-only "System Health" tab to the SysAdmin console**. It surfaces the same leading signals that now arm the CloudWatch alarms — RDS connections/CPU/memory/storage/CPU-credits, App Runner active-instances/5xx, CloudFront 5xx — each as a row showing the **current value**, a **tiny ~1h trend sparkline**, the **live alarm state**, a **healthy/warning/critical color**, and **current-vs-max headroom** where a ceiling exists. Data is fetched server-side from CloudWatch (`GetMetricData` + `DescribeAlarms`) on a ~30–60s refresh. No new datastore, no new metrics pipeline — the panel mirrors the external safety net rather than inventing a second source of truth.

Critically, the *alerting* still lives outside the app (CloudWatch → SNS → email/Pushover): if the app or DB is the thing failing, an in-app monitor fails with it. This panel is the **view**; the alarms are the **safety net**.

## Business Problem

A high-stakes launch (1k+ pre-registered) is riding on a stack with real, near-term ceilings — most acutely the RDS `db.t3.small` ~200-connection limit against an App Runner service that scales to 25 instances. Operators need to *see* headroom shrinking before it turns into mass 500s, without context-switching to AWS. A console-native health view turns "we found out when users complained" into "we watched it trending and acted."

### Core Design

| Element | In-App System Health |
| --- | --- |
| **Primary Actor** | A SysAdmin operating wxKanban in production |
| **Secondary Actor** | AWS CloudWatch (metric values, ~1h series, alarm state) reached via the app server's AWS identity |
| **Key Value** | One in-app glance answers "healthy? how much headroom?" — no AWS console needed for the daily check, and the colors can't disagree with what's alerting your phone |
| **Boundary — IN** | Read-only SysAdmin "System Health" tab; per-metric current value + ~1h sparkline + live alarm state + healthy/warning/critical color + current/max headroom; overall status banner; ~30–60s auto-refresh + last-updated; graceful degradation; thresholds + ceilings read live; one batched `GetMetricData` + short server cache |
| **Boundary — OUT** | Creating/editing alarms from the UI; deep historical analytics + log search (CloudWatch owns those); notification delivery (SNS/Pushover own it); auto-remediation/scaling; cost/billing views (AWS Budget covers cost); multi-environment / multi-account |

---

## User Scenarios

### US1 — Daily glance
A SysAdmin opens **System Health**.
**Expected:** all signals appear grouped (Database / Application / Edge), each with current value + unit, ~1h sparkline, live alarm state (OK / In-Alarm / No-Data), healthy/warning/critical color, and current/max headroom where a ceiling exists; an overall banner reads all-green.

### US2 — A ceiling starts to bite
RDS connections climb past the 140 warning line toward the ~200 ceiling.
**Expected:** within one refresh (~≤60s) the connections row turns warning→critical, its alarm shows In-Alarm, and the overall banner reflects the worst state. (The existing SNS path independently alerts the operator's phone.)

### US3 — CloudWatch unreachable
The aggregation call fails or times out (permissions revoked, network blip).
**Expected:** the panel shows last-known values with a clear "data stale" flag and does **not** blank or crash the SysAdmin console.

### US4 — Non-admin blocked
A non-SysAdmin user attempts to reach the tab or the endpoint.
**Expected:** no tab is shown; the endpoint returns 403. Enforced server-side.

### US5 — Headroom stays honest
The displayed ceilings (`138 / ~200` connections, `18 / 25` instances) are read live.
**Expected:** if the RDS instance class or App Runner autoscaling `MaxSize` changes, the displayed ceiling updates automatically — no stale hardcoded max.

### US6 — Many admins, few calls
Several SysAdmins view the panel at once.
**Expected:** a short server-side cache means CloudWatch is not queried per-viewer; the endpoint stays within cost/rate limits.

---

## Functional Requirements

### FR-001 — Access (SysAdmin only)
A "System Health" tab in the SysAdmin console, reachable by SysAdmin role only, enforced server-side.
**Acceptance:**
- [ ] SysAdmin sees and can open the tab
- [ ] Non-SysAdmin sees no tab and gets 403 from the endpoint

### FR-002 — Aggregation endpoint
One server-side endpoint (`GET /api/admin/system-health`) returns a single JSON payload of current values, ~1h trend series, alarm states, and ceilings, fetched with the server's AWS identity.
**Acceptance:**
- [ ] Endpoint returns all FR-003 signals in one response
- [ ] SysAdmin authz enforced on the route

### FR-003 — Signals shown, grouped
- *Database (RDS `wxkanban`, us-east-1):* connections, CPU, freeable memory, free storage, CPU-credit balance
- *Application (App Runner `wxKanban`, us-east-2):* active instances, 5xx
- *Edge (CloudFront `E3EOUZIK5I2I1W`):* 5xx error rate
**Acceptance:**
- [ ] All listed signals render, grouped by section

### FR-004 — Per-metric row (columns)
Each metric row shows: name · current value + unit · ~1h trend sparkline · live alarm state · healthy/warning/critical color.
**Acceptance:**
- [ ] Each row renders all five columns
- [ ] Sparkline reflects ~last 60 min

### FR-005 — Headroom context
Where a metric has a known ceiling, show current-vs-max (e.g. `138 / ~200` connections, `18 / 25` instances), ceiling read live.
**Acceptance:**
- [ ] Capped metrics show current/max; max derives from live describe calls

### FR-006 — Overall banner
A top summary: all-green, or a count of warnings/criticals + the worst state.
**Acceptance:**
- [ ] Banner reflects the worst current metric/alarm state

### FR-007 — Auto-refresh
Updates every ~30–60s without full reload; shows "last updated HH:MM:SS" + a manual refresh.
**Acceptance:**
- [ ] Values refresh on interval with no page reload; timestamp updates; manual refresh works

### FR-008 — Single source of truth for thresholds
Warning/critical colors derive from the **same thresholds as the CloudWatch alarms** (read live from `DescribeAlarms`), so the panel can never disagree with what alerts the operator.
**Acceptance:**
- [ ] Coloring uses the live alarm thresholds, not a separate hardcoded set

### FR-009 — Graceful degradation
On CloudWatch error/timeout, show last-known values + a "data stale" flag; never blank or crash the console.
**Acceptance:**
- [ ] Simulated CloudWatch failure → stale flag shown, console intact

### FR-010 — Read-only / least privilege
No AWS writes; server identity gets only read perms (`cloudwatch:GetMetricData`, `cloudwatch:DescribeAlarms`, `rds:DescribeDBInstances`, `apprunner:DescribeService` + `DescribeAutoScalingConfiguration`).
**Acceptance:**
- [ ] IAM policy is read-only; feature calls zero write APIs

### FR-011 — Efficient + cached
Batch into a single `GetMetricData` call (per region) and apply a ~15–30s server-side cache; endpoint target < ~2s.
**Acceptance:**
- [ ] Repeated loads within the cache window issue no new CloudWatch calls
- [ ] Typical response < ~2s

---

## Technical Sections

### Aggregation endpoint (`src/server/...` → `GET /api/admin/system-health`)
SysAdmin-gated route. Issues one batched `GetMetricData` per region (us-east-1 for RDS + CloudFront, us-east-2 for App Runner), `DescribeAlarms` for state + live thresholds, and `DescribeDBInstances` / `DescribeService` + `DescribeAutoScalingConfiguration` for ceilings. Merges into one payload. Wraps results in a ~15–30s in-process cache (FR-011). Uses `db/client.ts` only if any persistence is later needed — none required for v1.

### IAM (hard prerequisite, D-1)
The App Runner `wxKanban` service needs an **instance role** with a read-only policy (`cloudwatch:GetMetricData`, `cloudwatch:DescribeAlarms`, `rds:DescribeDBInstances`, `apprunner:DescribeService`, `apprunner:DescribeAutoScalingConfiguration`). If the service has no instance role today, create one and attach the policy. Handled as an infra step alongside implementation; the endpoint cannot render without it.

### Multi-region merge
Metrics span us-east-1 and us-east-2; the endpoint queries both and merges, handling each region independently so one region's failure degrades gracefully (FR-009) rather than failing the whole payload.

### Frontend (SysAdmin console)
A "System Health" tab rendering grouped metric rows in columns (name / value / sparkline / alarm-state / color), the overall banner, last-updated + manual refresh, and the stale indicator. A small sparkline component (~1h series, no axes/chrome). Polls the endpoint on the FR-007 interval.

### Live thresholds & ceilings (decision)
Thresholds come from `DescribeAlarms` (the alarm's own `Threshold`); ceilings from the describe calls (RDS class → derived max_connections; App Runner `MaxSize`). No hardcoded thresholds/ceilings — eliminates drift (R-1) by construction.

### Conventions
TypeScript 100% (no `any`), Pino logging (no console.log), fences written via `implement`. No new Drizzle tables. Implement via `createSpecs` → `implement`.

---

## Success Criteria

1. **One-glance health.** A SysAdmin (only) sees every FR-003 signal with value, unit, color, alarm state, sparkline, and current/max headroom. *(FR-001, 003, 004, 005)*
2. **Headline reads at a glance.** Overall banner reflects the worst current state. *(FR-006)*
3. **Responsive to reality.** A metric crossing warning, or an alarm entering In-Alarm, shows within one refresh (~≤60s). *(FR-007, 008)*
4. **Fails safe.** With CloudWatch unreachable, the panel shows last-known + "data stale" and never crashes the console. *(FR-009)*
5. **Cheap & fast.** Endpoint < ~2s typical; loads within the cache window make no new CloudWatch calls. *(FR-011)*
6. **Locked down.** Non-SysAdmins get no tab / 403. *(FR-001)*
7. **Read-only.** The feature calls zero AWS write APIs (read-only policy proves it). *(FR-010)*

---

## Constraints & Notes

### Constraints
- **Read-only, least privilege.** No AWS writes; scoped read-only IAM.
- **No drift.** Thresholds + ceilings read live, never hardcoded.
- **SysAdmin-only**, server-enforced.
- **Efficient.** One batched `GetMetricData` per region + short cache; never per-viewer fan-out.

### Out of Scope (own later scope if wanted)
- Alarm create/edit/delete from the UI.
- Deep historical analytics and log search.
- Notification delivery (SNS/Pushover own it).
- Auto-remediation / scaling actions.
- Cost/billing views (AWS Budget covers cost; possible future tab).
- Multi-environment / multi-account.

### Dependencies
- **D-1 (hard):** App Runner instance role with read-only CloudWatch/describe perms.
- **D-2:** The `wxkanban-alerts` SNS topics + 8 CloudWatch alarms (provisioned 2026-06-23) — alarm names/namespaces are a contract.
- **D-3:** Multi-region reads (us-east-1 + us-east-2).
- **D-4:** Existing SysAdmin console + role framework (SCOPE-014).

### Notes
- **Process:** authored in-conversation (orchestrator buildscope CLI bypassed per current kit state); implement via `createSpecs` → `implement`.
- **Decisions captured:** sparkline IN for v1 (current value + ~1h trend + alarm state, column layout); thresholds + ceilings read live from CloudWatch/describe APIs; alerting stays AWS-side (this is the view, not the safety net).
