# Scope 146: Audit Route Access Control

**Scope Number**: 146
**Status**: `draft`
**Created**: 2026-10-25
**Depends On**: SCOPE-013, SCOPE-112
**Source**: `specs/Project-Scope/146-audit-route-access-control.md`

## Overview
Put an explicit, tested role guard on every /api/audit route. Only a SYSADMIN may change the Platform Compliance Library or run, read and approve the Platform Self-Audit. Any logged-in user may read the framework documents and their compliance tasks, and internal platform documents are hidden from customers (404). Re-extracting a document replaces its tasks instead of duplicating them, and refuses a parse that finds none. SYSADMIN writes and all denials are recorded. The client hides what a role cannot use. No schema change; customer-run audits of their own code are a separate follow-on scope.

The Platform Compliance Library — the framework rule documents (SOC2, HIPAA, HITRUST, GDPR, NIST SSDF, ISO 27001) and the 565 compliance tasks extracted from them — is shared by every tenant, yet every /api/audit route except PUT /config is guarded only by a login. Any logged-in user in any Company and any role can: DELETE a framework document (the cascade removes its tasks — SOC2 119, HITRUST 304 — and compliance context goes empty for every customer project); re-extract a document (duplicating its tasks for everyone, because extraction inserts without clearing); upload documents into the shared library. Separately, the server-side audit engine scans wxKanban's own source code and config files; any login can start a run, list every run, and read results that carry wxKanban source lines as code snippets, and can list, download and approve reports and read wxKanban-internal documents (database analysis, ER diagram, test reports). Every customer project's Compliance tab offers these actions in the UI. Verified read-only against production on 2026-10-25: all 11 documents and 5 executions are unowned seed/test rows, so no misuse is evident yet — this must close before it is found.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | SYSADMIN (Platform Compliance Library maintainer) |
| **Secondary Actors** | Customer users (ADMIN, TEAM_MANAGER, TEAM_MEMBER) reading the library from a project's Compliance tab, Kit users consuming MCP get_compliance_context at buildscope/createSpecs/implement (protected indirectly) |
| **Key Value** | No customer can damage, or read across, the shared Platform Compliance Library or wxKanban's own audit data, and SOC2 CC6.3 (an explicit role guard on every privileged route) holds for /api/audit. |
| **Scope Boundary** | Role guards on all 22 /api/audit routes; framework-only document reads for non-SYSADMIN (internal documents 404); a route access table plus a route-enumeration test; replace-on-re-extract with a 0-task refusal; denial logging and SYSADMIN audit records; client hiding of controls a role cannot use; live endpoint tests per role against production. |
| **Out of Scope** | Customer-run audits of their own code via the kit, with tenant-owned results (companyid/projectid columns) — a separate follow-on scope; any DDL or schema change; separation of duties on report approval (SOC2 CC5.2) — only SYSADMINs can generate or approve, and there is effectively one; the 4 same-named HITRUST controls (pre-existing, not a re-extract artifact); the dead /sysadmin/audit link on the SysAdmin Dashboard; any change to the MCP compliance-context read path. |


## Out of Scope

- Customer-run audits of their own code via the kit, with tenant-owned results (companyid/projectid columns) — a separate follow-on scope.
- Any DDL or schema change.
- Separation of duties on report approval (SOC2 CC5.2) — only SYSADMINs can generate or approve, and there is effectively one.
- The 4 same-named HITRUST controls (pre-existing, not a re-extract artifact).
- The dead `/sysadmin/audit` link on the SysAdmin Dashboard.
- Any change to the MCP compliance-context read path.
- **Durable auditing of SysAdmin actions** (added 2026-10-25). `src/server/routes/sysadmin.ts` writes no audit row on any of its 34 mutating routes, and nine other route files use `requireSysAdmin`. This is a SOC2 CC7.2 gap of its own, and it gets its own scope next. FR-010 only removes the dead logger that was meant for it.

## Integration Context

- **SCOPE-013 (Audit Management)** owns these routes and the audit engine; its route table already intended `DELETE /api/audit/documents/:id` as admin only, which was never built. This scope hardens those routes; it does not replace SCOPE-013.
- **SCOPE-112 (per-project framework enablement)** — `GET/PUT /config` and `GET /tasks/relevant?projectId` stay exactly as they are.
- **MCP `get_compliance_context`** reads `complianceaudittasks` directly, not through these routes, and is unaffected.
- Reuses `src/server/middleware/requireSysAdmin.ts`; audit rows go to `companyauditlogs` directly (see Clarification 10).
- First item of the kit write-safety batch (`docs/brainstorms/2026-10-25-kit-write-safety.md`), shipped alone ahead of it.

