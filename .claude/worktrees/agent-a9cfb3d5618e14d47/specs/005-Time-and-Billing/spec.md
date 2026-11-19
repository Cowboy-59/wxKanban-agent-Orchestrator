# Spec 005: Time and Billing

**Implements**: SCOPE-005 (specs/Project-Scope/005-scope-timeandBilling.md, Amendment A)

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

## Open Questions

None. Every decision was resolved with the owner in the 2026-11-01 buildscope session. One external dependency stays open: automatic Resource time (FR-007) waits for SPEC-143's agentruns table to reach production; the manual path works without it.

## Functional Requirements

### FR-001 — Time & Billing page

/admin/time-billing renders the Time & Billing page for an ADMIN on the SMALL_BUSINESS (Business) plan or higher — Business, Consultant and Enterprise — replacing the blank page and the AdminDashboard placeholder card (which becomes a link to the page). *(Amendment B: was CONSULTANT or higher.)*

**Acceptance Criteria**:
- [ ] The sidebar Time & Billing link opens the page; it is no longer blank.
- [ ] A TEAM_MANAGER sees the existing "Requires Admin" lock; a FREE plan sees the upgrade lock.
- [ ] Every API route behind the page refuses non-ADMIN callers with 403 and FREE-plan callers with the upgrade 403, enforced on the server.

### FR-002 — Project list and billed flag

The page lists every project of the ADMIN's company and, for a consulting company, every client project it is engaged on (FR-014), in one list sorted by name, each with a "Billable" checkbox *(Amendment C: was "Bill this project", own projects listed before engaged ones)*. An own project's flag is persisted on the project; an engaged client project's flag is persisted on the consulting company's billing row (FR-014).

**Acceptance Criteria**:
- [ ] A ticked box survives a page reload.
- [ ] Projects of other companies with no live engagement never appear and cannot be toggled; a toggle by id returns 404.
- [ ] A billed project with no Customer shows "Assign a client to bill this project".

### FR-003 — Time lines

Each project expands into one row per scope (Developer and Resource) plus the project lines: Brainstorming – Developer, Brainstorming – Resource, Processes – Resource, and *(Amendment D)* DBA – Developer, Management – Developer, Meetings – Developer (Developer time only). Each row shows its hours for the selected period.

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

A timer panel starts and stops against a chosen line. A timer starts from ▶ on a line or, *(Amendment C)*, from the clock at the right edge of a project row, which opens a Start timer window to pick the project's line (its scopes, Brainstorming, or *(Amendment D)* DBA, Management, Meetings). Each start and stop is its own entry, so a day can hold several timeframes on the same line. Stopping creates a Developer entry for the signed-in user, rounded up per FR-005. Its notes combine automatic lines for each agent run in the timer window (command · task · scope · model · minutes) with manual notes such as meetings. *(Amendment F:)* The timer card has **Pause** and **Resume**. Pause holds the clock and Resume continues the **same** entry; nothing is saved at a pause. On Stop the entry's duration is the active time (elapsed minus every paused stretch, including a pause still open at Stop), rounded up to 15 minutes once (FR-005). The paused time is kept on the entry (projecttimeentries.pausedat while paused, pausedseconds in total; migration 0077). Like Start, Pause and Resume write no audit row; Stop stays the entry's one creation record (FR-013).

**Acceptance Criteria**:
- [ ] Automatic note lines contain no prompt text, code or file contents.
- [ ] Manual notes are editable until the entry is invoiced.
- [ ] A running timer survives a page reload.
- [ ] *(Amendment F)* Two 5-minute stretches with a 20-minute pause between them save ONE entry of 15 minutes, not 30 and not 30-plus-pause.
- [ ] *(Amendment F)* A paused timer survives a page reload still paused, its clock frozen; Pause on a paused timer, or Resume on a running one, is 409.

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

Page 2 lists the items done in the period, one line each with hours, grouped as Scopes, Bugs (bug tasks completed and feedback reports resolved), Processes (work outside the buildscope → implement pipeline, e.g. test plans, SOC 2 artifacts, DB analysis), Brainstorms, and *(Amendment D)* DBA, Management and Meetings, each per project. It is kept to about one page by showing highest-hour items first and "+N more".

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

### FR-014 — Engaged client projects (Amendment B, 2026-11-02)

