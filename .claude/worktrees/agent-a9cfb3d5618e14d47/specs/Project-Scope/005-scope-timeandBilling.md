# Time and Billing

**Implemented By**: SPEC-005 (`specs/005-Time-and-Billing/`)

> **Original stub, superseded by Amendment A (2026-11-01).** Kept for history only; the per-task minimum and the Billing=true setting below are replaced by FR-005/FR-007 (15-minute round-up) and FR-002 (per-project billed flag).
>
> time and billing , for each task generated, keep the amount of time  that the AI uses to accomplish the task. 
> if this is a consultant or settings are marked as "Billing=true"  allow admin in settings to set a minimum time effort for each task that if the tasks take less than that time it is then set to the min time.
> 
> if settings "Billing=true" is not set, disable the invoice selection on admin.
> 
> report should be the lifecycle report based on the speckit lifecycle command
> 
> all other time creations are done on the projects page and will be defined in that specifications

## Overview

Time and Billing gives the company ADMIN one page to capture and bill all work on billed projects. Each scope carries Developer and Resource (AI agent) time, and each project carries Brainstorming – Developer, Brainstorming – Resource and Processes – Resource lines. Time comes from a side timer with automatic and manual notes, from manual entries, and from agent runs, and every entry is rounded up to 15 minutes. For each client and each weekly (or negotiated bi-weekly) period, it generates a 2-page statement: daily Senior Developer and Resource rows with hours × rate, the total, and ACH payment details, then a terse summary of the scopes, bugs, processes and brainstorms done.

**Key Value**: bill a client weekly in minutes, with every developer and agent minute captured per scope and every statement adding up.

## Business Problem

wxperts does consulting and development work across many projects, its own and its clients', with a developer and AI agents doing the work. There is no place to see or record how much time went into each scope — split between developer and AI — nor the brainstorming and process time that sits outside any scope, so there is no way to say what a project cost in effort or what to bill a client. The Time & Billing link in the sidebar opens a blank page (no route exists; the dashboard card is a placeholder), and agent work goes unbilled.

## Actors

- Primary: Company ADMIN who bills clients (the consultant / Senior Developer)
- Secondary: Client (Customer) — receives the statement, has no login, Developers whose time is logged by the ADMIN

## Success Metrics

1. A weekly statement for one client is generated, from opening the page to a downloaded PDF, in under 5 minutes with no spreadsheet.
2. No agent minute goes unbilled: for a test week, the statement's Resource hours equal the summed active time of that client's billable agent runs, rounded per FR-007, with 0 runs unaccounted for.
3. Every statement adds up: on 100% of generated statements, each row's amount = hours × rate and the total = the sum of the rows; checked at generation, and a mismatch blocks the PDF.
4. No double billing: 0 entries appear on more than one statement and 0 edits succeed on locked entries.
5. A weekly statement for a client with 15 or fewer items done is 2 pages or fewer.
6. SOC 2 evidence: 100% of the FR-013 actions produce an audit row, and 0 log lines contain routing or account numbers (verified by log grep in QA).

## Scope Boundary

The /admin/time-billing page with a side timer panel and automatic/manual notes; the per-project "Bill this project" flag; per-scope Developer and Resource lines and the project-level Brainstorming – Developer, Brainstorming – Resource and Processes – Resource lines; manual entry and agent-run pre-fill of Resource time; 15-minute round-up; company default rates (Developer $150.00, Resource $50.00) with project overrides; the Customer billing cycle (weekly default, bi-weekly if negotiated); ACH details in company Settings; the per-client statement PDF (page 1 daily rows + ACH, page 2 summary); locking invoiced entries and correcting entries.

## Out of Scope

Taking payment or a paid/unpaid status; emailing statements to the client; a client-facing view; an approval workflow before invoicing (stays with SCOPE-022); changes to the existing task timer; legacy task-timer entries (no category) on this page or on statements; editing or deleting an invoiced entry.

## Integration Context

