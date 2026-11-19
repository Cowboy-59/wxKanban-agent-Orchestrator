# Tasks: Cancelled-Company Data Archival (SPEC-132)

Umbrella scope: `specs/Project-Scope/130-subscription-cancellation-and-data-archival.md`
Spec: `specs/132-cancelled-company-archival/spec.md`
Created 2026-09-21 by `createSpecs` (SCOPE-130 fan-out). DB spec id `01a94cb4-a10e-4317-a0e4-c8280c641300`.

Fence label for this spec's code is `[SCOPE 132 / Tnnn]`. Fences are written by `implement`,
never by hand.

**T001 gated SPEC-131 — that gate is now OPEN.** The DDL was hand-applied on the owner connection
and verified against `information_schema.columns` on 2026-09-22 (change-log entry:
`specs/117-production-schema-integrity/schema-change-log.md`). T002 and all of SPEC-131 are clear to
start. Note `db:drift` cannot confirm column-level changes — it passed before the apply too.

**Arming order is not negotiable:** T018 (backfill) → T019 (dry-run review + P1.1 sign-off) →
only then `SUBSCRIPTION_ARCHIVAL_ENABLED=on`.

| # | Task | Priority | Status | FRs |
|---|------|----------|--------|-----|
| T001 | DDL: the four timestamp columns on `companies` | critical | **done — applied + verified 2026-09-22** | FR-001 |
| T002 | Declare the columns in `schema/company.ts` **after** they exist in production | high | **done — verified via live drizzle select 2026-09-22** | FR-001 |
| T003 | `subscriptionArchivalJob.ts` with `off`/`dryrun`/`on` modes | critical | **done** | FR-003 |
| T004 | Wire the job into `index.ts` and log its mode at boot | high | **done** | FR-003, FR-009 |
| T005 | Selection query — `cancelledat` only, every skip rule, per-run cap | critical | todo | FR-002 |
| T006 | Transfer `companyprojects` to the archive target, from configuration | critical | todo | FR-004 |
| T007 | Re-point the six tables carrying `companyid` alongside `projectid` | high | todo | FR-004 |
| T008 | Assert `projectid`-only tables untouched and no orphans remain | high | todo | FR-004 |
| T009 | Guard the audit store and company-scoped tables against modification | critical | todo | FR-005 |
| T010 | Scrub the company row with deterministic, collision-free values | high | todo | FR-006 |
| T011 | Scrub user rows, destroy credentials, invalidate sessions | critical | todo | FR-006 |
| T012 | Scrub `projectinvoices` and sever `projectid` | high | todo | FR-008 |
| T013 | Deactivate users at effective cancellation, exempting one ADMIN | high | todo | FR-007 |
| T014 | One transaction per company, `archivedat` stamp, provable idempotency | critical | todo | FR-003, FR-006 |
| T015 | Archival manifest audit row | high | todo | FR-011 |
| T016 | Pre-archival warning email, seven days out, exactly once | medium | todo | FR-010 |
| T017 | SYSADMIN archival-queue endpoint and panel | medium | todo | FR-009 |
| T018 | Backfill `cancelledat` for the four pre-existing `CANCELED` companies | high | todo | FR-012 |
| T019 | Dry-run review over exactly those four, then the integrity gate | critical | todo | FR-003, FR-012 |
| T020 | Seeded-fixture test for the invoice scrub | high | todo | FR-008 |

---

## T001 — The four timestamp columns
Add `cancelrequestedat`, `cancelledat`, `pausedat`, `archivedat` (nullable timestamps) to
`companies`. Per SCOPE-117 there is no migration ledger and nothing auto-applies DDL: produce
reviewed SQL, apply **by hand**, record it in
`specs/117-production-schema-integrity/schema-change-log.md`, verify with `npm run db:drift`.
`drizzle-kit push` is **prohibited** here — it would propose dropping the ~19
undeclared-but-live tables. Note `db:drift` is **table-level only** and exits 0 while declared
*columns* are missing, so check column presence explicitly.

## T002 — Declare only after the column exists
Ordering is not cosmetic: Drizzle SELECTs every declared column, so declaring ahead of the DDL
returns production 500s. Declare in `src/db/schema/company.ts` once T001 is verified present.

