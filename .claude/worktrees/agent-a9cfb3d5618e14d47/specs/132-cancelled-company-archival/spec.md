# SPEC-132: Cancelled-Company Data Archival

**Spec Number**: SPEC-132
**Umbrella Scope**: SCOPE-130 (`specs/Project-Scope/130-subscription-cancellation-and-data-archival.md`)
**Status**: `planned`
**Created**: 2026-09-21
**Implements**: SCOPE-130 FR-008 – FR-014, FR-015 (pre-archival warning), FR-016 (archival manifest), FR-018, FR-019
**Depends On**: SPEC-131 — consumes the `cancelledat` stamp its period-end webhook writes
**Provides To**: SPEC-131 — the four timestamp columns (T001) are a prerequisite for that spec's writes

> Fence label for this spec's code is `[SCOPE 132 / Tnnn]`.

---

## Overview

Thirty days after a cancellation takes effect, a company's work is moved somewhere it stays reachable and the company's identity is erased. This spec builds that window and the job that closes it.

The chosen model is **transfer and scrub, never delete**. Projects and project-scoped data are re-pointed to a designated archive company under an ADMIN owner; the departing company row, its user rows and its invoices are anonymized in place. Not a single row is deleted anywhere in this spec.

That is not squeamishness — it is what keeps the database coherent. The departing company remains the foreign-key target of `companyauditlogs`, `companysubscriptions` and `company_status_history`; its users remain the target of `projecttimeentries.userid`, `projectusers`, `projectteam` and `dutyassignment` on the projects that just moved. Deleting the company would cascade the audit trail away, and deleting the users would strand the transferred work. Scrubbing achieves the actual goal — the customer's identity is gone, their work survives somewhere owned — with none of that damage, and it keeps the SOC 2 audit store intact (CC7.2).

The retention promise already exists in the product and is a fiction. `SysAdminCompanyService.deleteCompany()` reports `"Data will be retained for {n} days"` to the operator and writes a `retentionDate` into a `jsonb` metadata blob that **nothing in the codebase reads** — grep returns zero readers. This spec makes the promise real.

## Business Problem

Cancelled companies accumulate forever. Production holds **four** of them right now — CPC, McM Tech Solutions, MIRALTEC INFORMÁTICA S.L.L. and JCA Software — carrying seven projects and four still-`active` users between them, cancelled between 2026-06-19 and 2026-08-27 and archived nowhere. Nothing is scheduled to happen to them, because nothing reads the only field that was ever written about their retention.

Three consequences:

1. **An unenforced retention promise.** The operator is told data will be retained 30 days, which implies it will then *not* be. Neither half is true.
2. **Customer PII is held indefinitely with no lifecycle.** Names, email addresses, addresses, phone numbers and password hashes for departed customers sit in the production database with no expiry and no accountable decision behind their retention. Under SOC 2 P1.1 that is new personal-data handling nobody has approved.
3. **Departed customers' work is unreachable but not gone.** Their projects belong to a company whose users are dormant, so the work is neither usable nor disposed of.

There is also a trap sitting in the data. Because `cancelledat` does not exist, the only date available on those four rows is `updatedat` — which last moved months ago for unrelated reasons. A sweep keyed on `updatedat` would judge all four to be long overdue and archive them, unreviewed, on its very first run.

---

## Actors

- Primary: The daily archival sweep job, running unattended, which selects eligible companies and performs the transfer and scrub.
- Secondary: A SYSADMIN reviewing the pending-archival queue and the dry-run output before the sweep is armed; the company's last active ADMIN, who receives the pre-archival warning and may still resubscribe; the Stripe webhook from SPEC-131, whose `cancelledat` stamp starts the clock.

---

## Functional Requirements

### FR-001 — The four timestamp columns
Add `companies.cancelrequestedat`, `companies.cancelledat`, `companies.pausedat`, `companies.archivedat` — all nullable timestamps.
**Acceptance:**
- [ ] Per SCOPE-117 the DDL is reviewed and applied **by hand**, recorded in `specs/117-production-schema-integrity/schema-change-log.md`; `drizzle-kit push` is prohibited against this database
- [ ] `npm run db:drift` passes afterwards
- [ ] Per `reference_drop_column_ordering` the columns are declared in `src/db/schema/company.ts` **only after** they exist in the database — declaring first makes Drizzle SELECT a column that isn't there and returns production 500s
- [ ] SPEC-131 is not merged before this lands, since it writes three of these columns

