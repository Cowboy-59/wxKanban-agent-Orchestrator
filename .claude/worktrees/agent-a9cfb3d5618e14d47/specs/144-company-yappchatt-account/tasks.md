# Task Breakdown: Company YappChatt Account

**Feature**: Company YappChatt Account
**Spec**: 144
**Date Generated**: 2026-10-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011) | critical | todo |
| 2 | T002 Security gate: community sessions only for the token's company (FR-009, FR-010) | critical | todo |
| 3 | T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007) | high | todo |
| 4 | T004 Declare the new columns in src/db/schema after they exist in production (FR-001) | high | todo |
| 5 | T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011) | high | todo |
| 6 | T006 Company account service and POST/GET /api/company/yappchatt (FR-001, FR-002, FR-003) | high | todo |
| 7 | T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004) | high | todo |
| 8 | T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007) | high | todo |
| 9 | T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008) | high | todo |
| 10 | T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008) | high | todo |
| 11 | T011 Project agent asks to create the company account when none exists (FR-006) | medium | todo |
| 12 | T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002) | medium | todo |
| 13 | T013 Audit every action to companyauditlogs (FR-010) | high | todo |
| 14 | T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers | medium | todo |
| 15 | T015 Acceptance: US1 to US6 live in a test company and the success metrics | high | todo |
| 16 | T016 (Amendment FR-012) Reviewed SQL + schema declaration: engagements.consultantapprovers, engagementinvitations.consultantapprovers | high | todo |
| 17 | T017 (Amendment FR-012) PATCH /api/engagements/:id/consultant-approvers (client ADMIN, audited); invitation create/accept carry the flag | high | todo |
| 18 | T018 (Amendment FR-012) 'Consultant managers may approve decisions' checkbox on the ConsultantsPanel card and in InviteConsultingCompanyModal | medium | todo |
| 19 | T019 (Amendment FR-012) Approver rule: consulting ADMIN/TEAM_MANAGER on assigned projects when the engagement allows it; tests | high | todo |

## Task Details

### T001 — T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011)

Managing agent writes specs/144-company-yappchatt-account/contracts.md before any area starts: C1 the YappChatt consumer endpoints (create-or-link account by email returning the user id, create group, add/remove group member, create room with members under an owner, add/remove room member, retire room; all behind WXKANBAN_CONSUMER_SECRET), C2 the reviewed SQL for the new columns, C3 the wxKanban routes and response shapes, C4 the bridge-to-server approver check. An area may not change a contract; it asks the managing agent.

### T002 — T002 Security gate: community sessions only for the token's company (FR-009, FR-010)

POST /api/community/session requires an app token (401 without) and issues a session only for an email of a user of the token's company or a consulting member on one of its projects (403 'This email isn't a member of your company' otherwise); refused attempts are audited. The Cockpit Community Help sends the app token; the bridge read login and the KAIN contract follow. Standalone: ships first, on its own.

### T003 — T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007)

companies: yappchattuserid, yappchattemail, yappchattlinkedat, yappchattgroupid; userprofiles: yappchattuserid; projectrooms: owneryappchattid, retiredat, and the (projectid, agentname) unique key replaced by a partial unique index on non-retired rows. Reviewed SQL for the owner to apply by hand (SCOPE-117), then npm run db:drift and the schema-change-log entry.

### T004 — T004 Declare the new columns in src/db/schema after they exist in production (FR-001)

Only after T003 is applied and db:drift passes: declare the columns in companies, userprofiles and projectrooms. Declaring before the column exists causes 500s.

### T005 — T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011)

src/server/lib/yappchattBroker.ts gains calls for each C1 endpoint. When the companion is not deployed (404 or not configured), every caller reports 'YappChatt companion not available' and changes nothing, so nothing half-completes.

### T006 — T006 Company account service and POST/GET /api/company/yappchatt (FR-001, FR-002, FR-003)

ADMIN-only create-or-link from the company contact email (link shows which account), idempotent second press, creates the company group and adds every company user and consulting member directly, storing each person's YappChatt user id. GET returns connected status, email and id to company users.

### T007 — T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004)

Brings the company group and every project room in line with wxKanban: company users in every project room, consulting members only in rooms of projects their engagement covers, removed people out of the group and every room. Reports a seat-limit shortfall instead of failing silently.

### T008 — T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007)

POST /api/project-agent/room and POST /api/agent/connect create rooms with the company account's session and the right members, record owneryappchattid; with no company account return 409 no_company_account (createCompanyAccount: true creates it first); a room with another or no recorded owner is retired (history kept) and replaced.

### T009 — T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008)

A Room Approver is a company ADMIN, or a user of type TEAM_MANAGER who is a current member of the project (projectusers, not removed). Returns { approver, name } for the bridge.

### T010 — T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008)

The bridge asks T009 with the poster's YappChatt user id before recording a DQ answer or a KR review; a non-approver's reply goes to the session as discussion with a room note that it was not recorded; approved_by is the approver's name (route.mjs and kain.mjs take the approver). Updates SPEC-142 Amendment A. KAIN still cannot review.

### T011 — T011 Project agent asks to create the company account when none exists (FR-006)

On 409 no_company_account the bridge posts 'Create the company YappChatt account now, using <contact email>?' and only on yes retries with createCompanyAccount: true; on no it stops with that message and creates nothing.

### T012 — T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002)

Connected / Not connected, email and id, and the Create YappChatt account button for ADMINs only (shadcn Card, Button, AlertDialog for the confirm and the link-found notice).

### T013 — T013 Audit every action to companyauditlogs (FR-010)

Account created or linked, member added or removed, room created or retired, session refused, room decision accepted or refused: one entry each with who, what and when.

### T014 — T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers

docs/kain-contract.md (session gate, approvers, room ownership), the Decision Memory help section (approvers), and a help section for the Team chat panel.

### T015 — T015 Acceptance: US1 to US6 live in a test company and the success metrics

Live runs of US1-US6 against a test company with the YappChatt companion deployed; measure success criteria 1-7 from data (room owners, membership, refused sessions, ledger approvers, audit entries). Endpoint-test every claim; unit green alone is not done.

### T016 — T016 (Amendment FR-012) Reviewed SQL + schema declaration

`ALTER TABLE engagements ADD COLUMN consultantapprovers boolean NOT NULL DEFAULT false;` and the same on engagementinvitations, as reviewed SQL for the owner to apply by hand (SCOPE-117), then npm run db:drift and the schema-change-log entry. Declare both in src/db/schema only after they exist in production.

### T017 — T017 (Amendment FR-012) Engagement route and invitation flag

PATCH /api/engagements/:id/consultant-approvers { consultantApprovers } for a client company ADMIN only (403 otherwise), one companyauditlogs entry per change (old and new value). The invitation create route accepts the flag and stores it on engagementinvitations; acceptance copies it to the new engagement.

### T018 — T018 (Amendment FR-012) The two checkboxes

"Consultant managers may approve decisions" on the client-side engagement card in ConsultantsPanel (calls T017) and in InviteConsultingCompanyModal (sent with the invitation). shadcn Checkbox, ADMIN only, off by default. These files belong to SCOPE-037.

### T019 — T019 (Amendment FR-012) Approver rule

GET /api/project-agent/approver (T009) also answers approver true, role CONSULTANT_MANAGER, for an active ADMIN or TEAM_MANAGER of a consulting company whose active engagement with the token's company has consultantapprovers true and a live assignment on the token's project. Unit tests for on, off, unassigned project, and paused or ended engagement.