## User Scenarios & Testing

### US1 — A customer browses the library safely

**Actor**: TEAM_MEMBER in a customer Company, on a project with SOC2 enabled

**Scenario**:
1. Opens Project → Compliance
2. Sees the Settings, Documents and Tasks sub-tabs; the Audit and Reports sub-tabs are not rendered
3. On Documents sees only framework rule documents, with no Upload form, Extract button or Delete button; the Database Analysis, ER diagram and test reports are not listed
4. On Tasks browses the SOC2 controls

**Expected outcome**: Every request returns 200; the document list contains only compliance_framework rows; no write control is rendered.

### US2 — A customer calls the API directly

**Actor**: TEAM_MEMBER or company ADMIN in a customer Company with a valid login cookie

**Scenario**:
1. DELETE /api/audit/documents/<SOC2 id>
2. POST /api/audit/documents/<id>/extract
3. POST /api/audit/documents
4. POST /api/audit/execute
5. GET /api/audit/executions, /executions/<id>/results, /reports, /reports/<id>/download, /trends
6. POST /api/audit/reports/<id>/approve
7. GET /api/audit/documents/<id of the Database Analysis document>

**Expected outcome**: Steps 1-6 each return 403 with roleRequired SYSADMIN and write nothing (SOC2 keeps 119 tasks, 11 documents remain); step 7 returns 404 with the same body as a missing document; every denial writes a structured warn log naming user, role, method and path.

### US3 — The SYSADMIN maintains the library and runs a self-audit

**Actor**: SYSADMIN

**Scenario**:
1. Opens /admin/audit; every tab, Upload and Delete are shown
2. Lists all documents including internal ones
3. Starts a Platform Self-Audit, views its results with code snippets, generates and approves a report
4. Re-extracts a framework document after confirming that its existing tasks and their self-audit results are replaced

**Expected outcome**: Every action works as before; re-extract leaves the same task count as a single extract; each write leaves a companyauditlogs record.

### US4 — Unauthenticated caller and per-project config are unchanged

**Actor**: Anonymous caller; company ADMIN; TEAM_MEMBER; kit MCP consumer

**Scenario**:
1. Anonymous calls any /api/audit route
2. Company ADMIN changes the project's framework enablement via PUT /config
3. TEAM_MEMBER attempts the same PUT /config
4. Kit calls MCP get_compliance_context for a customer project

**Expected outcome**: 401, 200, 403 respectively, unchanged; MCP returns the same SOC2 control count as before the release.

### US5 — Another company's ADMIN tries to change a project's frameworks (added 2026-10-25)

**Actor**: ADMIN of company A, with a valid login, who knows the id of a project owned by company B

**Scenario**:
1. `PUT /api/audit/config?projectId=<B's project>` with `{ soc2enabled: false }`
2. `GET /api/audit/config?projectId=<B's project>`
3. `GET /api/audit/tasks/relevant?projectId=<B's project>`

**Expected outcome**: All three return 404 with the same body as an unknown project. B's configuration is unchanged.

## Functional Requirements

### FR-001 — SYSADMIN guard on Platform Compliance Library writes

POST /api/audit/documents, POST /api/audit/documents/:id/extract and DELETE /api/audit/documents/:id MUST require usertype SYSADMIN.

**Acceptance Criteria**:
- [ ] Each returns 403 { error, roleRequired: "SYSADMIN", currentRole } for ADMIN, TEAM_MANAGER and TEAM_MEMBER
- [ ] On denial nothing is written: wxkanbandocuments and complianceaudittasks counts are identical before and after
- [ ] The guard runs before body validation, so a denied caller receives 403 even with a malformed body

### FR-002 — SYSADMIN guard on the Platform Self-Audit and reports

POST /execute; GET /executions, /executions/:id, /executions/:id/results; POST /executions/:id/cancel; POST /reports; GET /reports, /reports/:id, /reports/:id/download; POST /reports/:id/approve; and GET /trends under /api/audit MUST require usertype SYSADMIN, with the FR-001 403 shape.