A consulting company's ADMIN also bills the client projects it is engaged on (SCOPE-037): a project of another company is listed while an engagement between the two companies is not ended and has a live assignment (engagementassignments.removedat IS NULL) on that project. The consulting company's billed flag, Customer and rate overrides for it live in projectbillings (migration 0073), keyed by the consulting company and the project; nothing is written to the client's companyprojects row. Time entries on it belong to the consulting company (projecttimeentries.companyid). The Customer pre-fills from the consulting company's Customer linked to that client company (customers.clientcompanyid). Agent-run time (FR-007) is pulled for engaged projects too *(Amendment E: was "not pulled for engaged projects")*: every agentruns row carries the company that bills it (agentruns.companyid, set by the server from the sending token, SPEC-143 FR-017), so the pull takes the consultant's runs by that company and leaves the client company's own runs to the client. Manual Resource entries still work.

**Acceptance Criteria**:
- [ ] An engaged client project appears with its scopes and the three project lines; once the engagement ends it leaves the list, and its already-recorded unbilled entries still go on the next statement.
- [ ] Ticking, the Customer and rate overrides of an engaged project write projectbillings only; the client's companyprojects row is unchanged, and the client company's own Time & Billing page never shows the consultant's flag, rates or entries.
- [ ] A toggle, entry, or timer on a client project with no live engagement returns 404.
- [ ] The pre-filled Customer is a Customer of the consulting company; a Customer of another company is rejected with 404.
- [ ] ~~The agent-run pull never creates entries on an engaged client project, and the page says Resource time there is manual.~~ Superseded by Amendment E (SPEC-143 T027): the pull reads runs by `agentruns.companyid`, so a consultant's runs on an engaged client project become the consultant's Resource entries, and the client company's own runs there stay the client's.
- [ ] Amendment E: loading the page pulls the agent runs of its date range and generating a statement pulls its period first; two loads give the same hours; a failed pull never blocks the page but does block the statement.

## Amendment Log

- **2026-11-02 — Amendment B** (owner, verbatim: "should be able to check ANY project billed as a consultant or business"): FR-001 opens to the Business plan and up; FR-002 and the new FR-014 add a consulting company's engaged client projects, billed through the new projectbillings table (migration 0073, applied and verified 2026-11-02). Tasks T022–T024 added. Full replaced text in the scope file's Amendment Log.
- **2026-11-02 — Amendment C** (owner, verbatim: "on listings fetched from database for projects, on consultants version, have it by name and Billable also put a clock on the right edge to start the time window up there will be more than one timeframe a day"): FR-002 lists own and engaged projects in one name-sorted list and labels the checkbox "Billable"; FR-006 adds the project-row clock that opens a Start timer window, and states that each start/stop is its own entry (several timeframes a day). UI only — no schema or API change. Task T025 added.
- **2026-11-03 — Amendment F** (owner, verbatim: "also then add a PAUSE button on the timer card"; decision: "True pause, one entry"): FR-006 adds Pause/Resume on the timer card; a paused stretch is not billed and the entry is rounded once at Stop. Needs migration 0077 (projecttimeentries.pausedat, pausedseconds), applied by hand before the deploy. Tasks T028–T029 added.
- **2026-11-02 — Amendment D** (owner, verbatim: "you have Brainstorming as only drop list item , Add DBA and Management and Meetings to that" / "this is only on the Time and billing"; decisions: "Developer only", "Own group each"): FR-003 adds three Developer-only project lines — DBA, Management, Meetings (stored as line = dba | management | meeting); FR-006's Start timer window offers them; FR-010's summary page gives each its own per-project group. Needs migration 0074 (widens projecttimeentries_line_check), applied by hand before the deploy. Tasks T026–T027 added.
- **2026-11-02 — Amendment E** (from SCOPE-143 Amendment A; owner, verbatim: "ANY thing that the AI has to do to work with an application from brainstorming , god, buildscope and any other command or subagents running to build need time and billing sent to any application that has billing", "ok on d2", D4: "yes"): FR-007's agent-run pull selects runs by agentruns.companyid instead of by the project's owning company, so FR-014 engaged client projects are pulled for the consulting company; the pull also runs by itself when the page loads a date range and when a statement is generated (repeat-safe; the manual pull stays). Built under SPEC-143 T027, after migration 0075 (SPEC-143 T023) is applied. No new SPEC-005 task.

## Scope Reference

Data Requirements, API Routes, Frontend Components, Key Entities, Constraints and Risks, and User Scenarios are defined in the scope file: specs/Project-Scope/005-scope-timeandBilling.md.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-11-01
- **Phase**: design
