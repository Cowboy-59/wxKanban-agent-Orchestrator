# Implementation Plan: Audit Management (Spec 013)

**Branch**: `013-audit-management` | **Date**: 2026-02-22 | **Spec**: `specs/013-AuditManagement/spec.md`
**Input**: `specs/Project-Scope/013-scopeAudit.md`, `specs/013-AuditManagement/spec.md`

---

## Summary

Add a comprehensive **Audit Management** system to wxKanban that:

1. Stores compliance framework documents (SOC2, HIPAA, HITRUST, GDPR) in a master `wxkanbandocuments` table
2. Extracts analyzable compliance tasks from each document
3. Allows app creators to enable/disable specific frameworks per app
4. Runs automated code audits against enabled frameworks post-implementation
5. Stores tamper-evident audit reports as compliance evidence

Backend: 6 new tables, 5 new service files, 20+ new API routes.
Frontend: 10 new components + 1 modified page (Compliance tab in project workspace).
No changes to existing tables.

---

## Technical Context

**Type**: Backend feature + Frontend feature + Compliance infrastructure
**Language/Version**: TypeScript 5.3, React 18, Express 4, PostgreSQL
**Primary Dependencies**: `crypto` (built-in, SHA-256 hashing), `pg` (existing), `drizzle-orm` (existing)
**Storage**: PostgreSQL — 6 new tables; full-text search via `tsvector`/`GIN` index
**Testing**: Manual verification via browser + API
**Target Platform**: Web (desktop primary)
**Performance Goals**: Audit execution <5 minutes for typical spec; document search <500ms
**Constraints**: No modification of original compliance documents; SHA-256 integrity on all documents; framework enablement is per-app (not global)

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript only | ✅ Pass | All new files are `.tsx` / `.ts` |
| No `console.log` | ✅ Pass | Uses logger pattern from existing components |
| No `any` types | ✅ Pass | All types explicitly defined |
| Security: no secrets | ✅ Pass | Auth via existing `authenticateToken` middleware |
| Dark/light mode | ✅ Pass | All Tailwind classes include `dark:` variants |
| No toast messages | ✅ Pass | Error feedback via inline error state |
| Database naming conventions | ✅ Pass | All table/column names lowercase, no underscores in column names |

**Gate Result**: PASS

---

## Project Structure

### New Files

```
src/server/services/
├── AuditConfigService.ts        # App-level framework configuration CRUD
├── DocumentService.ts           # wxkanbandocuments CRUD + SHA-256 + FTS
├── AuditTaskService.ts          # compliance_audit_tasks extraction + query
├── AuditEngineService.ts        # Automated code analysis engine
└── AuditReportService.ts        # Report generation + storage

src/server/routes/
└── audit.ts                     # All /api/audit/* routes

src/client/components/Audit/
├── AuditFrameworkSelector.tsx   # Toggle SOC2/HIPAA/HITRUST/GDPR on/off
├── AuditConfigPanel.tsx         # Full audit configuration UI
├── ComplianceDocumentManager.tsx # Upload, view, manage compliance documents
├── AuditTaskBrowser.tsx         # Browse and filter compliance tasks
├── AuditTaskRecommender.tsx     # Suggest relevant tasks for current work
├── AuditExecutionPanel.tsx      # Trigger and monitor audit runs
├── AuditResultsViewer.tsx       # View audit results with code references
├── AuditReportDashboard.tsx     # List and manage audit reports
├── ComplianceTrendChart.tsx     # Visualize compliance over time
└── AuditFindingDetail.tsx       # Detailed view of audit finding with fix

database/migrations/
└── 013_audit_management.sql     # All 6 new tables + indexes

specs/013-AuditManagement/
├── spec.md                      # Feature specification
├── plan.md                      # This file
├── quickstart.md                # Test scenarios
├── tasks.md                     # Implementation task list
├── lifecycle.json               # Pipeline lifecycle tracking
└── checklists/
    └── requirements.md          # Quality checklist
```

### Modified Files

```
src/server/routes/index.ts                    # Register /api/audit routes
src/client/pages/ProjectWorkspacePage.tsx     # Add Compliance tab
```

---

## Database Schema

### Table 1: `app_audit_configuration`

