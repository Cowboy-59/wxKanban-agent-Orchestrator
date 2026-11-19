# Spec 013: Audit Management — Compliance Document System & Automated Code Auditin
**Spec Number**: 013  
**Status**: `clarified`
**Created**: 2026-02-22  
**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle), Spec 012 (Kanban View)  
**Source**: `specs/Project-Scope/013-scopeAudit.md`

---

## Overview

The Audit Management system provides a comprehensive compliance infrastructure that stores regulatory documents, extracts analyzable compliance tasks, and performs automated code audits during the SDLC. It ensures wxKanban maintains continuous compliance with SOC2, HIPAA, HITRUST, and GDPR by embedding compliance checks directly into the development workflow.

### Core Design

| Element | Value |
|---------|-------|
| **Document Storage** | `wxKanbanDocuments` table stores all compliance documents |
| **Compliance Frameworks** | SOC2, HIPAA, HITRUST CSF, GDPR |
| **Task Extraction** | Parse compliance rules into actionable audit tasks |
| **Automated Auditing** | Run compliance checks against code post-implementation |
| **Report Storage** | Generated audit reports stored as app documents |
| **Integration** | Hooks into wxAI pipeline and development lifecycle |

---

## The 4 Compliance Frameworks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    wxKanban Compliance Framework Matrix                      │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│    SOC2      │    HIPAA     │   HITRUST    │    GDPR      │  wxKanban       │
│   (TSC)      │  (45 CFR)    │    (CSF)     │  (EU 2016)   │  Documents      │
├──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤
│ • Security   │ • Privacy    │ • 17 Control │ • Lawfulness │ • Master        │
│ • Availability│   Rule      │   Categories │ • Data Min   │   Document      │
│ • Processing │ • Security   │ • 5 Maturity │ • Security   │   Store         │
│   Integrity │   Rule       │   Levels     │ • Rights     │                 │
│ • Confidentiality│ • Breach │ • 40+ Auth  │ • Breach     │ • Audit Tasks   │
│ • Privacy    │   Notif     │   Sources    │   Notif      │   Registry      │
├──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┤
│                         Automated Audit Engine                               │
│  • Code Analysis → Compliance Rule Matching → Pass/Fail → Report Generation    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Scenarios & Testing

### US1 — Document Ingestion: Store Compliance Documents

**Actor**: System administrator or compliance officer uploading regulatory documents.

**Scenario**:
1. Admin uploads SOC2_SDLC_Compliance_Rules.md to `wxKanbanDocuments`
2. System parses document and extracts:
   - Document metadata (type, version, effective date)
   - Compliance categories (Security, Access Control, Audit, etc.)
   - Analyzable rules and requirements
   - Checklist items that can be automated
3. Document stored with full text search indexing
4. Extracted tasks populate `compliance_audit_tasks` table
5. Report shows: "SOC2 document ingested, 47 audit tasks extracted"

**Expected outcome**: `wxk_document_list({ type: "compliance" })` returns 4 documents. `wxk_audit_task_list({ framework: "SOC2" })` returns 47+ tasks.

---

### US2 — Pre-Implementation: View Relevant Audit Tasks

**Actor**: Developer starting work on a new feature (e.g., authentication system).

**Scenario**:
1. Developer opens feature specification
2. System analyzes spec content and suggests relevant audit tasks:
   - "SOC2 CC6.1 - Implement MFA for privileged access"
   - "HIPAA §164.312(d) - Person/entity authentication"
   - "GDPR Article 32 - Security of processing"
3. Developer sees task list with:
   - Priority (critical/high/medium/low)
   - Framework source
   - Specific requirement text
   - Implementation guidance
4. Developer marks tasks as "acknowledged" for this feature

**Expected outcome**: Contextual compliance tasks presented before coding begins.

---

### US3 — Post-Implementation: Automated Code Audit

**Actor**: wxAI pipeline or developer triggering compliance check after code completion.

