# Tasks: Admin & Company Management System (Feature 002)

**Branch**: `002-admin-management`
**Input**: plan.md, spec.md, data-model.md, contracts/api-contracts.md, research.md
**Generated**: 2026-02-19
**Updated**: 2026-02-19 — post-clarify: three-tier usertype, T002/T003/T015/T022/T033/T034 revised; T015a/T015b/T023a/T035/T036 added
**Total Tasks**: 70
**User Stories**: 5 (US1–US5)

**Key Finding**: DB schemas, services, and routes exist from prior sessions. Tasks target updates and new components.

---

## Phase 1: Setup

- [ ] T001 Confirm on branch `002-admin-management` (git checkout 002-admin-management from repo root)

---

## Phase 2: Foundational — DB Schema + Shared Middleware

_Must complete before any user story. Human runs migration after T007._

- [x] T002 [P] Update `src/db/schema/company.ts` — add/verify fields: `billingplan` default `'FREE'`, `subscriptionstatus` (ACTIVE/PENDING/SUSPENDED), `phone` varchar, `maxusers` integer (FREE/SMALL_BUSINESS=5, CONSULTANT=9999, ENTERPRISE=25), `digestconfig` jsonb nullable
- [x] T003 [P] Update `src/db/schema/user.ts` — replace `role` field with `usertype` (ADMIN/TEAM_MANAGER/TEAM_MEMBER, default TEAM_MEMBER); verify `payrate`, `tracktimeflag`, `timezone`, `joinedat`, `lastloginedat`; add `dashboardconfig` jsonb nullable
- [x] T004 [P] Update `src/db/schema/projectuser.ts` — verify `role` (Lead/TeamMember/Observer), `assignedat`, `removedat` fields exist; add any missing
- [x] T005 [P] Update `src/db/schema/userinvitation.ts` — verify `token`, `status` (pending/accepted/expired), `expireseat`, `acceptedat` fields; add any missing
- [x] T006 [P] Verify `src/db/schema/companyauditlog.ts` — confirm `action`, `changedby`, `previousvalue` (JSON), `newvalue` (JSON), `timestamp` fields exist
- [x] T007 [P] Update `src/db/schema/index.ts` — ensure all new/modified schemas are exported
- [ ] T008 **HUMAN TASK**: Run `npm run db:generate && npm run db:migrate` to apply schema changes
- [x] T009 [P] Update `src/server/middleware/auth.ts` — inject `company.billingplan`, `company.subscriptionstatus`, `company.maxusers`, `user.usertype` into JWT-decoded request context
- [x] T010 [P] Create `src/server/middleware/tier.ts` — tier-gate middleware: accepts `requiredPlan` param, returns `403 { error, upgrade: true }` for ineligible plans. Gate order: FREE < SMALL_BUSINESS < CONSULTANT < ENTERPRISE
- [x] T011 [P] Create `src/server/middleware/requireAdmin.ts` — middleware that returns 403 if `req.user.usertype !== 'ADMIN'`
- [x] T012 Update `src/server/services/AuditService.ts` — ensure `logEvent(companyid, action, changedby, prev, next)` method works with new schema
- [x] T013 Update `src/client/context/AuthContext.tsx` — extend user context to include `billingplan`, `subscriptionstatus`, `usertype`, `seatsused`, `seatslimit` loaded from login response

---

## Phase 3: US1 — Company Registration and Plan Selection

_Goal: New company can register, select tier, optionally pay, verify email, and access dashboard._

**Independent Test**: POST `/api/company` with FREE plan → company created, ACTIVE, verification email sent. POST with CONSULTANT → company PENDING, Stripe payment initiated.

