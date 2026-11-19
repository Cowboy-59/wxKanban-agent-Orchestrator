# Scope 001: Consulting billing automation

**Scope Number**: 001
**Status**: `draft`
**Created**: 2026-10-04
**Depends On**: None
**Source**: `specs/Project-Scope/001-consulting-billing-automation.md`

## Overview
Consulting billing automation gives wxKanban a clearly defined business workflow with accountable outcomes. Project leads lose revenue because billable time is reconciled manually across disconnected tools every week. This scope covers Include time-entry review, approval routing, and invoice-ready export for consulting projects. Exclude payment collection, tax handling, and ERP integration from this scope.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Consulting operations manager |
| **Secondary Actors** | Project manager, Finance lead |
| **Key Value** | Project leads lose revenue because billable time is reconciled manually across disconnected tools every week. |
| **Scope Boundary** | Include time-entry review, approval routing, and invoice-ready export for consulting projects. Exclude payment collection, tax handling, and ERP integration from this scope. |


## User Scenarios & Testing

### US1 — Manager approves a week

**Actor**: Consulting operations manager

**Scenario**:
1. Opens the week under review.
2. Approves every entry.

**Expected outcome**: The week is marked approved and included in the next export.

### US2 — Finance imports the export

**Actor**: Finance lead

**Scenario**:
1. Downloads the period export.
2. Imports it into the invoicing tool.

**Expected outcome**: Invoices are created without manual edits.

### US3 — A project has no manager

**Actor**: Consulting operations manager

**Scenario**:
1. Starts routing for the period.

**Expected outcome**: The project is flagged and routing waits for a manager to be assigned.

## Functional Requirements

### FR-001 — Review time entries before export

The system MUST let the operations manager approve or return each week of time entries before it is exported.

**Acceptance Criteria**:
- [ ] A returned week shows the reason to the consultant.
- [ ] Only approved weeks appear in the export.

### FR-002 — Route approvals to the project manager

The system MUST route each project's time entries to that project's manager for approval.

**Acceptance Criteria**:
- [ ] A project with no manager is flagged before routing.

### FR-003 — Produce an invoice-ready export

The system MUST produce one export per billing period in the finance team's import format.

**Acceptance Criteria**:
- [ ] The export totals match the approved hours to the cent.

## Data Requirements

| Table | Change |
|---|---|
| `timeentryapprovals` | new — one row per approved week |

## API Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/time-approvals/:weekId` | Approve or return a week |

## Frontend Components

None — not affected by this scope.

## Success Criteria

1. 95% of invoice-ready exports complete in under 5 minutes.
2. Missed billable hours drop by 25% within 30 days.
3. The review workflow supports 50 concurrent sessions with less than 1% error rate.

## Key Entities

None — no new domain entity; approvals extend time entries.

## Constraints

- MUST deliver only the behavior described within the scope boundary: Include time-entry review, approval routing, and invoice-ready export for consulting projects.
- MUST keep the following work out of scope for this iteration: Exclude payment collection, tax handling, and ERP integration from this scope.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: Align with the existing invoicing workflow, finance review process, and current project lifecycle reporting.
- Constraints and risks: Finance needs the first usable draft before the next billing cycle, and upstream billing codes must stay stable during rollout.
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-04

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Project leads lose revenue because billable time is reconciled manually across disconnected tools every week. |
| 2 | Who are the primary and secondary actors? | Primary actor: Consulting operations manager. Secondary actors: Project manager, Finance lead. |
| 3 | What is in scope? | Include time-entry review, approval routing, and invoice-ready export for consulting projects. |
| 4 | What is out of scope? | Exclude payment collection, tax handling, and ERP integration from this scope. |
| 5 | How is success measured? | 95% of invoice-ready exports complete in under 5 minutes. Missed billable hours drop by 25% within 30 days. The review workflow supports 50 concurrent sessions with less than 1% error rate. |
| 6 | What existing workflow must this align with? | Align with the existing invoicing workflow, finance review process, and current project lifecycle reporting. |
| 7 | What constraints or risks matter right now? | Finance needs the first usable draft before the next billing cycle, and upstream billing codes must stay stable during rollout. |