**Scenario**:
1. Code implementation completed for authentication feature
2. `/audit-check --spec 013 --feature auth` command executed
3. System runs automated analyzers:
   - **Static Analysis**: Check for MFA implementation, password policies, session management
   - **Pattern Matching**: Verify audit logging calls, encryption usage, access controls
   - **Configuration Review**: Validate security headers, CORS settings, environment variables
4. Each audit task evaluated: PASS, FAIL, or NEEDS_REVIEW
5. Results stored in `audit_results` table
6. Report generated and stored in `wxKanbanDocuments`

**Expected outcome**: Automated audit report showing 42/47 tasks passed, 3 failed, 2 need review.

---

### US4 — Audit Report Review: Examine Failures

**Actor**: Security reviewer or compliance officer reviewing failed audit items.

**Scenario**:
1. Reviewer opens audit report from `wxKanbanDocuments`
2. Report shows:
   - Overall compliance score (e.g., 89%)
   - Failed items with code references
   - Suggested remediation steps
   - Framework-specific impact (e.g., "HIPAA violation - high risk")
3. Reviewer clicks failed item to see:
   - Specific code location
   - Compliance requirement text
   - Recommended fix with code example
4. Reviewer creates ticket for remediation or accepts risk with justification

**Expected outcome**: Clear audit trail with actionable remediation guidance.

---

### US5 — Continuous Compliance: Scheduled Audits

**Actor**: Automated system running periodic compliance checks.

**Scenario**:
1. Weekly scheduled job triggers full codebase audit
2. System compares current code against all 4 frameworks
3. New violations detected since last audit are flagged
4. Trend report generated showing:
   - Compliance score over time
   - New issues introduced
   - Issues resolved
   - Framework-specific breakdown
5. Alerts sent to compliance team for new critical violations

**Expected outcome**: Continuous monitoring with trend analysis and alerting.

---

## Functional Requirements

### FR-001 — App-Level Audit Configuration

The system MUST allow app creators to enable/disable specific compliance frameworks.

**Configuration Schema**:
```sql
CREATE TABLE app_audit_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appid UUID REFERENCES apps(id) ON DELETE CASCADE,
  -- Framework enablement flags
  soc2_enabled BOOLEAN DEFAULT false,
  hipaa_enabled BOOLEAN DEFAULT false,
  hitrust_enabled BOOLEAN DEFAULT false,
  gdpr_enabled BOOLEAN DEFAULT false,
  -- Global audit settings
  auto_audit_on_deploy BOOLEAN DEFAULT true,
  auto_audit_schedule VARCHAR(20) DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly', 'never'
  audit_severity_threshold VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  fail_on_critical BOOLEAN DEFAULT true,
  -- Retention settings
  audit_report_retention_days INTEGER DEFAULT 365,
  -- Timestamps
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Unique constraint: one config per app
  UNIQUE(appid)
);
```

**Framework Selection UI**:
- [ ] Toggle switches for each of the 4 frameworks (SOC2, HIPAA, HITRUST, GDPR)
- [ ] "Enable All" and "Disable All" quick actions
- [ ] Framework description cards with compliance requirements summary
- [ ] Warning when disabling framework with existing audit reports
- [ ] Default state: all frameworks disabled (opt-in)

**Behavior**:
- [ ] Only enabled frameworks' documents are parsed for audit tasks
- [ ] Only enabled frameworks' rules are checked during automated audits
- [ ] Audit reports only include enabled frameworks
- [ ] Pre-implementation task recommendations filtered by enabled frameworks
- [ ] Changing framework selection does not delete historical audit reports

---

### FR-002 — wxKanbanDocuments Master Table

The system MUST maintain a master document store for all compliance and audit materials.


**Document Schema**:
```sql
CREATE TABLE wxkanbandocuments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documenttype VARCHAR(50) NOT NULL, -- 'compliance_framework', 'audit_report', 'policy', 'procedure'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  filename VARCHAR(255),
  filecontent TEXT, -- Full text of document
  filehash VARCHAR(64), -- SHA-256 for integrity
  framework VARCHAR(50), -- 'SOC2', 'HIPAA', 'HITRUST', 'GDPR', null for general
  version VARCHAR(20),
  effectivedate DATE,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'superseded', 'draft'
  extractedtasks INTEGER DEFAULT 0,
  createdby UUID REFERENCES users(id),
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulltextsearch TSVECTOR -- For search indexing
);
```

