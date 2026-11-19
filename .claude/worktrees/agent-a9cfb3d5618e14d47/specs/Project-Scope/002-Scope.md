# Spec 002: Production pipeline for Module 001 Ryder API: automated run every 15 minutes that retrieves records from MSSQL and submits JSON events to the Ryder API, with per-cycle counters for records retrieved, successes, and failures with reason codes.

**Spec Number**: 002
**Status**: `draft`
**Created**: 2026-04-17
**Depends On**: None
**Source**: `specs/Project-Scope/002-Scope.md`

## Overview
Production pipeline for Module 001 Ryder API: automated run every 15 minutes that retrieves records from MSSQL and submits JSON events to the Ryder API, with per-cycle counters for records retrieved, successes, and failures with reason codes. gives wxKanban a clearly defined business workflow with accountable outcomes. Ryder milestone events must be submitted continuously from our MSSQL data store to Ryder's API without manual operator intervention. Today the Management Screen only covers the test-runner phase; there is no production path that polls MSSQL every 15 minutes, posts JSON to Ryder, and produces auditable per-cycle counts of records processed, successes, and failures with reason codes. Without this, operators cannot confirm the integration is healthy or triage problems when Ryder rejects events. This scope covers First iteration delivers the production run path for Module 001 Ryder API: (a) 15-minute scheduled poll that reads the configured MSSQL source, (b) JSON payload construction matching Ryder's /events API, (c) POST to Ryder with authenticated carrier headers, (d) per-record success/failure capture with reason codes, (e) per-cycle counters persisted and surfaced on the Management Screen's production panel (already the default view when env=Production), (f) failure log with reason detail reviewable by support. User authentication and authorization (handled by a separate system per spec 002); real-time log streaming; automated error remediation; third-party monitoring/APM integration; support for modules other than 001 in this iteration.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation |
| **Secondary Actors** | Support team (consumes failure logs and reason codes when records fail to submit) |
| **Key Value** | Ryder milestone events must be submitted continuously from our MSSQL data store to Ryder's API without manual operator intervention. Today the Management Screen only covers the test-runner phase; there is no production path that polls MSSQL every 15 minutes, posts JSON to Ryder, and produces auditable per-cycle counts of records processed, successes, and failures with reason codes. Without this, operators cannot confirm the integration is healthy or triage problems when Ryder rejects events. |
| **Scope Boundary** | First iteration delivers the production run path for Module 001 Ryder API: (a) 15-minute scheduled poll that reads the configured MSSQL source, (b) JSON payload construction matching Ryder's /events API, (c) POST to Ryder with authenticated carrier headers, (d) per-record success/failure capture with reason codes, (e) per-cycle counters persisted and surfaced on the Management Screen's production panel (already the default view when env=Production), (f) failure log with reason detail reviewable by support. User authentication and authorization (handled by a separate system per spec 002); real-time log streaming; automated error remediation; third-party monitoring/APM integration; support for modules other than 001 in this iteration. |


## User Scenarios & Testing

### US1 — Scope primary workflow

**Actor**: Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation

**Scenario**:
1. Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation initiates the primary production pipeline for module 001 ryder api: automated run every 15 minutes that retrieves records from mssql and submits json events to the ryder api, with per-cycle counters for records retrieved, successes, and failures with reason codes. workflow inside wxKanban.
2. Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation completes the in-scope steps defined for the first iteration and confirms the expected business rules.
3. The system records the result and exposes the updated state to the affected stakeholders.

**Expected outcome**: Every 15-minute cycle records three counters in the database: recordsRetrieved, recordsSucceeded, recordsFailed (sum of succeeded+failed equals retrieved, 100% cycles reconciled).

### US2 — Scope review and coordination flow

**Actor**: Support team (consumes failure logs and reason codes when records fail to submit)

**Scenario**:
1. A secondary actor reviews the result produced by the primary workflow.
2. The actor confirms that the information needed for the next downstream step is available and aligned with the agreed scope boundary.
3. The workflow remains visible and understandable across the affected teams.

**Expected outcome**: 100% of failed records have an attached reason code and human-readable reason message; zero failures logged with blank reason.

### US3 — Scope exception handling

**Actor**: Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation

**Scenario**:
1. The primary workflow encounters a missing dependency, invalid state, or out-of-scope request.
2. The system keeps the scope boundary visible and prevents accidental overbuild or silent failure.
3. Follow-up actions, risks, or approval decisions are captured for later review.