- [ ] T014 [P] [US1] Update `src/server/routes/company.ts` — `POST /api/company` endpoint: validate body (name, contactemail, billingplan from enum), call RegistrationService, return 201
- [x] T015 [P] [US1] Update `src/server/services/RegistrationService.ts` — `registerCompany()`: create company record with correct billingplan enum value (FREE/SMALL_BUSINESS → ACTIVE immediately; CONSULTANT/ENTERPRISE → PENDING). Set `maxusers` from tier (5/5/9999/25). Create admin user with `usertype='ADMIN'` (no `role` field). Trigger 24-hour verification email.
- [ ] T015a [P] [US1] Update `src/server/services/VerificationService.ts` — add `bypassVerification(userId, adminId)`: sets `company.verifiedat=NOW()`, activates account, logs audit event `admin_bypass_verify`. Expose via `POST /api/admin/company/:id/verify` (requireAdmin middleware).
- [ ] T015b [P] [US1] Update admin UI to show "Verify Now" button on unverified company detail page — calls bypass endpoint, refreshes company status on success.
- [ ] T016 [P] [US1] Update `src/server/services/VerificationService.ts` — `generateEmailVerificationToken()` and `verifyEmail()`: on verify, set `company.verifiedat = NOW()`, set status ACTIVE for free tiers, log audit event `email_verified`
- [ ] T017 [P] [US1] Update `src/server/routes/payment.ts` — Stripe webhook handler: on `payment_intent.succeeded`, update `company.subscriptionstatus = 'ACTIVE'`; on `payment_intent.payment_failed`, keep PENDING with error reason
- [ ] T018 [US1] Update `src/client/pages/RegistrationPage.tsx` — multi-step flow: Step 1 (CompanyInfoForm), Step 2 (PaymentStep for CONSULTANT/ENTERPRISE — skip for FREE/SMALL_BUSINESS), Step 3 (ConfirmationStep). Route progress via state machine.
- [ ] T019 [P] [US1] Update `src/client/components/CompanyInfoForm.tsx` — ensure `billingplan` field uses updated enum values (FREE, SMALL_BUSINESS, CONSULTANT, ENTERPRISE), remove old 'Professional'/'Enterprise' values
- [ ] T020 [P] [US1] Update `src/client/components/TierSelector.tsx` — update tier display names and descriptions to match new 4-tier model (FREE $0, SMALL_BUSINESS $0, CONSULTANT $29.95, ENTERPRISE $59.95+)
- [ ] T021 [P] [US1] Create `src/client/components/registration/ConfirmationStep.tsx` — post-registration success screen: plan summary, email verification instruction, next steps

---

## Phase 4: US2 — Admin Dashboard with Tier-Gated View

_Goal: Admin logs in and sees role-conditional sidebar + tier-appropriate dashboard. Locked sections show upgrade prompts._

**Independent Test**: Login as ADMIN on FREE plan → sidebar shows 8 items, Invoices and Reports render tier-locked ("Requires CONSULTANT"). Login as TEAM_MANAGER → 8-item nav with Time & Billing/Invoices/Reports role-locked ("Requires Admin"). Login as TEAM_MEMBER → 4-item nav, no billing/admin sections.