```sql
CREATE TABLE app_audit_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appid UUID NOT NULL,
  soc2enabled BOOLEAN NOT NULL DEFAULT false,
  hipaaenabled BOOLEAN NOT NULL DEFAULT false,
  hitrustenabled BOOLEAN NOT NULL DEFAULT false,
  gdprenabled BOOLEAN NOT NULL DEFAULT false,
  autoauditondeploy BOOLEAN NOT NULL DEFAULT true,
  autoauditschedule VARCHAR(20) NOT NULL DEFAULT 'weekly',
  auditseveritythreshold VARCHAR(20) NOT NULL DEFAULT 'medium',
  failoncritical BOOLEAN NOT NULL DEFAULT true,
  auditreportretentiondays INTEGER NOT NULL DEFAULT 365,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(appid)
);
```

### Table 2: `wxkanbandocuments`

```sql
CREATE TABLE wxkanbandocuments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documenttype VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  filename VARCHAR(255),
  filecontent TEXT,
  filehash VARCHAR(64),
  framework VARCHAR(50),
  version VARCHAR(20),
  effectivedate DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  extractedtasks INTEGER NOT NULL DEFAULT 0,
  createdby UUID,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fulltextsearch TSVECTOR
);

CREATE INDEX idx_wxkanbandocuments_fts ON wxkanbandocuments USING GIN(fulltextsearch);
CREATE INDEX idx_wxkanbandocuments_framework ON wxkanbandocuments(framework);
CREATE INDEX idx_wxkanbandocuments_type ON wxkanbandocuments(documenttype);
```

### Table 3: `compliance_audit_tasks`

```sql
CREATE TABLE compliance_audit_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documentid UUID REFERENCES wxkanbandocuments(id),
  framework VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  controlreference VARCHAR(50),
  priority VARCHAR(20) NOT NULL,
  tasktype VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  requirementtext TEXT,
  checkmethod VARCHAR(50),
  checkpattern TEXT,
  suggestedfix TEXT,
  applicablephases TEXT[],
  applicablefiletypes TEXT[],
  isautomated BOOLEAN NOT NULL DEFAULT true,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compliance_tasks_framework ON compliance_audit_tasks(framework);
CREATE INDEX idx_compliance_tasks_category ON compliance_audit_tasks(category);
CREATE INDEX idx_compliance_tasks_priority ON compliance_audit_tasks(priority);
```

### Table 4: `audit_executions`

```sql
CREATE TABLE audit_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executiontype VARCHAR(50) NOT NULL,
  triggeredby UUID,
  specid UUID,
  featurescope VARCHAR(255),
  enabledframeworks TEXT[],
  starttime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endtime TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  totaltasks INTEGER NOT NULL DEFAULT 0,
  passedtasks INTEGER NOT NULL DEFAULT 0,
  failedtasks INTEGER NOT NULL DEFAULT 0,
  reviewtasks INTEGER NOT NULL DEFAULT 0,
  overallscore DECIMAL(5,2),
  reportdocumentid UUID REFERENCES wxkanbandocuments(id),
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_executions_status ON audit_executions(status);
CREATE INDEX idx_audit_executions_specid ON audit_executions(specid);
```

### Table 5: `audit_results`

```sql
CREATE TABLE audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executionid UUID NOT NULL REFERENCES audit_executions(id),
  taskid UUID NOT NULL REFERENCES compliance_audit_tasks(id),
  filepath VARCHAR(500),
  linenumber INTEGER,
  codesnippet TEXT,
  resultstatus VARCHAR(20) NOT NULL,
  resultdetails TEXT,
  suggestedfix TEXT,
  severity VARCHAR(20),
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_results_execution ON audit_results(executionid);
CREATE INDEX idx_audit_results_status ON audit_results(resultstatus);
CREATE INDEX idx_audit_results_severity ON audit_results(severity);
```

### Table 6: `audit_report_metadata`

