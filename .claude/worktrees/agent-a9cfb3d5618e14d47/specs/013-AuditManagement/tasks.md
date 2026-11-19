# Tasks: Audit Management (Spec 013)

**Branch**: `013-audit-management`
**Input**: `specs/013-AuditManagement/spec.md`, `specs/013-AuditManagement/plan.md`, `specs/Project-Scope/013-scopeAudit.md`
**Generated**: 2026-02-22
**Total Tasks**: 30
**User Stories**: US1 (Framework Config), US2 (Document Ingestion), US3 (Pre-Impl Tasks), US4 (Automated Audit), US5 (Report Review), US6 (Disable No Data Loss)

---

## Phase A: Database Migration

_Create all 6 new tables. T001–T006 can run in parallel (independent DDL statements)._

- [ ] T001 [P] Create `database/migrations/013_audit_management.sql` — add `app_audit_configuration` table: `id UUID PK`, `appid UUID UNIQUE NOT NULL`, `soc2enabled BOOLEAN DEFAULT false`, `hipaaenabled BOOLEAN DEFAULT false`, `hitrustenabled BOOLEAN DEFAULT false`, `gdprenabled BOOLEAN DEFAULT false`, `autoauditondeploy BOOLEAN DEFAULT true`, `autoauditschedule VARCHAR(20) DEFAULT 'weekly'`, `auditseveritythreshold VARCHAR(20) DEFAULT 'medium'`, `failoncritical BOOLEAN DEFAULT true`, `auditreportretentiondays INTEGER DEFAULT 365`, `createdat TIMESTAMP DEFAULT NOW()`, `updatedat TIMESTAMP DEFAULT NOW()`
- [ ] T002 [P] Add `wxkanbandocuments` table to `database/migrations/013_audit_management.sql` — `id UUID PK`, `documenttype VARCHAR(50) NOT NULL`, `title VARCHAR(255) NOT NULL`, `description TEXT`, `filename VARCHAR(255)`, `filecontent TEXT`, `filehash VARCHAR(64)`, `framework VARCHAR(50)`, `version VARCHAR(20)`, `effectivedate DATE`, `status VARCHAR(20) DEFAULT 'active'`, `extractedtasks INTEGER DEFAULT 0`, `createdby UUID`, `createdat TIMESTAMP DEFAULT NOW()`, `updatedat TIMESTAMP DEFAULT NOW()`, `fulltextsearch TSVECTOR`; add GIN index on `fulltextsearch`; add index on `framework`; add index on `documenttype`
- [ ] T003 [P] Add `compliance_audit_tasks` table to `database/migrations/013_audit_management.sql` — `id UUID PK`, `documentid UUID REFERENCES wxkanbandocuments(id)`, `framework VARCHAR(50) NOT NULL`, `category VARCHAR(100) NOT NULL`, `controlreference VARCHAR(50)`, `priority VARCHAR(20) NOT NULL`, `tasktype VARCHAR(50) NOT NULL`, `title VARCHAR(255) NOT NULL`, `description TEXT NOT NULL`, `requirementtext TEXT`, `checkmethod VARCHAR(50)`, `checkpattern TEXT`, `suggestedfix TEXT`, `applicablephases TEXT[]`, `applicablefiletypes TEXT[]`, `isautomated BOOLEAN DEFAULT true`, `createdat TIMESTAMP DEFAULT NOW()`; add indexes on `framework`, `category`, `priority`
- [ ] T004 [P] Add `audit_executions` table to `database/migrations/013_audit_management.sql` — `id UUID PK`, `executiontype VARCHAR(50) NOT NULL`, `triggeredby UUID`, `specid UUID`, `featurescope VARCHAR(255)`, `enabledframeworks TEXT[]`, `starttime TIMESTAMP DEFAULT NOW()`, `endtime TIMESTAMP`, `status VARCHAR(20) DEFAULT 'running'`, `totaltasks INTEGER DEFAULT 0`, `passedtasks INTEGER DEFAULT 0`, `failedtasks INTEGER DEFAULT 0`, `reviewtasks INTEGER DEFAULT 0`, `overallscore DECIMAL(5,2)`, `reportdocumentid UUID REFERENCES wxkanbandocuments(id)`, `createdat TIMESTAMP DEFAULT NOW()`; add indexes on `status`, `specid`
- [ ] T005 [P] Add `audit_results` table to `database/migrations/013_audit_management.sql` — `id UUID PK`, `executionid UUID NOT NULL REFERENCES audit_executions(id)`, `taskid UUID NOT NULL REFERENCES compliance_audit_tasks(id)`, `filepath VARCHAR(500)`, `linenumber INTEGER`, `codesnippet TEXT`, `resultstatus VARCHAR(20) NOT NULL`, `resultdetails TEXT`, `suggestedfix TEXT`, `severity VARCHAR(20)`, `createdat TIMESTAMP DEFAULT NOW()`; add indexes on `executionid`, `resultstatus`, `severity`
- [ ] T006 [P] Add `audit_report_metadata` table to `database/migrations/013_audit_management.sql` — `id UUID PK`, `documentid UUID NOT NULL REFERENCES wxkanbandocuments(id)`, `executionid UUID NOT NULL REFERENCES audit_executions(id)`, `frameworks TEXT[]`, `featurescope VARCHAR(255)`, `executiondate TIMESTAMP`, `overallcompliance DECIMAL(5,2)`, `criticalfindings INTEGER DEFAULT 0`, `highfindings INTEGER DEFAULT 0`, `mediumfindings INTEGER DEFAULT 0`, `lowfindings INTEGER DEFAULT 0`, `remediationstatus VARCHAR(20) DEFAULT 'open'`, `reviewedby UUID`, `reviewdate TIMESTAMP`, `approved BOOLEAN DEFAULT false`, `createdat TIMESTAMP DEFAULT NOW()`