- [x] T022 [US2] Create `src/client/components/layout/AppShell.tsx` — three-tier role-conditional sidebar. ADMIN: 8 items (Dashboard, Team Members, Projects, PM Integrations, Time & Billing, Invoices, Reports, Settings), all tier-gated as appropriate. TEAM_MANAGER: same 8 items but Time & Billing/Invoices/Reports wrapped in `<RoleLock>`. TEAM_MEMBER: 4 items (Dashboard, Time Tracking, PM Integrations, Projects). Reads `usertype` and `billingplan` from AuthContext.
- [x] T023 [P] [US2] Create `src/client/components/admin/UpgradeLock.tsx` — reusable tier-lock component: takes `requiredPlan: string`, `featureName: string`, `children: ReactNode`. If `currentPlan` meets requirement, renders children. Otherwise renders locked state: grayed icon, feature description, "Requires [PLAN]" badge, "Upgrade Plan" button routing to `/settings/billing/upgrade`.
- [x] T023a [P] [US2] Create `src/client/components/admin/RoleLock.tsx` — reusable role-lock component: takes `requiredUsertype: string`, `featureName: string`, `children: ReactNode`. If `usertype` meets requirement, renders children. Otherwise renders locked state: "Requires Admin" message, grayed nav item. Used for TEAM_MANAGER's billing/invoices/reports nav items.
- [x] T024 [P] [US2] Create `src/client/components/admin/SubscriptionCard.tsx` — widget: plan name, status badge (ACTIVE/PENDING/SUSPENDED), seats used/limit, next billing date (paid plans), overage indicator (ENTERPRISE), "Upgrade Plan" CTA.
- [ ] T025 [P] [US2] Create `src/server/services/DashboardService.ts` — `getAdminDashboard(companyid, billingplan)`: aggregate team stats, project summaries, financial metrics (CONSULTANT+ only), activity feed, digest preview. Cache results with 5-minute TTL. Return `lockedfeatures` array for current plan.
- [ ] T026 [P] [US2] Update `src/server/routes/company.ts` — `GET /api/admin/dashboard` (requireAdmin middleware): call DashboardService, return dashboard payload including `lockedfeatures`
- [ ] T027 [P] [US2] Update `src/server/routes/company.ts` — `GET /api/company/subscription`: return billingplan, subscriptionstatus, seatsused, seatslimit, nextbillingdate (paid), overage (ENTERPRISE)
- [ ] T028 [P] [US2] Update `src/server/routes/company.ts` — `PATCH /api/company/subscription` (requireAdmin + tier check): validate seat count before downgrade, call Stripe for paid upgrades, update billingplan + subscriptionstatus
- [ ] T029 [P] [US2] Update `src/server/routes/company.ts` — `GET /api/company/feature/:featurename`: returns `{ accessible: bool, requiredplan, currentplan, upgradeurl }` — 200 even for locked features (for client-side locked state rendering)
- [x] T030 [US2] Update `src/client/pages/AdminDashboard.tsx` — fetch from `GET /api/admin/dashboard`, render: SubscriptionCard, team stats, ProjectOverview grid, DailyDigestPreview, ActivityFeed. Wrap tier-gated sections in UpgradeLock.
- [ ] T031 [P] [US2] Create `src/client/components/admin/DailyDigestPreview.tsx` — preview widget showing data that will appear in 6am email: hours tracked, active members, top project.
- [ ] T032 [P] [US2] Create `src/client/components/admin/ActivityFeed.tsx` — recent company events: users joined, projects created, invoices generated, team changes. Max 10 items.
- [x] T033 [P] [US2] Create `src/client/pages/TeamDashboard.tsx` — task-focused view for TEAM_MEMBER users: assigned projects, active tasks, time tracking summary. No admin sections, no billing.
- [x] T034 [US2] Update `src/client/pages/Dashboard.tsx` — redirect based on usertype: `ADMIN` or `TEAM_MANAGER` → `/admin/dashboard`; `TEAM_MEMBER` → `/dashboard/team`. Wrap in AppShell.
- [ ] T035 [P] [US2] Create `GET /api/user/dashboard/config` and `PATCH /api/user/dashboard/config` in `src/server/routes/user.ts` — reads/writes `users.dashboardconfig` JSON for current authenticated user. No admin middleware required (each user manages own layout). FR-033.
- [ ] T036 [P] [US2] Add `PATCH /api/company/settings` to `src/server/routes/company.ts` — updates `companies.digestconfig` JSON (requireAdmin middleware). Body: `{ digestconfig: { sendtime, timezone, frequency, recipients } }`. FR-086.

---

## Phase 5: US3 — Team Member Invitation and Role Assignment

_Goal: Admin can invite users, assign roles, manage team. Team Manager role assignable on CONSULTANT+._

**Independent Test**: POST `/api/company/users` with email → userinvitation created, status='pending', invitation email sent within 2 minutes. PUT invitation token → user created, status='accepted'.

- [ ] T035 [P] [US3] Update `src/server/routes/team.ts` — `POST /api/company/users` (requireAdmin): validate email, check seat limit for plan, create userinvitation record, trigger invitation email. Block if at seat cap with 409 response including upgrade hint.
- [ ] T036 [P] [US3] Update `src/server/routes/team.ts` — `GET /api/company/users`: paginated team list with role, status, lastloginedat, activeflag
- [x] T037 [US3] Update `src/server/routes/team.ts` — `PATCH /api/team/:userId`: update fullname (usertype changes blocked by design). `POST /api/team/:userId/remove` now also blocks deletion of ADMIN users (server-enforced, client hides button too). Note: endpoint path uses `/api/team/` not `/api/company/users/` per existing route structure.
  - CompanyService.getCompanyTeamMembers updated to return `usertype` and `joinedat` fields.
