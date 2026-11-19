# Spec 144: Company YappChatt Account

## Overview

# Scope 144: Company YappChatt Account

**Scope Number**: 144
**Status**: `draft`
**Created**: 2026-10-24
**Depends On**: SCOPE-079 (Community Help), SCOPE-132 / SPEC-134 (project agent and rooms), SPEC-142 Amendment A (room answers and KAIN-reply review), SCOPE-014 (company and user management); companion scope in the YappChatt repo (FR-011)
**Source**: `specs/Project-Scope/144-company-yappchatt-account.md`

## Overview
Each wxKanban company owns its team chat. An ADMIN creates or links one company YappChatt account from the company's contact email, and its id is stored on the company record. Every company user, and every consulting member on the company's projects, is added directly to the company's group and kept in sync. Each project's room is created under the company account. Company users are in every project room; consulting members only in the rooms of projects they work on. Rooms from before are retired and replaced. In a room, only Room Approvers (ADMINs, and TEAM_MANAGERs on the project) decide, under their own name. Chat sessions open only for the calling company's own people, closing the open email-only login. YappChatt adds the endpoints this needs, in a companion scope. A company's project rooms in YappChatt are created under whichever user connected first (the user who issued the project's app token, or the user who ticked KAIN's grant), and nothing records who. A room can land in an account the company does not control, or in a YappChatt account nobody knew was created. The rest of the team is not in the room, so they cannot see or answer the project agent and KAIN. Separately, the Cockpit's Community Help opens a YappChatt session for any email with no sign-in, so anyone who knows a team member's email can read and post as them. All three pains are equal. It needs solving now because the KAIN review flow (SPEC-142 Amendment A) depends on the right people being in the room, and the session hole is open in production. This scope covers The company YappChatt account and its id on the company record; the Create YappChatt account button (ADMIN, company contact email, link if it exists); the company group with direct adds of company users and consulting members and each person's YappChatt id stored; membership sync on account creation, user add/remove, engagement start/end and every agent connect, with automatic removal; project rooms created under the company account with company users plus the project's consulting members; no-account path (no room, offer to create); retiring rooms created the old way; Room Approvers for DQ answers and KAIN-reply reviews; the community session gate for the Cockpit, the bridge read login and KAIN; audit of every action. Any change to the shared app token. Room naming (stays "<project> · KAIN"). Moving chat history out of retired rooms. Per-person YappChatt sign-in or SSO. Automation of common (non-project) rooms, which stay by the YappChatt Manager's invitation. MFA. Community Help for people without a wxKanban company (none at this time).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Company ADMIN (presses the button; is the YappChatt Manager) |
| **Secondary Actors** | Company users and consulting members, TEAM_MANAGERs (Room Approvers), The project agent (kit bridge), KAIN (supervising agent), YappChatt (companion scope) |
| **Key Value** | A company's project rooms in YappChatt are created under whichever user connected first (the user who issued the project's app token, or the user who ticked KAIN's grant), and nothing records who. A room can land in an account the company does not control, or in a YappChatt account nobody knew was created. The rest of the team is not in the room, so they cannot see or answer the project agent and KAIN. Separately, the Cockpit's Community Help opens a YappChatt session for any email with no sign-in, so anyone who knows a team member's email can read and post as them. All three pains are equal. It needs solving now because the KAIN review flow (SPEC-142 Amendment A) depends on the right people being in the room, and the session hole is open in production. |
| **Scope Boundary** | The company YappChatt account and its id on the company record; the Create YappChatt account button (ADMIN, company contact email, link if it exists); the company group with direct adds of company users and consulting members and each person's YappChatt id stored; membership sync on account creation, user add/remove, engagement start/end and every agent connect, with automatic removal; project rooms created under the company account with company users plus the project's consulting members; no-account path (no room, offer to create); retiring rooms created the old way; Room Approvers for DQ answers and KAIN-reply reviews; the community session gate for the Cockpit, the bridge read login and KAIN; audit of every action. Any change to the shared app token. Room naming (stays "<project> · KAIN"). Moving chat history out of retired rooms. Per-person YappChatt sign-in or SSO. Automation of common (non-project) rooms, which stay by the YappChatt Manager's invitation. MFA. Community Help for people without a wxKanban company (none at this time). |


