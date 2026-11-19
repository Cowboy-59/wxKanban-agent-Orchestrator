# Quickstart: Audit Management (Spec 013)

**Branch**: `013-audit-management`
**Date**: 2026-02-22

---

## Prerequisites

- wxKanban dev server running (`npm run dev`)
- PostgreSQL database with migration `013_audit_management.sql` applied
- Admin user account available
- Compliance framework documents available:
  - `SOC2_SDLC_Compliance_Rules.md`
  - `HIPAA_SDLC_Compliance_Rules.md`
  - `HITRUST_SDLC_Compliance_Rules.md`
  - `GDPR_SDLC_Compliance_Rules.md`

---

## Test Scenario 1: Enable Compliance Frameworks

**Goal**: Verify app creator can enable/disable frameworks.

1. Log in as ADMIN
2. Navigate to App Settings → Compliance tab
3. Verify all 4 framework cards are shown (SOC2, HIPAA, HITRUST, GDPR)
4. Verify all toggles are OFF by default
5. Toggle SOC2 ON → verify save succeeds
6. Toggle HIPAA ON → verify save succeeds
7. Refresh page → verify SOC2 and HIPAA remain ON
8. Toggle HIPAA OFF → verify warning dialog appears ("Historical reports preserved")
9. Confirm disable → verify HIPAA toggle is OFF

**Expected**: Framework configuration persists. Warning shown on disable.

---

## Test Scenario 2: Upload Compliance Document

**Goal**: Verify document ingestion and task extraction.

1. Navigate to Compliance → Documents tab
2. Click "Upload Document"
3. Select `SOC2_SDLC_Compliance_Rules.md`
4. Set: Type = "Compliance Framework", Framework = "SOC2"
5. Click Upload
6. Verify document appears in list with:
   - Title: "SOC2 SDLC Compliance Rules"
   - Framework: SOC2
   - Status: active
   - Extracted Tasks: 47+ (count shown)
7. Click document → verify full text is searchable
8. Navigate to Tasks tab → verify SOC2 tasks appear

**Expected**: Document stored with SHA-256 hash. Tasks extracted and queryable.

---

## Test Scenario 3: Browse Compliance Tasks

**Goal**: Verify task filtering by enabled frameworks.

1. Navigate to Compliance → Tasks tab
2. Verify only SOC2 tasks shown (HIPAA disabled in Scenario 1 step 8)
3. Enable HIPAA in settings
4. Return to Tasks tab → verify both SOC2 and HIPAA tasks shown
5. Filter by Priority = "critical" → verify only critical tasks shown
6. Filter by Category = "Access Control" → verify filtered results
7. Search for "MFA" → verify relevant tasks appear

**Expected**: Tasks filtered by enabled frameworks. Filter controls work correctly.

---

## Test Scenario 4: Run Automated Audit

**Goal**: Verify automated audit execution.

1. Navigate to Compliance → Audit tab
2. Click "Run Audit"
3. Select scope: "Authentication Feature"
4. Verify enabled frameworks shown (SOC2, HIPAA)
5. Click "Start Audit"
6. Verify execution status shows "running"
7. Wait for completion (< 5 minutes)
8. Verify results show:
   - Overall compliance score (percentage)
   - Pass/Fail/Needs Review breakdown
   - Framework-specific sections (SOC2, HIPAA)
9. Click a failed item → verify code reference + suggested fix shown

**Expected**: Audit completes. Results stored. Report accessible.

---

## Test Scenario 5: View Audit Report

**Goal**: Verify audit report generation and storage.

1. Navigate to Compliance → Reports tab
2. Verify audit report from Scenario 4 appears in list
3. Click report → verify:
   - Executive summary with compliance score
   - SOC2 section with findings
   - HIPAA section with findings
   - Each finding has: code reference, requirement text, suggested fix
4. Click "Download" → verify JSON report downloads
5. Navigate to Documents tab → verify report also appears as `documenttype: 'audit_report'`
6. Verify report has integrity hash (SHA-256)

**Expected**: Report stored in wxkanbandocuments. Downloadable. Tamper-evident.

---

## Test Scenario 6: Disable Framework — No Data Loss

**Goal**: Verify historical data preserved when framework disabled.

1. Verify audit report from Scenario 4 exists (SOC2 + HIPAA)
2. Navigate to Settings → Compliance
3. Toggle SOC2 OFF
4. Confirm disable warning
5. Navigate to Reports tab → verify historical report still shows SOC2 findings
6. Run new audit → verify only HIPAA tasks checked
7. New report shows only HIPAA section

**Expected**: Historical reports unchanged. New audits exclude disabled framework.

---

## Test Scenario 7: Compliance Trend Chart

**Goal**: Verify trend visualization.

1. Run 3 audits over time (or use test data)
2. Navigate to Compliance → Dashboard
3. Verify trend chart shows compliance score over time
4. Verify per-framework breakdown visible
5. Verify new issues vs resolved issues tracked

**Expected**: Trend data visualized correctly.

---

## API Quick Tests

```bash
# Get audit configuration
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/audit/config

# Enable SOC2 framework
curl -X PATCH -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"soc2enabled": true}' \
  http://localhost:3000/api/audit/config

# List compliance tasks (SOC2 only)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/audit/tasks?framework=SOC2&priority=critical"

# Trigger audit execution
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"featurescope": "authentication", "executiontype": "manual"}' \
  http://localhost:3000/api/audit/execute

# Get audit reports
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/audit/reports

# Get compliance trends
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/audit/trends?days=30"
```

---

## TypeScript Check

```bash
npm run check-types
# Expected: 0 errors
```

---

## Database Verification

```sql
-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'app_audit_configuration',
  'wxkanbandocuments',
  'compliance_audit_tasks',
  'audit_executions',
  'audit_results',
  'audit_report_metadata'
);

-- Verify framework configuration
SELECT * FROM app_audit_configuration;

-- Verify documents ingested
SELECT id, title, framework, extractedtasks, status FROM wxkanbandocuments;

-- Verify tasks extracted
SELECT framework, COUNT(*) as task_count FROM compliance_audit_tasks GROUP BY framework;

-- Verify audit results
SELECT resultstatus, COUNT(*) FROM audit_results GROUP BY resultstatus;