- [ ] T038 [P] [US3] Update `src/server/routes/team.ts` — `POST /api/company/users/bulk` (requireAdmin): accept CSV body, parse emails, batch create invitations. Return success/error per row.
- [ ] T039 [P] [US3] Create `src/server/services/InvitationService.ts` — `sendInvitation(companyid, email, role, invitedby)`: generate 256-bit token, set expireseat=+7days, send invitation email via Mailgun with join link. `acceptInvitation(token, name, password, timezone)`: validate token, create user record, mark invitation accepted, send welcome email.
- [ ] T040 [P] [US3] Update `src/server/services/userService.ts` — add `deactivateUser()`, `reactivateUser()`, `updateRole()`, `setTeamManager()` (CONSULTANT+ check), `updateBillingProps(payrate, tracktimeflag)`. Log all changes to AuditService.
- [x] T041 [US3] Update `src/client/components/Dashboard/TeamMembersTab.tsx` — use real API data (GET /api/team), show correct usertype badges (ADMIN/TEAM_MANAGER/TEAM_MEMBER), active/inactive status filter, inline name editing via PATCH /api/team/:userId, delete hidden for ADMIN users (server enforces too), dark mode compliant. Note: role changing not yet implemented — usertype is display-only badge per UI rules.
- [ ] T042 [P] [US3] Create `src/client/components/admin/InviteUserModal.tsx` — modal: email input, role selector, pre-assign role option. Submit → POST /api/company/users. Show seat limit warning if near cap.
- [x] T043 [US3] Create `src/client/pages/admin/TeamMembersPage.tsx` — admin team management page wrapping AppShell + TeamMembersTab. Route: `/admin/team`. (Note: spec called this TeamPage.tsx; implemented as TeamMembersPage.tsx in pages/admin/ for consistent admin namespace.)
- [ ] T044 [P] [US3] Create `src/client/pages/InviteAcceptPage.tsx` — invitation acceptance page at `/invite/:token`: validate token, show company name, collect name + password + timezone, submit → accept invitation endpoint. Handle expired token with resend option.
- [x] T045 [US3] Update `src/client/App.tsx` — add route `/admin/team` → TeamMembersPage (partial: `/invite/:token` → InviteAcceptPage still pending T044)

---

## Phase 6: US4 — Project Overview and Task Drill-Down

_Goal: Admin sees project summary grid; can drill into any project for task-level detail; can add guidance notes to tasks._

**Independent Test**: GET `/api/admin/dashboard` projects array contains all company projects with percentcomplete. GET `/api/projects/:id` from admin shows all tasks with status and assigned user.

- [ ] T046 [P] [US4] Update `src/server/routes/projects.ts` — `GET /api/admin/projects`: return all company projects with assignedcount, taskcount, status, percentcomplete (admin-only endpoint via requireAdmin)
- [ ] T047 [P] [US4] Update `src/server/routes/projects.ts` — `GET /api/admin/projects/:id`: return full project drill-down: tasks with status, assignee, lastupdate, progress by date
- [ ] T048 [P] [US4] Update `src/server/services/ProjectService.ts` — add `getAdminProjectSummary(companyid)`, `getProjectDrillDown(projectid, companyid)` methods. Enforce companyid isolation.
- [ ] T049 [P] [US4] Create `src/client/components/admin/ProjectOverview.tsx` — summary grid: project name, assigned member, task count, status badge, % complete progress bar. Clicking row navigates to drill-down.
- [ ] T050 [P] [US4] Create `src/client/pages/ProjectDrillDownPage.tsx` — task list with date progress, assignee, status. Admin note editor per task. Fetch from GET /api/admin/projects/:id.
- [ ] T051 [P] [US4] Update `src/server/routes/notes.ts` — `POST /api/projects/:id/tasks/:taskid/notes` (requireAdmin): create note, set `visibletoteam=true`, trigger email notification to assignee
- [ ] T052 [P] [US4] Create `src/client/components/admin/TaskNoteEditor.tsx` — note input form shown per task in drill-down. Submit → POST /api/projects/:id/tasks/:taskid/notes. Show existing admin notes inline.
- [ ] T053 [P] [US4] Update `src/server/jobs/emailQueue.ts` — add `scheduleDigestEmail(companyid, sendtime)` job: query DashboardService, render email template, send via Mailgun at configured time
- [ ] T054 [P] [US4] Update `src/client/App.tsx` — add routes: `/admin/projects` → ProjectsPage, `/admin/projects/:id` → ProjectDrillDownPage (requireAdmin)

