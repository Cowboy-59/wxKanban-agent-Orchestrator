# Spec 037: Consultants Management (Engagement Core)

**Spec Number**: 037
**Status**: `draft`
**Created**: 2026-05-26
**Depends On**: spec 020 (Consultant Work Hub — for FR-021 only), spec 023 (Stripe Subscription Operations), spec 005 (Time and Billing), spec 002/003 (Admin/Registration invitation pattern), spec 013 (Audit Management)
**Related Scopes (downstream)**: 038, 039, 040, 041
**Source**: `specs/Project-Scope/037-consultant-mgmt.md`

---

## Overview

Establishes a foundational tenant-to-tenant relationship model in wxKanban that lets a Client Company engage a Consulting Company to do scoped work on its Projects — without the consultant becoming a team member. Introduces three new domain entities: the **Engagement** (the Company-to-Company contractual link), the **Engagement Assignment** (which scopes and/or tasks the Consulting Company is granted access to inside the Client's Projects), and the **Sub-Assignment** (the Consulting Company's internal distribution of that work among its own members).

Time tracking lives in the Consulting Company's own tenant and flows to the Client as **aggregated** metrics (count of consulting members + total hours and billing dollars); per-member breakdowns are not exposed. Invoicing is **B2B** — Consulting Company → Client Company's designated billing email. Consultants are explicitly **not team members**, do not count against the Client's seat cap, and only see what has been assigned to them through their Company's Engagement.

This scope is foundational. Discovery/marketplace, pre-sales/proposals, payment processing, and cross-engagement reporting are deferred to dependent scopes 038–041.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Client Company ADMIN (initiates Engagement, manages Assignments) |
| **Secondary Actors** | Consulting Company ADMIN (accepts, sub-assigns, invoices); Consulting Company TEAM_MANAGER (sub-assigns); Consulting Member (does the work) |
| **Key Value** | A wxKanban customer can hire a consulting firm — solo or multi-person — and have all scoped collaboration, time tracking, and B2B billing flow inside the platform without granting team-member access. |
| **Scope Boundary** | **IN**: Engagement model + lifecycle (active/paused/disabled/ended), Engagement Assignment (scope-level + task-level + mixed), Sub-Assignment, multi-project per engagement, concurrent consultants per scope/task, aggregated billing visibility to Client, B2B invoice generation, optional PM connect at onboarding, audit trail. **OUT**: marketplace/discovery/profiles/reviews (→038), proposals/rate negotiation/NDAs (→039), payment processing/escrow (→040), time-entry dispute/cross-engagement reporting (→041), per-member time breakdown to Client, messaging/DMs/@-mentions, manual lifecycle phase advance by consultants, task deletion by consultants. |

---

## User Scenarios & Testing

### US1 — Happy path: full engagement lifecycle (primary, ~80% case)

**Actor**: Client Company ADMIN (Andy at wxperts) + Consulting Company ADMIN (Howard at HAS Enterprises) + Consulting Members (Howard + Jane)

**Scenario**:
1. Andy opens wxperts' Personnel page → **Consultants** section → "Invite Consulting Company" → enters `howard@hasenterprises.com`.
2. Howard receives invitation email, clicks link, signs in to his existing HAS Enterprises tenant. Sees "wxperts has invited HAS Enterprises to a consulting engagement" → clicks Accept. Engagement created in `active` state.
3. Andy edits the Engagement: adds **Scope 037 (whole)** + **tasks T012-T014 of Scope 003** in wxperts' Project Alpha + **Scope 029 (whole)** in wxperts' Project Beta. (Multi-project, mixed granularity.)
4. Howard, as HAS Enterprises ADMIN, opens the Engagement in his tenant → sub-assigns Scope 037 to himself, T012-T014 to Jane (Consulting Member), and Scope 029 to himself.
5. Howard works on Scope 037 in wxperts' tenant: sees only that scope, changes task statuses, logs billable time in his own tenant. Jane logs time against T012-T014.
6. End of month: Howard generates the B2B invoice in HAS Enterprises' tenant for the month's billable hours; invoice email delivered to wxperts' billing email.
7. Andy opens wxperts' Personnel → Consultants → HAS Enterprises card: sees `2 consulting members · 47.5 hours · $7,125` (aggregate only — no per-member breakdown).

