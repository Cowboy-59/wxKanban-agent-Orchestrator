# Spec 013: Audit Management — Compliance Document System & Automated Code Auditing

**Branch**: `013-audit-management`
**Type**: backend feature / frontend feature / compliance infrastructure
**Status**: clarified
**Created**: 2026-02-22
**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle), Spec 012 (Kanban View)
**Source**: `specs/Project-Scope/013-scopeAudit.md`

---

## Overview

The Audit Management system provides a comprehensive compliance infrastructure that:

1. **Stores regulatory documents** in a master `wxkanbandocuments` table (SOC2, HIPAA, HITRUST, GDPR)
2. **Extracts analyzable compliance tasks** from each framework document
3. **Performs automated code audits** post-implementation against enabled frameworks
4. **Stores audit reports** as tamper-evident documents for compliance evidence
5. **Allows app creators** to enable/disable specific compliance frameworks per app

The system embeds compliance checks directly into the development workflow via wxAI pipeline integration.

---

## User Scenarios & Testing

### US1 — App Creator Enables Compliance Frameworks

**Actor**: App creator (ADMIN) setting up compliance for their wxKanban app.

**Scenario**:
1. Admin navigates to App Settings → Compliance tab
2. Sees 4 framework cards: SOC2, HIPAA, HITRUST, GDPR (all disabled by default)
3. Toggles SOC2 and HIPAA on
4. Saves configuration
5. System stores `app_audit_configuration` record with `soc2_enabled=true`, `hipaa_enabled=true`

**Expected outcome**: Only SOC2 and HIPAA tasks appear in audit recommendations. HITRUST and GDPR tasks are excluded.

---

### US2 — Compliance Document Ingestion

**Actor**: System administrator uploading regulatory documents.

**Scenario**:
1. Admin uploads `SOC2_SDLC_Compliance_Rules.md` via document manager
2. System parses document, extracts 47+ audit tasks
3. Tasks stored in `compliance_audit_tasks` with framework='SOC2'
4. Document stored in `wxkanbandocuments` with SHA-256 hash
5. Report: "SOC2 document ingested, 47 audit tasks extracted"

**Expected outcome**: `GET /api/audit/documents` returns document. `GET /api/audit/tasks?framework=SOC2` returns 47+ tasks.

---

### US3 — Pre-Implementation: Relevant Audit Tasks

**Actor**: Developer starting work on authentication feature.

**Scenario**:
1. Developer opens spec for authentication feature
2. System suggests relevant compliance tasks (filtered by enabled frameworks):
   - "SOC2 CC6.1 — Implement MFA for privileged access" [critical]
   - "HIPAA §164.312(d) — Person/entity authentication" [high]
3. Developer acknowledges tasks before coding begins

**Expected outcome**: Only tasks from enabled frameworks shown. Tasks filtered by feature context.

---

### US4 — Post-Implementation: Automated Code Audit

**Actor**: Developer triggering compliance check after code completion.

**Scenario**:
1. Developer runs `/audit-check --spec 013 --feature auth`
2. System checks `app_audit_configuration` — SOC2 and HIPAA enabled
3. Runs automated analyzers against codebase
4. Results: 42 pass, 3 fail, 2 needs_review
5. Report generated and stored in `wxkanbandocuments`

**Expected outcome**: Audit report stored with integrity hash. Results accessible via `GET /api/audit/reports`.

---

### US5 — Audit Report Review

**Actor**: Compliance officer reviewing failed audit items.

**Scenario**:
1. Reviewer opens audit report from document manager
2. Report shows: 89% compliance score, 3 failed items with code references
3. Reviewer clicks failed item → sees code location + requirement text + suggested fix
4. Reviewer creates remediation ticket or accepts risk with justification

**Expected outcome**: Clear audit trail with actionable remediation guidance.

---

### US6 — Disable Framework: No Data Loss

**Actor**: Admin disabling HIPAA framework after initial setup.

**Scenario**:
1. Admin navigates to Compliance settings
2. Toggles HIPAA off
3. System shows warning: "Disabling HIPAA will exclude it from future audits. Historical reports are preserved."
4. Admin confirms
5. Future audits only check SOC2; historical HIPAA reports remain accessible