---

## Phase 7: US5 — Billing and Invoice Management (CONSULTANT+)

_Goal: CONSULTANT+ admin can configure billing rates (rate hierarchy), generate PDF invoices, download or email them._

**Independent Test**: PATCH `/api/company/billing/rates` sets company rate. POST `/api/company/billing/invoices` generates invoice — only includes un-invoiced billable entries, marks them `invoiced=true`, returns PDF download URL. FREE plan request returns 403 with `upgrade: true`.

- [ ] T055 [P] [US5] Update `src/server/routes/invoices.ts` — `GET /api/company/billing/rates` (CONSULTANT+ tier gate): return company default rate, per-project overrides, per-user overrides. `PATCH /api/company/billing/rates`: update any rate level.
- [ ] T056 [P] [US5] Update `src/server/routes/invoices.ts` — `POST /api/company/billing/invoices` (CONSULTANT+ tier gate): accept `{ daterange, breakdown }`, call InvoiceService, return invoice record with PDF URL
- [ ] T057 [P] [US5] Update `src/server/services/InvoiceService.ts` — `generateInvoice(companyid, daterange, breakdown)`: query billable, un-invoiced time entries; resolve rates via rate hierarchy; calculate totals; generate PDF via Puppeteer; upload to storage; mark entries `invoiced=true`; return invoice record with INV-YYYY-NNN number.
- [ ] T058 [P] [US5] Create `src/server/services/BillingService.ts` — `resolveRate(userid, projectid, companyid, entrydate)`: implements rate hierarchy (user > project > company) using rate effective at entrydate from audit trail. `calculateInvoiceTotal(entries)`: aggregate hours × rate.
- [ ] T059 [P] [US5] Create `src/client/pages/InvoicesPage.tsx` — invoice list with generate button, date range picker, status badges (draft/sent/paid). Wrap in UpgradeLock for FREE plan. Fetch from GET /api/company/billing/invoices.
- [ ] T060 [P] [US5] Create `src/client/components/admin/InvoiceGenerator.tsx` — date range picker + breakdown option (by user/project/both) + "Generate Invoice" button. Shows billable hours preview before generating.
- [ ] T061 [P] [US5] Create `src/client/pages/BillingConfigPage.tsx` — three-section layout: company default rate, project rate overrides table, user rate overrides table. All editable inline. Wrap in UpgradeLock for FREE plan.
- [ ] T062 [P] [US5] Update `src/client/App.tsx` — add routes: `/admin/billing` → BillingConfigPage (requireAdmin + CONSULTANT+), `/admin/invoices` → InvoicesPage (requireAdmin)

---

## Phase 8: Polish & Cross-Cutting

_Reports, settings, SSO shell, daily digest scheduler, app routing completion._