**Required Documents**:
- [ ] SOC2_SDLC_Compliance_Rules.md → `documenttype: 'compliance_framework'`, `framework: 'SOC2'`
- [ ] HIPAA_SDLC_Compliance_Rules.md → `documenttype: 'compliance_framework'`, `framework: 'HIPAA'`
- [ ] HITRUST_SDLC_Compliance_Rules.md → `documenttype: 'compliance_framework'`, `framework: 'HITRUST'`
- [ ] GDPR_SDLC_Compliance_Rules.md → `documenttype: 'compliance_framework'`, `framework: 'GDPR'`

### FR-002 — Compliance Audit Tasks Registry

The system MUST extract and store analyzable compliance tasks from each framework.

**Task Schema**:
```sql
CREATE TABLE compliance_audit_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documentid UUID REFERENCES wxkanbandocuments(id),
  framework VARCHAR(50) NOT NULL, -- 'SOC2', 'HIPAA', 'HITRUST', 'GDPR'
  category VARCHAR(100) NOT NULL, -- e.g., 'Access Control', 'Encryption', 'Audit Logging'
  controlreference VARCHAR(50), -- e.g., 'CC6.1', '§164.312(a)', '02.a.1', 'Article 32'
  priority VARCHAR(20) NOT NULL, -- 'critical', 'high', 'medium', 'low'
  tasktype VARCHAR(50) NOT NULL, -- 'code_pattern', 'configuration', 'process', 'documentation'
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  requirementtext TEXT, -- Original text from compliance document
  checkmethod VARCHAR(50), -- 'static_analysis', 'regex_pattern', 'ast_query', 'manual_review'
  checkpattern TEXT, -- Regex, AST query, or check logic
  suggestedfix TEXT, -- Template for remediation
  applicablephases VARCHAR(100)[], -- {'design', 'development', 'testing', 'deployment'}
  applicablefiletypes VARCHAR(50)[], -- {'.ts', '.tsx', '.sql', '.json', '.md'}
  isautomated BOOLEAN DEFAULT true,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Task Extraction Requirements**:
- [ ] Parse markdown documents for checklist items
- [ ] Identify code-relevant requirements (filter out pure process requirements)
- [ ] Map requirements to implementation phases
- [ ] Assign priority based on risk level (critical = Tier 4 penalties, high = security controls)
- [ ] Generate check patterns for automated validation
- [ ] **Respect app configuration**: Only extract tasks for frameworks enabled in `app_audit_configuration`


### FR-003 — Automated Audit Engine

The system MUST provide automated code analysis against compliance tasks.

**Audit Execution Schema**:
```sql
CREATE TABLE audit_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executiontype VARCHAR(50) NOT NULL, -- 'manual', 'scheduled', 'pipeline_triggered'
  triggeredby UUID REFERENCES users(id),
  specid UUID REFERENCES specifications(id), -- Optional: specific spec being audited
  featurescope VARCHAR(255), -- e.g., 'authentication', 'billing', 'reporting'
  starttime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  endtime TIMESTAMP,
  status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed'
  totaltasks INTEGER DEFAULT 0,
  passedtasks INTEGER DEFAULT 0,
  failedtasks INTEGER DEFAULT 0,
  reviewtasks INTEGER DEFAULT 0,
  overallscore DECIMAL(5,2), -- Percentage
  reportdocumentid UUID REFERENCES wxkanbandocuments(id),
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Audit Results Schema**:
```sql
CREATE TABLE audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executionid UUID REFERENCES audit_executions(id),
  taskid UUID REFERENCES compliance_audit_tasks(id),
  filepath VARCHAR(500),
  linenumber INTEGER,
  code snippet TEXT,
  resultstatus VARCHAR(20) NOT NULL, -- 'pass', 'fail', 'needs_review', 'not_applicable'
  resultdetails TEXT, -- Explanation of finding
  suggestedfix TEXT, -- Generated or template fix
  severity VARCHAR(20), -- 'critical', 'high', 'medium', 'low'
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Analysis Methods**:
- [ ] **Static Analysis (SAST)**: Parse TypeScript/JavaScript AST for security patterns
- [ ] **Pattern Matching**: Regex-based checks for common issues (hardcoded secrets, SQL injection)
- [ ] **Configuration Analysis**: Validate security headers, CORS, environment configs
- [ ] **Dependency Scanning**: Check for known vulnerabilities in npm packages
- [ ] **Database Query Analysis**: Validate SQL queries for injection risks

**Framework Filtering**:
- [ ] Audit execution MUST check `app_audit_configuration` for enabled frameworks
- [ ] Only tasks from enabled frameworks are included in audit
- [ ] If no frameworks enabled, audit returns warning: "No compliance frameworks enabled for this app"
- [ ] Execution metadata records which frameworks were active during audit


### FR-004 — Audit Report Generation

The system MUST generate and store compliance audit reports.

**Report Document Schema**:
```sql
-- Stored in wxkanbandocuments with documenttype: 'audit_report'
-- Extended metadata in:
CREATE TABLE audit_report_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documentid UUID REFERENCES wxkanbandocuments(id),
  executionid UUID REFERENCES audit_executions(id),
  frameworks VARCHAR(50)[], -- {'SOC2', 'HIPAA', 'HITRUST', 'GDPR'}
  featurescope VARCHAR(255),
  executiondate TIMESTAMP,
  overallcompliance DECIMAL(5,2),
  criticalfindings INTEGER DEFAULT 0,
  highfindings INTEGER DEFAULT 0,
  mediumfindings INTEGER DEFAULT 0,
  lowfindings INTEGER DEFAULT 0,
  remediationstatus VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
  reviewedby UUID REFERENCES users(id),
  reviewdate TIMESTAMP,
  approved BOOLEAN DEFAULT false,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Report Content Requirements**:
- [ ] Executive summary with compliance score
- [ ] Framework-specific breakdown (tabs for each framework)
- [ ] Detailed findings with code references
- [ ] Remediation guidance with code examples
- [ ] Trend analysis (if previous reports exist)
- [ ] Digital signature/integrity hash for audit trail

### FR-005 — wxAI Pipeline Integration

The system MUST integrate with the wxAI development pipeline.

**Integration Points**:
- [ ] **Pre-implementation**: `/audit-tasks --feature <name>` returns relevant compliance tasks
- [ ] **Post-implementation**: `/audit-check --spec <id>` triggers automated audit
- [ ] **Report retrieval**: `/audit-report --execution <id>` returns stored report
- [ ] **Trend view**: `/audit-trends --days 30` shows compliance over time

**Pipeline Hooks**:
- [ ] After `wxAI-tasks` generation: Suggest compliance tasks for new spec
- [ ] After code implementation: Trigger automatic audit
- [ ] Before phase transition: Require audit report approval for critical phases

### FR-006 — Manual Review Workflow

The system MUST support human review for non-automated compliance items.

**Review Workflow**:
- [ ] Flag tasks with `checkmethod: 'manual_review'` for human evaluation
- [ ] Assign review tasks to compliance officers or security team
- [ ] Track review status (pending, in_review, approved, rejected)
- [ ] Require justification for accepted risks
- [ ] Escalate critical violations to management

---

## Schema Changes

### New Tables

| Table | Purpose |
|-------|---------|
| `wxkanbandocuments` | Master document store for compliance docs and audit reports |
| `compliance_audit_tasks` | Extracted analyzable tasks from frameworks |
| `audit_executions` | Audit run tracking |
| `audit_results` | Individual task results |
| `audit_report_metadata` | Extended metadata for audit reports |
| `data_subject_requests` | GDPR data subject request tracking (if applicable) |