**Expected outcome**: Historical audit data preserved. Future audits exclude disabled framework.

---

## Project-Level Audit Type Field

The `projects` table has an `audittype` column (`varchar(50)`, nullable) that stores the compliance framework selected for a project. This is the primary mechanism for associating a project with a compliance framework.

| Value | Framework |
|-------|-----------|
| `GDPR` | General Data Protection Regulation |
| `HIPAA` | Health Insurance Portability and Accountability Act |
| `HITRUST` | HITRUST Common Security Framework |
| `SOC2` | Service Organization Control 2 |
| `null` | No audit framework selected |

**How it is set:** Admin Dashboard → project card → pencil (Edit) icon → "Edit Audit Type" modal → select framework → Save. This calls `PATCH /api/projects/:id` with `{ audittype: "HIPAA" }` (or `null` to clear).

**How it is consumed:** The `audittype` field drives which compliance framework's tasks are surfaced in pre-implementation recommendations and which framework's rules are applied during automated code audits. When `audittype` is `null`, audit features are inactive for that project.

---

## Functional Requirements

### FR-001 — Project-Level Audit Type Selection
The system MUST allow an ADMIN to select a compliance framework for a project via the Admin Dashboard project card Edit button. The selected framework is stored in `projects.audittype`. Default: `null` (no audit). Changing the framework MUST NOT delete historical audit data for the previous framework.

### FR-002 — wxKanbanDocuments Master Table
The system MUST store all compliance documents and audit reports in `wxkanbandocuments` with SHA-256 integrity hashes and full-text search indexing.

### FR-003 — Compliance Audit Tasks Registry
The system MUST extract and store analyzable compliance tasks from each framework document. Tasks MUST be filtered by enabled frameworks in all queries.

### FR-004 — Automated Audit Engine
The system MUST provide automated code analysis (static analysis, pattern matching, configuration review, dependency scanning) against compliance tasks from enabled frameworks only.

### FR-005 — Audit Report Generation & Storage
The system MUST generate compliance audit reports and store them in `wxkanbandocuments` with integrity verification. Reports MUST include: compliance score, framework breakdown, findings with code references, remediation guidance.

### FR-006 — wxAI Pipeline Integration
The system MUST integrate with the wxAI pipeline: pre-implementation task recommendations, post-implementation audit triggers, report retrieval commands.

### FR-007 — Manual Review Workflow
The system MUST support human review for non-automated compliance items with status tracking (pending, in_review, approved, rejected) and escalation for critical violations.

### FR-008 — Framework Warning on Disable
The system MUST show a confirmation warning when disabling a framework that has existing audit reports.

---

## Success Criteria

1. App creator can enable/disable individual frameworks via UI toggle
2. Only enabled frameworks' tasks appear in recommendations and audits
3. All 4 compliance documents stored in `wxkanbandocuments` with full-text indexing
4. 200+ audit tasks extracted across all frameworks (50+ per framework)
5. Automated audit execution completes in <5 minutes for typical spec
6. Audit reports generated and stored with SHA-256 integrity verification
7. Disabling a framework preserves all historical audit data
8. Pre-implementation task recommendations filtered by enabled frameworks
9. Post-implementation audits catch 90%+ of common compliance violations
10. TypeScript compiles cleanly with no errors

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `app_audit_configuration` | Per-app framework enablement flags and audit settings |
| `wxkanbandocuments` | Master document store for compliance docs and audit reports |
| `compliance_audit_tasks` | Extracted analyzable compliance requirements per framework |
| `audit_executions` | Audit run instances with status, timing, and results |
| `audit_results` | Individual task pass/fail/needs_review results with code refs |
| `audit_report_metadata` | Extended metadata for generated audit reports |

---

## Constraints

- MUST NOT modify original compliance documents (immutable storage)
- MUST maintain document integrity with SHA-256 hashes
- MUST support full-text search across all documents
- Framework enablement MUST be app-level (not global)
- Disabling a framework MUST NOT delete historical audit data
- At least one framework MUST be enabled for audit features to be active
- Audit reports MUST be tamper-evident (signed/verified)