## User Scenarios & Testing

### US1 — Admin creates the company account

**Actor**: Company ADMIN

**Scenario**:
1. On the Company page the admin sees 'YappChatt account: not connected' and presses Create YappChatt account.
2. wxKanban shows the contact email (info@acme.com) and asks to confirm.
3. It creates the account (or links it, if info@acme.com already has one, naming the account found), creates the company group and adds all 5 users directly.

**Expected outcome**: The page shows 'Connected: info@acme.com' and the YappChatt id; the group has 5 members; each user's YappChatt id is stored; each add is in the company audit log.

### US2 — The project agent opens a room and the team is there

**Actor**: Project agent

**Scenario**:
1. A developer starts the project agent on project Billing.
2. No room exists, so the server creates 'Billing · KAIN' under the company account with all 5 company users plus the consulting member assigned to Billing, and not a second consultant who works only on another project.

**Expected outcome**: All 6 see the room under their own YappChatt accounts; the room row records the company account as its owner.

### US3 — A TEAM_MANAGER answers a parked question; a TEAM_MEMBER cannot

**Actor**: TEAM_MANAGER on Billing

**Scenario**:
1. The room shows 'Decision needed (DQ-01)'. A TEAM_MEMBER replies 'DQ-01: yes'.
2. Their reply goes to the agent as discussion, with a room note that it is not recorded as a decision.
3. The TEAM_MANAGER replies 'DQ-01: no, use seeded data'.

**Expected outcome**: A ledger entry with approved_by set to the manager's name; the unit resumes.

### US4 — Edge: no company account yet

**Actor**: Developer

**Scenario**:
1. A developer starts the project agent for a company with no YappChatt account.
2. The agent asks: 'Create the company YappChatt account now, using info@acme.com?'
3. On no, no room is created and the agent stops with that message; on yes, it does US1's work and then US2's.

**Expected outcome**: A room is never created under a personal account.

### US5 — Edge: someone leaves, and an old room is replaced

**Actor**: Company ADMIN

**Scenario**:
1. An ADMIN removes a user from the company, and a consulting engagement on Billing ends.
2. On the next agent connect, an old room created under a personal account is found.

**Expected outcome**: Within one sync the removed user is out of the group and every project room, and the consultant is out of Billing's room; the old room is retired with its history kept and a new company-owned room replaces it.

### US6 — Edge: someone tries to borrow a login

**Actor**: An outsider

**Scenario**:
1. Someone calls the community session endpoint with a team member's email, with no token or with another company's token.

**Expected outcome**: Refused ('This email isn't a member of your company'), no session issued, and the attempt recorded in the audit log.

## Functional Requirements

### FR-001 — The company YappChatt account on the company record

The company record holds the company YappChatt account's user id, the email it was made from, and when it was linked.

**Acceptance Criteria**:
- [ ] Once the account exists, the Company page shows 'Connected: <email>' and the id.
- [ ] Without one, the page shows 'Not connected' and the button.

### FR-002 — The Create YappChatt account button (ADMIN only)

The button always uses the company contact email. If that email already has a YappChatt account it is linked, not created, after showing the admin which account it is. Pressing it again on a connected company changes nothing.

**Acceptance Criteria**:
- [ ] A non-ADMIN never sees the button and the server refuses them with 403.
- [ ] An existing YappChatt account for the contact email is linked, not duplicated.
- [ ] A second press neither creates nor relinks anything.
- [ ] Before anything changes, the admin sees the account the button would use (email, whether it already exists, its display name) and confirms; the preview itself changes nothing (D5, contracts C1.0 and C3).

### FR-003 — The company group

Under the company account, wxKanban creates the company's YappChatt group and adds every company user, and every consulting member on one of the company's projects, directly (no invitation step), storing each person's YappChatt user id against their wxKanban user.

**Acceptance Criteria**:
- [ ] After FR-002 the group holds all of them.
- [ ] Each person's YappChatt id is stored.

### FR-004 — Membership sync

Group and room membership are brought in line with wxKanban when the account is created, when a user is added or removed, when a consulting engagement starts or ends, and on every project agent connect. Removed people come out of the group and every project room. A consulting member is only in the rooms of projects their engagement covers.

**Acceptance Criteria**:
- [ ] A removed user is gone from the group and all rooms after one sync.
- [ ] A consultant not on a project is never added to its room.

### FR-005 — Rooms under the company account

A project room is always created with the company account's session, never a token issuer's or a grant-ticker's. Its members are the company users plus the consulting members on that project. The room row records its owner (the company account's id).