```sql
CREATE TABLE audit_report_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documentid UUID NOT NULL REFERENCES wxkanbandocuments(id),
  executionid UUID NOT NULL REFERENCES audit_executions(id),
  frameworks TEXT[],
  featurescope VARCHAR(255),
  executiondate TIMESTAMP,
  overallcompliance DECIMAL(5,2),
  criticalfindings INTEGER NOT NULL DEFAULT 0,
  highfindings INTEGER NOT NULL DEFAULT 0,
  mediumfindings INTEGER NOT NULL DEFAULT 0,
  lowfindings INTEGER NOT NULL DEFAULT 0,
  remediationstatus VARCHAR(20) NOT NULL DEFAULT 'open',
  reviewedby UUID,
  reviewdate TIMESTAMP,
  approved BOOLEAN NOT NULL DEFAULT false,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Key Decisions

### Decision 1: Per-app framework enablement (not global)

**Chosen**: `app_audit_configuration` table with one row per app. Each app independently enables/disables frameworks.
**Rationale**: Different apps may have different compliance requirements (e.g., healthcare app needs HIPAA, EU app needs GDPR).
**Alternative**: Global system-wide configuration — rejected (too restrictive).

### Decision 2: All frameworks disabled by default (opt-in)

**Chosen**: `soc2enabled`, `hipaaenabled`, `hitrustenabled`, `gdprenabled` all default to `false`.
**Rationale**: Compliance frameworks add overhead. Apps should explicitly opt in to the frameworks they need.
**Alternative**: All enabled by default — rejected (unnecessary noise for apps that don't need compliance).

### Decision 3: Disable does NOT delete historical data

**Chosen**: Disabling a framework only affects future audits. Historical `audit_results` and `audit_report_metadata` rows are preserved.
**Rationale**: Compliance evidence must be retained. Deleting historical audit data would violate audit trail requirements.
**Alternative**: Delete historical data on disable — rejected (compliance violation).

### Decision 4: SHA-256 integrity for all documents

**Chosen**: `filehash` column stores SHA-256 hash of `filecontent`. Verified on read.
**Rationale**: Compliance documents must be tamper-evident. SOC2 and HIPAA require immutable audit logs.
**Alternative**: No integrity check — rejected (compliance requirement).

### Decision 5: Full-text search via PostgreSQL `tsvector`

**Chosen**: `fulltextsearch TSVECTOR` column with GIN index on `wxkanbandocuments`.
**Rationale**: Enables fast full-text search across compliance documents without external search service.
**Alternative**: External Elasticsearch — rejected (unnecessary complexity for this use case).

### Decision 6: Audit engine uses static analysis + pattern matching

**Chosen**: TypeScript AST parsing + regex pattern matching + configuration file analysis + npm audit for dependency scanning.
**Rationale**: Covers the most common compliance violations without requiring external SAST tools.
**Alternative**: External SAST tool integration — deferred to future enhancement.

### Decision 7: Compliance tab added to project workspace

**Chosen**: New "Compliance" tab in `ProjectWorkspacePage.tsx` alongside existing tabs.
**Rationale**: Compliance is a project-level concern. Fits naturally in the project workspace.
**Alternative**: Separate top-level route — rejected (compliance is project-scoped).

---

## API Routes

### Configuration
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/audit/config` | ADMIN | Get app audit configuration |
| POST | `/api/audit/config` | ADMIN | Create audit configuration |
| PATCH | `/api/audit/config` | ADMIN | Toggle framework enablement |
| GET | `/api/audit/config/frameworks` | Any | Get available frameworks with descriptions |

### Documents
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/audit/documents` | ADMIN | Upload compliance document |
| GET | `/api/audit/documents` | Any | List documents (filtered by enabled frameworks) |
| GET | `/api/audit/documents/:id` | Any | Get document with extracted tasks |
| POST | `/api/audit/documents/:id/extract` | ADMIN | Re-extract tasks from document |
| DELETE | `/api/audit/documents/:id` | ADMIN | Remove document |

### Tasks
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/audit/tasks` | Any | List compliance tasks (filter by framework, category, priority) |
| GET | `/api/audit/tasks/relevant` | Any | Get tasks relevant to current feature/spec |
| GET | `/api/audit/tasks/:id` | Any | Get task details with check pattern |
| POST | `/api/audit/tasks/:id/acknowledge` | Any | Mark task as acknowledged |

### Executions
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/audit/execute` | ADMIN | Trigger new audit execution |
| GET | `/api/audit/executions` | Any | List audit executions |
| GET | `/api/audit/executions/:id` | Any | Get execution status and results |
| GET | `/api/audit/executions/:id/results` | Any | Get detailed results |
| POST | `/api/audit/executions/:id/cancel` | ADMIN | Cancel running audit |

### Reports
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/audit/reports` | Any | List generated audit reports |
| GET | `/api/audit/reports/:id` | Any | Get report document |
| GET | `/api/audit/reports/:id/download` | Any | Download report (JSON) |
| POST | `/api/audit/reports/:id/approve` | ADMIN | Approve audit report |
| GET | `/api/audit/trends` | Any | Get compliance trend data |

---

## Progress Tracking

- [x] Phase 0: Scope document reviewed (`specs/Project-Scope/013-scopeAudit.md`)
- [x] Phase 1: Design complete (spec.md, plan.md)
- [ ] Phase 2: Tasks generated (tasks.md)
- [ ] Phase 3: Implementation complete
- [ ] Phase 4: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)