**Pass condition**: Andy never grants seat-cap access; Howard and Jane never log into wxperts' tenant directly; Andy sees aggregate billing; invoice arrives at the billing email.

---

### US2 — Engagement modification mid-flight (mutable assignments + notifications)

**Actor**: Client Company ADMIN

**Scenario**:
1. Engagement is active. Andy decides Scope 029 is being pulled in-house. He opens the Engagement → removes Scope 029. He also adds tasks T015-T020 of Scope 003 because there's more work than expected.
2. Both sides receive a notification: *"Andy@wxperts modified the assignments on Engagement #N: removed Scope 029; added 6 tasks in Scope 003."*
3. Howard sees the change immediately in HAS Enterprises' Engagement view. Scope 029 access for him goes read-only on history; he can no longer log new time or change task state on it. Time already logged on Scope 029 stays in the historical record and is included in pending billing.
4. Howard sub-assigns the 6 new tasks to Jane.

**Pass condition**: Removed-scope time history is preserved; new assignments are immediately actionable by Consulting Co.; notification fires once per modification batch (not per item).

---

### US3 — Pause, disable, and end (lifecycle transitions)

**Actor**: Client Company ADMIN

**Scenario**:
1. wxperts hits a short-term budget review. Andy pauses the Engagement → `active → paused`. Both sides notified.
2. While paused: Howard and Jane can **read** their assigned work and see history, but cannot log new time, change task statuses, or upload files.
3. Two weeks later Andy resumes → `paused → active`. Work resumes normally. No notification on resume.
4. Six months later wxperts pivots strategy; the engagement is dormant but not over. Andy disables the Engagement → `active → disabled`. Both sides notified.
5. Three months after that wxperts wants to re-engage HAS for a new initiative. Andy enables the Engagement → `disabled → active`. Both sides notified.
6. After completing the new initiative, Andy ends the Engagement → `active → ended`. Both sides notified. Howard's tenant retains the engagement's history (time entries, completed task records) for invoicing and reporting. New writes to wxperts' tenant are blocked from HAS Enterprises members effective immediately.

**Pass condition**: Paused and disabled states are reversible without data loss; ended state preserves history but is irreversible; no orphaned time entries; transitions match notification policy.

---

### US4 — Solo consultant onboarding with optional PM connect

**Actor**: Client Company ADMIN + brand-new consultant

**Scenario**:
1. Andy invites `dave@dchconsulting.com` — an email with no existing wxKanban account.
2. Dave receives invitation email, clicks link → lands on **"Set up your Consulting Company"** form: enters company name (DCH Consulting), primary-contact full name, accepts CONSULTANT-tier terms. Optionally connects an external PM system (Jira / Monday / Asana / Trello) via the existing wxKanban PM integration so Engagement tasks appear in his existing PM tool alongside wxKanban (skippable; checkbox-and-OAuth flow).
3. wxKanban provisions a minimal 1-member CONSULTANT-plan tenant for Dave with him as ADMIN. If a PM system was connected, the integration is bound to the new Consulting Company tenant. The Engagement between wxperts and DCH Consulting is then created in `active` state.
4. Dave immediately sees the Engagement in his tenant and proceeds exactly as Howard does in US1 from step 3 onward. Assigned tasks sync to his connected PM system (if connected) via spec 020's bidirectional sync once that scope is complete.

**Pass condition**: A brand-new email can go from invite-click → working on assignments in under 5 minutes. PM connection is optional and never blocks onboarding completion.

---

## Functional Requirements

### A. Engagement Lifecycle

#### FR-001 — Invite Consulting Company by email

Client ADMIN can invite a Consulting Company by emailing its primary contact.

