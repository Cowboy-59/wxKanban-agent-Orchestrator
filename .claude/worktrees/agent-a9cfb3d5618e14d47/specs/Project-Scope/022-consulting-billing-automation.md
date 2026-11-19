# Spec 022: Consulting billing automation

**Spec Number**: 022
**Status**: `draft`
**Created**: 2026-04-03
**Source**: `specs/Project-Scope/022-consulting-billing-automation.md`

## Overview
Consulting billing automation

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Consulting operations manager |
| **Secondary Actors** | Project manager, Finance lead |
| **Key Value** | Project leads lose revenue because billable time is reconciled manually across disconnected tools every week. |
| **Scope Boundary** | Include time-entry review, approval routing, and invoice-ready export for consulting projects. |

## Business Problem
Project leads lose revenue because billable time is reconciled manually across disconnected tools every week.

## Actors
- Primary: Consulting operations manager
- Secondary: Project manager, Finance lead

## Integration Context
This scope should align with the existing wxKanban workflow, project lifecycle, and any already-approved integrations in the same feature area.

## Success Metrics
- 95% of invoice-ready exports complete in under 5 minutes.
- Missed billable hours drop by 25% within 30 days.
- The review workflow supports 50 concurrent sessions with less than 1% error rate.

## User Scenarios & Testing

### US1 — Consulting Billing Automation primary workflow

**Actor**: Consulting operations manager

**Scenario**:
1. Consulting operations manager starts the core consulting billing automation workflow.
2. Consulting operations manager completes the in-scope steps defined for the first iteration.
3. The system records the result and exposes the updated state to stakeholders.

**Expected outcome**: 95% of invoice-ready exports complete in under 5 minutes.

### US2 — Consulting Operations Manager collaboration and review flow

**Actor**: Project manager, Finance lead

**Scenario**:
1. A secondary actor reviews the result produced by the primary workflow.
2. The actor confirms the information needed for the next downstream step is available.
3. The workflow remains visible and understandable across the affected teams.

**Expected outcome**: Missed billable hours drop by 25% within 30 days.

### US3 — Consulting Billing Automation exception handling

**Actor**: Consulting operations manager

**Scenario**:
1. The primary workflow encounters a missing dependency, invalid state, or out-of-scope request.
2. The system keeps the scope boundary visible and prevents accidental overbuild.
3. Open questions or follow-up actions are captured for later review.

**Expected outcome**: The review workflow supports 50 concurrent sessions with less than 1% error rate.

## Functional Requirements

### FR-001 — Core workflow coverage

The system MUST support the in-scope workflow for consulting billing automation within the agreed scope boundary.

**Acceptance Criteria**:
- [ ] The primary actor can complete the core workflow without manual workaround.
- [ ] The system persists or exposes the resulting business state needed by downstream users.

### FR-002 — Visibility for affected actors

The system MUST expose the workflow state and outcomes to the primary and secondary actors identified in this scope.

**Acceptance Criteria**:
- [ ] Secondary actors can review the workflow outcome using the agreed business context.
- [ ] The workflow state is understandable without relying on undocumented tribal knowledge.

### FR-003 — Scope guardrails and exception handling

The system MUST preserve the declared scope boundary and route exceptions or unresolved questions into explicit follow-up.

**Acceptance Criteria**:
- [ ] Requests outside the declared scope are identified and not silently absorbed into the implementation.
- [ ] Open questions, constraints, or dependencies are visible to the team before implementation begins.

## Scope Boundary
Include time-entry review, approval routing, and invoice-ready export for consulting projects.

## Out of Scope
Exclude payment collection, tax handling, and ERP integration from this scope.

## Constraints & Risks
Confirm delivery constraints, rollout timing, and upstream dependencies during scope review before implementation begins.

## Open Questions
- None currently.