Extends projecttimeentries, TimeTrackingService and the timeTracking routes; extends InvoiceService and projectinvoices rather than forking them (its 30-day line-item guess is replaced by invoiceid on entries). Reads agentruns from SPEC-143 and must reconcile with AgentRunBillingService (one pull path). Uses Customers from SCOPE-119 (companyprojects.customerid) as the client. Fixes the dead AppShell sidebar link and replaces the AdminDashboard placeholder card. Uses src/server/lib/crypto.ts for AES-256-GCM and companyauditlogs for the audit trail. PDF via the existing @sparticuz/chromium path. SOC 2 is active: CC6.1 authorization design, CC6.3 least privilege (explicit ADMIN guard on every route), CC7.2 audit trail of every state change. Borders SCOPE-022 (consulting billing automation: review, approval, export). SCOPE-017, SCOPE-037 and SCOPE-119 depend on this scope; none of them changes.

## Constraints and Risks

1. Schema is applied by hand (SCOPE-117): write SQL, owner applies it, verify with npm run db:drift plus a column-level check (db:drift is table-level only), record in specs/117-production-schema-integrity/schema-change-log.md. Declare each column in Drizzle only AFTER its DDL is live, or every companyprojects/projecttimeentries query returns 500. drizzle-kit push is forbidden.
2. Automatic Resource time depends on SPEC-143: agentruns is not in production yet and its schema file and AgentRunBillingService are uncommitted. Until then FR-007 runs manual-only and says so. This scope's per-day, per-line, per-model rounding supersedes AgentRunBillingService's per-(session, task) diff approach — one pull path, not two.
3. Legacy task-timer entries (no category) are excluded from this page and from statements.
4. InvoiceService and InvoicesPage are extended, not forked.
5. "Resource", never "AI", in UI labels, statement text and i18n strings (all 6 locales).
6. Days are bucketed by workdate, never derived from no-tz timestamps (they read +5h shifted).
7. No client code on statements: notes and summary carry only command, task, scope, model and time — agentruns stores no prompt text, code or file contents and nothing here may add it.
8. ACH routing and account numbers are encrypted at rest and never logged.
Amendment A replaces the old per-task minimum time with 15-minute round-up and the old "Billing=true disables invoices" setting with the per-project billed flag.

## User Scenarios & Testing

### US1 — Track a working session with the timer

**Actor**: ADMIN / Senior Developer

**Scenario**:
1. Open Time & Billing, pick a project, then the scope line SCOPE-146 → Developer.
2. Start the side timer and work; agents run implement and wxCreateTestPlan.
3. Add a manual note: "15-min call with client re: audit scope".
4. Stop the timer after 1 h 38 m.

**Expected outcome**: A Developer entry of 1.75 hrs (rounded up) is created; its notes hold the automatic agent-run lines plus the manual note; the scope's Developer total rises by 1.75.

### US2 — Agent time lands on the right lines

**Actor**: System, reviewed by ADMIN

**Scenario**:
1. Over one day, 40 agent runs record about 1 h 32 m of active time: 30 runs tied to SCOPE-146 tasks, 6 wxCreateTestPlan / SOC 2 runs tied to no scope, 4 runs in a brainstorm session.
2. The ADMIN opens the page.

**Expected outcome**: Each line gets the day's summed active time, rounded up once: SCOPE-146 → Resource, Processes – Resource, Brainstorming – Resource. Waiting time is never counted. The ADMIN can add a manual Resource entry (model required) or correct an entry that is not yet invoiced.

### US3 — Generate a client's weekly statement

**Actor**: ADMIN

**Scenario**:
1. Tick "Bill this project" on two projects whose Customer is Acme.
2. Click Generate statement for Acme; the period pre-fills from Acme's billing cycle (10/26–11/1).
3. Download the PDF.

**Expected outcome**: Page 1 has, per day with time, one "N Senior Developers" row and one "N Resources" row with hours × rate = amount, the invoice total (sum of rows) and ACH details. Page 2 is a one-line-per-item summary of scopes, bugs, processes and brainstorms. The statement is about 2 pages, and every included entry is marked invoiced on that statement and locked.

### US4 — Billed project with no client (edge)

**Actor**: ADMIN

**Scenario**:
1. Tick "Bill this project" on a project with no Customer assigned.

**Expected outcome**: The project shows "Assign a client to bill this project" and is left off every statement until a Customer is assigned; nothing fails silently.

### US5 — Correcting an invoiced entry (edge)

**Actor**: ADMIN