### FR-002 — Selection keys on `cancelledat` alone
The sweep MUST select on `cancelledat` older than the retention window and MUST NOT infer a date from `updatedat` or any other column.
**Rationale:** the four companies already in `CANCELED` have `updatedat` values months old for unrelated reasons. Any `updatedat`-based heuristic archives all four on the first run without review. The null-skip stays absolute so a *future* row that reaches `CANCELED` without a stamp also fails safe.
**Acceptance:**
- [ ] `cancelledat IS NULL` is skipped unconditionally, before and after the FR-012 backfill
- [ ] `PAUSED` and `billingexempt` companies are never selected
- [ ] `archivedat IS NOT NULL` is skipped — no company is archived twice
- [ ] No code path anywhere derives an archival date from `updatedat`

### FR-003 — The sweep job
A new `src/server/jobs/subscriptionArchivalJob.ts` following the `infraHealthJob` start/stop pattern, wired into `src/server/index.ts`.
**Rationale:** it MUST NOT use `src/server/services/jobScheduler.ts`. That module holds jobs in an in-memory `Map` of `setTimeout`/`setInterval` handles, so every App Runner redeploy silently forgets them — a 30-day timer registered there would never fire. The wait must live in the database as a date and be *discovered* by a recurring sweep.
**Acceptance:**
- [ ] Runs daily and is idempotent — a second run the same day archives nothing twice
- [ ] Modes `off` (default) / `dryrun` / `on` via `SUBSCRIPTION_ARCHIVAL_ENABLED`
- [ ] A per-run cap bounds the blast radius of a bad selection
- [ ] Each company is archived in **one transaction**; a partial archival is impossible
- [ ] Mode `on` is not enabled in production until the SOC 2 P1.1 sign-off on the FR-006/FR-008 scrub field lists is recorded

### FR-004 — Transfer projects and project-scoped data
Re-point the company's projects to the archive target:

| Target | Value |
| --- | --- |
| Archive company | `019d4ff7-527e-7627-92a0-13eaf5e16ee8` — HAS Enterprises LLC (verified live: CONSULTANT, ACTIVE, `maxusers` 999) |
| Archive owner | `019d4ff7-52b5-724d-b0ad-b37f5c331199` — `andy@ccscowboy.com` (verified live: `usertype = ADMIN`, active, member of the above) |

An ADMIN was chosen deliberately over that company's other member, a `TEAM_MANAGER`: a transferred project must land with an owner who can administer it. `companyprojects.companyid` and `.userid` are re-pointed. Tables keyed **only** by `projectid` — roughly 36 of them — follow automatically and MUST NOT be rewritten. Tables carrying `companyid` *and* `projectid` MUST be re-pointed explicitly: `projecttimeentries`, `projectproposals`, `aispecsessions`, `overviewdrafts`, `feedbacksubmissions`.
**Acceptance:**
- [ ] Every transferred project is visible and usable under the archive company
- [ ] **0** orphans: no `projectid` resolves to a project outside the archive company
- [ ] The targets are configuration, not literals compiled into the job
- [ ] The job aborts **without writing** if either target fails to resolve at run time
- [ ] Transferring projects adds no users, so the archive company's seat limit is not engaged

### FR-005 — Company-scoped data stays, and the audit store is untouchable
These MUST NOT be transferred: `companysubscriptions`, `companyauditlogs`, `company_status_history`, `company_analytics`, `companystackprofiles`, `companythemeprofiles`, `notificationsettings`, `userinvitations`, `customers`, `externalconnections`, `importcache`, `credentialauditlogs`, `subscriptiondutytype`, `themeblocks`, `themetemplates`, `campaigns`, `campaignposts`, `marketingassets`, `marketingbanners`, `marketingleads`, `marketinglinks`.
**Acceptance:**
- [ ] After archival these rows still reference the original company id
- [ ] `companyauditlogs`, `company_status_history` and `credentialauditlogs` are **not modified at all** — not transferred, not scrubbed, not pruned. SOC 2 CC7.2 requires an audit store the acting party cannot alter, and this job is an acting party
- [ ] No marketing contact or consent record changes owner — transferring an opt-in would attribute one company's consent to another