- [ ] T063 [P] Create `src/server/services/ReportService.ts` — `getRevenueReport(companyid, daterange)`, `getHoursReport(companyid, daterange)`, `getUtilizationReport(companyid)`. Cache results for 1 hour. CONSULTANT+ only.
- [ ] T064 [P] Update `src/server/routes/company.ts` — `GET /api/company/billing/reports?type=revenue|hours|utilization&start&end` (CONSULTANT+ tier gate): call ReportService, return data + support `?format=csv|excel` export
- [ ] T065 [P] Create `src/client/pages/ReportsPage.tsx` — report builder UI: date range, type selector, tabular + chart display. Wrap in UpgradeLock for FREE/SMALL_BUSINESS. CSV/Excel export buttons.
- [ ] T066 [P] Create `src/client/pages/SettingsPage.tsx` — company profile editor (name, address, logo upload), notification preferences (digest frequency, alert toggles), SSO config section (UpgradeLock for non-ENTERPRISE)
- [ ] T067 [P] Update `src/server/jobs/emailQueue.ts` — implement configurable digest frequency (daily/weekly/monthly), multi-recipient support, exponential backoff retry (5min/30min/4hr, max 3 attempts)
- [ ] T068 Update `src/client/App.tsx` — finalize all routes: `/admin/dashboard`, `/admin/team`, `/admin/projects`, `/admin/projects/:id`, `/admin/billing`, `/admin/invoices`, `/admin/reports`, `/admin/settings`, `/dashboard/team`, `/invite/:token`. Wrap admin routes in requireAdmin guard.
- [ ] T069 Update `src/client/components/layout/AppShell.tsx` — add active route highlighting, tier badges on locked nav items (e.g. lock icon next to Invoices for FREE), mobile-responsive sidebar

---

## Amendment A: Company VAT number (2026-10-09)

_Approved 2026-10-09. See spec.md → Amendment A (FR-012a, FR-012b, FR-012c). Order is MANDATORY: T071 must be applied and verified before T072 is declared, or every request that reads `companies` returns 500._

| Task | Status | What |
| --- | --- | --- |
| T070 | done | Create `src/db/migrations/0071_scope002_company_vatnumber.sql`: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS vatnumber varchar(50);`. Additive and nullable with no default, so only metadata changes. |
| T071 | done (Andy, 2026-10-09) | **HUMAN**: apply 0071 by hand, verify the column in `information_schema.columns`, confirm `db:drift` exits 0, and record it in the SPEC-117 schema change log. **Blocked T072–T077.** |
| T072 | done | `src/db/schema/company.ts`: declare `vatnumber: varchar("vatnumber", { length: 50 })` (FR-012a). |
| T073 | done | `src/server/routes/admin.ts`: `GET /api/admin/settings` returns `vatNumber`. `PUT` trims it, turns empty into NULL, returns 400 above 50 characters, and leaves the stored value alone when the key is absent. `PUT` now has `requireAdmin` (FR-012c). |
| T074 | done | `src/client/components/admin/CompanyInfoSection.tsx`: VAT Number input in Company Information on `/admin/settings` (FR-012b). |
| T075 | done | `src/client/pages/SettingsPage.tsx`: VAT Number input on the Company tab of `/settings` (FR-012b). |
| T076 | done | `src/server/routes/sysadmin.ts` (`companyUpdateSchema` gets `vatnumber`, empty becomes NULL) and `src/client/pages/SysAdminDashboard.tsx` (detail row and Edit Company field) (FR-012b). |
| T077 | done | Endpoint test, browser check, build, typecheck and `auditfences`. Results are below. |

**T077 results (2026-10-09).** The real `admin` and `sysadmin` routers, with their real middleware,
were mounted on an ephemeral port against the production database, without booting the full server
and its schedulers. The target was Wxperts LLC. All 16 checks passed:

- Set (trimmed), read back, and clear to NULL, through both `/api/admin/settings` and `/api/sysadmin/companies/:id`.
- A PUT without `vatNumber` leaves the stored value alone.
- 51 characters returns 400 and leaves the value unchanged. Exactly 50 is accepted.
- A non-string value returns 400.
- TEAM_MEMBER `PUT /api/admin/settings` returns 403 and changes nothing. Their `GET` still returns 200.
- ADMIN on the SysAdmin PATCH returns 403.
- Afterwards, every other profile column was identical to the pre-test snapshot and `vatnumber` was NULL again.

`npm run build` passes, and the built bundles carry the fields and `requireAdmin`. The typecheck
shows no new errors in the touched files.

**Browser check (2026-10-09).** Headless Chromium drove the real app (`createApp()` and the built
client, without `index.ts`'s background jobs) as the Wxperts LLC ADMIN and as a SysAdmin. All 10
checks passed:

- `/admin/settings`: the field renders empty. Saving `"  DE123456789  "` reloads as `DE123456789`.
- `/settings` Company tab: it shows that same value. Saving `FR40303265045` persists across a reload.
- SysAdmin: the detail panel and Edit Company both show `FR40303265045`. Clearing it in Edit Company
  makes the detail panel show a dash, and the column is NULL.
- Afterwards, Wxperts LLC was identical to the pre-run snapshot.

The only browser errors were 3 × `404 GET /api/tier/info` on `/settings`. That has nothing to do with
this amendment: `src/server/routes/tier.ts` exists, but nothing mounts it.

---

## Dependencies

```
T001 (branch)
  ↓