### Indexes

```sql
-- Full-text search on documents
CREATE INDEX idx_wxkanbandocuments_fts ON wxkanbandocuments USING GIN(fulltextsearch);

-- Framework lookups
CREATE INDEX idx_compliance_tasks_framework ON compliance_audit_tasks(framework);
CREATE INDEX idx_compliance_tasks_category ON compliance_audit_tasks(category);
CREATE INDEX idx_compliance_tasks_priority ON compliance_audit_tasks(priority);

-- Audit execution queries
CREATE INDEX idx_audit_results_execution ON audit_results(executionid);
CREATE INDEX idx_audit_results_status ON audit_results(resultstatus);
CREATE INDEX idx_audit_results_severity ON audit_results(severity);
```

---

## API Routes

### App Configuration

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/audit/config` | Get app audit configuration |
| POST | `/api/audit/config` | Create or update audit configuration |
| PATCH | `/api/audit/config` | Toggle specific frameworks on/off |
| GET | `/api/audit/config/frameworks` | Get available frameworks with descriptions |

### Document Management

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/audit/documents` | Upload compliance document |
| GET | `/api/audit/documents` | List documents (filter by type, framework, only enabled if app-level filter) |
| GET | `/api/audit/documents/:id` | Get document with extracted tasks |
| POST | `/api/audit/documents/:id/extract` | Re-extract tasks from document (filtered by enabled frameworks) |
| DELETE | `/api/audit/documents/:id` | Remove document (admin only) |


### Audit Tasks

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/audit/tasks` | List compliance tasks (filter by framework, category, priority) |
| GET | `/api/audit/tasks/relevant` | Get tasks relevant to current feature/spec |
| GET | `/api/audit/tasks/:id` | Get task details with check pattern |
| POST | `/api/audit/tasks/:id/acknowledge` | Mark task as acknowledged for feature |

### Audit Execution

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/audit/execute` | Trigger new audit execution |
| GET | `/api/audit/executions` | List audit executions |
| GET | `/api/audit/executions/:id` | Get execution status and results |
| GET | `/api/audit/executions/:id/results` | Get detailed results |
| POST | `/api/audit/executions/:id/cancel` | Cancel running audit |