## T003 — The sweep job
New `src/server/jobs/subscriptionArchivalJob.ts` on the `infraHealthJob` start/stop pattern.
**Must not use** `src/server/services/jobScheduler.ts`: it holds jobs in an in-memory `Map` of
`setTimeout`/`setInterval` handles, so every App Runner redeploy silently forgets them and a
30-day timer would never fire. The wait lives in the database as a date and is *discovered* by a
daily sweep. `SUBSCRIPTION_ARCHIVAL_ENABLED` defaults to `off`.

## T004 — Wire it in, and announce the mode
Register start/stop beside `startInfraHealthJob` in `src/server/index.ts`, plus exactly one boot
line naming the active mode. This project has shipped a subscription gate off, a welcome message
inert, and a compliance context that loaded for nobody — the boot line is the standing
counterweight for a destructive job that defaults to off. **It is not log noise; do not trim it.**

## T005 — Selection
Select `cancelledat` older than the window. Skip unconditionally: `cancelledat IS NULL`, `PAUSED`,
`billingexempt`, `archivedat IS NOT NULL`. **No code path may derive an archival date from
`updatedat`** — the four pre-existing `CANCELED` companies carry `updatedat` values months old for
unrelated reasons, so an `updatedat` heuristic archives all four unreviewed on the first run.
Enforce a per-run cap.

## T006 — Transfer the projects
Re-point `companyprojects.companyid` → `019d4ff7-527e-7627-92a0-13eaf5e16ee8` (HAS Enterprises
LLC) and `.userid` → `019d4ff7-52b5-724d-b0ad-b37f5c331199` (`andy@ccscowboy.com`, `usertype
ADMIN` — chosen over the TEAM_MANAGER in that same company so a transferred project lands with an
owner who can administer it). Both ids are **configuration, never literals**. The job aborts
**without writing** if either target fails to resolve at run time. Note the project table is
`companyprojects`, not `projects`.

## T007 — The six dual-keyed tables
`projecttimeentries`, `projectproposals`, `aispecsessions`, `overviewdrafts`,
`feedbacksubmissions` carry `companyid` as well as `projectid`, so they must be re-pointed
explicitly or they keep pointing at the departing company while their project has moved.

## T008 — Prove nothing was orphaned
Roughly 36 tables key only on `projectid` and follow the parent for free — `projecttasks`,
`projectphases`, `notes`, `testplans`, `taskfences` and the rest. They **must not** be rewritten.
Add a post-run assertion that zero `projectid` values resolve to a project outside the archive
company.

## T009 — The audit store is untouchable
`companyauditlogs`, `company_status_history` and `credentialauditlogs` must not be modified at
all — not transferred, not scrubbed, not pruned. SOC 2 **CC7.2** requires an audit store the
acting party cannot alter, and this job is an acting party. The 21 company-scoped tables
(`companysubscriptions`, `marketing*`, `campaigns`, theme tables, `notificationsettings` and the
rest) keep their original `companyid` — transferring a marketing opt-in would attribute one
company's consent to another. Verify by row count and checksum before and after.

## T010 — Scrub the company row
Anonymize `name`, `contactemail`, `address`, `phone`, `billingemail`, `logourl` in place. The row
is **never deleted**: it remains the FK target of `companyauditlogs`, `companysubscriptions` and
`company_status_history`. `contactemail` and `referralcode` are unique-constrained, so scrub
values must derive from the row id — a shared literal makes the second archival of the day die on
a duplicate key.

## T011 — Scrub users; destroy credentials
Anonymize `emailaddr`, `fullname`, `avatarurl`, `pendingemail`; set `active = false`. Credentials
are **destroyed, not anonymized**: overwrite `password` with an unusable value and null `clientid`
and `clientsecret`, so a scrubbed account cannot be signed into by anyone — including whoever
holds the original password. Clear `payrate`, `payratemethod`, `dashboardconfig`. Invalidate live
`sessions` rows so an open session cannot outlive the scrub. `emailaddr` is unique-constrained —
derive from the row id. User rows are never deleted: they remain the FK target of
`projecttimeentries.userid`, `projectusers`, `projectteam` and `dutyassignment` on the projects
that just moved.