T002–T007 (schema updates) [PARALLEL]
  ↓
T008 (HUMAN: migrate) — BLOCKS all further tasks
  ↓
T009–T013 (middleware + auth context) [PARALLEL]
  ↓
Phase 3 US1 (T014–T021) [some parallel]
  ↓
Phase 4 US2 (T022–T034) — AppShell BLOCKS all frontend (T022 before T030/T033/T034)
  ↓
Phase 5 US3 (T035–T045) [mostly parallel within phase]
Phase 6 US4 (T046–T054) [mostly parallel within phase]
Phase 7 US5 (T055–T062) [mostly parallel within phase]
  ↓
Phase 8 Polish (T063–T069)
```

**Critical path**: T001 → T002–T007 → T008(human) → T009–T013 → T022(AppShell) → T030(AdminDashboard)

---

## Parallel Execution Examples

### Parallel Group 1: Schema updates (after T001)
```
T002 Update company.ts
T003 Update user.ts
T004 Update projectuser.ts
T005 Update userinvitation.ts
T006 Verify companyauditlog.ts
T007 Update index.ts
```

### Parallel Group 2: Middleware (after T008)
```
T009 Update auth.ts (add billingplan to JWT context)
T010 Create tier.ts middleware
T011 Create requireAdmin.ts middleware
T012 Update AuditService.ts
T013 Update AuthContext.tsx
```

### Parallel Group 3: US2 Frontend (after T022 AppShell)
```
T023 UpgradeLock component
T024 SubscriptionCard component
T031 DailyDigestPreview component
T032 ActivityFeed component
T033 TeamDashboard page
```

### Parallel Group 4: US3 Backend (after T008)
```
T035 POST /api/company/users endpoint
T036 GET /api/company/users endpoint
T037 PATCH /api/company/users/:id endpoint
T039 InvitationService
T040 Update userService.ts
```

---

## Task Count Summary

| Phase | Tasks | Parallel [P] | User Story |
|---|---|---|---|
| Phase 1: Setup | 1 | 0 | — |
| Phase 2: Foundational | 12 | 9 | — |
| Phase 3: US1 Registration | 8 | 6 | US1 |
| Phase 4: US2 Dashboard | 13 | 10 | US2 |
| Phase 5: US3 Team | 11 | 8 | US3 |
| Phase 6: US4 Projects | 9 | 8 | US4 |
| Phase 7: US5 Billing | 8 | 8 | US5 |
| Phase 8: Polish | 7 | 5 | — |
| **Total** | **69** | **54** | |

---

## MVP Scope (Minimum Viable Increment)

**Suggested MVP**: Complete US1 + US2 (T001–T034 + T008 human task)

- Delivers: working company registration with correct tier selection, admin dashboard with role-conditional nav, tier-gated locked sections
- Independently verifiable: login as FREE admin → see upgrade prompts; login as CONSULTANT → see full dashboard
- Unblocks: US3/US4/US5 can proceed in parallel after T022 (AppShell) is done

---

## Implementation Notes

- `T008` is a **human task** — AI cannot run migrations. Confirm schema changes are correct before running.
- `billingplan` enum migration: existing rows with `'Free'` must be updated to `'FREE'` before deploying new code. Add a one-time migration script if rows exist.
- `AppShell` (T022) must be completed before any admin page work since it wraps all authenticated views.
- All API endpoints serving locked features MUST apply `tier.ts` middleware server-side — client UpgradeLock is supplementary.
- `BillingService.ts` rate resolution must use historical rate (rate at time of entry), not current rate.