**Scenario**:
1. Find that an entry on last week's statement was 1 hour too high.
2. Add a correcting entry of −1.00 hr in the current period with a note.

**Expected outcome**: The invoiced entry cannot be edited (409); the correcting entry appears on the next statement and reduces its total.

## Functional Requirements

### FR-001 — Time & Billing page

/admin/time-billing renders the Time & Billing page for an ADMIN on the SMALL_BUSINESS (Business) plan or higher — Business, Consultant and Enterprise — replacing the blank page and the AdminDashboard placeholder card (which becomes a link to the page). *(Amendment B: was CONSULTANT or higher.)*

**Acceptance Criteria**:
- [ ] The sidebar Time & Billing link opens the page; it is no longer blank.
- [ ] A TEAM_MANAGER sees the existing "Requires Admin" lock; a FREE plan sees the upgrade lock.
- [ ] Every API route behind the page refuses non-ADMIN callers with 403 and FREE-plan callers with the upgrade 403, enforced on the server.

### FR-002 — Project list and billed flag

The page lists every project of the ADMIN's company and, for a consulting company, every client project it is engaged on (FR-014), each with a "Bill this project" checkbox. An own project's flag is persisted on the project; an engaged client project's flag is persisted on the consulting company's billing row (FR-014).

**Acceptance Criteria**:
- [ ] A ticked box survives a page reload.
- [ ] Projects of other companies with no live engagement never appear and cannot be toggled; a toggle by id returns 404.
- [ ] A billed project with no Customer shows "Assign a client to bill this project".

### FR-003 — Time lines

Each project expands into one row per scope (Developer and Resource) plus three project lines: Brainstorming – Developer, Brainstorming – Resource, Processes – Resource. Each row shows its hours for the selected period.

**Acceptance Criteria**:
- [ ] Every scope of the project appears, except archived scopes.
- [ ] Totals show per scope, per project, and as a grand total across billed projects.
- [ ] The UI never shows the word "AI" as a line label.

### FR-004 — Date range

A date-range filter, defaulting to the current week, drives every total; a toggle includes invoiced entries.

**Acceptance Criteria**:
- [ ] Changing the range changes all totals.
- [ ] Invoiced entries are hidden unless the toggle is on.
- [ ] The default range is the current week.

### FR-005 — Manual entry

An ADMIN adds an entry to any line with: the person (Developer lines) or the model (Resource lines), the date, the hours, and notes. Hours round up to the next 15 minutes.

**Acceptance Criteria**:
- [ ] 0:07 is stored as 0.25 hrs and 1:38 as 1.75 hrs.
- [ ] A Resource entry without a model is rejected.
- [ ] The entry records who did the work and who entered it.

### FR-006 — Side timer with notes

A timer panel starts and stops against a chosen line. Stopping creates a Developer entry for the signed-in user, rounded up per FR-005. Its notes combine automatic lines for each agent run in the timer window (command · task · scope · model · minutes) with manual notes such as meetings.

**Acceptance Criteria**:
- [ ] Automatic note lines contain no prompt text, code or file contents.
- [ ] Manual notes are editable until the entry is invoiced.
- [ ] A running timer survives a page reload.

### FR-007 — Resource time from agent runs

For each day, the active seconds of agent runs are summed per line and per model and rounded up to 15 minutes once: runs tied to a scope's tasks go to that scope's Resource line, brainstorm runs to Brainstorming – Resource, all other runs to Processes – Resource. Waiting time and comparison runs (neverbilled) are never counted.

**Acceptance Criteria**:
- [ ] 40 runs totalling 1 h 32 m on one line in one day produce 1.75 hrs, not 40 × 0.25.
- [ ] Re-running the pull for a day never creates duplicate entries.
- [ ] Until the agentruns table exists in production, the page works with manual entry only and says so.

### FR-008 — Rates

Company Settings hold a Developer rate (default $150.00) and a Resource rate (default $50.00); a project may override either. Each entry keeps the rate in force when it was created.

**Acceptance Criteria**:
- [ ] Changing a rate does not alter existing entries.
- [ ] A project override wins over the company default.
- [ ] A new company starts with Developer $150.00 and Resource $50.00.

### FR-009 — Client statement