**Acceptance Criteria**:
- [ ] A new room is owned by the company account, whoever connected first.
- [ ] The room row names that owner.

### FR-006 — No company account means no room, and an offer to create one

With no company YappChatt account, the project agent creates no room and asks: 'Create the company YappChatt account now, using <contact email>?' Yes runs FR-002 then FR-005; no stops with that message.

**Acceptance Criteria**:
- [ ] No room is ever created under a personal account.
- [ ] Answering no leaves nothing created.

### FR-007 — Old rooms are retired

On connect, a room whose recorded owner is not the company account, or that has no owner recorded, is retired in YappChatt with its history kept; a new company-owned room replaces it and the room row is updated.

**Acceptance Criteria**:
- [ ] After one connect the project's room is company-owned.
- [ ] The old room still exists in YappChatt, retired.

### FR-008 — Room Approvers

A parked-question answer (DQ-nn) or a review of KAIN's answers (KR-nnnn) counts only from a Room Approver: a company ADMIN, or a user of type TEAM_MANAGER who is a current member of that project (projectusers, not removed). The bridge asks the server using the poster's YappChatt user id. Anyone else's reply goes to the agent as discussion, with a room note that it was not recorded. A decision is recorded with the approver's name as approved_by. This updates SPEC-142 Amendment A, which treats any person who posts as the owner.

**Acceptance Criteria**:
- [ ] A TEAM_MEMBER's 'DQ-01: yes' creates no ledger entry and the room says so.
- [ ] A TEAM_MANAGER's answer creates an entry with their name.
- [ ] KAIN still cannot review.

### FR-009 — Community sessions only for the company's own people

The session endpoint requires an app token and issues a session only for an email that belongs to a user of that token's company, or a consulting member on one of its projects; anything else gets 403 'This email isn't a member of your company'. This applies to the Cockpit, the bridge's read login and KAIN, and the KAIN contract is updated.

**Acceptance Criteria**:
- [ ] No token gives 401.
- [ ] Another company's email gives 403 and no session.
- [ ] The company's own users still connect.

### FR-010 — Audit

Each of these writes an entry to the company audit log with who, what and when: account created or linked, member added or removed, room created or retired, session refused, room decision accepted or refused.

**Acceptance Criteria**:
- [ ] Each US1 to US6 action leaves exactly one audit entry.

### FR-011 — Depends on the YappChatt companion scope

FR-002, FR-003, FR-004 and FR-007 need YappChatt endpoints callable only with the shared consumer secret: create or link an account by email (returning its id), create the group, add and remove group members, add and remove room members, retire a room. Until they are deployed, the affected requirements report 'YappChatt companion not available' and do nothing.

**Acceptance Criteria**:
- [ ] With the companion missing, nothing half-completes.

### FR-012 — Consultant approvers, allowed per engagement (Amendment, 2026-10-24)