### Reports

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/audit/reports` | List generated audit reports |
| GET | `/api/audit/reports/:id` | Get report document |
| GET | `/api/audit/reports/:id/download` | Download report (PDF/JSON) |
| POST | `/api/audit/reports/:id/approve` | Approve audit report |
| GET | `/api/audit/trends` | Get compliance trend data |

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `AuditFrameworkSelector` | `components/Audit/AuditFrameworkSelector.tsx` | Toggle SOC2/HIPAA/HITRUST/GDPR on/off at app level |
| `AuditConfigPanel` | `components/Audit/AuditConfigPanel.tsx` | Full audit configuration UI (frameworks + settings) |
| `ComplianceDocumentManager` | `components/Audit/ComplianceDocumentManager.tsx` | Upload, view, manage compliance documents |
| `AuditTaskBrowser` | `components/Audit/AuditTaskBrowser.tsx` | Browse and filter compliance tasks (filtered by enabled frameworks) |
| `AuditTaskRecommender` | `components/Audit/AuditTaskRecommender.tsx` | Suggest relevant tasks for current work (filtered by enabled frameworks) |
| `AuditExecutionPanel` | `components/Audit/AuditExecutionPanel.tsx` | Trigger and monitor audit runs (shows enabled frameworks) |
| `AuditResultsViewer` | `components/Audit/AuditResultsViewer.tsx` | View audit results with code references |
| `AuditReportDashboard` | `components/Audit/AuditReportDashboard.tsx` | List and manage audit reports |
| `ComplianceTrendChart` | `components/Audit/ComplianceTrendChart.tsx` | Visualize compliance over time (per framework) |
| `AuditFindingDetail` | `components/Audit/AuditFindingDetail.tsx` | Detailed view of audit finding with fix |


### Modified Components

| Component | Change |
|-----------|--------|
| `ProjectWorkspacePage.tsx` | Add "Compliance" tab to project workspace |
| `SpecDetailView.tsx` | Show relevant compliance tasks for spec |
| `ScopeKanbanCard.tsx` | Display compliance score badge |

---

## wxAI Commands

### `/audit-config`

**Purpose**: Configure which compliance frameworks are enabled for the app.

**Usage**:
```
/audit-config --show
/audit-config --enable SOC2
/audit-config --disable HIPAA
/audit-config --enable-all
/audit-config --disable-all
/audit-config --set-schedule weekly
/audit-config --set-threshold medium
```

### `/audit-documents`

**Purpose**: Manage compliance documents in wxKanbanDocuments.

**Usage**:
```
/audit-documents --list
/audit-documents --upload <path> --type compliance_framework --framework SOC2
/audit-documents --extract-tasks <document_id>
/audit-documents --view <document_id>
```


### `/audit-tasks`

**Purpose**: Browse and query compliance audit tasks.

**Usage**:
```
/audit-tasks --list --framework HIPAA --priority critical
/audit-tasks --relevant --feature authentication
/audit-tasks --view <task_id>
/audit-tasks --acknowledge <task_id> --spec <spec_number>
```

### `/audit-check`

**Purpose**: Execute automated compliance audit against codebase.

**Usage**:
```
/audit-check --spec 013 --feature authentication
/audit-check --full --frameworks SOC2,HIPAA
/audit-check --execution <execution_id> --status
```

### `/audit-report`

**Purpose**: View and manage audit reports.

**Usage**:
```
/audit-report --list --days 30
/audit-report --view <report_id>
/audit-report --download <report_id> --format pdf
/audit-report --approve <report_id>
```

---

## Success Criteria

1. All 4 compliance documents stored in `wxKanbanDocuments` with full-text indexing
2. 200+ audit tasks extracted across all frameworks (50+ per framework)
3. **App creators can enable/disable individual frameworks via UI**
4. **Only enabled frameworks' tasks appear in recommendations and audits**
5. Automated audit execution completes in <5 minutes for typical spec
6. Audit reports generated and stored with integrity verification
7. Pre-implementation task recommendations relevant to feature context (filtered by enabled frameworks)
8. Post-implementation audits catch 90%+ of common compliance violations
9. Compliance trend tracking shows improvement over time (per framework)
10. Integration with wxAI pipeline for seamless workflow


---

## Key Entities

| Entity | Description |
|--------|-------------|
| `app_audit_configuration` | Per-app settings for enabled frameworks and audit behavior |
| `wxKanbanDocuments` | Master document store for compliance and audit materials |
| `compliance_audit_tasks` | Extracted analyzable compliance requirements |
| `audit_executions` | Audit run instances with status and results |
| `audit_results` | Individual task pass/fail/needs_review results |
| `audit_report_metadata` | Extended metadata for generated reports |
| Audit Engine | Automated code analysis system (respects enabled frameworks) |
| Compliance Framework | SOC2, HIPAA, HITRUST, GDPR rule sets (toggleable) |


---

## Constraints

- MUST NOT modify original compliance documents (immutable storage)
- MUST maintain document integrity with SHA-256 hashes
- MUST support full-text search across all documents
- MUST provide clear remediation guidance for failures
- MUST integrate with existing wxAI pipeline without disruption
- Audit reports MUST be tamper-evident (signed/verified)
- Manual review items MUST be tracked and escalated appropriately
- **Framework enablement MUST be app-level configuration (not global)**
- **Disabling a framework MUST NOT delete historical audit data**
- **At least one framework MUST be enabled for audit features to be active**


---

## Notes

- The Audit Management system is foundational for wxKanban's compliance posture
- Automated checks reduce manual audit burden while maintaining rigor
- Integration with the Kanban view (Spec 012) allows compliance visibility at scope level
- Document storage approach enables future frameworks to be added easily
- Audit reports serve as evidence for external compliance audits
- The system supports both automated and manual compliance verification