**Acceptance Criteria**:
- [ ] A non-SYSADMIN never receives an execution, result, code snippet, report or trend row
- [ ] A non-SYSADMIN cannot start a server-side audit run (403, no auditexecutions row created)

### FR-003 — Framework-only document reads for non-SYSADMIN

GET /api/audit/documents, GET /api/audit/documents/search and GET /api/audit/documents/:id MUST return to a non-SYSADMIN only rows with documenttype = 'compliance_framework'. A SYSADMIN sees all rows.

**Acceptance Criteria**:
- [ ] For a non-SYSADMIN a documenttype query parameter cannot widen the filter: ?documenttype=db_analysis returns an empty list
- [ ] GET /documents/:id on an internal platform document returns 404 with the same body as a missing document
- [ ] Search never returns an internal platform document to a non-SYSADMIN

### FR-004 — Every route has a declared access rule

Every /api/audit route MUST appear in a single access table declaring login, company ADMIN or SYSADMIN. Unchanged and explicitly listed: GET /config (login), PUT /config (company ADMIN), GET /tasks, /tasks/relevant, /tasks/:id (login).

**Acceptance Criteria**:
- [ ] A unit test enumerates the router's registered routes and fails if any route is missing from the access table
- [ ] The test fails if the access table names a route that is no longer registered
- [ ] The guard applied to each route matches its access-table entry

### FR-005 — Denials and SYSADMIN writes are recorded