### FR-006 — Scrub the company and its users; destroy credentials
Anonymize in place. No row is deleted.
**Acceptance:**
- [ ] Company `name`, `contactemail`, `address`, `phone`, `billingemail`, `logourl` carry no recoverable PII
- [ ] User `emailaddr`, `fullname`, `avatarurl`, `pendingemail` carry no recoverable PII, and `active = false`
- [ ] **Credentials are destroyed, not anonymized**: `password` overwritten with an unusable value; `clientid` and `clientsecret` nulled. A scrubbed account must not be sign-in-able by anyone, including whoever holds the original password
- [ ] `payrate`, `payratemethod`, `dashboardconfig` cleared — commercially sensitive, no further use
- [ ] Scrub values are **deterministic and collision-free**, derived from the row id: `companies.contactemail`, `companies.referralcode` and `userprofiles.emailaddr` are unique-constrained, so a shared literal makes the second archival of the day die on a duplicate key
- [ ] Live `sessions` rows for scrubbed users are invalidated, so an open session cannot outlive the scrub
- [ ] Every foreign key across all 77 company/project/user-keyed tables still resolves
- [ ] `archivedat` is stamped

### FR-007 — Deactivate users at effective cancellation, one ADMIN exempt
At effective cancellation — **not** at the click — all the company's users are set `active = false` **except one ADMIN**, who stays active until archival.
**Rationale:** two reasons, both load-bearing. Deactivating at the click would strip seats already paid for, contradicting the period-end cancellation. And `userprofiles.active = true` is the filter both `StripeWebhookHandler.ts:397` and `SubscriptionRecoveryService.ts:341` use to find someone to email — deactivating everyone makes the company uncontactable about its own cancellation, and trips `CompanyInvariants.assertCompanyHasAtLeastOneAdmin`, which throws on zero active ADMINs.
**Acceptance:**
- [ ] Exactly one ADMIN stays active between effective cancellation and archival
- [ ] That ADMIN can sign in, reach the wall, and resubscribe
- [ ] `assertCompanyHasAtLeastOneAdmin` is satisfied throughout
- [ ] `TierEnforcementService` seat counts reflect the deactivation
- [ ] At archival the last ADMIN is deactivated too, and the invariant is not invoked against an archived company
- [ ] The FR-012 companies never ran this step, so archival must tolerate a company whose users are still active

### FR-008 — Invoices scrubbed in place, detached from their transferred project
`projectinvoices` rows stay with the departing company and are anonymized. `clientemail`, `billedto`, `description`, `downloadurl` are scrubbed; `invoicenumber`, `totalamount`, `hoursworked`, `generatedat`, `createdat` are preserved. `projectid` MUST be set to NULL.
**Rationale:** the invoice belongs to the company that raised it, so transferring it would post one company's revenue as another's. But its `projectid` points at a project that has just moved, leaving a row owned by company A referencing a project owned by company B — the cross-tenant join SCOPE-043 was opened for. `projectid` is nullable so severing it is clean; `companyid` is `NOT NULL`, which is why the row must stay rather than be orphaned.
**Acceptance:**
- [ ] **0** `projectinvoices` rows reference a project belonging to another company
- [ ] Totals and invoice numbers unchanged — financial history stays auditable in aggregate
- [ ] `clientemail`, `billedto`, `description`, `downloadurl` carry no recoverable PII
- [ ] Any stored PDF behind `downloadurl` is dealt with; clearing the column while leaving a retrievable rendered invoice defeats the requirement
- [ ] Tested against a **seeded fixture** — the FR-012 companies hold 0 invoices, so the first armed run exercises this path against no data

### FR-009 — A disarmed destructive job must announce itself
One log line at boot naming the active mode, and a SYSADMIN queue showing pending archivals with each company's `cancelledat` and computed archival date.
**Rationale:** this project has shipped a subscription gate off, a welcome message inert, and a compliance context that loaded for nobody. A destructive job defaulting to `off` needs a standing counterweight. **This is not log noise — do not trim it.**
**Acceptance:**
- [ ] Exactly one boot line states the mode
- [ ] The queue lists pending archivals, any `cancelledat IS NULL` stragglers, and the last run's outcome

### FR-010 — Pre-archival warning email
Seven days before archival, email the surviving active ADMIN: the date, what moves, and the resubscribe link.
**Acceptance:**
- [ ] Exactly one warning per company; not re-sent on subsequent sweeps
- [ ] A resubscribe before the window closes clears `cancelledat` and cancels the archival entirely
- [ ] Email failure never blocks or aborts the transaction

### FR-011 — Archival manifest audit row
Each archival writes a `company_status_history` row recording the target company, target owner, and per-table row counts of everything moved and scrubbed.
**Acceptance:**
- [ ] The manifest is complete enough to answer "where did this customer's data go" without reading the job's source
- [ ] `changedByType` is `SYSTEM`
- [ ] Satisfies SOC 2 CC7.2 — recorded in a table separate from the rows changed

### FR-012 — One-time backfill of the four pre-existing CANCELED companies
Backfill `cancelledat` so they archive under the normal rule instead of sitting indefinitely:

| Company | Id | Evidence (`updatedat`) | Projects / Users / Invoices |
| --- | --- | --- | --- |
| CPC | `019ee07e-0113-74b0-909e-6f20181bcbdf` | 2026-06-19 | 0 / 1 / 0 |
| McM Tech Solutions | `01a01abf-94b4-774e-89a0-dded7f780eb4` | 2026-08-19 | 1 / 1 / 0 |
| MIRALTEC INFORMÁTICA, S.L.L. | `019f3b5a-091b-77ad-83b2-a0154a97a812` | 2026-08-27 | 4 / 1 / 0 |
| JCA Software | `019f2aed-e170-708c-9915-9a1e426e8e62` | 2026-08-27 | 2 / 1 / 0 |

All four are already more than 30 days past those dates, so they become eligible the moment the sweep is armed.
**Rationale:** `updatedat` is weak evidence — any unrelated row update would have moved it. It is accepted as good enough for these four specific rows by explicit decision, which is exactly why this is a one-time reviewed statement and not a rule the job applies.
**Acceptance:**
- [ ] Applied by hand as reviewed SQL per SCOPE-117 and recorded in the schema-change log with its rationale
- [ ] Exactly **4** rows updated; the statement is keyed on those four ids, never on `subscriptionstatus`
- [ ] `activeflag` is inconsistent across them (2 true, 2 false) and the backfill does not attempt to normalize it
- [ ] Order enforced: **backfill → review a `dryrun` naming exactly these four → only then arm**

---

## Success Metrics

1. **100%** of companies whose `cancelledat` exceeds the retention window are processed, and **0%** of those where it is null — verified by a `dryrun` naming exactly the four FR-012 companies, their 7 projects and their 4 users, and moving nothing.
2. **0** rows deleted and **0** broken foreign keys across all 77 company/project/user-keyed tables after an archival, verified by a post-run integrity check.
3. **100%** of transferred projects reachable under the archive company, with **0** orphaned `projectid` references.
4. **0** PII fields recoverable on an archived company, its users or its invoices, confirmed by direct query — and **0** scrubbed accounts that can still authenticate, confirmed by attempting sign-in with the pre-scrub password.
5. **0** cross-tenant references after archival: no `projectinvoices` row points at another company's project.
6. **0** modifications to `companyauditlogs`, `company_status_history` or `credentialauditlogs`, verified by row-count and checksum before and after.
7. **1** archival manifest row per archived company, and **1** boot line per process start naming the sweep's mode.

## Scope Boundary

In scope: the four timestamp columns and their hand-applied DDL; the daily sweep job with `off`/`dryrun`/`on` modes and a per-run cap; selection keyed strictly on `cancelledat`; transfer of projects and the six `companyid`+`projectid` tables to the archive target; the untouchability guarantee for company-scoped and audit tables; scrubbing of the company row, user rows and credentials with session invalidation; invoice scrubbing with `projectid` severed; user deactivation at effective cancellation with one ADMIN exempt; the pre-archival warning email; the archival manifest audit row; the SYSADMIN queue and boot-mode notice; the one-time backfill of the four legacy companies.

## Out of Scope

Excluded: everything that produces the `cancelledat` stamp — the cancel and suspend endpoints, the panel UI, the period-end webhook and the cancellation email all belong to **SPEC-131**. Also excluded: hard deletion of any row, in any circumstance; a customer-facing data-export or GDPR-erasure surface; reconciling the sysadmin-side `deleteCompany()` path so it stamps `cancelledat` too (a deliberate deferral — it widens the change into the sysadmin surface); making the retention window configurable per company; arming the sweep in production, which is an operational decision taken after the dry-run review and the P1.1 sign-off; any reclaim path for a customer who resubscribes *after* archival.

---

## Data Requirements

New columns on `companies`: `cancelrequestedat`, `cancelledat`, `pausedat`, `archivedat` (nullable timestamps). No migration ledger exists in production and nothing auto-applies DDL (SCOPE-117) — edit `src/db/schema/`, produce reviewed SQL, apply by hand, verify with `npm run db:drift`, record in the schema-change log. Note `npm run db:drift` is **table-level only** and exits 0 while declared *columns* are missing, so column presence must be checked explicitly.

The project table is **`companyprojects`**, not `projects`. 77 live tables carry a `companyid` / `projectid` / `userid` key.

Re-pointed on transfer: `companyprojects` (`companyid`, `userid`), then `projecttimeentries`, `projectproposals`, `aispecsessions`, `overviewdrafts`, `feedbacksubmissions`.