**Acceptance Criteria**:
- AC1: A new "Invite Consulting Company" entry point exists on the Personnel page → Consultants section.
- AC2: Form captures email + optional message; no role field is present (consultants don't have wxKanban-team roles).
- AC3: Sending creates an `engagementinvitations` row in `pending` state with a 7-day expiry token (single-use).
- AC4: Engagement invitations do not consume Client seat-cap quota.

#### FR-002 — Accept invitation: existing tenant vs auto-provision branch

The accept handler routes by whether the email already exists in `userprofiles`. A single endpoint handles both branches.

**Acceptance Criteria**:
- AC1: Email exists AND user's primary Company is on `CONSULTANT` plan → user signs in; Engagement is bound to that user's primary Company. The user must be an ADMIN of that Company to accept.
- AC2: Email exists AND user's primary Company is NOT on `CONSULTANT` plan → accept fails with a clear error directing the user to upgrade their tenant or use a different account. No silent dual-tenant creation.
- AC3: Email does not exist → user lands on the auto-provision onboarding form (FR-003).
- AC4: On successful accept, an `engagements` row is created in `active` state, linking the two Company IDs and recording the originating invitation.

#### FR-003 — Auto-provision Consulting Company tenant during accept

Brand-new email accepting an invite is guided through a minimal Consulting Company setup.

**Acceptance Criteria**:
- AC1: Form captures: Consulting Company name, primary-contact full name, accept-terms checkbox for CONSULTANT plan.
- AC2: Optional "Connect a PM system" panel (Jira/Monday/Asana/Trello) using the existing spec 020 OAuth flow; skippable.
- AC3: On submit, wxKanban creates: a CONSULTANT-plan `companies` row (free/trial billing state — see Compliance and 6B Constraints), a `userprofiles` row for the contact with ADMIN role within that Company, and the `engagements` row binding the new tenant to the Client.
- AC4: User is signed in to their new tenant and lands on its Engagement view within 60 seconds of clicking the invite link.

#### FR-004 — Engagement state machine: active / paused / disabled / ended

**Acceptance Criteria**:
- AC1: Only Client ADMIN can transition state.
- AC2: `paused` state and `disabled` state both disable all writes (task status, time logging, file upload, comments) by Consulting Members on assigned work; reads remain allowed. Difference is semantic — `paused` is short-term hold; `disabled` is indefinite hold.
- AC3: `ended` is terminal — no further state changes allowed; access fully revoked except read-only history for the Consulting Company.
- AC4: Allowed transitions: `active ↔ paused`, `active ↔ disabled`, `any → ended`. Disallowed transitions return HTTP 409 with a clear error code.
- AC5: All state transitions are recorded in `companyauditlogs` for both tenants with timestamp, actor `userid`, from-state, to-state, optional reason.

#### FR-005 — Mutable assignments after creation

**Acceptance Criteria**:
- AC1: Client ADMIN can add or remove assigned scopes/tasks at any time while engagement is `active`.
- AC2: Removed scope/task: Consulting Members lose write access immediately; existing time entries on the removed work remain in history and remain billable.
- AC3: Added scope/task: Consulting Co. sees the addition in real time (no re-acceptance required); the Consulting Co. ADMIN/TM sub-assigns as needed.
- AC4: Modifications attempted during `paused` or `disabled` state are queued and take effect on resume.

### B. Assignment Granularity

#### FR-006 — Mixed scope-level and task-level grants per engagement

**Acceptance Criteria**:
- AC1: An `engagementassignments` row references EITHER a scope OR a specific task — not both. Enforced by DB check constraint.
- AC2: A single Engagement can carry any combination of scope-level and task-level rows.
- AC3: Adding a scope-level assignment implicitly grants all current and future tasks within that scope until removal; task-level rows are unaffected by adding a scope-level row.

#### FR-007 — Multi-project per Engagement

**Acceptance Criteria**:
- AC1: A single Engagement can carry assignments across multiple Projects owned by the same Client Company.
- AC2: The Engagement view groups assignments by Project for readability.

#### FR-008 — Concurrent Consultants on the same scope or task

**Acceptance Criteria**:
- AC1: Two Engagements (different Consulting Companies) may both have grants on the same scope or task.
- AC2: Each Consulting Company sees only their own time entries and sub-assignments; the Client sees both Consulting Companies' aggregates separately on the Personnel page.

### C. Sub-Assignment (within the Consulting Company)

#### FR-009 — Sub-Assignment by Consulting Co. ADMIN or TEAM_MANAGER

**Acceptance Criteria**:
- AC1: Consulting Co. ADMIN or TEAM_MANAGER can create `subassignments` rows linking an Engagement Assignment to one or more Consulting Members.
- AC2: A Consulting Member with no active sub-assignment sees nothing about that Engagement.
- AC3: Sub-assignments are not visible to the Client.

#### FR-010 — Member removal cascade ("Needs reassignment" queue)

**Acceptance Criteria**:
- AC1: When a Consulting Member is deactivated, their active sub-assignments are automatically transferred to a "Needs reassignment" queue visible to the Consulting Co. ADMIN and TEAM_MANAGER.
- AC2: Either an ADMIN or a TEAM_MANAGER can reassign queue items to any active Consulting Member.

### D. Consultant Permissions

#### FR-011 — Visibility scoping

**Acceptance Criteria**:
- AC1: A Consulting Member sees ONLY the scopes and tasks that match their active sub-assignments through their Company's active Engagement.
- AC2: Within an assigned scope, the scope's spec.md / plan.md / tasks.md documents are visible read-only for context.
- AC3: No visibility into: other scopes, other projects, team members, company settings, billing config, lifecycle decisions outside assigned scopes.

#### FR-012 — Allowed actions on assigned work

**Acceptance Criteria**:
- AC1: Change task status.
- AC2: Add comments / notes to tasks.
- AC3: Upload files / attachments to tasks.
- AC4: Log billable or non-billable time entries against assigned tasks (entries persist in the Consulting Co.'s tenant — see FR-015).
- AC5: For scope-level assignments only: create new tasks in that scope.

#### FR-013 — Disallowed actions

**Acceptance Criteria**:
- AC1: Delete tasks (always denied).
- AC2: Manually advance the scope's lifecycle phase (always denied; auto-advance is the only path).
- AC3: View or @-mention team members of the Client Company.
- AC4: View any data outside their active assignments.

#### FR-014 — Lifecycle phase visibility

**Acceptance Criteria**:
- AC1: Consulting Members see the current lifecycle phase of any assigned scope.
- AC2: Phase changes happen via existing wxKanban automation (e.g. all tasks complete → next phase) and are not triggerable by Consultants.

### E. Billing & Invoicing

#### FR-015 — Time entries owned by Consulting Company tenant

**Acceptance Criteria**:
- AC1: A time entry logged by a Consulting Member is stored in the Consulting Co.'s tenant against the engagement, sub-assignment, and original task ID.
- AC2: The Client's `timeentries` table does not receive a copy; data is exposed to the Client only through the aggregated billing view.

#### FR-016 — Aggregated billing visibility to Client

**Acceptance Criteria**:
- AC1: The Client's Personnel → Consultants → [Consulting Co.] card shows: number of distinct Consulting Members who logged time + total billable hours + total dollars (using the Consulting Co.'s configured hourly rate).
- AC2: No per-member, per-task, or per-day breakdown is exposed.
- AC3: Time-window selector (this month / last month / engagement-to-date).
- AC4: This aggregation is a confidentiality contract. Any future feature change that exposes finer granularity must be debated as a contract change.

#### FR-017 — B2B invoice generation

**Acceptance Criteria**:
- AC1: Consulting Co. ADMIN can generate an invoice for any billable time-entry range on an Engagement; the existing invoice/PDF flow is reused with the Client Company as billed party.
- AC2: Invoice is emailed to the Client Company's `billingemail`. If `billingemail` is empty, invoice generation fails fast with a clear error.
- AC3: Invoice references the Engagement ID and the time-window covered, but not individual time entries or per-member data.

#### FR-018 — Time entries are final-on-submit in MVP

**Acceptance Criteria**:
- AC1: Once a Consulting Member submits a time entry, it cannot be deleted by either side; corrections require a new offsetting entry with a note.
- AC2: A dispute/reject workflow is deferred to scope 041.

### F. PM Integration

#### FR-019 — Optional PM connection during onboarding

**Acceptance Criteria**:
- AC1: The auto-provision form (FR-003) shows the "Connect a PM system" panel after company info is entered.
- AC2: Connection uses spec 020's existing OAuth flow; on success, the connection is bound to the new Consulting Co. tenant.
- AC3: Skipping the connection does not block onboarding.

#### FR-020 — PM connection manageable post-onboarding

**Acceptance Criteria**:
- AC1: Consulting Co. ADMIN can connect, disconnect, or reconnect a PM system at any time from Consulting Co. settings.

#### FR-021 — Bidirectional sync of Engagement work to connected PM

**Status**: Pending spec 020 completion. Will not ship in 037 MVP if spec 020 is not yet stable.

**Acceptance Criteria**:
- AC1: When a Consulting Member has a PM system connected, tasks they're sub-assigned to appear in their PM tool via the existing spec 020 sync.
- AC2: Status changes and time entries made in the consultant's PM tool sync back to the Client's wxKanban view (subject to FR-015 — time entries land in the Consulting Co.'s tenant first).

### G. Notifications

#### FR-022 — Engagement state-change notifications

**Acceptance Criteria**:
- AC1: On `active → paused`: email to Client ADMIN(s) + Consulting Co. ADMIN(s).
- AC2: On `paused → active`: silent (no notification, by design).
- AC3: On `active → disabled` or `disabled → active`: email to Client ADMIN(s) + Consulting Co. ADMIN(s).
- AC4: On `* → ended`: email to Client ADMIN(s) + Consulting Co. ADMIN(s).

#### FR-023 — Assignment-modification notification

**Acceptance Criteria**:
- AC1: When Client ADMIN saves changes to assignments, a single batched notification is emailed to Consulting Co. ADMIN(s) summarizing added/removed items.
- AC2: A copy is logged in `companyauditlogs` for both tenants.

#### FR-024 — Scope-phase auto-advance notification

**Acceptance Criteria**:
- AC1: When an assigned scope's lifecycle phase auto-advances, Client ADMIN(s) are notified.
- AC2: Consulting Co. is not notified for phase advances (phase is a Client governance signal; consultants see it via task status).

### H. Other

#### FR-025 — Consultants do not consume seat-cap quota

**Acceptance Criteria**:
- AC1: Consulting Members never count against the Client Company's `companies.maxusers`.
- AC2: The Consulting Co.'s own seat cap is enforced per the standard tier rules; CONSULTANT plan caps still apply within their tenant.

#### FR-026 — Personnel UI: Consultants section

**Acceptance Criteria**:
- AC1: The existing Personnel page gains a new "Consultants" section beneath team members.
- AC2: Each engaged Consulting Company is listed as a card showing: name, active engagement state (active/paused/disabled), members-on-this-engagement count, total hours/$ (FR-016), invite/pause/disable/end actions.
- AC3: A new entry point: "Invite Consulting Company" button.

#### FR-027 — New top-level data entities

The scope introduces four new tables. Detailed schemas are in the Technical Specifications below.

**Acceptance Criteria**:
- AC1: All new tables use UUID v7 PKs and lowercase concatenated column names per CLAUDE.md DB conventions.
- AC2: Foreign keys reference existing `companies`, `userprofiles`, `projects`, `tasks` tables.

#### FR-028 — At-least-one-ADMIN invariant

**Acceptance Criteria**:
- AC1: Every Company (Client or Consulting) must have at least one active ADMIN at all times.
- AC2: Removing the last ADMIN is denied with HTTP 409 and a clear error directing the user to promote another member to ADMIN first.
- AC3: This invariant applies generally and is observable through the consultant onboarding flow but is not unique to it.

---

## Technical Specifications

### Data Model — New Tables (4) and One Column

```sql
-- engagementinvitations — Client → Consulting Co. invite (mirrors userinvitations)
engagementinvitations (
  id                  uuid v7 pk
  clientcompanyid     uuid fk → companies.id    not null
  invitedemail        text not null
  invitedbyid         uuid fk → userprofiles.id not null
  token               text unique not null
  status              text not null              -- 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresat           timestamp not null
  invitedat           timestamp default now()
  acceptedat          timestamp null
  message             text null
)

-- engagements — Client Co. × Consulting Co. with lifecycle
engagements (
  id                   uuid v7 pk
  clientcompanyid      uuid fk → companies.id    not null
  consultingcompanyid  uuid fk → companies.id    not null
  state                text not null             -- 'active' | 'paused' | 'disabled' | 'ended'
  invitationid         uuid fk → engagementinvitations.id not null
  createdat            timestamp default now()
  createdbyid          uuid fk → userprofiles.id not null
  acceptedat           timestamp not null
  acceptedbyid         uuid fk → userprofiles.id not null
  pausedat             timestamp null
  disabledat           timestamp null
  endedat              timestamp null
  endedbyid            uuid fk → userprofiles.id null

  unique (clientcompanyid, consultingcompanyid)
     where state in ('active', 'paused', 'disabled')   -- one open engagement per pair
)

-- engagementassignments — scope-level OR task-level grant
engagementassignments (
  id              uuid v7 pk
  engagementid    uuid fk → engagements.id  not null
  scopeid         text null    -- e.g. '037'; text not FK (scope numbers are filesystem-immutable)
  taskid          uuid fk → tasks.id null
  projectid       uuid fk → projects.id    not null   -- denormalized for multi-project filtering
  addedat         timestamp default now()
  addedbyid       uuid fk → userprofiles.id not null
  removedat       timestamp null
  removedbyid     uuid fk → userprofiles.id null

  check ((scopeid is null) != (taskid is null))   -- exactly one of scopeid/taskid
)

-- subassignments — Consulting Co. internal distribution to its members
subassignments (
  id                      uuid v7 pk
  engagementassignmentid  uuid fk → engagementassignments.id not null
  consultingmemberid      uuid fk → userprofiles.id          not null
  assignedat              timestamp default now()
  assignedbyid            uuid fk → userprofiles.id          not null
  removedat               timestamp null
  removedbyid             uuid fk → userprofiles.id null
)

-- New column on companies for B2B invoice routing
ALTER TABLE companies
  ADD COLUMN billingemail text null;    -- editable from company settings
```

### API Routes

All under `/api/engagements`. New router file `src/server/routes/engagements.ts`, mounted in `src/server/app.ts`.

| Method | Path | Purpose | Caller |
|---|---|---|---|
| POST | `/invite` | Send engagement invite by email | Client ADMIN |
| GET | `/invite/:token` | Validate invite + return company info for accept page | Public |
| POST | `/invite/:token/accept` | Accept (single endpoint, branches on whether `provisionCompany` payload included) | Recipient |
| GET | `/` | List engagements visible to caller's tenant | Any tenant member |
| GET | `/:id` | Engagement detail (lifecycle, counts, billing summary) | Any party member |
| POST | `/:id/pause` | active → paused | Client ADMIN |
| POST | `/:id/resume` | paused → active | Client ADMIN |
| POST | `/:id/disable` | active → disabled | Client ADMIN |
| POST | `/:id/enable` | disabled → active | Client ADMIN |
| POST | `/:id/end` | any → ended (terminal) | Client ADMIN |
| GET | `/:id/assignments` | List assignments | Either party |
| POST | `/:id/assignments` | Add scope-level or task-level assignment | Client ADMIN |
| DELETE | `/:id/assignments/:assignmentid` | Remove assignment (soft-delete, preserves history) | Client ADMIN |
| GET | `/:id/subassignments` | List sub-assignments | Consulting Co. members |
| POST | `/:id/assignments/:assignmentid/subassign` | Sub-assign to a Consulting Member | Consulting ADMIN or TM |
| DELETE | `/:id/subassignments/:subid` | Remove sub-assignment | Consulting ADMIN or TM |
| GET | `/:id/billing` | Aggregate billing metrics for Client (FR-016) | Client ADMIN |
| POST | `/:id/invoice` | Generate B2B invoice for time window | Consulting ADMIN |

An auth-context resolver middleware is required: determines whether the caller is acting as Client side or Consulting Co. side based on their primary `companyid` and the engagement's two FKs. Centralizing this avoids the orphaned-route / wrong-mount class of bug (see BUG-20).

### Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `ConsultantsPanel` | inside `PersonnelManagementPage.tsx`, below team members | List of engagements for the Client; cards per Consulting Co. with FR-016 metrics |
| `InviteConsultingCompanyModal` | new file `src/client/components/admin/InviteConsultingCompanyModal.tsx` | Email-only invite form (no role field) |
| `EngagementDetailPage` | new route `/engagements/:id` | Both sides — list assignments, lifecycle controls (Client only), sub-assignments (Consulting Co. only) |
| `AssignmentEditor` | inside `EngagementDetailPage` | Client ADMIN widget: pick scopes/tasks from owned projects, add/remove |
| `SubAssignmentEditor` | inside `EngagementDetailPage` | Consulting ADMIN/TM widget: assign Engagement Assignments to Consulting Members |
| `ConsultantProvisionForm` | new page `/engagements/invite/:token/setup` | FR-003 — company name, contact, terms, optional PM connect |
| `ConsultantWorkView` | extends `ConsultantWorkHubPage.tsx` | Consulting Member view — surface sub-assignments alongside spec 020 PM work |
| `InvoiceGenerator` *(reuse)* | existing component | Pre-populate "billed company" from `engagement.clientcompanyid` |

### wxAI Commands

None in this scope. CRUD + lifecycle only; no AI surface. Downstream scopes 038 (marketplace matching) and 041 (cross-engagement reporting) may introduce AI.

---

## Success Criteria

### SC-1 — Engagement establishment works end-to-end

Median elapsed time from "Client ADMIN clicks Invite" to "Engagement row in `active` state with a Sub-Assignment created" ≤ **10 minutes**, measured across 10 successive beta runs covering both existing-tenant and auto-provision paths.

### SC-2 — Solo consultant onboarding speed

90th-percentile time from invite-click to "first assigned task is visible in the new Consulting Co. tenant" ≤ **5 minutes**. Measured across 5 net-new-email beta accepts.

### SC-3 — Permission isolation is provably correct

A negative-test suite of **≥ 15 scenarios** (one per FR-013 + FR-011 visibility rule) passes 100%. Examples: cross-engagement leak, cross-scope leak, scope-phase-move attempt, team-list visibility attempt.

### SC-4 — Billing visibility is accurate and aggregated-only

For a 7-day beta with 3 active engagements × 2 Consulting Members each logging time, the Client-side aggregate matches Consulting Co.-side time-entry sums to the minute, with **zero** API surface exposing per-member or per-task data to the Client. Verified by automated reconciliation job + manual API surface audit.

### SC-5 — B2B invoice delivery and timing

Generated invoices deliver to `companies.billingemail` with **≥ 99.9%** success rate (with retry queue and exponential backoff up to 24 hours for transient failures) over the first 100 invoices issued post-launch. PDF generation completes within the existing **< 2-minute** target.

### SC-6 — Lifecycle state machine is sound

**100% branch coverage** of the engagement state-machine reducer in unit tests, with explicit assertions that disallowed transitions return 409 with a clear error code. State-change audit-log rows exist for 100% of transitions verified in integration tests.

### SC-7 — SOC 2 audit-evidence trail (CC6.1, CC6.3, CC7.2)

Every engagement state transition, assignment add/remove, and sub-assignment change writes to `companyauditlogs` for the appropriate tenant(s). Entries are append-only (no UPDATE/DELETE paths). Forensic timeline reconstructable by `engagementid`.

---

## Constraints & Notes

### Technical Constraints

- `scopeid` is `text`, not a FK. Referential integrity is enforced at the application layer; orphan rows are possible if scope dirs are renamed/deleted. Mitigation: scope numbers are filesystem-immutable by convention (CLAUDE.md fencing rules).
- Single open engagement per (Client × Consulting Co.) pair, enforced by partial unique index where `state in ('active','paused','disabled')`. Multiple `ended` rows allowed as tombstones; new engagement creation after end is permitted.
- Existing-user accept path requires CONSULTANT-plan primary Company. Users on SMALL_BUSINESS or ENTERPRISE plans cannot accept consulting invites; refused with clear error.
- `engagementinvitations` and `engagements` do not consume Client seat-cap quota.
- All new tables: UUID v7 primary keys, lowercase concatenated column names, no underscores per CLAUDE.md database conventions.
- `billingemail` is plain text, no FK to userprofiles. Editable from Company settings. Empty = invoice generation fails fast with a clear error.

### Business Constraints

- 037 is foundational. Marketplace/discovery/profiles/reviews/proposals/payment processing/dispute/cross-engagement reporting are all deferred to scopes 038–041.
- B2B invoicing assumes the Consulting Co. has billing rates configured (existing dependency on spec 005).
- Re-engagement after `ended` requires a brand-new invitation flow — no "reactivate" shortcut.
- Aggregate-only billing visibility (FR-016) is a confidentiality contract with the Consulting Companies. Future changes that would expose finer granularity must be debated as a contract change.
- **Solo Consulting tenants auto-provisioned via FR-003 land on a free/trial billing state**, not a paid CONSULTANT subscription. Not all consulting billing flows through wxKanban; solo consultants can engage paying clients without wxKanban being in their billing loop.

### Dependencies on Other Scopes

| Scope | Type | What 037 needs |
|---|---|---|
| **020** Consultant Work Hub | Hard (for FR-021 only) | Bidirectional PM sync. FR-021 ships as "pending spec 020 completion." |
| **023** Stripe Subscription Operations | Soft | CONSULTANT-tier billing infrastructure must support a free/trial state for auto-provisioned solo tenants. |
| **005** Time and Billing | Soft | Consulting Co. must have billing rates table to generate B2B invoices. |
| **002/003** Admin / Registration | Soft | We extend the invitation pattern (token + 7-day expiry + audit). |
| **013** Audit Management | Soft | `companyauditlogs` is the audit row destination (SC-7). |
| **026** Code Fencing | Soft | New entities and handlers must follow the BEGIN/END fence convention. |

### Open Risks & Gotchas

- **Risk**: A user whose primary Company is CONSULTANT-tier may use the same login for their own work and as a consultant identity. Single login, dual personas. The UI must always make the active tenant context obvious. Dual-persona context management is the user's responsibility; not all consulting billing flows through wxKanban.
- **Risk**: PM-system sync (FR-021) creates a path where a Consulting Member sees Client tasks in their own tenant's PM tool plus in the Client's wxKanban view. If they delete a task in their Jira, the upstream behavior is owned by spec 020 — confirm before implementing FR-021.
- **Gotcha**: `engagements.invitationid` ties the engagement back to the originating invite. `engagementinvitations` rows must be retained indefinitely for engagement provenance — never purged.
- **Gotcha**: The "Needs reassignment" queue (FR-010) is mitigated by FR-028 (at-least-one-ADMIN invariant) — without that invariant the queue could become orphaned in a solo-consultant scenario.

---

## Compliance Requirements (SOC 2)

The scope touches the following Trust Services Criteria and is implemented to satisfy them:

- **CC6.1 — Logical access controls**. Engagement + Sub-Assignment together form the access-control surface. Tested by SC-3 (≥15 negative isolation tests).
- **CC6.2 — Prior to initial access**. Invitation token is single-use, expires in 7 days, validated against `invitedemail` on accept (no token reuse, no email substitution).
- **CC6.3 — Access removal**. `paused` / `disabled` / `ended` transitions revoke writes immediately; ended state revokes reads going forward; verified by SC-6.
- **CC7.2 — Incident response readiness**. Append-only audit logs in `companyauditlogs` for state transitions and assignment changes; per SC-7. Forensic timeline reconstructable by `engagementid`.
- **Confidentiality (TSC C1.1, C1.2)**. FR-016 aggregate-only billing exposure to Client; sub-assignment data hidden from Client per FR-009 AC3.

CC6.6 (encryption at rest), CC6.7 (vulnerability scanning), and CC7.3 (SDLC standards) are inherited from baseline project infrastructure and are not specific to this scope.

---

## Migration Notes

- 4 new tables created from scratch — no data to migrate in.
- 1 `companies` column added (`billingemail text null`) — null-safe migration; can backfill from existing ADMIN emails as a one-shot script later.
- No existing data migration is required; FR-028 (at-least-one-ADMIN invariant) is enforced going forward, not retroactively (existing data is presumed compliant).

---

## Next Steps

1. Review and refine this scope document.
2. Run `wxkanban-agent createSpecs 037` (via direct-import wrapper if CLI bootstrap is unavailable) to produce `spec.md`, `plan.md`, `tasks.md`, `tests.md`, `quickstart.md` under `specs/037-consultant-mgmt/`.
3. Validate via `wxkanban-agent validateScope 037` before implementation begins.
4. Implementation tasks must include explicit "wire router in `src/server/app.ts`" steps to prevent the orphaned-route class of bug.
