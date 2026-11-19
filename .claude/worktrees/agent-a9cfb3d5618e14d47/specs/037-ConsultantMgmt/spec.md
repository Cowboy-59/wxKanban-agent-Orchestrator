# Spec 037: Consultants Management (Engagement Core)

**Spec Number**: 037
**Status**: `design`
**Created**: 2026-05-26
**Source Scope**: `specs/Project-Scope/037-consultant-mgmt.md`
**Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md)
**Depends On**: 020 (FR-021 only — bidirectional PM sync), 023 (Stripe — for trial-state tenant), 005 (Time and Billing), 002/003 (invitation pattern), 013 (Audit), 026 (Code Fencing)
**Downstream**: 038, 039, 040, 041

---

## Overview

Establishes a foundational tenant-to-tenant relationship model in wxKanban that lets a Client Company engage a Consulting Company to do scoped work on its Projects — without the consultant becoming a team member. Introduces three new domain entities: the **Engagement** (the Company-to-Company contractual link), the **Engagement Assignment** (which scopes and/or tasks the Consulting Company is granted access to), and the **Sub-Assignment** (the Consulting Company's internal distribution of work among its own members).

Time tracking lives in the Consulting Company's tenant and flows to the Client as **aggregated** metrics (count + total hours + dollars). Invoicing is **B2B** — Consulting Company → Client Company's billing email. Consultants are **not team members**, do not count against the Client's seat cap, and only see what has been assigned to them.

## Business Problem

Today a wxKanban Client Company that wants to bring in outside consulting help has only two options: (a) burn a team-member seat to give the consultant tenant access — which exposes data the consultant shouldn't see, counts against the seat cap, and treats a vendor relationship as employment; or (b) work entirely outside wxKanban with email + spreadsheets, losing the platform's task, time, and billing integrity. Today's BUG case — Howard at HAS Enterprises (a consulting firm on the CONSULTANT plan) being invited to wxperts and getting blocked by the accept handler's "email already exists" check — is the direct manifestation. The platform needs a first-class Company-to-Company engagement model so a Client can grant scoped access to a Consulting Company without making the consultant a team member, while preserving each tenant's data isolation and billing integrity.

## Actors

- **Primary**: Client Company ADMIN — initiates the engagement, manages assignments, sees aggregate billing, controls lifecycle transitions
- **Secondary**: Consulting Company ADMIN — accepts engagements on behalf of the Consulting Company, sub-assigns work to their members, generates B2B invoices
- **Secondary**: Consulting Company TEAM_MANAGER — sub-assigns engagement work to Consulting Members (alongside ADMIN)
- **Secondary**: Consulting Member — does the assigned work; logs time in their own tenant; sees only what's sub-assigned to them

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Client Company ADMIN (initiates Engagement, manages Assignments) |
| **Secondary Actors** | Consulting Company ADMIN (accepts, sub-assigns, invoices); Consulting Company TEAM_MANAGER (sub-assigns); Consulting Member (does the work) |
| **Key Value** | Hire a consulting firm — solo or multi-person — and have scoped collaboration, time tracking, and B2B billing flow inside the platform without granting team-member access |
| **Lifecycle States** | `active`, `paused`, `disabled`, `ended` (terminal) |
| **Scope Boundary** | IN: Engagement model + lifecycle (active/paused/disabled/ended); Engagement Assignment (scope-level + task-level + mixed); Sub-Assignment within Consulting Company; multi-project per engagement; concurrent consultants per scope/task; aggregated billing visibility to Client; B2B invoice generation; optional PM connect at onboarding; audit trail; at-least-one-ADMIN invariant. OUT: marketplace/discovery/profiles/reviews (→038); proposals/rate negotiation/NDAs (→039); payment processing/escrow (→040); time-entry dispute/cross-engagement reporting (→041); per-member time breakdown to Client; messaging/DMs/@-mentions; manual lifecycle phase advance by consultants; task deletion by consultants. |

---

## Functional Requirements

### A. Engagement Lifecycle

#### FR-001 — Invite Consulting Company by email
Client ADMIN sends invite from Personnel → Consultants section. Creates `engagementinvitations` row with single-use 7-day token. Does not consume seat-cap quota.

#### FR-002 — Accept invitation routing
Single endpoint `POST /api/engagements/invite/:token/accept`. Branches:
- Email exists + primary Company is CONSULTANT-plan + user is ADMIN of that Company → bind engagement to that tenant.
- Email exists + primary Company is NOT CONSULTANT-plan → reject with HTTP 403 directing user to upgrade or use a different account.
- Email does not exist → render auto-provision form (FR-003).

#### FR-003 — Auto-provision Consulting Company tenant
Form captures Company name, primary-contact full name, accept-terms. Optional PM-system OAuth panel. On submit: create CONSULTANT-plan `companies` row in free/trial billing state + `userprofiles` row as ADMIN + the `engagements` row. Land on engagement view within 60s of click.

#### FR-004 — State machine
- Allowed transitions: `active ↔ paused`, `active ↔ disabled`, `* → ended`.
- `paused` and `disabled` both block writes; reads allowed.
- `ended` is terminal; access revoked except read-only history.
- Disallowed transitions return HTTP 409.
- All transitions audited to `companyauditlogs` for both tenants.

#### FR-005 — Mutable assignments
Client ADMIN may add/remove assignments at any time while `active`. Removed scope/task: writes revoked immediately; existing time entries preserved as billable history. Added: visible to Consulting Co. in real time (no re-acceptance). Modifications during `paused`/`disabled` are queued, applied on resume.

### B. Assignment Granularity

#### FR-006 — Three-level assignment granularity per engagement

`engagementassignments` row grants ONE of three granularity levels:

1. **Project-level** — `projectid` set, `scopeid` null, `taskid` null. Covers every current and future scope and task in that project until removed.
2. **Scope-level** — `projectid` + `scopeid` set, `taskid` null. Covers every current and future task in that scope until removed.
3. **Task-level** — `projectid` + `taskid` set, `scopeid` null. Covers exactly that task.

DB check constraint: at most one of `(scopeid, taskid)` is non-null. Mixed granularities per Engagement allowed (e.g., whole project A + just one task in project B).

#### FR-007 — Multi-project per Engagement
Single Engagement may carry assignments across multiple Projects of the same Client Company. UI groups assignments by Project.

#### FR-008 — Concurrent Consultants on same scope/task
Two Engagements (different Consulting Companies) may both have grants on the same scope/task. Each Consulting Co. sees only their own time/sub-assignments; the Client sees both Consulting Companies' aggregates separately.

#### FR-030 — Duplicate assignment = same full key (Amendment A, 2026-10-25)
An add is a duplicate, and refused with `409 ASSIGNMENT_ALREADY_EXISTS`, only when this engagement already holds an **active** assignment with the same `(projectid, scopeid, taskid)`, where an absent `scopeid` / `taskid` matches only NULL. Any other combination is a new grant (FR-006 mixed granularities, FR-007 multi-project).
- AC1: an engagement holding whole-project A accepts whole-project B (201).
- AC2: whole-project A twice → 409, `existingId` naming A's row.
- AC3: whole-project A plus scope S in A, or task T in A → both accepted (FR-006).
- AC4: a removed assignment (`removedat` set) never blocks a new one.

*Defect this closes:* before 2026-10-25 a project-level add matched on engagement only, so any active assignment blocked every later project-level add, naming a different project's row.

#### FR-031 — "All projects" one-time grant (Amendment A, 2026-10-25)
The Add assignment dialog's **Whole project** tab carries an **All projects** checkbox. Checked, the project picker is disabled and the add grants a whole-project assignment on **every project the Client Company currently owns with status `ACTIVE`** that this engagement does not already hold at project level. Archived or other non-ACTIVE projects are never included.
- It is a **one-time bulk add, not a standing flag**: each project gets its own ordinary `engagementassignments` row, so FR-011 visibility, FR-029 project access, audit, notifications and YappChatt room sync (SCOPE-144) all work unchanged. Projects the Client creates later are **not** covered; they are added like any other.
- API: `POST /api/engagements/:id/assignments` with `{ "allProjects": true }` (no `projectid`, `scopeid` or `taskid`; sending them with it → 400). Client ADMIN only, as for single adds. Answers `201 { added: [{ id, projectid }], skipped: [projectid] }` — `skipped` = projects already held at project level. Nothing left to add → `200` with empty `added`.
- Only projects whose `companyid` is the engagement's Client Company; projects the caller reaches as a consultant elsewhere are never included.
- Inserts run in one transaction (all or none). Each added row is audited to both tenants exactly as a single add; the FR-023 assignment notification goes out **once**, listing the projects.
- `paused` / `disabled` engagement: one queued `ADD_ASSIGNMENT` per project (FR-005), `202` as for single adds. `ended` → 403 `ENGAGEMENT_ENDED`.
- The checkbox's help text says it covers current projects only.
- AC1: Client with projects A, B, C; engagement holds A → `added` = B, C; `skipped` = A.
- AC2: run again → `200`, `added` empty.
- AC3: a project of another company never appears in `added`.
- AC4: a forced failure on the second insert leaves no new rows.
- AC5: one FR-023 notification per bulk add.

*Rejected alternative:* a live engagement-level "all projects" flag (covering future projects). It would add an "or all projects" branch to every FR-011 / FR-029 visibility check and grant open-ended access from one checkbox (SOC 2 CC6.1/CC6.3). Not adopted.

### C. Sub-Assignment

#### FR-009 — Sub-Assignment by Consulting Co. ADMIN or TEAM_MANAGER
`subassignments` rows link an Engagement Assignment to one or more Consulting Members. Consulting Members with no active sub-assignment see nothing of that Engagement. Sub-assignments are not visible to the Client.

#### FR-010 — Member removal cascade
On Consulting Member deactivation, their active sub-assignments transfer to a "Needs reassignment" queue visible to the Consulting Co. ADMIN and TEAM_MANAGER. Either role may reassign queue items to any active Consulting Member.

### D. Consultant Permissions

#### FR-011 — Visibility scoping
Consulting Member sees ONLY scopes/tasks matching their active sub-assignments through their Company's active Engagement. A project-level grant transitively covers every scope and task within that project; a scope-level grant transitively covers every task within that scope; a task-level grant covers only that task. Within an assigned scope: `spec.md`/`plan.md`/`tasks.md` visible read-only. No visibility into: other scopes, other projects, team members, company settings, billing config, lifecycle decisions outside assignments.

#### FR-012 — Allowed actions on assigned work
Change task status; add comments/notes; upload files; log billable/non-billable time entries (stored in Consulting Co. tenant per FR-015); create new tasks only when scope-level assignment grants the scope.

#### FR-013 — Disallowed actions
Delete tasks (always denied); manually advance lifecycle phase (always denied — automation only); view/@-mention Client team members; access any data outside active assignments.

#### FR-014 — Lifecycle phase visibility
Consulting Members see current lifecycle phase of any assigned scope (read-only). Phase changes via existing wxKanban automation only.

### E. Billing & Invoicing

#### FR-015 — Time entries owned by Consulting Co. tenant
A time entry logged by a Consulting Member is stored in the Consulting Co.'s tenant against `engagementid`, `subassignmentid`, and original `taskid`. The Client's `timeentries` table receives no copy.

#### FR-016 — Aggregated billing visibility to Client (confidentiality contract)
Personnel → Consultants → [Consulting Co.] card shows: distinct Consulting Members count + total billable hours + total dollars (Consulting Co.'s hourly rate). NO per-member, per-task, or per-day breakdown ever exposed to the Client. Time-window selector: this month / last month / engagement-to-date.

#### FR-017 — B2B invoice generation
Consulting Co. ADMIN generates invoice for billable-time range on an Engagement. Existing invoice/PDF flow reused with Client as billed party. Delivery to `companies.billingemail`; empty = fail-fast with clear error. Invoice references Engagement ID + time window only — not individual entries.

#### FR-018 — Time entries final-on-submit (MVP)
Once submitted, a time entry cannot be deleted by either side. Corrections via offsetting entry with note. Dispute/reject workflow deferred to spec 041.

### F. PM Integration

#### FR-019 — Optional PM connection during onboarding
Auto-provision form shows "Connect a PM system" panel using spec 020's OAuth flow. Skipping does not block onboarding.

#### FR-020 — PM connection manageable post-onboarding
Consulting Co. ADMIN may connect/disconnect/reconnect from Company settings.

#### FR-021 — Bidirectional sync of Engagement work to connected PM
**Status: Pending spec 020 completion.** Won't ship in 037 MVP if 020 isn't stable. AC1: assigned tasks appear in consultant's PM tool. AC2: status changes + time entries in their PM sync back to Client wxKanban view (subject to FR-015 — time first lands in Consulting Co. tenant).

### G. Notifications

#### FR-022 — Engagement state-change notifications
`active → paused`: both sides emailed. `paused → active`: silent. `active ↔ disabled`: both sides emailed. `* → ended`: both sides emailed.

#### FR-023 — Assignment-modification notification
Saving assignment changes emits a single batched email to Consulting Co. ADMIN(s) summarizing added/removed items. Copy logged in `companyauditlogs` for both tenants.

#### FR-024 — Scope-phase auto-advance notification
On phase advance of an assigned scope, Client ADMIN(s) notified. Consulting Co. is not notified.

### H. Other

#### FR-025 — Consultants do not consume seat-cap quota
Consulting Members never count against the Client's `companies.maxusers`. Consulting Co.'s own seat cap enforced per tier rules.

#### FR-026 — Personnel UI: Consultants section
Personnel page gains "Consultants" section below team members. Each engaged Consulting Co. shown as a card: name, state, members count, hours/$, lifecycle actions. "Invite Consulting Company" entry point.

#### FR-027 — New top-level data entities
Four new tables (UUID v7 PKs, lowercase concatenated column names per CLAUDE.md): `engagementinvitations`, `engagements`, `engagementassignments`, `subassignments`. One new column: `companies.billingemail`.

#### FR-028 — At-least-one-ADMIN invariant
Every Company (Client or Consulting) must have at least one active ADMIN at all times. Removing the last ADMIN returns HTTP 409. Applies generally; observable through the consultant onboarding flow.

#### FR-029 — Consultant project access via Engagement

A project assigned to a Consulting Company through an active Engagement is accessible by that Consulting Company's members through the SAME project workspace UI used for owned projects — no parallel "consultant view" routes.

- **Whole-project grant** (`scopeid` null + `taskid` null): the project appears in the consultant's `GET /api/projects` list and is openable at `/projects/:id`. The workspace behaves identically to an owned project, gated only by FR-012 disallowed actions (no manual phase advance, no team-member access, etc.).
- **Scope-level or task-level grant**: project is accessible but scope/task listings are filtered to visible items only — out-of-scope items return 404 to the consultant. (Deferred to Phase B; whole-project grants ship first.)
- **Badging**: projects accessed via Engagement are visually labeled "Client project — [Client Company Name]" in the workspace header and in the project list, so a consultant who also owns their own projects can distinguish the two.
- **Backend annotation**: `GET /api/projects` and `GET /api/projects/:id` return `accessRole: 'owner' | 'consulting'`; when consulting, also `engagementId` and `clientCompanyName`. FR-011 visibility rules and FR-012 action rules apply to the consulting access path.

---

## Data Model

```sql
-- engagementinvitations
id                  uuid v7 pk
clientcompanyid     uuid fk → companies.id    not null
invitedemail        text not null
invitedbyid         uuid fk → userprofiles.id not null
token               text unique not null
status              text not null   -- 'pending' | 'accepted' | 'expired' | 'revoked'
expiresat           timestamp not null
invitedat           timestamp default now()
acceptedat          timestamp null
message             text null

-- engagements
id                   uuid v7 pk
clientcompanyid      uuid fk → companies.id    not null
consultingcompanyid  uuid fk → companies.id    not null
state                text not null              -- 'active' | 'paused' | 'disabled' | 'ended'
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
   where state in ('active', 'paused', 'disabled')

-- engagementassignments
id              uuid v7 pk
engagementid    uuid fk → engagements.id  not null
scopeid         text null    -- e.g. '037'; text not FK
taskid          uuid fk → tasks.id null
projectid       uuid fk → projects.id    not null   -- granularity carrier when both scope+task null = whole-project grant
addedat         timestamp default now()
addedbyid       uuid fk → userprofiles.id not null
removedat       timestamp null
removedbyid     uuid fk → userprofiles.id null
check (NOT (scopeid IS NOT NULL AND taskid IS NOT NULL))  -- at most one non-null; both null = project-level grant

-- subassignments
id                      uuid v7 pk
engagementassignmentid  uuid fk → engagementassignments.id not null
consultingmemberid      uuid fk → userprofiles.id          not null
assignedat              timestamp default now()
assignedbyid            uuid fk → userprofiles.id          not null
removedat               timestamp null
removedbyid             uuid fk → userprofiles.id null

-- New column on existing table
ALTER TABLE companies ADD COLUMN billingemail text null;
```

---

## API Surface

Under `/api/engagements`, new router `src/server/routes/engagements.ts`, mounted in `app.ts` (task T011 — first wiring step to prevent BUG-20 class).

| Method | Path | Caller |
|---|---|---|
| POST | `/invite` | Client ADMIN |
| GET | `/invite/:token` | Public |
| POST | `/invite/:token/accept` | Recipient (branches by `provisionCompany` payload) |
| GET | `/` | Any tenant member (filtered by tenant role) |
| GET | `/:id` | Either party |
| POST | `/:id/pause` | Client ADMIN |
| POST | `/:id/resume` | Client ADMIN |
| POST | `/:id/disable` | Client ADMIN |
| POST | `/:id/enable` | Client ADMIN |
| POST | `/:id/end` | Client ADMIN |
| GET | `/:id/assignments` | Either party |
| POST | `/:id/assignments` | Client ADMIN (single, or `{ allProjects: true }` bulk — FR-031) |
| DELETE | `/:id/assignments/:aid` | Client ADMIN |
| GET | `/:id/subassignments` | Consulting Co. members |
| POST | `/:id/assignments/:aid/subassign` | Consulting ADMIN or TM |
| DELETE | `/:id/subassignments/:sid` | Consulting ADMIN or TM |
| GET | `/:id/billing` | Client ADMIN (aggregate, FR-016) |
| POST | `/:id/invoice` | Consulting ADMIN (B2B, FR-017) |

Auth-context resolver middleware required: determines Client side vs Consulting Co. side based on caller's primary `companyid` and engagement's two FKs.

---

## Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `ConsultantsPanel` | `PersonnelManagementPage.tsx` (new section) | List of engagements with FR-016 metrics |
| `InviteConsultingCompanyModal` | new `admin/InviteConsultingCompanyModal.tsx` | Email-only invite form |
| `EngagementDetailPage` | new route `/engagements/:id` | Both-sides view with role-gated actions |
| `AssignmentEditor` | inside `EngagementDetailPage` | Client ADMIN: pick scopes/tasks, add/remove |
| `SubAssignmentEditor` | inside `EngagementDetailPage` | Consulting ADMIN/TM: distribute to members |
| `ConsultantProvisionForm` | new route `/engagements/invite/:token/setup` | FR-003 onboarding |
| `ConsultantWorkView` | extends `ConsultantWorkHubPage.tsx` | Consulting Member work surface |
| `InvoiceGenerator` (reuse) | existing | Pre-populate billed-company from `engagement.clientcompanyid` |

---

## Success Metrics

1. **SC-1 — Engagement establishment time**: Median elapsed time from "Client ADMIN clicks Invite" to "Engagement row in `active` state with a Sub-Assignment created" is ≤ **10 minutes** across 10 successive beta runs covering both existing-tenant and auto-provision paths.
2. **SC-2 — Solo consultant onboarding speed**: 90th-percentile time from invite-click to "first assigned task is visible in the new Consulting Co. tenant" is ≤ **5 minutes**, measured across 5 net-new-email beta accepts.
3. **SC-3 — Permission isolation correctness**: A negative-test suite of ≥ **15 scenarios** (one per FR-013 + FR-011 visibility rule) passes 100% — including cross-engagement leak, cross-scope leak, team-list visibility, and manual phase-move attempts.
4. **SC-4 — Billing accuracy and confidentiality**: Over a 7-day beta with 3 active engagements × 2 Consulting Members logging time each, Client-side aggregate metrics match Consulting Co.-side time-entry sums to **within 60 seconds** of any new entry, with **zero** API endpoints exposing per-member or per-task breakdowns to the Client (verified by automated reconciliation + manual API surface audit).
5. **SC-5 — B2B invoice delivery rate**: Generated invoices deliver to `companies.billingemail` with **≥ 99.9%** success rate (with retry queue and exponential backoff up to 24 hours) over the first 100 invoices issued post-launch; PDF generation completes within **< 2 minutes**.
6. **SC-6 — Lifecycle state machine soundness**: **100% branch coverage** of the engagement state-machine reducer in unit tests; disallowed transitions return HTTP 409 with a clear error code; audit rows exist for **100%** of state transitions verified in integration tests.
7. **SC-7 — SOC 2 audit-evidence trail**: Every engagement state transition, assignment add/remove, and sub-assignment change writes an append-only row to `companyauditlogs` (no UPDATE or DELETE paths); the forensic timeline for any engagement is reconstructable by `engagementid` query within **< 5 seconds**.

## Out of Scope

This scope is foundational and intentionally excludes the following — each is documented as a separate downstream scope:

- **Marketplace discovery, public Consulting Company profile pages, star reviews / review text** → deferred to scope **038**.
- **Pre-sales workflow**: proposals, hourly rate negotiation, optional background checks, NDAs / legal-document storage → deferred to scope **039**.
- **Payment processing**: Stripe Connect / escrow / platform fees / 1099 issuance → deferred to scope **040**.
- **Time-entry dispute / reject workflow** (FR-018 final-on-submit MVP is the placeholder) → deferred to scope **041**.
- **Cross-engagement reporting** (Consulting Co.'s view of all their clients; Client's view of all consultants ever engaged) → deferred to scope **041**.
- **Per-Consulting-Member breakdowns exposed to the Client** — explicitly excluded as a confidentiality contract (FR-016); aggregate-only by design.
- **Messaging, direct messages, @-mentions** between Client and Consulting Members — excluded outright; out of scope.
- **Manual lifecycle-phase advancement by Consultants** — excluded; automated transitions only (FR-013, FR-014).
- **Task deletion by Consultants** — excluded; always denied (FR-013).
- **Bidirectional PM sync (FR-021)** — present as a stub; full implementation is pending **spec 020** completion and will land then.

---

## Compliance Requirements (SOC 2)

- **CC6.1 — Logical access controls**: Engagement + Sub-Assignment form the access surface. Verified by SC-3.
- **CC6.2 — Prior to initial access**: Token single-use, 7-day expiry, validated against `invitedemail`.
- **CC6.3 — Access removal**: `paused`/`disabled`/`ended` revoke writes immediately. Verified by SC-6.
- **CC7.2 — Incident response readiness**: Append-only `companyauditlogs`. Verified by SC-7.
- **Confidentiality (C1.1, C1.2)**: FR-016 aggregate-only billing; FR-009 AC3 sub-assignment hidden from Client.

CC6.6 (encryption at rest), CC6.7 (vuln scanning), CC7.3 (SDLC standards) inherited from baseline infrastructure.

---

## Constraints

- `scopeid text`, not FK. App-layer validation. Scope numbers filesystem-immutable per CLAUDE.md fencing rules.
- One open engagement per (Client × Consulting Co.) pair. `ended` rows are tombstones; re-engagement requires new invitation.
- Existing-user accept requires CONSULTANT-plan primary Company. Non-CONSULTANT plans refused.
- Solo Consulting tenants auto-provisioned land on free/trial billing state, not paid CONSULTANT subscription.
- `engagementinvitations` retained indefinitely for engagement provenance.
- All new tables: UUID v7 PKs, lowercase concatenated column names per CLAUDE.md.
- Dual-persona context (one user = ADMIN of own Consulting Co. + acting on Client engagements) is the user's responsibility; UI must always show active tenant context.
