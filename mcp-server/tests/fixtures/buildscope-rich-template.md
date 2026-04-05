# Spec 001: Consulting billing automation

**Spec Number**: 001
**Status**: `draft`
**Created**: 2026-04-03
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

### US1 — Consulting Billing Automation primary workflow

**Actor**: Consulting operations manager

**Scenario**:
1. Consulting operations manager initiates the primary consulting billing automation workflow inside wxKanban.
2. Consulting operations manager completes the in-scope steps defined for the first iteration and confirms the expected business rules.
3. The system records the result and exposes the updated state to the affected stakeholders.

**Expected outcome**: 95% of invoice-ready exports complete in under 5 minutes.

### US2 — Consulting Billing Automation review and coordination flow

**Actor**: Project manager, Finance lead

**Scenario**:
1. A secondary actor reviews the result produced by the primary workflow.
2. The actor confirms that the information needed for the next downstream step is available and aligned with the agreed scope boundary.
3. The workflow remains visible and understandable across the affected teams.

**Expected outcome**: Missed billable hours drop by 25% within 30 days.

### US3 — Consulting Billing Automation exception handling

**Actor**: Consulting operations manager

**Scenario**:
1. The primary workflow encounters a missing dependency, invalid state, or out-of-scope request.
2. The system keeps the scope boundary visible and prevents accidental overbuild or silent failure.
3. Follow-up actions, risks, or approval decisions are captured for later review.

**Expected outcome**: The review workflow supports 50 concurrent sessions with less than 1% error rate.

## Functional Requirements

### FR-001 — Primary workflow support

The system MUST support the primary in-scope workflow for consulting billing automation within the agreed scope boundary.

**Acceptance Criteria**:
- [ ] The primary actor can complete the core workflow without manual workaround.
- [ ] The resulting business state is persisted or exposed to downstream users as defined by the scope.

### FR-002 — Business rule enforcement

The system MUST enforce the business rules, limits, and approval conditions defined for this scope.

**Acceptance Criteria**:
- [ ] The workflow does not proceed when business rules or scope guardrails are violated.
- [ ] Users are told why an action is blocked, deferred, or requires follow-up.

### FR-003 — Visibility for affected actors

The system MUST expose the workflow state and outcomes to the primary and secondary actors identified in this scope.

**Acceptance Criteria**:
- [ ] Secondary actors can review the workflow outcome using the agreed business context.
- [ ] The workflow state is understandable without relying on undocumented tribal knowledge.

### FR-004 — Integration alignment

The system MUST align the workflow with the existing integrations, operating processes, or reference documents identified during discovery.

**Acceptance Criteria**:
- [ ] The implementation reflects the integration context declared in this scope.
- [ ] Downstream teams are not forced to reverse-engineer missing workflow assumptions.

### FR-005 — History and traceability

The system MUST preserve enough workflow history, status context, and change visibility for operational review and support.

**Acceptance Criteria**:
- [ ] Material workflow outcomes can be reviewed after the primary action completes.
- [ ] Follow-up reviews can identify the reason for a workflow state change.

### FR-006 — Reporting and operational review

The system MUST provide the operational visibility needed to review progress, outcomes, or exceptions for this scope.

**Acceptance Criteria**:
- [ ] Stakeholders can review current state and recent outcomes without querying implementation details directly.
- [ ] Reported information reflects the same business rules enforced by the primary workflow.

## Data Requirements

### Schema Changes

| Table | Purpose |
|-------|---------|
| `companyautomations` | Stores the current business state for consulting billing automation at the company or workflow level. |
| `consultingbillingautomationevents` | Stores lifecycle events, status transitions, and system-generated workflow actions for this scope. |
| `consultingbillingautomationhistory` | Stores customer-visible or operator-visible history records needed for review, audit, or reporting. |

**Schema Notes**:
- The schema MUST reflect the scope boundary: Include time-entry review, approval routing, and invoice-ready export for consulting projects.
- Out-of-scope persistence or unrelated aggregates remain excluded: Exclude payment collection, tax handling, and ERP integration from this scope.

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/consulting-billing-automation` | Create or initiate the primary consulting billing automation workflow. |
| GET | `/api/consulting-billing-automation` | Return the current workflow summary, status, and key business details for this scope. |
| PATCH | `/api/consulting-billing-automation` | Update workflow state, business settings, or approval outcomes within the declared scope. |
| GET | `/api/consulting-billing-automation/history` | Return operator-visible or customer-visible workflow history for review. |
| GET | `/api/consulting-billing-automation/reports` | Return operational reporting or summary views derived from the current workflow state. |
| POST | `/api/consulting-billing-automation/events` | Capture integration, lifecycle, or downstream events that must keep wxKanban state synchronized. |

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `ConsultingBillingAutomationPrimaryPanel` | `src/client/components/consulting-billing-automation/ConsultingBillingAutomationPrimaryPanel.tsx` | Handles the primary user workflow for this scope. |
| `ConsultingBillingAutomationHistoryPanel` | `src/client/components/consulting-billing-automation/ConsultingBillingAutomationHistoryPanel.tsx` | Shows the workflow history, outcomes, or event trail for review. |
| `ConsultingBillingAutomationManagementPanel` | `src/client/components/consulting-billing-automation/ConsultingBillingAutomationManagementPanel.tsx` | Lets authorized users review status, business rules, and operational controls. |
| `ConsultingBillingAutomationNotice` | `src/client/components/consulting-billing-automation/ConsultingBillingAutomationNotice.tsx` | Surfaces important state changes, scope guardrails, or user-facing warnings. |

### Modified Components

| Component | Change |
|-----------|--------|
| `SettingsPage` | Add entry points, current-state visibility, and management controls for consulting billing automation. |
| `AdminDashboard` | Add reporting or operational summary access for the new workflow. |
| `ConsultingBillingAutomationPage` | Add the primary end-user workflow entry point, review states, and exception messaging. |

## Success Criteria

1. 95% of invoice-ready exports complete in under 5 minutes.
2. Missed billable hours drop by 25% within 30 days.
3. The review workflow supports 50 concurrent sessions with less than 1% error rate.

## Key Entities

| Entity | Description |
|--------|-------------|
| `AutomationWorkflow` | Represents the primary business workflow or configuration state introduced by this scope. |
| `AutomationEvent` | Represents lifecycle, approval, or synchronization events emitted as the workflow changes state. |
| `AutomationHistoryRecord` | Represents the history or review record shown to users or operators after workflow actions occur. |
| `AutomationReportSnapshot` | Represents the reporting or summary view used to monitor current status and recent outcomes. |

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

### Session 2026-04-03

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Project leads lose revenue because billable time is reconciled manually across disconnected tools every week. |
| 2 | Who are the primary and secondary actors? | Primary actor: Consulting operations manager. Secondary actors: Project manager, Finance lead. |
| 3 | What is in scope? | Include time-entry review, approval routing, and invoice-ready export for consulting projects. |
| 4 | What is out of scope? | Exclude payment collection, tax handling, and ERP integration from this scope. |
| 5 | How is success measured? | 95% of invoice-ready exports complete in under 5 minutes. Missed billable hours drop by 25% within 30 days. The review workflow supports 50 concurrent sessions with less than 1% error rate. |
| 6 | What existing workflow must this align with? | Align with the existing invoicing workflow, finance review process, and current project lifecycle reporting. |
| 7 | What constraints or risks matter right now? | Finance needs the first usable draft before the next billing cycle, and upstream billing codes must stay stable during rollout. |
