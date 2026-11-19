# Task Breakdown: Consultants Management (Engagement Core)

**Feature**: Consultants Management
**Spec**: 037
**Date Generated**: 2026-05-26
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | FR / SC | Priority | Status |
|----|------|---------|----------|--------|
| T001 | Drizzle schema file: `src/db/schema/engagementinvitations.ts` (mirrors `userinvitations`; 8 fields + token unique index) | FR-001, FR-027 | high | todo |
| T002 | Drizzle schema file: `src/db/schema/engagements.ts` (state enum + partial unique index where state in active/paused/disabled) | FR-004, FR-027 | high | todo |
| T003 | Drizzle schema file: `src/db/schema/engagementassignments.ts` (scopeid text, taskid uuid FK, check exactly-one) | FR-006, FR-027 | high | todo |
| T004 | Drizzle schema file: `src/db/schema/subassignments.ts` (FKs to engagementassignments + userprofiles) | FR-009, FR-027 | high | todo |
| T005 | Drizzle schema delta: add `billingemail text null` to `companies` schema | FR-017 | high | todo |
| T006 | Register all 4 new schemas in `src/db/schema/index.ts` | FR-027 | high | todo |
| T007 | Generate migration via `npm run db:generate`; review SQL for partial unique + check constraint correctness | FR-027 | high | todo |
| T008 | Apply migration to dev DB; verify all 4 tables + new column exist; test partial unique + check constraint with manual inserts | FR-027 | high | todo |
| T009 | New router file: `src/server/routes/engagements.ts` (empty scaffold + imports) | — | high | todo |
| T010 | Auth-context resolver middleware: `src/server/middleware/engagementContext.ts` — determines Client vs Consulting Co. role from caller's `companyid` and engagement's two FKs | — | high | todo |
| T011 | **Wire `engagementsRoutes` into `src/server/app.ts`** as `app.use("/api/engagements", engagementsRoutes)` — first wiring task to prevent BUG-20 class | — | high | todo |
| T012 | `POST /api/engagements/invite` — Client ADMIN creates invitation row + sends email via existing email infra | FR-001 | high | todo |
| T013 | `GET /api/engagements/invite/:token` — public token validator; returns Client Co. name + invited email | FR-001 | high | todo |
| T014 | `POST /api/engagements/invite/:token/accept` (single endpoint) — branches by `provisionCompany` payload + existing-user lookup. Implements FR-002 routing rules | FR-002 | high | todo |
| T015 | `POST /api/engagements/invite/:token/accept` provision-branch logic — creates new CONSULTANT-plan tenant + ADMIN user + engagement row (FR-003) | FR-003 | high | todo |
| T016 | Email template + send for engagement invitation (HTML + text) reusing existing `lib/emailTemplates.ts` pattern | FR-001 | medium | todo |
| T017 | Engagement state-machine module: `src/server/lib/engagementStateMachine.ts` with allowed-transition table; throws on disallowed (409) | FR-004, SC-6 | high | todo |
| T018 | `POST /api/engagements/:id/pause` + `/resume` handlers (active ↔ paused); writes audit row | FR-004 | high | todo |
| T019 | `POST /api/engagements/:id/disable` + `/enable` handlers (active ↔ disabled); writes audit row | FR-004 | high | todo |
| T020 | `POST /api/engagements/:id/end` handler (any → ended terminal); writes audit row | FR-004 | high | todo |
| T021 | Permission gate: `paused` and `disabled` states block writes via shared middleware on assignment + sub-assignment + time-log endpoints | FR-004 AC2 | high | todo |
| T022 | `GET /api/engagements` — list filtered by caller's tenant role | — | high | todo |
| T023 | `GET /api/engagements/:id` — detail view with lifecycle, assignment counts, billing summary stub | — | high | todo |
| T024 | `GET /api/engagements/:id/assignments` — list with Project grouping | FR-007 | high | todo |
| T025 | `POST /api/engagements/:id/assignments` — add scope-level OR task-level row; enforce DB check constraint at app layer too | FR-005, FR-006 | high | todo |
| T026 | `DELETE /api/engagements/:id/assignments/:aid` — soft-delete (set `removedat`); preserve history per FR-005 AC2 | FR-005 | high | todo |
| T027 | Audit log writes for all assignment add/remove + state-transition events to `companyauditlogs` for both tenants where applicable | FR-023, SC-7 | high | todo |
| T028 | Modification-during-paused queue: writes to a `pendingmodifications` projection table (or in-place flag); applied on resume | FR-005 AC4 | medium | todo |
| T029 | `GET /api/engagements/:id/subassignments` — list visible only to Consulting Co. members of the engagement | FR-009 | high | todo |
| T030 | `POST /api/engagements/:id/assignments/:aid/subassign` — Consulting ADMIN or TEAM_MANAGER only | FR-009 | high | todo |
| T031 | `DELETE /api/engagements/:id/subassignments/:sid` — soft-delete; transfer affected member's time to history view | FR-009 | high | todo |
| T032 | "Needs reassignment" queue endpoint: `GET /api/engagements/:id/needsreassignment` — surfaces sub-assignments whose member is deactivated | FR-010 | medium | todo |
| T033 | Cascade trigger on userprofiles deactivation: open sub-assignments transition to queue (via either DB trigger or app-level hook on user deactivate path) | FR-010 | medium | todo |
| T034 | At-least-one-ADMIN invariant: pre-update check on `userprofiles.active` + role-change paths; reject if it would remove last active ADMIN | FR-028 | high | todo |
| T035 | Visibility middleware: Consulting Member queries scoped to their active sub-assignments via their Company's active engagement | FR-011 | high | todo |
| T036 | Task / scope access checks integrated into existing `tasks` + scope-documents endpoints to deny consultants outside their assignments | FR-011, FR-013 | high | todo |
| T037 | Lifecycle-phase write block: Consultants always denied manual phase-advance; auto-advance unchanged | FR-013 AC2, FR-014 | medium | todo |
| T038 | Time-entry storage in Consulting Co. tenant with FK references to `engagementid` + `subassignmentid` + original `taskid` | FR-015 | high | todo |
| T039 | `GET /api/engagements/:id/billing` — aggregate metrics ONLY: members count + total hours + total $ + time-window selector | FR-016 | high | todo |
| T040 | API-surface audit test: prove no endpoint returns per-member or per-task time data to a Client-side caller | FR-016 AC2, SC-4 | high | todo |
| T041 | `POST /api/engagements/:id/invoice` — B2B invoice generation reusing existing invoice/PDF flow; bill `engagement.clientcompanyid` | FR-017 | high | todo |
| T042 | Invoice delivery to `companies.billingemail` with retry queue + exponential backoff to 24h (mirrors `invitationdlqs` pattern) | FR-017 AC2, SC-5 | high | todo |
| T043 | Invoice fail-fast: if `billingemail` empty, 400 with clear error before queueing | FR-017 AC2 | medium | todo |
| T044 | Time-entry final-on-submit: block delete; offsetting-entry pattern documented in API | FR-018 | medium | todo |
| T045 | Notification: engagement state transitions (paused, disabled, enabled, ended) — both sides emailed; resume silent | FR-022 | high | todo |
| T046 | Notification: assignment modifications — batched per save, emailed to Consulting Co. ADMIN(s) | FR-023 | high | todo |
| T047 | Notification: scope phase auto-advance — Client ADMIN(s) only | FR-024 | medium | todo |
| T048 | Seat-cap calculation guard: confirm `companies.maxusers` enforcement does NOT count `subassignments` rows | FR-025 | high | todo |
| T049 | PM connect at onboarding: form panel + OAuth handoff using existing spec 020 flow; binds connection to new Consulting Co. tenant | FR-019 | medium | todo |
| T050 | PM connect post-onboarding: existing Consulting Co. settings page surface | FR-020 | medium | todo |
| T051 | FR-021 STUB: `[pending spec 020 completion]` — bidirectional sync not implemented; document the trigger point + integration shape | FR-021 | low | todo |
| T052 | Frontend: `ConsultantsPanel` inside `PersonnelManagementPage.tsx` — cards per engaged Consulting Co. with aggregate metrics + lifecycle actions | FR-026 | high | todo |
| T053 | Frontend: `InviteConsultingCompanyModal` (new component) — email-only invite form, no role field | FR-001 | high | todo |
| T054 | Frontend: route `/engagements/:id` → `EngagementDetailPage` with role-gated layout (Client vs Consulting Co.) | — | high | todo |
| T055 | Frontend: `AssignmentEditor` (Client ADMIN) — pick scopes/tasks from Client's Projects, add/remove with confirmation | FR-005 | high | todo |
| T056 | Frontend: `SubAssignmentEditor` (Consulting ADMIN/TM) — assign Engagement Assignments to Consulting Members + "Needs reassignment" queue | FR-009, FR-010 | high | todo |
| T057 | Frontend: route `/engagements/invite/:token/setup` → `ConsultantProvisionForm` (FR-003 onboarding with optional PM connect panel) | FR-003, FR-019 | high | todo |
| T058 | Frontend: extend `ConsultantWorkHubPage.tsx` — surface sub-assignments alongside spec 020 PM-system work | FR-011, FR-012 | high | todo |
| T059 | Frontend: `InvoiceGenerator` reuse — pre-populate billed-Company from `engagement.clientcompanyid`; B2B-mode flag | FR-017 | medium | todo |
| T060 | Frontend: lifecycle controls (pause / resume / disable / enable / end) wired to API; confirmation modal for `end` (terminal warning) | FR-004 | medium | todo |
| T061 | Frontend: Company settings — `billingemail` field add + edit | FR-017 | medium | todo |
| T062 | Frontend: tenant-context indicator chip in nav (visible when user has multiple-tenant exposure via engagements) | Constraint | medium | todo |
| T063 | Unit tests: state-machine reducer (100% branch coverage; all allowed + disallowed transitions) | SC-6 | high | todo |
| T064 | Unit tests: auth-context resolver — Client vs Consulting Co. side branching | — | high | todo |
| T065 | Unit tests: at-least-one-ADMIN invariant — last-admin removal scenarios | FR-028 | high | todo |
| T066 | Unit tests: aggregate-billing query — sums match; no per-member fields in response shape | FR-016, SC-4 | high | todo |
| T067 | Integration tests: US1 happy-path E2E — invite, accept, multi-project assign, sub-assign, log time, B2B invoice | US1 | high | todo |
| T068 | Integration tests: US2 mid-flight modification — add/remove assignments during active, history preservation | US2 | high | todo |
| T069 | Integration tests: US3 lifecycle transitions — pause/resume/disable/enable/end with notification + access enforcement assertions | US3 | high | todo |
| T070 | Integration tests: US4 solo auto-provision — new email → tenant created → onboarding clears in < 5 min | US4, SC-2 | high | todo |
| T071 | Negative-test suite: ≥ 15 permission isolation scenarios (cross-engagement leak, cross-scope leak, team-list visibility, phase-move attempt, etc.) | FR-011, FR-013, SC-3 | high | todo |
| T072 | Confidentiality audit: API surface tested for zero per-member/per-task leakage to Client | FR-016, SC-4 | high | todo |
| T073 | Audit-trail test: every state transition + assignment change + sub-assignment change produces row in `companyauditlogs` queryable by `engagementid` | SC-7 | high | todo |
| T074 | Email delivery integration test: invoice send → retry on transient failure → confirm reaches recipient or queues to DLQ | SC-5 | medium | todo |
| T075 | Documentation: `docs/consultants-engagement.md` — admin guide for Client + Consulting Co. flows | — | medium | todo |
| T076 | README + CHANGELOG entries for 037 | — | low | todo |
| T077 | Beta-runbook: 10 establishment paths + 5 onboarding paths for SC-1 + SC-2 validation | SC-1, SC-2 | medium | todo |
| T078 | Fix: assignment duplicate check on the full `(projectid, scopeid, taskid)` key + test for two project-level adds on one engagement (Amendment A) | FR-030 | high | done |
| T079 | Backend: `POST /:id/assignments { allProjects: true }` bulk whole-project add (ACTIVE projects only, skip held, one notification, queue when paused/disabled) + tests AC1–AC5 (Amendment A) | FR-031 | high | done |
| T080 | Frontend: **All projects** checkbox on the Add assignment dialog's Whole project tab (shadcn Checkbox), result message with added/skipped counts (Amendment A) | FR-031 | high | done |
| T081 | Endpoint test: bulk add against the running app; confirm one YappChatt membership sync and one FR-023 notification (Amendment A) | FR-030, FR-031 | high | done |
| T082 | Fix: Engagement page labels whole-project assignments "task" (badge) and "task undefined…" (sub-assignment list); show "whole project" (Amendment A) | FR-006 | medium | done |
| T083 | Fix: FR-023 notification body rendered whole-project grants as "task null"; name the project instead + 4 tests (Amendment A) | FR-023, FR-031 | high | done |

---

## Summary

- **77 tasks** across 15 implementation phases (see [plan.md](plan.md)).
- **High priority**: 53 tasks. **Medium**: 21 tasks. **Low**: 3 tasks.
- **All start status**: `todo`. No work has begun.
- **Critical path**: T001 → T011 (schema → router mounted) is the gate that unlocks all backend work.
- **Test coverage**: 15 of 77 tasks are tests (T063–T074, T077) mapping to SC-1 through SC-7.
- **FR-021 (PM sync)** is a stub task (T051); shipping is conditional on spec 020 readiness.