Every FR-001/FR-002 denial MUST emit a structured Pino warn log, and every SYSADMIN state-changing action MUST write a companyauditlogs record (attributed to the acting SYSADMIN's company).

**Acceptance Criteria**:
- [ ] Each 403 emits a warn record carrying userid, usertype, method and path
- [ ] Upload, extract, delete, execute, cancel, generate report and approve each write a companyauditlogs record naming the action and target id
- [ ] Extract and delete records include the tasks removed and tasks extracted counts

### FR-006 — Re-extract replaces, never duplicates

POST /api/audit/documents/:id/extract MUST replace that document's compliance tasks in one transaction: delete the existing set, then insert the newly parsed set.

**Acceptance Criteria**:
- [ ] Extracting the same document twice leaves the same task count as extracting it once
- [ ] If parsing yields 0 tasks the request returns 422 and the document's existing tasks are untouched
- [ ] The response returns { documentId, tasksRemoved, tasksExtracted }
- [ ] The SYSADMIN confirm step states that existing tasks and their Platform Self-Audit results will be replaced before the request is sent

### FR-007 — Client shows only what the role can use

The client MUST not render controls or views a non-SYSADMIN cannot use on the audit surfaces; SYSADMIN sees everything as today.

**Acceptance Criteria**:
- [ ] Project → Compliance shows a non-SYSADMIN the Settings, Documents and Tasks sub-tabs; Audit and Reports are not rendered
- [ ] The Documents sub-tab shows a non-SYSADMIN no Upload form, Extract button or Delete button
- [ ] /admin/audit shows a non-SYSADMIN a 'System Administrator access required' notice and issues no /api/audit write or SYSADMIN-only request
- [ ] A SYSADMIN sees every tab and control exactly as before

### FR-008 — Live endpoint test per role

The release MUST be proven against the deployed application for TEAM_MEMBER, company ADMIN, SYSADMIN and anonymous callers, with results recorded in the spec's evidence.

**Acceptance Criteria**:
- [ ] Every route in the FR-004 access table returns its expected status (401/403/404/200) for each role
- [ ] Denied DELETE and extract probes target a nonexistent UUID so a missing guard would still destroy nothing
- [ ] SYSADMIN extract and delete are proven on a throwaway framework document: upload, extract twice with a stable count, delete, and 0 of its tasks remain
- [ ] Results are written to the spec's evidence folder

### FR-009 — Per-project compliance settings answer only to the project's tenant (added 2026-10-25)

`GET /api/audit/config?projectId=`, `PUT /api/audit/config?projectId=` and `GET /api/audit/tasks/relevant?projectId=` MUST check that the caller may reach that project before reading or changing anything. Today none of them do: any login can read any project's framework settings, and **any company's ADMIN can change another company's project frameworks**. Reads are allowed to the project's owner company, to a company holding a SPEC-037 engagement grant on it (the same tenant rule `ProjectService.getProject` applies), and to a SYSADMIN. The write is allowed only to an ADMIN of the **owner** company; a consulting company cannot change a client's compliance settings. Any other caller receives 404 with the same body as an unknown project. The legacy company-wide path (no `projectId`) is unchanged.

**Acceptance Criteria**:
- [ ] An ADMIN of company A calling `PUT /config?projectId=<company B's project>` gets 404, and B's configuration is unchanged.
- [ ] Any login of company A calling `GET /config?projectId=<B's project>` or `GET /tasks/relevant?projectId=<B's project>` gets 404.
- [ ] A consulting company with an engagement grant on B's project can read its configuration (200) but gets 404 on `PUT`.
- [ ] Owner-company reads and an owner-company ADMIN's write behave exactly as before.
- [ ] A SYSADMIN can read any project's configuration.

### FR-010 — The dead SysAdmin audit logger is removed (added 2026-10-25)

`src/server/lib/auditLogger.ts` MUST be deleted. Nothing imports it. Every function in it builds SQL by string interpolation against a `sysadmin_audit_logs` table that does not exist in production, and its doc comments describe an audit trail that has never run. Left in place, it is an injection-shaped trap for whoever wires it up next. Durable auditing of SysAdmin actions is a separate scope (see Out of Scope).

**Acceptance Criteria**:
- [ ] The file is gone, and both bundles and every test suite still build and pass.
- [ ] A search of `src/`, `mcp-server/src/` and `scripts/` finds no reference to `sysadmin_audit_logs` or to the removed functions.

## Data Requirements

None — no DDL, no new tables or columns. Tables touched by behavior only:

- `wxkanbandocuments` — read-filtered for non-SYSADMIN (FR-003); written by SYSADMIN only (FR-001).
- `complianceaudittasks` — replace-on-extract inside one transaction (FR-006).
- `auditexecutions`, `auditresults`, `auditreportmetadata` — SYSADMIN only (FR-002).
- `companyauditlogs` — new rows written directly for SYSADMIN audit-library writes (FR-005).

Forbidden: any schema change. Tenant columns (companyid/projectid) belong to the follow-on kit-audit scope.

## API Routes

No new routes; guards added to the existing 22 under `/api/audit`.

| Access | Routes |
|---|---|
| Login (unchanged) | GET `/config`; GET `/tasks`, `/tasks/relevant`, `/tasks/:id` |
| Company ADMIN (unchanged) | PUT `/config` |
| Login, framework-only for non-SYSADMIN (FR-003) | GET `/documents`, `/documents/search`, `/documents/:id` |
| SYSADMIN (FR-001) | POST `/documents`; POST `/documents/:id/extract`; DELETE `/documents/:id` |
| SYSADMIN (FR-002) | POST `/execute`; GET `/executions`, `/executions/:id`, `/executions/:id/results`; POST `/executions/:id/cancel`; POST `/reports`; GET `/reports`, `/reports/:id`, `/reports/:id/download`; POST `/reports/:id/approve`; GET `/trends` |

Per-project tenant check (FR-009): `GET /config?projectId=`, `PUT /config?projectId=` and `GET /tasks/relevant?projectId=` additionally require the caller to reach the project (owner company or engagement grant for reads; owner-company ADMIN for the write; SYSADMIN reads), else 404.

Changed response: POST `/documents/:id/extract` returns `{ documentId, tasksRemoved, tasksExtracted }`, and 422 when the parse yields 0 tasks.

## Frontend Components

Existing files only; shadcn components per `_wxAI/rules/shadcn.md`.

- `src/client/pages/ProjectWorkspacePage.tsx` → `ComplianceWorkspace`: hide the Audit and Reports sub-tabs for non-SYSADMIN.
- `src/client/components/audit/DocumentUpload.tsx`: hide Upload, Extract and Delete for non-SYSADMIN; the SYSADMIN re-extract confirm states that existing tasks and their self-audit results are replaced.
- `src/client/pages/AuditManagement.tsx` (`/admin/audit`): non-SYSADMIN sees a "System Administrator access required" notice and the page makes no data calls.

No new components.

## Success Criteria

1. 0 of the 14 FR-001/FR-002 routes return 2xx to a non-SYSADMIN, across all three customer roles, in the live endpoint test.
2. 100% of the 22 /api/audit routes appear in the access table, and the route-enumeration test fails within one CI run when a new route lacks an entry.
3. After the live test the Platform Compliance Library is unchanged: 6 framework documents, SOC2 119 tasks, HITRUST 304 tasks, 565 tasks total — the throwaway document leaves no residue.
4. Re-extracting a document twice yields the same task count as once, and a 0-task parse leaves existing tasks untouched (unit test plus live throwaway).
5. A non-SYSADMIN sees 0 internal platform documents in list, search and by-id views (by-id returns 404).
6. No regression: SYSADMIN completes US3 end to end; PUT /config keeps 200 for company ADMIN and 403 for TEAM_MEMBER; MCP get_compliance_context returns the same SOC2 control count before and after release.
7. Every denial in the live test has a matching structured warn log line, and every SYSADMIN write has a companyauditlogs row.
8. 0 of 3 per-project compliance routes (FR-009) return 2xx to a company that neither owns nor is engaged on the project, in the live test; 1 of 1 cross-tenant `PUT` leaves the target's configuration byte-identical.
9. 0 references to `sysadmin_audit_logs` remain in `src/`, `mcp-server/src/` and `scripts/` after FR-010.

## Key Entities

No schema change. Domain terms (added to CONTEXT.md):

- **Platform Compliance Library** — framework rule documents (`wxkanbandocuments`, documenttype `compliance_framework`) plus their extracted compliance tasks (`complianceaudittasks`). Global to the product, SYSADMIN-maintained, read by every Company.
- **Platform Self-Audit** — an audit execution and its results and reports (`auditexecutions`, `auditresults`, `auditreportmetadata`), run server-side against wxKanban's own code. SYSADMIN only; never a customer's audit.
- **Internal platform document** — any `wxkanbandocuments` row that is not `compliance_framework` (db_analysis, erdiagram, audit_report). SYSADMIN only.

## Compliance Requirements

Active framework: **SOC2** (project compliance context, Design phase, loaded 2026-10-25).

| Control | Requirement | Where this scope meets it |
|---|---|---|
| CC6.3 — Principle of least privilege | Every privileged route is gated by an explicit role guard rather than assuming an authenticated caller is entitled | FR-001, FR-002, FR-003; FR-004 route-enumeration test keeps it true for future routes |
| CC6.1 — Authentication and authorization design | How identity is established and how authorization decisions are made is stated before implementation | API Routes access table; FR-004 |
| CC7.2 — Audit trail of all changes | Every state-changing action records who did what and when, in a store separate from the record changed | FR-005 (rows in `companyauditlogs`) |
| CC7.2 — Security log monitoring | Security-relevant events emit structured, queryable log records | FR-005 (structured Pino warn on every denial) |
| CC5.2 — Separation of duties | No single identity both authors and approves the same change | **Not applied** — report generation and approval are both SYSADMIN-only and there is effectively one SYSADMIN (owner decision, 2026-10-25) |

## Constraints

- MUST deliver only the behavior described within the scope boundary: Role guards on all 22 /api/audit routes; framework-only document reads for non-SYSADMIN (internal documents 404); a route access table plus a route-enumeration test; replace-on-re-extract with a 0-task refusal; denial logging and SYSADMIN audit records; client hiding of controls a role cannot use; live endpoint tests per role against production.
- MUST keep the following work out of scope for this iteration: Customer-run audits of their own code via the kit, with tenant-owned results (companyid/projectid columns) — a separate follow-on scope; any DDL or schema change; separation of duties on report approval (SOC2 CC5.2) — only SYSADMINs can generate or approve, and there is effectively one; the 4 same-named HITRUST controls (pre-existing, not a re-extract artifact); the dead /sysadmin/audit link on the SysAdmin Dashboard; any change to the MCP compliance-context read path.

## Notes

- Integration context: Hardens the routes owned by SCOPE-013 (Audit Management — its route table already intended DELETE /api/audit/documents/:id as admin only, never built). Keeps SCOPE-112 per-project framework enablement (GET/PUT /config, GET /tasks/relevant?projectId) unchanged. Reuses src/server/middleware/requireSysAdmin.ts; audit rows are written to companyauditlogs directly (see Clarification 10). The MCP get_compliance_context reads complianceaudittasks directly and is unaffected. First item of the kit write-safety batch (docs/brainstorms/2026-10-25-kit-write-safety.md), shipped alone ahead of it.
- Constraints and risks: Release order: ships as its own app push ahead of the rest of the write-safety batch (server + client only; no kit or VSIX release; the MCP redeploys on the same push but is unchanged). No DDL; drizzle-kit push prohibited; the local .env DATABASE_URL is production. Live-test safety: denied DELETE and extract probes target a nonexistent UUID so a missing guard still destroys nothing; the only real writes are one throwaway framework document (upload, extract twice, delete) whose residue is verified to be zero (approved by the owner 2026-10-25). Reuse existing requireSysAdmin; no new guard code. Code fences via the orchestrator path, labelled [SCOPE 146 / Tnnn]. FR-006 replace deletes the document's tasks, which cascades their Platform Self-Audit results (0 rows in production today) — the SYSADMIN confirm states this. Risk: a caller who scripted these routes starts receiving 403; production shows no customer-owned rows, so expected impact is none. Known defects noted, not fixed: HITRUST has 304 rows but 300 distinct title+control keys; the SysAdmin Dashboard links to /sysadmin/audit, which has no route. Depends on SCOPE-013 and SCOPE-112.

## Clarifications

### Session 2026-10-25

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | The shared Platform Compliance Library and wxKanban's own Platform Self-Audit data are writable and readable by any logged-in user in any Company (see Overview). Verified read-only against production 2026-10-25: no customer-owned rows, no evident misuse. |
| 2 | Who are the primary and secondary actors? | Primary: SYSADMIN (Platform Compliance Library maintainer). Secondary: customer users (ADMIN, TEAM_MANAGER, TEAM_MEMBER) reading the library from a project's Compliance tab; kit users consuming MCP get_compliance_context (protected indirectly). |
| 3 | SYSADMIN-only, tenant-scoped, or both? | Owner first chose tenant-scoping; after learning the server-side engine scans wxKanban's own `src/` and `.env`-adjacent config (so a tenant-scoped run would still audit wxKanban), chose: close the hole now with SYSADMIN guards and no DDL; customer audits run by the kit locally, with tenant-owned results, are a separate follow-on scope. |
| 4 | Re-extract duplication — in scope or noted defect? | In scope (FR-006), with a 0-task refusal so a bad parse never wipes a framework. |
| 5 | New scope or SCOPE-013 amendment? | New hardening scope over SCOPE-013's routes. |
| 6 | Internal documents for non-SYSADMIN — 403 or 404? | 404, same body as a missing document (matches the SCOPE-043 tenant-404 pattern). |
| 7 | Separation of duties on report approval (SOC2 CC5.2)? | Out — only SYSADMINs generate or approve, and there is effectively one. |
| 8 | Live test writes to production? | Approved: one throwaway framework document (upload, extract twice, delete), residue verified zero; denied probes use a nonexistent UUID. |
| 9 | Consulting members (engagements) treated differently? | No — role is the only input; no engagement-specific rule. |
| 10 | Audit records via `logSysAdminAction`, as first drafted? | No. Found at implement (2026-10-25): `logSysAdminAction` writes a `sysadmin_audit_logs` table that does not exist in production (verified with `to_regclass`) and swallows the failure, so it persists nothing. SPEC-146 writes `companyauditlogs` directly (`src/server/routes/auditAccess.ts` `recordAuditLibraryWrite`). The defect in `logSysAdminAction` itself affects every SysAdmin action and is reported separately, not fixed here. |
| 11 | How many routes? | 22 `/api/audit` routes, 14 of them SYSADMIN only (3 for FR-001, 11 for FR-002). The first draft said 23 and 15; corrected at implement when the route-enumeration test counted the router. |
| 12 | Fold the two holes found at implement into this scope? | Owner, 2026-10-25: fold the `/config` ownership hole (FR-009) and the dead logger's removal (FR-010); split "audit every SysAdmin action" into its own scope. The second hole was first misdescribed as a broken audit trail; it is a never-wired one, which is why the full fix was sized separately. |
| 13 | Who may change a project's compliance frameworks? | An ADMIN of the owning company only. A consulting company with an engagement grant may read the settings, not change them. A SYSADMIN may read them; the write keeps today's `requireAdmin` (company ADMIN). |