**Expected outcome**: Production cycle success rate is >=99% under normal Ryder API availability (rolling 24h window), with alerts when it drops below 95%.

## Functional Requirements

### FR-001 — Primary workflow support

The system MUST support the primary in-scope workflow for production pipeline for module 001 ryder api: automated run every 15 minutes that retrieves records from mssql and submits json events to the ryder api, with per-cycle counters for records retrieved, successes, and failures with reason codes. within the agreed scope boundary.

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
| `companyScopes` | Stores the current business state for production pipeline for module 001 ryder api: automated run every 15 minutes that retrieves records from mssql and submits json events to the ryder api, with per-cycle counters for records retrieved, successes, and failures with reason codes. at the company or workflow level. |
| `Scopeevents` | Stores lifecycle events, status transitions, and system-generated workflow actions for this scope. |
| `Scopehistory` | Stores customer-visible or operator-visible history records needed for review, audit, or reporting. |

**Schema Notes**:
- The schema MUST reflect the scope boundary: First iteration delivers the production run path for Module 001 Ryder API: (a) 15-minute scheduled poll that reads the configured MSSQL source, (b) JSON payload construction matching Ryder's /events API, (c) POST to Ryder with authenticated carrier headers, (d) per-record success/failure capture with reason codes, (e) per-cycle counters persisted and surfaced on the Management Screen's production panel (already the default view when env=Production), (f) failure log with reason detail reviewable by support.
- Out-of-scope persistence or unrelated aggregates remain excluded: User authentication and authorization (handled by a separate system per spec 002); real-time log streaming; automated error remediation; third-party monitoring/APM integration; support for modules other than 001 in this iteration.

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/Scope` | Create or initiate the primary production pipeline for module 001 ryder api: automated run every 15 minutes that retrieves records from mssql and submits json events to the ryder api, with per-cycle counters for records retrieved, successes, and failures with reason codes. workflow. |
| GET | `/api/Scope` | Return the current workflow summary, status, and key business details for this scope. |
| PATCH | `/api/Scope` | Update workflow state, business settings, or approval outcomes within the declared scope. |
| GET | `/api/Scope/history` | Return operator-visible or customer-visible workflow history for review. |
| GET | `/api/Scope/reports` | Return operational reporting or summary views derived from the current workflow state. |
| POST | `/api/Scope/events` | Capture integration, lifecycle, or downstream events that must keep wxKanban state synchronized. |

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `ScopePrimaryPanel` | `src/client/components/Scope/ScopePrimaryPanel.tsx` | Handles the primary user workflow for this scope. |
| `ScopeHistoryPanel` | `src/client/components/Scope/ScopeHistoryPanel.tsx` | Shows the workflow history, outcomes, or event trail for review. |
| `ScopeManagementPanel` | `src/client/components/Scope/ScopeManagementPanel.tsx` | Lets authorized users review status, business rules, and operational controls. |
| `ScopeNotice` | `src/client/components/Scope/ScopeNotice.tsx` | Surfaces important state changes, scope guardrails, or user-facing warnings. |

### Modified Components

| Component | Change |
|-----------|--------|
| `SettingsPage` | Add entry points, current-state visibility, and management controls for production pipeline for module 001 ryder api: automated run every 15 minutes that retrieves records from mssql and submits json events to the ryder api, with per-cycle counters for records retrieved, successes, and failures with reason codes.. |
| `AdminDashboard` | Add reporting or operational summary access for the new workflow. |
| `ScopePage` | Add the primary end-user workflow entry point, review states, and exception messaging. |

## Success Criteria

1. Every 15-minute cycle records three counters in the database: recordsRetrieved, recordsSucceeded, recordsFailed (sum of succeeded+failed equals retrieved, 100% cycles reconciled).
2. 100% of failed records have an attached reason code and human-readable reason message; zero failures logged with blank reason.
3. Production cycle success rate is >=99% under normal Ryder API availability (rolling 24h window), with alerts when it drops below 95%.
4. End-to-end cycle duration (MSSQL read -> Ryder POST -> log write) p95 <=60 seconds per cycle.

## Key Entities

| Entity | Description |
|--------|-------------|
| `ScopeWorkflow` | Represents the primary business workflow or configuration state introduced by this scope. |
| `ScopeEvent` | Represents lifecycle, approval, or synchronization events emitted as the workflow changes state. |
| `ScopeHistoryRecord` | Represents the history or review record shown to users or operators after workflow actions occur. |
| `ScopeReportSnapshot` | Represents the reporting or summary view used to monitor current status and recent outcomes. |

## Constraints

- MUST deliver only the behavior described within the scope boundary: First iteration delivers the production run path for Module 001 Ryder API: (a) 15-minute scheduled poll that reads the configured MSSQL source, (b) JSON payload construction matching Ryder's /events API, (c) POST to Ryder with authenticated carrier headers, (d) per-record success/failure capture with reason codes, (e) per-cycle counters persisted and surfaced on the Management Screen's production panel (already the default view when env=Production), (f) failure log with reason detail reviewable by support.
- MUST keep the following work out of scope for this iteration: User authentication and authorization (handled by a separate system per spec 002); real-time log streaming; automated error remediation; third-party monitoring/APM integration; support for modules other than 001 in this iteration.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: Spec 001 (Ryder API Interface) defines the outbound API contract, event codes, and carrier header conventions. The production pipeline reads from the Ryder source tables in MSSQL/Azure SQL using the mssql (Tedious) driver. The wxKanban MCP server continues to own project management/audit via dbpush; all pipeline events and cycle summaries are captured through project.capture_event. The Management Screen (002) provides the operator view and already auto-switches to the production panel when env=Production.
- Constraints and risks: MSSQL/Azure SQL is the only application data store (constitution Art. I); no PostgreSQL for app data. All lifecycle-gated operations route through the MCP server per constitution Art. XIII; the pipeline must call project.capture_event for every cycle. 30-day log retention policy per spec 002. Risks: Ryder API rate-limits or outages could cause backlog; MSSQL connection pool exhaustion if cycle overruns the 15-minute window; credential rotation for the Ryder carrier token must not break the scheduler.
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-04-17

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Ryder milestone events must be submitted continuously from our MSSQL data store to Ryder's API without manual operator intervention. Today the Management Screen only covers the test-runner phase; there is no production path that polls MSSQL every 15 minutes, posts JSON to Ryder, and produces auditable per-cycle counts of records processed, successes, and failures with reason codes. Without this, operators cannot confirm the integration is healthy or triage problems when Ryder rejects events. |
| 2 | Who are the primary and secondary actors? | Primary actor: Automated scheduler (15-minute poll job) running the Module 001 Ryder API pipeline without human initiation. Secondary actors: Support team (consumes failure logs and reason codes when records fail to submit). |
| 3 | What is in scope? | First iteration delivers the production run path for Module 001 Ryder API: (a) 15-minute scheduled poll that reads the configured MSSQL source, (b) JSON payload construction matching Ryder's /events API, (c) POST to Ryder with authenticated carrier headers, (d) per-record success/failure capture with reason codes, (e) per-cycle counters persisted and surfaced on the Management Screen's production panel (already the default view when env=Production), (f) failure log with reason detail reviewable by support. |
| 4 | What is out of scope? | User authentication and authorization (handled by a separate system per spec 002); real-time log streaming; automated error remediation; third-party monitoring/APM integration; support for modules other than 001 in this iteration. |
| 5 | How is success measured? | Every 15-minute cycle records three counters in the database: recordsRetrieved, recordsSucceeded, recordsFailed (sum of succeeded+failed equals retrieved, 100% cycles reconciled). 100% of failed records have an attached reason code and human-readable reason message; zero failures logged with blank reason. Production cycle success rate is >=99% under normal Ryder API availability (rolling 24h window), with alerts when it drops below 95%. End-to-end cycle duration (MSSQL read -> Ryder POST -> log write) p95 <=60 seconds per cycle. |
| 6 | What existing workflow must this align with? | Spec 001 (Ryder API Interface) defines the outbound API contract, event codes, and carrier header conventions. The production pipeline reads from the Ryder source tables in MSSQL/Azure SQL using the mssql (Tedious) driver. The wxKanban MCP server continues to own project management/audit via dbpush; all pipeline events and cycle summaries are captured through project.capture_event. The Management Screen (002) provides the operator view and already auto-switches to the production panel when env=Production. |
| 7 | What constraints or risks matter right now? | MSSQL/Azure SQL is the only application data store (constitution Art. I); no PostgreSQL for app data. All lifecycle-gated operations route through the MCP server per constitution Art. XIII; the pipeline must call project.capture_event for every cycle. 30-day log retention policy per spec 002. Risks: Ryder API rate-limits or outages could cause backlog; MSSQL connection pool exhaustion if cycle overruns the 15-minute window; credential rotation for the Ryder carrier token must not break the scheduler. |