A client company can let a consulting company's ADMINs and TEAM_MANAGERs act as Room Approvers (FR-008). It is set per engagement: a checkbox "Consultant managers may approve decisions" on the client-side engagement card (ConsultantsPanel) and the same checkbox in the Invite consulting company dialog, carried to the engagement when the invitation is accepted. Off by default. When it is on, such a person is a Room Approver only on the projects their company holds a live assignment on, and only while the engagement is active.

**Acceptance Criteria**:
- [ ] A new engagement is off unless the invitation set it; an invitation's choice is carried to the engagement on acceptance.
- [ ] Only a client company ADMIN can change it (403 otherwise); every change writes one companyauditlogs entry (who, old, new).
- [ ] With it off, a consulting ADMIN or TEAM_MANAGER's room decision is not recorded (FR-008 room note); with it on, it is recorded under their name on an assigned project and refused on an unassigned one.
- [ ] Pausing, disabling or ending the engagement stops it at once.

## Data Requirements

Columns (all applied by hand under SCOPE-117: reviewed SQL, db:drift, change log; declared in the schema only after they exist):
- `companies`: add `yappchattuserid`, `yappchattemail`, `yappchattlinkedat`, `yappchattgroupid`.
- `userprofiles`: add `yappchattuserid`.
- `projectrooms`: add `owneryappchattid` and `retiredat`. A retired row is kept and a new row is written for the replacement; the unique key on (projectid, agentname) becomes a partial unique index on non-retired rows only.

No new tables: membership is derived from `userprofiles` (company users), `projectusers` (project membership) and `engagementassignments` (consulting assignments).

Audit: every FR-010 action goes to `companyauditlogs`.

Forbidden: storing any YappChatt session token or room token server-side (room tokens stay with the agent).

- (FR-012) `engagements`: add `consultantapprovers boolean NOT NULL DEFAULT false`; `engagementinvitations`: add `consultantapprovers boolean NOT NULL DEFAULT false`. Applied by hand (SCOPE-117), declared after they exist.