---

## Phase B: Backend Services

_Create 5 service files. T007–T010 can run in parallel. T011 depends on T008, T009, T010._

- [ ] T007 [P] Create `src/server/services/AuditConfigService.ts` — export functions: `getAuditConfig(appId: string): Promise<AuditConfig | null>`, `createAuditConfig(appId: string, data: CreateAuditConfigInput): Promise<AuditConfig>`, `updateAuditConfig(appId: string, data: UpdateAuditConfigInput): Promise<AuditConfig>`, `getEnabledFrameworks(appId: string): Promise<string[]>`; `getEnabledFrameworks` returns array of enabled framework names (e.g. `['SOC2', 'HIPAA']`); all functions use parameterized queries via `db` pool; define `AuditConfig`, `CreateAuditConfigInput`, `UpdateAuditConfigInput` types in same file
- [ ] T008 [P] Create `src/server/services/DocumentService.ts` — export functions: `uploadDocument(data: UploadDocumentInput, userId: string): Promise<WxKanbanDocument>`, `listDocuments(filters: DocumentFilters): Promise<WxKanbanDocument[]>`, `getDocument(id: string): Promise<WxKanbanDocument | null>`, `deleteDocument(id: string): Promise<void>`, `searchDocuments(query: string): Promise<WxKanbanDocument[]>`; `uploadDocument` computes SHA-256 hash of `filecontent` using Node.js `crypto.createHash('sha256')`, updates `fulltextsearch` via `to_tsvector('english', title || ' ' || COALESCE(filecontent, ''))`, sets `extractedtasks = 0` initially; define all types in same file
- [ ] T009 [P] Create `src/server/services/AuditTaskService.ts` — export functions: `extractTasksFromDocument(documentId: string): Promise<number>`, `listTasks(filters: TaskFilters): Promise<ComplianceAuditTask[]>`, `getTask(id: string): Promise<ComplianceAuditTask | null>`, `getRelevantTasks(featureKeywords: string[], enabledFrameworks: string[]): Promise<ComplianceAuditTask[]>`; `extractTasksFromDocument` reads document `filecontent`, parses markdown checklist items (`- [ ]` lines), creates `compliance_audit_tasks` rows with framework from document, infers priority from keywords ('critical', 'high', 'medium', 'low'), sets `checkmethod` based on task content; `getRelevantTasks` filters by `enabledFrameworks` and matches keywords against `title` and `description`; define all types in same file
- [ ] T010 [P] Create `src/server/services/AuditEngineService.ts` — export function: `executeAudit(executionId: string, enabledFrameworks: string[], featureScope: string): Promise<AuditExecutionResult>`; implementation: (1) load all `compliance_audit_tasks` for `enabledFrameworks` where `isautomated = true`; (2) for each task, run check based on `checkmethod`: `'regex_pattern'` → scan source files matching `applicablefiletypes` with `checkpattern` regex; `'configuration'` → check config files (`.env`, `tsconfig.json`, `package.json`); `'manual_review'` → set `resultstatus = 'needs_review'`; (3) insert `audit_results` rows; (4) update `audit_executions` with totals and `overallscore`; define `AuditExecutionResult` type in same file
- [ ] T011 Create `src/server/services/AuditReportService.ts` — export functions: `generateReport(executionId: string, createdBy: string): Promise<WxKanbanDocument>`, `listReports(filters: ReportFilters): Promise<AuditReportSummary[]>`, `getReport(id: string): Promise<AuditReportWithMetadata | null>`, `approveReport(id: string, reviewerId: string): Promise<void>`, `getTrends(days: number): Promise<ComplianceTrend[]>`; `generateReport` builds markdown report content from `audit_results` joined with `compliance_audit_tasks`, calls `DocumentService.uploadDocument` with `documenttype: 'audit_report'`, inserts `audit_report_metadata` row, updates `audit_executions.reportdocumentid`; define all types in same file