## T012 — Invoices
They stay with the departing company — transferring them would post one company's revenue as
another's — and are anonymized: clear `clientemail`, `billedto`, `description`, `downloadurl`;
preserve `invoicenumber`, `totalamount`, `hoursworked`, `generatedat`, `createdat` so financial
history stays auditable in aggregate. Set `projectid` to **NULL**: otherwise a row owned by
company A references a project owned by company B, the cross-tenant join SCOPE-043 was opened
for. `projectid` is nullable; `companyid` is `NOT NULL`, which is why the row stays rather than
being orphaned. Also deal with any stored PDF behind `downloadurl` — clearing the column while
leaving a retrievable rendered invoice defeats the requirement.

## T013 — Deactivate at effective cancellation, keep one ADMIN
At effective cancellation — **not** at the click — set all users `active = false` except one
ADMIN. Deactivating at the click would strip seats already paid for, contradicting the period-end
cancellation. And `userprofiles.active = true` is the filter both `StripeWebhookHandler.ts:397`
and `SubscriptionRecoveryService.ts:341` use to find someone to email, so deactivating everyone
makes the company uncontactable about its own cancellation and trips
`CompanyInvariants.assertCompanyHasAtLeastOneAdmin`, which throws on zero active ADMINs. The
surviving ADMIN must still sign in, reach the wall and resubscribe. At archival the last ADMIN is
deactivated too, without invoking the invariant against an archived company.

## T014 — One transaction, idempotent
Each company's archival is a single transaction — a partial archival must be impossible. Stamp
`archivedat`; a second run the same day is a no-op. Verify **0 rows deleted** and **0 broken
foreign keys** across all 77 company/project/user-keyed tables with a post-run integrity check.

## T015 — The manifest
Each archival writes a `company_status_history` row (`changedByType = SYSTEM`) recording the
target company, target owner, and per-table row counts of everything moved and scrubbed —
complete enough to answer "where did this customer's data go" without reading the job's source.

## T016 — Warning email
Seven days out, to the surviving active ADMIN: the date, what moves, the resubscribe link. Not
re-sent on later sweeps. A resubscribe before the window closes clears `cancelledat` and cancels
the archival entirely. Email failure never blocks or aborts the transaction.

## T017 — SYSADMIN queue
`GET /api/sysadmin/archival-queue` with an explicit SYSADMIN role guard (SOC 2 **CC6.3**),
returning pending archivals with `cancelledat` and computed archival date, any
`cancelledat IS NULL` stragglers, and the last run's outcome. New `ArchivalQueuePanel.tsx` under
`src/client/pages/SysAdmin/`.

## T018 — Backfill the four legacy companies

| Company | Id | `updatedat` |
|---|---|---|
| CPC | `019ee07e-0113-74b0-909e-6f20181bcbdf` | 2026-06-19 |
| McM Tech Solutions | `01a01abf-94b4-774e-89a0-dded7f780eb4` | 2026-08-19 |
| MIRALTEC INFORMÁTICA, S.L.L. | `019f3b5a-091b-77ad-83b2-a0154a97a812` | 2026-08-27 |
| JCA Software | `019f2aed-e170-708c-9915-9a1e426e8e62` | 2026-08-27 |

Applied by hand as reviewed SQL per SCOPE-117, recorded in the schema-change log with its
rationale. **Exactly 4 rows updated**, keyed on those four ids and never on `subscriptionstatus`.
`updatedat` is weak evidence and is accepted for these four rows *only* by explicit decision —
which is why this is a one-time statement and not a rule the job applies. `activeflag` is
inconsistent across them (2 true, 2 false); do not normalize it.

## T019 — Dry run, then the gate
Order is enforced: T018 backfill → a `dryrun` naming exactly these four companies, their 7
projects and their 4 users while moving nothing → only then arm. The dry-run output is the
compensating control for SOC 2 **CC5.2**, whose separation of duties cannot be met on a
single-operator project. Mode `on` is not enabled in production until the SOC 2 **P1.1** sign-off
on the T010/T011/T012 scrub field lists is recorded. Verify 0 broken FKs and 0 cross-tenant
references.

## T020 — Seeded fixture for the invoice path
The four backfilled companies hold **0 invoices** between them, so the first armed run exercises
the invoice path against no data at all. Build a fixture with invoices attached to a transferred
project and assert: identity columns cleared, financial columns intact, `projectid` NULL, and no
cross-tenant reference surviving.