## API Routes

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/company/yappchatt` | ADMIN | `{ confirm: false }` previews the account with no change; `{ confirm: true }` creates or links the company account, creates the group, syncs members (FR-002, FR-003) |
| GET | `/api/company/yappchatt` | Company users | Connected status, email, id (FR-001). The Team chat panel that shows it is ADMIN-only for v1 (D4) |
| POST | `/api/project-agent/room` | App token (changed) | Uses the company account; 409 `no_company_account` when none; `{ createCompanyAccount: true }` creates it first; retires old rooms (FR-005, FR-006, FR-007) |
| POST | `/api/agent/connect` | Company token (changed) | Same room rules for KAIN |
| GET | `/api/project-agent/approver?yappchattUserId=…` | App token | Is this person a Room Approver on the token's project (FR-008) |
| POST | `/api/community/session` | App token (changed) | 401 without a token; 403 for an email outside the company (FR-009) |
| PATCH | `/api/engagements/:id/consultant-approvers` | Client company ADMIN | `{ consultantApprovers: boolean }`; audited (FR-012). The invitation create and accept routes carry the same flag |

## Frontend Components

- Company page: a "Team chat (YappChatt)" panel: Connected / Not connected, the email and id, and the Create YappChatt account button (ADMIN only), using shadcn `Card`, `Button` and `AlertDialog` for the confirm and the link-found notice.
- Cockpit: Community Help sends the app token with the email; the "isn't a member of your company" refusal is shown as is.
- Project agent (kit bridge, not UI): the "Create the company account now?" prompt, and the "not recorded: only approvers decide" room note.

- (FR-012) ConsultantsPanel client-side engagement card and InviteConsultingCompanyModal: the "Consultant managers may approve decisions" checkbox (shadcn Checkbox), ADMIN only. These files belong to SCOPE-037.

## Success Criteria

1. Ownership: 100% of project rooms created after release are owned by the company YappChatt account; 0 owned by a token issuer or grant-ticker (projectrooms.owneryappchattid equals companies.yappchattuserid).
2. Old rooms replaced: every project with a room created the old way is on a company-owned room within its first agent connect after release.
3. Right people, quickly: 100% of a company's users and only the consulting members assigned to a project are in that project's room; a removed user or ended engagement is out of the group and every room within one sync, under 5 minutes in the test company.
4. No borrowed logins: 0 sessions issued without an app token or for an email outside the token's company; every refused attempt is in the audit log.
5. Only approvers decide: 0 ledger entries or KAIN-reply reviews from anyone but a Room Approver; every decision names its approver.
6. Admin effort: connecting a company and getting a 5-person team into the group takes one button press and under one minute, with no YappChatt steps by hand.
7. Audit: 100% of the FR-010 actions leave exactly one audit entry.

## Key Entities

- **Company YappChatt Account** (new, on `companies`): the one YappChatt account a Company owns, made from its contact email or linked.
- **Project Session Room** (redefined): owned by the Company YappChatt Account and shared by the Company's users plus the project's consulting members.
- **Room Approver**: a Company ADMIN, or a TEAM_MANAGER (user type) who is a current member of the project.
- **YappChatt Manager**: a Company ADMIN, managing the account's common rooms by invitation.

## Constraints

- MUST deliver only the behavior described within the scope boundary: The company YappChatt account and its id on the company record; the Create YappChatt account button (ADMIN, company contact email, link if it exists); the company group with direct adds of company users and consulting members and each person's YappChatt id stored; membership sync on account creation, user add/remove, engagement start/end and every agent connect, with automatic removal; project rooms created under the company account with company users plus the project's consulting members; no-account path (no room, offer to create); retiring rooms created the old way; Room Approvers for DQ answers and KAIN-reply reviews; the community session gate for the Cockpit, the bridge read login and KAIN; audit of every action.
- MUST keep the following work out of scope for this iteration: Any change to the shared app token. Room naming (stays "<project> · KAIN"). Moving chat history out of retired rooms. Per-person YappChatt sign-in or SSO. Automation of common (non-project) rooms, which stay by the YappChatt Manager's invitation. MFA. Community Help for people without a wxKanban company (none at this time).
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: SCOPE-079 Community Help (Amendment C made the email the identity; FR-009 changes that). SCOPE-132 / SPEC-134 project agent and rooms (POST /api/project-agent/room, POST /api/agent/connect, projectrooms, docs/kain-contract.md). SPEC-142 Amendment A (room answers and KAIN-reply review; FR-008 replaces "any person who posts is the owner" with Room Approvers; built, not committed). SCOPE-014 company and user management and the engagement scopes (their events trigger the sync). Existing tables: companies (contactemail), userprofiles (usertype), projectusers, engagementassignments, projectrooms, companyauditlogs. YappChatt orgs (owner/admin/member, seat limit, invitations), chats created with memberIds, internal addConversationMember. CONTEXT.md terms: Project Session Room (redefined), Company YappChatt Account, YappChatt Manager, Room Approver.
- Constraints and risks: Constraints: schema changes are applied by hand (SCOPE-117) and a column is declared in src/db/schema only after it exists in production; never drizzle-kit push. The YappChatt companion ships first or the feature waits (FR-011 makes wxKanban safe to deploy first). WXKANBAN_CONSUMER_SECRET is the only wxKanban-YappChatt credential and stays on the server. No session or room token is stored server-side (SCOPE-132 FR-015). wxKanban is the membership source of truth; a hand-made YappChatt membership change in a project room or the group is undone at the next sync (common rooms excepted). Retiring a room never deletes its history. Risks: the live session hole stays open until FR-009 ships (high) — build and push FR-009 first, on its own; YappChatt group seat limits may stop a large company's sync (medium) — the sync reports the shortfall, never fails silently; a contact email that is a personal YappChatt account gets linked (medium) — the link step shows the admin whose account it is first. Compliance (SOC2): CC6.1 identity and authorisation design (identity from the app token's company, never a typed email); CC6.3 least privilege (consulting members only in their projects' rooms; ADMIN-only button); CC5.2 separation of duties (named Room Approvers; KAIN never reviews); CC7.2 audit trail (every add, remove, room change, refused session and decision). Notes: from the 2026-10-24 design discussion; decisions Q2 (a,1), Q3 (a,2), Q4 (a; common rooms by the manager's invitation), Q5 (a; removal yes), Q6 (c), Q7 (1a with an offer to create; 2b), Q8 (yes; no outside users), Q9 (boundary as listed).
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-24

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Room ownership is accidental and unrecorded, the team is not in the rooms, and the community session endpoint issues a session for any email; all three equal. |
| 2 | Whose email makes the company account? | Always the company contact email; if it already has a YappChatt account, link it (show the admin which account first). |
| 3 | How are people added to the company group, and who? | Directly, no invitation; company users plus consulting members on the company's projects. |
| 4 | Which rooms do consulting members join? | Only the rooms of projects their engagement covers. Common rooms are by the YappChatt Manager's invitation. |
| 5 | Who is the YappChatt Manager; is removal automatic? | Company ADMINs; yes, removal from the group and rooms is automatic. |
| 6 | Who may answer a parked question or review KAIN? | Room Approvers: ADMINs plus TEAM_MANAGERs on that project; recorded under their name. |
| 7 | No company account yet; old rooms? | No room; the agent offers to create the account. Old rooms are retired and replaced. |
| 8 | Community session rule? | Only for an email of the calling token's company (users or its consulting members); no outside users at this time. |
| 9 | Boundary | Out of scope: app token change, room naming, history move, per-person SSO, common-room automation, MFA. |
| 10 | (Amendment, 2026-10-24, owner) Which consulting people count, and for which projects? | A consulting company assigns its members item by item (subassignments), and those members count only where they are sub-assigned. The consulting company's ADMINs and TEAM_MANAGERs count on **every** project their company holds a live assignment on under an active engagement, with no subassignment: in the company group, in those projects' rooms, and for community sessions (contracts D2). Room Approvers are unchanged: the client company's ADMINs and TEAM_MANAGERs on the project. |


## Business Problem

Describe the concrete customer or operator pain point this scope solves. Replace this paragraph with specific language describing the current friction, the desired outcome, and why this work is being prioritized now.

## Actors

- Primary: Operator who initiates this workflow as part of their daily responsibilities and depends on the result for downstream decisions.
- Secondary: Reviewing engineer, dependent service, or stakeholder who consumes or validates the output produced by this scope.

## Success Metrics

1. Outcome 1 — replace with a concrete target that includes a number, percentage, or timing threshold (e.g., "Reduce X by 30%" or "Complete Y within 2 minutes").
2. Outcome 2 — replace with a second measurable metric covering reliability, throughput, or operator-visible behavior.
3. Outcome 3 — replace with a third measurable metric covering correctness, audit, or downstream impact.

## Scope Boundary

This scope covers the specific files, modules, or workflows listed here. Replace this paragraph with the concrete set of code surfaces, screens, or APIs that this iteration changes. Reference paths where helpful.

## Out of Scope

Items deliberately deferred to future scopes. Replace this paragraph with the concrete list of things this iteration does NOT change, including any cross-cutting concerns (publishing, migration, UI polish) that need their own scope.

## Open Questions

None at this time. Add open questions as they arise during scope review; resolve each one with a written decision before promoting the scope.

## Functional Requirements

### FR-001 — Replace with first requirement title

Describe the requirement in concrete behavioral terms. The system MUST do something specific, observable, and testable.

**Acceptance Criteria**:
- [ ] criterion 1 — what the operator can do
- [ ] criterion 2 — what the system persists or exposes

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-24
- **Phase**: design