---

## Phase C: API Routes

_T012 depends on T007–T011 (all services must exist before routes)._

- [ ] T012 Create `src/server/routes/audit.ts` — register all `/api/audit/*` routes using Express Router; import and use `AuditConfigService`, `DocumentService`, `AuditTaskService`, `AuditEngineService`, `AuditReportService`; implement routes:
  - `GET /config` → `AuditConfigService.getAuditConfig`
  - `POST /config` → `AuditConfigService.createAuditConfig` (ADMIN only)
  - `PATCH /config` → `AuditConfigService.updateAuditConfig` (ADMIN only)
  - `GET /config/frameworks` → return static list of 4 frameworks with descriptions
  - `POST /documents` → `DocumentService.uploadDocument` (ADMIN only, parse multipart or JSON body)
  - `GET /documents` → `DocumentService.listDocuments`
  - `GET /documents/:id` → `DocumentService.getDocument`
  - `POST /documents/:id/extract` → `AuditTaskService.extractTasksFromDocument` (ADMIN only)
  - `DELETE /documents/:id` → `DocumentService.deleteDocument` (ADMIN only)
  - `GET /tasks` → `AuditTaskService.listTasks` (query params: `framework`, `category`, `priority`)
  - `GET /tasks/relevant` → `AuditTaskService.getRelevantTasks` (query params: `keywords`, uses `AuditConfigService.getEnabledFrameworks`)
  - `GET /tasks/:id` → `AuditTaskService.getTask`
  - `POST /execute` → create `audit_executions` row, call `AuditEngineService.executeAudit` async, return execution id immediately (ADMIN only)
  - `GET /executions` → query `audit_executions` ordered by `createdat DESC`
  - `GET /executions/:id` → query `audit_executions` by id
  - `GET /executions/:id/results` → query `audit_results` joined with `compliance_audit_tasks` for execution
  - `POST /executions/:id/cancel` → update `audit_executions.status = 'cancelled'` (ADMIN only)
  - `GET /reports` → `AuditReportService.listReports`
  - `GET /reports/:id` → `AuditReportService.getReport`
  - `GET /reports/:id/download` → return report `filecontent` as JSON download
  - `POST /reports/:id/approve` → `AuditReportService.approveReport` (ADMIN only)
  - `GET /trends` → `AuditReportService.getTrends` (query param: `days`, default 30)
  - All routes use `authenticateToken` middleware; ADMIN-only routes check `req.user.role === 'ADMIN'`

---

## Phase D: Route Registration

- [ ] T013 Update `src/server/routes/index.ts` — import `auditRouter` from `./audit`; register with `app.use('/api/audit', auditRouter)` alongside existing route registrations

---

## Phase E: Frontend Components

_T014–T019 can run in parallel. T020 depends on T014–T019. T021 depends on T020._