For one Customer and a period, Generate statement produces page 1: per day with time, one "N Senior Developers" row (distinct people with Developer time that day) and one "N Resources" row (each agent counted individually — every subagent run is 1 Resource even on the same model, the main session is 1, each manual Resource entry is 1), each with hours × rate = amount, then the invoice total and ACH details; and page 2, the summary (FR-010). Only the Customer's billed, unlocked entries in the period are included. The period pre-fills from the Customer's billing cycle (weekly default, bi-weekly if negotiated), starting the day after that Customer's last statement.

**Acceptance Criteria**:
- [ ] Every row's amount = hours × rate, and the total = the sum of the rows.
- [ ] Days with no time on a line have no row for that line.
- [ ] Five subagents on the same model in one day show as 5 Resources.
- [ ] The statement downloads as a PDF.

### FR-010 — Summary page

Page 2 lists the items done in the period, one line each with hours, grouped as Scopes, Bugs (bug tasks completed and feedback reports resolved), Processes (work outside the buildscope → implement pipeline, e.g. test plans, SOC 2 artifacts, DB analysis) and Brainstorms. It is kept to about one page by showing highest-hour items first and "+N more".

**Acceptance Criteria**:
- [ ] A typical weekly statement is 2 pages or fewer.
- [ ] No line contains prompt text, code, or data of another client.
- [ ] Each line is the item name and its hours, no prose.

### FR-011 — Locking and corrections

Every entry on a generated statement records that statement and becomes read-only. Corrections are new entries in a later period; negative hours are allowed only with a note.

**Acceptance Criteria**:
- [ ] Editing or deleting an invoiced entry returns 409.
- [ ] A −1.00 hr correction appears on the next statement.
- [ ] Generating a statement again for the same period does not pick up already-locked entries.

### FR-012 — ACH details

Company Settings store bank name, routing number, account number and account name, encrypted at rest (AES-256-GCM). Only an ADMIN can view or edit them; the account number is masked to the last 4 digits everywhere except the statement.

**Acceptance Criteria**:
- [ ] Database rows hold ciphertext only.
- [ ] A non-ADMIN API call returns 403.
- [ ] Logs never contain the routing or account number.

### FR-013 — Audit trail (SOC 2 CC7.2)

Entry create, edit and delete, billed-flag toggle, rate change, ACH change, and statement generation each write an audit record (who, what, when, before/after) to companyauditlogs.

**Acceptance Criteria**:
- [ ] Each listed action produces exactly one audit row.
- [ ] ACH audit rows record "changed", never the values.

### FR-014 — Engaged client projects (Amendment B)

A consulting company's ADMIN also bills the client projects it is engaged on (SCOPE-037): a project of another company is listed while an engagement between the two companies is not ended and has a live assignment (engagementassignments.removedat IS NULL) on that project. The consulting company's billed flag, Customer and rate overrides for it live in projectbillings, keyed by the consulting company and the project; nothing is written to the client's companyprojects row. Time entries on it belong to the consulting company (projecttimeentries.companyid). The Customer pre-fills from the consulting company's Customer linked to that client company (customers.clientcompanyid). Agent-run time (FR-007) is not pulled for engaged projects: agentruns records no company, so the consultant's runs cannot be told from the client's own; Resource time on them is entered manually.

**Acceptance Criteria**:
- [ ] An engaged client project appears with its scopes and the three project lines; once the engagement ends it leaves the list, and its already-recorded unbilled entries still go on the next statement.
- [ ] Ticking, the Customer and rate overrides of an engaged project write projectbillings only; the client's companyprojects row is unchanged, and the client company's own Time & Billing page never shows the consultant's flag, rates or entries.
- [ ] A toggle, entry, or timer on a client project with no live engagement returns 404.
- [ ] The pre-filled Customer is a Customer of the consulting company; a Customer of another company is rejected with 404.
- [ ] The agent-run pull never creates entries on an engaged client project, and the page says Resource time there is manual.

## Data Requirements

All changes are additive and applied by hand per SCOPE-117; each column is declared in Drizzle only after its DDL is live.