Following automatically via `projectid` and explicitly **not** rewritten: `projecttasks`, `projecttasknotes`, `projectphases`, `projectdocuments`, `projectspecifications`, `projectteam`, `projectusers`, `projectthemes`, `projectkits`, `projectkitfiles`, `projectlicenses`, `projectprofilexref`, `notes`, `events`, `testplans`, `testplanitems`, `testruns`, `testcycles`, `testitemsubjects`, `taskfences`, `taskfencehistory`, `taskfenceslegacy`, `scopedependencies`, `capabilityindex`, `phasetransitionlogs`, `dutyassignment`, `teamprojectduty`, `engagementassignments`, `aiproposals`, `complianceoverride`, `appauditconfiguration`, `mcpapitokens`, `mcpdriftevents`, `mcprequestaudit`, `mcpupdateadoptions`, `timeEntry`.

Scrubbed in place: `projectinvoices` — identity columns `clientemail`, `billedto`, `description`, `downloadurl` cleared; financial columns `invoicenumber`, `totalamount`, `hoursworked`, `generatedat` preserved; `projectid` set to NULL.

`userprofiles` scrub surface, wider than PII alone: `emailaddr`, `fullname`, `avatarurl`, `pendingemail` (identity); `password`, `clientid`, `clientsecret` (**credentials — destroyed**); `payrate`, `payratemethod`, `dashboardconfig` (commercially sensitive). Plus `sessions` invalidation.

## API Routes

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/sysadmin/archival-queue` | Pending archivals, `cancelledat IS NULL` stragglers, last run outcome — SYSADMIN-gated |

The sweep itself has no HTTP surface; it is a background job. Per SOC 2 CC6.3 the queue route carries an explicit SYSADMIN role guard.

## Frontend Components

| Component | Path | Notes |
| --- | --- | --- |
| `ArchivalQueuePanel` | `src/client/pages/SysAdmin/ArchivalQueuePanel.tsx` | New — pending-archival visibility (FR-009) |

Built with shadcn components per `_wxAI/rules/shadcn.md`.

## Integration Context

Aligns with **SCOPE-117** (production schema integrity — all DDL hand-applied and logged, `drizzle-kit push` prohibited), **SCOPE-126** (customer data sovereignty and audit readiness, which constrains what may be destroyed and is why FR-005 forbids touching the audit store), **SCOPE-043** (cross-tenant disclosure, the reason FR-008 severs `projectinvoices.projectid`), and **SPEC-131**, whose period-end webhook produces the only signal this spec acts on.

SOC 2 is the sole enabled framework. The controls that bear here are CC7.2 (audit trail in a separate, unalterable store — FR-005, FR-011), CC6.3 (explicit role guard on the queue route), CC8.1 (hand-applied DDL traced to a tracked item — FR-001, FR-012) and **P1.1 (a named person must approve new personal-data handling)**, which gates arming the sweep. CC5.2's separation of duties cannot be met on a single-operator project; the compensating control is the mandatory dry-run review in FR-003 and FR-012.

## Open Questions

1. Is 30 days the right window, and should it be configurable? It exists today only as a default argument (`retentionDays = 30`) on a function nothing calls — fixed constant, env var, or per-company override?
2. Should `SysAdminCompanyService.deleteCompany()` be reconciled to stamp `cancelledat`? It currently writes `CANCELLED` (two L, a spelling production never contains) plus the unread `retentionDate`. Left out deliberately; including it widens this spec into the sysadmin surface.

   > **Still open, but narrowed — 2026-09-22 (SPEC-131 Amendment C).** The sysadmin surface now has a *correct* cancellation path: `POST /api/sysadmin/companies/:id/cancel-subscription` runs the SPEC-131 engine, calls Stripe, stamps `cancelrequestedat`, and lets the period-end webhook stamp `cancelledat` — so an operator who wants a real cancellation has one, and this spec's clock starts properly for it.

   > `deleteCompany()` itself is **unchanged and still divergent**: it flips local status, never contacts Stripe, and writes a `retentionDate` nothing reads. Both controls now sit in the same company list, which makes the divergence easier to hit, not harder — an operator reaching for Delete still gets the fiction. Reconciling or retiring it remains this question's subject.
3. Does a resubscribe *after* archival restore anything? Once projects have moved and users are scrubbed, a returning customer starts fresh — acceptable, or is a reclaim path needed?
4. Should the archive company's project count be bounded? HAS Enterprises LLC holds 1 project today and will accumulate every departed customer's work indefinitely, which eventually makes its own dashboards unusable.