- [x] T014 ~~[P] Create `src/client/components/Audit/AuditFrameworkSelector.tsx`~~ — **ROLLED INTO T015** (2026-05-13). The 4-framework 2×2 grid, toggles, and disable-warning flow live inline in `AuditConfigPanel.tsx` rather than as a separate child component. No standalone `AuditFrameworkSelector.tsx` file will be created.
- [ ] T015 [P] Create `src/client/components/Audit/AuditConfigPanel.tsx` — props: `appId: string`; fetch `GET /api/audit/config` on mount; render: `AuditFrameworkSelector` + additional settings (auto-audit schedule dropdown, severity threshold dropdown, fail-on-critical toggle, retention days input); save button calls `PATCH /api/audit/config`; show success/error inline feedback; loading skeleton while fetching
- [x] T016 [P] ~~Create `src/client/components/Audit/ComplianceDocumentManager.tsx`~~ — **EXTENDED `DocumentUpload.tsx` TO COVER THIS SCOPE** (2026-05-13). `src/client/components/audit/DocumentUpload.tsx` now exports a full document manager: `enabledFrameworks?: string[]` prop, on-mount `GET /api/audit/documents`, document list table (title, framework, status, extracted tasks count, created date, actions), modal-based upload with title + framework selector + content textarea + file drop, post-upload `POST /api/audit/documents/:id/extract`, ADMIN-only delete with confirmation modal, and color-coded framework badges (SOC2=blue, HIPAA=green, HITRUST=purple, GDPR=orange). Existing `onUpload` callback retained for backwards-compat with `AuditManagement.tsx` and `ProjectWorkspacePage.tsx` call sites.
- [ ] T017 [P] Create `src/client/components/Audit/AuditTaskBrowser.tsx` — props: `enabledFrameworks: string[]`; fetch `GET /api/audit/tasks` on mount with enabled frameworks filter; render: filter bar (framework multi-select, category dropdown, priority filter, search input), task list showing: control reference badge, priority badge (critical=red, high=orange, medium=yellow, low=gray), title, description preview, check method indicator (auto/manual); click task → expand to show full description, requirement text, suggested fix; task count summary by framework
- [ ] T018 [P] Create `src/client/components/Audit/AuditExecutionPanel.tsx` — props: `enabledFrameworks: string[]`; fetch `GET /api/audit/executions` on mount; render: "Run Audit" button → opens modal with feature scope input and enabled frameworks shown; on submit calls `POST /api/audit/execute`; execution list table (date, scope, frameworks, status, score, actions); status badge (running=blue spinner, completed=green, failed=red, cancelled=gray); click execution → shows `AuditResultsViewer` inline; auto-refresh running executions every 10 seconds
- [x] T019 [P] ~~Create `src/client/components/Audit/AuditReportDashboard.tsx`~~ — **EXTENDED `ComplianceReportViewer.tsx` TO COVER THIS SCOPE** (2026-05-13). `src/client/components/audit/ComplianceReportViewer.tsx` now exports a full report dashboard: `enabledFrameworks?: string[]` prop, on-mount parallel `GET /api/audit/reports` + `GET /api/audit/trends?days=30`, inline-SVG sparkline showing 30-day compliance score with delta indicator, report list table (date, scope, frameworks badges, overall score, C/H findings counts, status, download/approve actions), per-report markdown modal on row click, ADMIN-only approve button calling `POST /api/audit/reports/:id/approve`, and download via client-side blob over `document.filecontent` (the spec's `GET /api/audit/reports/:id/download` endpoint is still missing — tracked under T012). **Field-contract bug fixed**: prior implementation read non-existent `report.reporttitle`/`reportcontent`/`generatedat`/`criticalcount` fields; rebound to the actual `listReports` response shape (`document.title`, `document.filecontent`, `executiondate`, `criticalfindings`, etc.). T019's "click → opens `AuditFindingDetail` modal" wording is satisfied as **per-report markdown modal** — `AuditFindingDetail` is per-finding (takes `{task, result}`) and doesn't fit per-report; drill-into-finding belongs in `AuditResultsViewer` (T020) which already uses it.
- [ ] T020 Create `src/client/components/Audit/AuditResultsViewer.tsx` — props: `executionId: string`; fetch `GET /api/audit/executions/:id/results` on mount; render: summary bar (total/pass/fail/needs_review counts + overall score percentage), results grouped by framework then by severity; each result row shows: status icon (✓/✗/⚠), task title, control reference, severity badge, file path + line number (if available), code snippet (monospace, truncated); expand row → shows full result details, requirement text, suggested fix in code block; filter by status (pass/fail/needs_review) and severity
- [ ] T021 Create `src/client/components/Audit/AuditFindingDetail.tsx` — props: `result: AuditResult`, `task: ComplianceAuditTask`, `onClose: () => void`; render as modal overlay; shows: framework badge, control reference, priority badge, full requirement text, code snippet with syntax highlighting (monospace pre block), result details, suggested fix with copy button, link to create remediation task; close button and ESC key dismiss

---

## Phase F: Workspace Integration

- [x] T022 Update `src/client/pages/ProjectWorkspacePage.tsx` — add `compliance` tab handling: add "Compliance" tab button (with `Shield` icon from lucide-react) after existing tabs using same active/inactive styling pattern; add `{activeTab === 'compliance' && <ComplianceWorkspace projectId={project.id} />}` in content area; create inline `ComplianceWorkspace` component that renders tabs: "Settings" (`AuditConfigPanel`), "Documents" (`ComplianceDocumentManager`), "Tasks" (`AuditTaskBrowser`), "Audit" (`AuditExecutionPanel`), "Reports" (`AuditReportDashboard`); fetch enabled frameworks from `GET /api/audit/config` and pass to all child components; import all Audit components. **Completed 2026-05-13** — `ComplianceWorkspace` now derives `enabledFrameworks` from `/api/audit/config` (SOC2/HIPAA/HITRUST/GDPR flags) and passes the array to `DocumentUpload`, `AuditTaskBrowser`, and `ComplianceReportViewer`. `AuditConfigPanel` accepts an `onChange` callback so saved config changes propagate immediately to sibling tabs via a `refreshKey`. `AuditExecutionPanel` does not currently accept the prop — it manages its own framework state.

---

## Phase G: Validation (HUMAN)

_Run after Phase F is complete. Sequential._

- [ ] T023 **HUMAN TASK**: Apply database migration — run `psql -d wxkanban -f database/migrations/013_audit_management.sql` and verify all 6 tables created with `\dt` in psql
- [ ] T024 **HUMAN TASK**: Run `npm run check-types` — verify TypeScript compiles cleanly with zero errors across all new and modified files
- [ ] T025 **HUMAN TASK**: Start dev server (`npm run dev`), navigate to a project, verify "Compliance" tab appears in tab bar and loads without errors
- [ ] T026 **HUMAN TASK**: Test framework configuration — toggle SOC2 ON, verify save succeeds, refresh page, verify SOC2 remains ON; toggle OFF, verify warning dialog appears
- [ ] T027 **HUMAN TASK**: Test document upload — upload `SOC2_SDLC_Compliance_Rules.md`, verify document appears in list with extracted task count > 0; navigate to Tasks tab, verify SOC2 tasks appear
- [ ] T028 **HUMAN TASK**: Test audit execution — click "Run Audit", enter feature scope, verify execution starts; wait for completion, verify results show pass/fail breakdown
- [ ] T029 **HUMAN TASK**: Test audit report — verify report appears in Reports tab after audit completes; click report, verify findings with code references shown; click Download, verify JSON downloads
- [ ] T030 **HUMAN TASK**: Test framework disable — disable SOC2 after audit exists; verify historical report still shows SOC2 findings; run new audit, verify only enabled frameworks checked

---

## Dependencies

```
T001–T006 (parallel) → T007–T011 (services need tables)
T007, T008 → T011 (ReportService uses DocumentService + config)
T007–T011 → T012 (routes need all services)
T012 → T013 (route file must exist before registration)
T013 → T014–T021 (backend must be ready before frontend)
T014 → T015 (AuditFrameworkSelector used in AuditConfigPanel) — N/A, T014 rolled into T015
T014–T019 → T022 (all components before workspace integration)
T020 → T022 (AuditResultsViewer used in AuditExecutionPanel)
T021 → T019 (AuditFindingDetail used in AuditReportDashboard)
T022 → T023 (implementation complete before validation)
T023 → T024 (migration applied before type check)
T024 → T025 (type check passes before browser test)
T025 → T026 → T027 → T028 → T029 → T030 (sequential validation)
```

---

## Parallel Execution Examples

```
# Phase A — all parallel:
T001, T002, T003, T004, T005, T006 — all DDL statements independent

# Phase B — partial parallel:
T007, T008, T009, T010 — independent services
T011 — after T007, T008 (depends on DocumentService + AuditConfigService)

# Phase E — partial parallel:
T014, T015, T016, T017, T018, T019 — independent components
T020 — after T018 (AuditResultsViewer used in AuditExecutionPanel)
T021 — after T019 (AuditFindingDetail used in AuditReportDashboard)
T022 — after T014–T021

# Phase G — sequential:
T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030
```

---

## MVP Scope

**P0 (must complete before any testing)**: T001–T013 (database + backend)

**P1 (core UI)**: T014–T022 (all frontend components + workspace integration)

**P2 (validation)**: T023–T025 (migration + type check + browser load)

**P3 (full validation)**: T026–T030 (end-to-end feature testing)