| Table | Change |
|---|---|
| `companies` | Reuse `hourlyrate` as the default Developer rate ($150.00). Add `resourcerate` numeric(10,2) default 50.00. Add `achbankname`, `achroutingnumber`, `achaccountnumber`, `achaccountname` text, encrypted via `src/server/lib/crypto.ts` |
| `companyprojects` | Add `billed` boolean default false. Reuse `hourlyrate` as the Developer override. Add `resourcerate` numeric(10,2) nullable (override) |
| `customers` | Add `billingcycle` varchar(10) default 'weekly' ('weekly' or 'biweekly') |
| `projecttimeentries` | `taskid` becomes nullable. Add `specid` (FK projectspecifications, nullable), `category` varchar(10) ('developer' or 'resource'), `line` varchar(12) ('scope', 'brainstorm' or 'process'), `model` varchar(100), `enteredbyid` (FK userprofiles), `invoiceid` (FK projectinvoices), `workdate` date, `resourcecount` integer (agents in the entry: distinct agent runs for an agent-pull entry, 1 for a manual Resource entry, NULL for Developer — FR-009 counts Resources from it). Negative `duration` allowed for corrections. Unique index on (projectid, line, COALESCE(specid, zero uuid), workdate, model) where source = 'agentrun' keeps the agent pull idempotent (COALESCE because project lines have no specid and PostgreSQL treats NULLs as distinct) |
| `projectinvoices` | Add `customerid` (FK customers), `periodstart` and `periodend` (date), `developerhours` and `resourcehours` (numeric) |
| `projectbillings` (new, Amendment B) | A consulting company's billing settings for an engaged client project: `id` uuid, `companyid` (FK companies, the billing company), `projectid` (FK companyprojects), `customerid` (FK customers, nullable), `billed` boolean default false, `hourlyrate` and `resourcerate` numeric(10,2) nullable overrides, `updatedbyid` (FK userprofiles), `createdat`, `updatedat`. Unique (companyid, projectid). Migration 0073, applied 2026-11-02 |

Forbidden: no change to `agentruns` (owned by SPEC-143); no prompt text, code or file contents in any column.

## API Routes

All routes require ADMIN (explicit role guard) on the SMALL_BUSINESS plan or higher and are scoped to the caller's company and the client projects it is engaged on (FR-014).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/time-billing/status` | Whether agent-run time is available (FR-007) |
| GET | `/api/time-billing/projects?from&to&includeInvoiced` | Projects (own and engaged), scope and project lines, totals |
| PATCH | `/api/time-billing/projects/:id/billed` | Toggle the billed flag |
| PATCH | `/api/time-billing/projects/:id/customer` | Set the Customer of an engaged client project (FR-014) |
| PATCH | `/api/time-billing/projects/:id/rates` | Set or clear the project's rate overrides (FR-008) |
| GET | `/api/time-billing/entries?projectid&from&to&includeInvoiced` | The project's entries, for edit and delete |
| GET | `/api/time-billing/timer` | The caller's running timer, if any (survives reload) |
| GET | `/api/time-billing/customers` | Customers with their billing cycle and billed-project count |
| PATCH | `/api/time-billing/customers/:id/billingcycle` | Set a Customer's billing cycle (FR-009) |
| GET | `/api/time-billing/statements/period?customerid` | The period to pre-fill for a Customer |
| POST | `/api/time-billing/entries` | Create a manual entry |
| PATCH | `/api/time-billing/entries/:id` | Edit an entry (409 if invoiced) |
| DELETE | `/api/time-billing/entries/:id` | Delete an entry (409 if invoiced) |
| POST | `/api/time-billing/timer/start` | Start the side timer on a line |
| POST | `/api/time-billing/timer/stop` | Stop the timer and create the Developer entry |
| GET | `/api/time-billing/timer/notes?since` | Automatic agent-run note lines for the timer window |
| POST | `/api/time-billing/agent-pull?date` | Idempotent daily pull of Resource time from agent runs |
| GET | `/api/time-billing/settings` | Rates and ACH details (account number masked) |
| PUT | `/api/time-billing/settings` | Update rates and ACH details |
| POST | `/api/time-billing/statements` | Generate a statement { customerid, periodstart, periodend } |
| GET | `/api/time-billing/statements/:id/pdf` | Download the statement PDF |

## Frontend Components

