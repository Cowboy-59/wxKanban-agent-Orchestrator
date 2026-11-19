# Task Breakdown: Audit Route Access Control

**Feature**: Audit Route Access Control
**Spec**: 146
**Date Generated**: 2026-10-25
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Audit route access table and route-enumeration test (FR-004) | critical | done |
| 2 | SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002) | critical | done |
| 3 | Framework-only document reads for non-SYSADMIN (FR-003) | critical | done |
| 4 | Re-extract replaces a document's tasks; 0-task parse refused (FR-006) | high | done |
| 5 | Record denials and SYSADMIN writes (FR-005) | high | done |
| 6 | Client shows only what the role can use (FR-007) | high | done |
| 7 | Route tests per role for all 22 audit routes | high | done |
| 8 | Live endpoint test per role against the deployed app (FR-008) | critical | done |
| 9 | Per-project compliance settings answer only to the project's tenant (FR-009) | critical | done |
| 10 | Remove the dead SysAdmin audit logger (FR-010) | medium | done |

## Task Details

### T001 — Audit route access table and route-enumeration test (FR-004)

Create one access table for every /api/audit route (method + path → login | companyAdmin | sysadmin | loginFrameworkOnly) in a new module beside src/server/routes/audit.ts. Add a unit test that walks the audit router's registered routes (router.stack) and fails when a registered route is missing from the table, when the table names a route that is no longer registered, or when the guard applied to a route does not match its table entry. 22 routes total (see the scope's API Routes table). Classification: moderate.

### T002 — SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002)

In src/server/routes/audit.ts apply requireSysAdmin (src/server/middleware/requireSysAdmin.ts) to POST /documents, POST /documents/:id/extract, DELETE /documents/:id, POST /execute, GET /executions, GET /executions/:id, GET /executions/:id/results, POST /executions/:id/cancel, POST /reports, GET /reports, GET /reports/:id, GET /reports/:id/download, POST /reports/:id/approve and GET /trends, driven by the T001 table. The guard MUST run before validateBody/validateQuery so a denied caller gets 403 even with a malformed body. 403 body: { error, roleRequired: "SYSADMIN", currentRole }. Denied requests write nothing (no auditexecutions row, no document or task change). Leave GET/PUT /config and the /tasks reads unchanged. Classification: heavy (security).

### T003 — Framework-only document reads for non-SYSADMIN (FR-003)

GET /documents, GET /documents/search and GET /documents/:id: for a non-SYSADMIN caller return only wxkanbandocuments rows with documenttype = 'compliance_framework'. A documenttype query parameter cannot widen the filter (?documenttype=db_analysis returns []). GET /documents/:id on an internal platform document returns 404 with the same body as a missing document. Implement the filter in DocumentService (listDocuments, searchDocuments, getDocument) via an explicit option, not in the route only. SYSADMIN sees every row. Classification: heavy (security). Also move GET /documents/search above GET /documents/:id: it is registered after it today (audit.ts:225 vs :267), so "search" is captured as an id and the search route is unreachable.

### T004 — Re-extract replaces a document's tasks; 0-task parse refused (FR-006)

AuditTaskService.extractTasksFromDocument: parse first; if the parse yields 0 tasks return a 422 from the route and change nothing. Otherwise, in one transaction, delete the document's existing complianceaudittasks rows and insert the newly parsed set (the cascade removes their auditresults). Return { documentId, tasksRemoved, tasksExtracted }. Extracting twice leaves the same count as once. Unit tests: double extract stable, 0-task parse leaves tasks untouched, transaction rollback on insert failure leaves the old set. Classification: heavy (production data).

### T005 — Record denials and SYSADMIN writes (FR-005)