- `TimeBillingPage` — route `/admin/time-billing`, wrapped in the existing UpgradeLock (CONSULTANT) and RoleLock (ADMIN); registered in App.tsx so the AppShell sidebar link resolves.
- `BilledProjectList` — projects with the "Bill this project" checkbox and the no-client warning.
- `ProjectTimeLines` — per-scope Developer/Resource rows plus the three project lines, with totals.
- `TimeEntryDialog` — manual entry (person or model, date, hours, notes).
- `TimerPanel` — side timer with automatic and manual notes.
- `RangeFilter` — date range (default current week) and include-invoiced toggle.
- `StatementDialog` — Customer and period (pre-filled from billing cycle), generate and download PDF.
- `TimeBillingSettings` — rates and ACH details, a section of SettingsPage.
- AdminDashboard placeholder card becomes a link to the page.
- shadcn/ui + Tailwind; every string through i18n in all 6 locales; "Resource", never "AI".

## Key Entities

- **Time Entry** (redefined) — a recorded amount of Developer or Resource work on a scope line or a project line; no longer requires a Task.
- **Resource** — one AI agent doing billable work; each subagent run counts as one Resource even on the same model, and the main session counts as one.
- **Process** — work outside the buildscope → implement pipeline (test plans, SOC 2 artifacts, DB analysis, G.O.D. plans), run by Resources.
- **Billed Project** — a project ticked "Bill this project", eligible for statements once it has a Customer.
- **Statement** — an invoice for one Customer for one period: page 1 daily rows and ACH, page 2 summary.
- **Billing Cycle** — a Customer's statement period: weekly by default, bi-weekly if negotiated.

## Open Questions

None. Every decision was resolved with the owner in the 2026-11-01 buildscope session. One external dependency stays open: automatic Resource time (FR-007) waits for SPEC-143's agentruns table to reach production; the manual path works without it.

## Amendment Log

### 2026-11-01 — Amendment A

- Reason: Full rewrite of the 12-line stub after an interactive buildscope (2026-11-01). The Time & Billing sidebar link opened a blank page (no route; dashboard card was a placeholder). Replaces the per-task minimum time with 15-minute round-up, and the "Billing=true disables invoices" setting with a per-project billed flag. Adds Developer/Resource time per scope, project-level Brainstorming and Processes lines, a side timer with notes, agent-run Resource time, rates, ACH details, and a per-client weekly/bi-weekly statement.
- Items: title, business_problem, actors, success_metrics, scope_boundary, out_of_scope, integration_context, constraints_and_risks, user_scenarios, functional_requirements, data_requirements, api_routes, frontend_components, key_entities
- Replaced text, verbatim:

Line 1:

```text
# Time and billing #
```

### 2026-11-01 — Amendment A, data note (SPEC-005 T001)

- Reason: FR-007 stores agent time as one entry per day, line and model, so the number of agents behind it was lost and FR-009's "5 subagents = 5 Resources" could not be met. Owner approved adding `projecttimeentries.resourcecount` (2026-11-01, verbatim: yes). The agent-pull unique index uses COALESCE(specid, zero uuid) so project lines (no specid) stay idempotent.
- Items: data_requirements (projecttimeentries row)

### 2026-11-02 — Amendment B

- Reason: Owner, during SPEC-005 implementation (verbatim: "should be able to check ANY project billed as a consultant or business"). Clarified the same day: the page opens to the Business plan and up, not Consultant only; and "any project" includes a consulting company's engaged client projects, not only its own. The owner chose a separate billing table so the consultant never writes the client's project row, and applied migration 0073 (`projectbillings`) on 2026-11-02 (verified: 10 columns, 7 constraints validated, 3 indexes, app-role privileges).
- Items: functional_requirements (FR-001 plan tier, FR-002 project list, new FR-014), data_requirements (projectbillings row), api_routes (status, customer, rates, entries, timer, customers, billing cycle, statement period)
- Replaced text, verbatim:

FR-001:

```text
/admin/time-billing renders the Time & Billing page for an ADMIN on the CONSULTANT plan or higher, replacing the blank page and the AdminDashboard placeholder card (which becomes a link to the page).
```

FR-002:

```text
The page lists every project of the ADMIN's company, each with a "Bill this project" checkbox persisted on the project.
```

- Known limit: agent-run time is not pulled on engaged client projects until agentruns (SPEC-143) records the company that ran it.