Every 403 from the T002 guards emits a structured Pino warn with userid, usertype, method and path (add method to requireSysAdmin's warn record). Every SYSADMIN state-changing audit action — upload, extract, delete, execute, cancel, generate report, approve — writes a companyauditlogs record via logSysAdminAction (src/server/lib/auditLogger.ts) naming the action and target id; extract and delete records carry tasksRemoved / tasksExtracted. Add AuditAction values if the enum lacks them. Classification: moderate.

### T006 — Client shows only what the role can use (FR-007)

src/client/pages/ProjectWorkspacePage.tsx ComplianceWorkspace: hide the Audit and Reports sub-tabs for non-SYSADMIN. src/client/components/audit/DocumentUpload.tsx: hide the Upload form and the Extract and Delete buttons for non-SYSADMIN; the SYSADMIN re-extract confirm states that existing tasks and their self-audit results are replaced. src/client/pages/AuditManagement.tsx (/admin/audit): a non-SYSADMIN sees a 'System Administrator access required' notice and the page issues no /api/audit write or SYSADMIN-only request. SYSADMIN unchanged. shadcn components per _wxAI/rules/shadcn.md; no new components. Classification: moderate.

### T007 — Route tests per role for all 22 audit routes

Supertest suite over the audit router with TEAM_MEMBER, TEAM_MANAGER, company ADMIN, SYSADMIN and anonymous callers asserting the expected status for every route in the T001 table (401/403/404/200), that denied writes change no row (service layer mocked or a transaction rolled back — never the production DB, see the unit-tests-hit-prod-DB trap), the framework-only filter, and the 422 on a 0-task extract. Classification: moderate.

### T008 — Live endpoint test per role against the deployed app (FR-008)

After the owner pushes and the deploy is verified: as TEAM_MEMBER, company ADMIN, SYSADMIN and anonymous, call every route in the access table against production and record status codes. Denied DELETE and extract probes target a nonexistent UUID. SYSADMIN extract/delete proven on a throwaway compliance_framework document: upload, extract twice (stable count), delete, verify 0 of its tasks remain. Before/after: 6 framework documents, SOC2 119, HITRUST 304, 565 tasks total; MCP get_compliance_context SOC2 count unchanged; every denial has a warn log line; every SYSADMIN write has a companyauditlogs row. Evidence to specs/146-audit-route-access-control/evidence/. Owner-approved prod writes (2026-10-25): the throwaway document only. Classification: heavy (production).

### T009 — Per-project compliance settings answer only to the project's tenant (FR-009)

Added 2026-10-25 (owner folded the /config hole into SCOPE-146). GET/PUT /api/audit/config?projectId= and GET /api/audit/tasks/relevant?projectId=: reads by owner company, engagement-granted company, or SYSADMIN; the PUT by an ADMIN of the owner company only; anyone else 404 with the unknown-project body. Legacy no-projectId path unchanged. T008's live test covers these routes too.

### T010 — Remove the dead SysAdmin audit logger (FR-010)

Added 2026-10-25. Delete src/server/lib/auditLogger.ts (no importers; string-built SQL against a sysadmin_audit_logs table that does not exist). Durable SysAdmin auditing is its own scope.

### T008 result (2026-10-25)

PASSED. Deployed app (commit 99ccb3e8, app 1.5.351): both App Runner deploys SUCCEEDED; the live bundle carries 1.5.351 and the /admin/audit notice; 22 of 22 routes answer anonymous callers 401. Production's JWT secret differs from the local env, so the role matrix ran on the run-wxkanban local server on the same commit against the production database (owner's choice): 0 failures across anonymous, TEAM_MANAGER (Wxperts has no TEAM_MEMBER), ADMIN and SYSADMIN; 28 SYSADMIN-route denials, 28 matching warn log lines. FR-009 cross-tenant: PUT/GET/relevant 404 with the unknown-project body, target config unchanged. Throwaway document: upload 201, extract {0,3} then {3,3}, delete 200, residue 0 tasks / 0 docs, 4 audit rows. Library unchanged (6 framework docs, SOC2 119, HITRUST 304, 565 total); deployed MCP SOC2 controlCount 119. Evidence: evidence/t008-live.json.
