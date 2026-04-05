---
description: Retrieve and display compliance audit reports with detailed findings
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```text
{{args}}
```

## Audit Report — Compliance Report Retrieval & Analysis

This command retrieves audit reports from the Audit Management system. It can list all reports, show a specific report, or download findings for further analysis.

**API Endpoints**:
- `GET /api/audit/reports` — List all reports
- `GET /api/audit/reports/:id` — Get specific report details
- `GET /api/audit/reports/:id/download` — Download report as JSON
- `GET /api/audit/trends?days=N` — Get compliance trends

---

## Pre-Flight Validation

### 1. Parse Arguments

Supported flags and arguments:

| Flag | Description | Example |
|------|-------------|---------|
| `--list` | List all reports (default if no args) | `--list` |
| `--report <id>` | Show specific report by ID | `--report uuid` |
| `--execution <id>` | Find report by execution ID | `--execution uuid` |
| `--download <id>` | Download report as JSON | `--download uuid` |
| `--trends [days]` | Show compliance trends (default: 30 days) | `--trends` or `--trends 90` |
| `--framework <name>` | Filter by framework | `--framework SOC2` |
| `--status <status>` | Filter by status | `--status approved` |

If `{{args}}` is empty, default to `--list`.

### 2. Validate Environment

Required environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `WXKANBAN_API_URL` | Yes | Base URL (e.g., `http://localhost:3000`) |
| `WXKANBAN_API_TOKEN` | Yes | JWT token for authentication |

---

## Mode 1: List All Reports (Default)

### API Request

```http
GET /api/audit/reports
Headers:
  Authorization: Bearer <token>
```

### Query Parameters (Optional Filters)

- `?framework=SOC2` — Filter by framework
- `?status=approved` — Filter by approval status
- `?days=30` — Reports from last N days

### Response Display

```
===================================================
AUDIT REPORTS
===================================================

Total Reports: 12 | Showing: 12

| Date       | Frameworks | Score | Findings | Status     | Report ID            |
|------------|------------|-------|----------|------------|----------------------|
| 2026-02-22 | SOC2,HIPAA | 89%   | C:2 H:3  | 🟡 Open    | 019c8f6e-b3b3-727c... |
| 2026-02-21 | SOC2       | 94%   | C:0 H:1  | ✅ Approved| 019c8f5d-a2a2-616b... |
| 2026-02-20 | HIPAA      | 87%   | C:1 H:4  | 🟡 Open    | 019c8f4c-9191-505a... |
| 2026-02-18 | SOC2,HIPAA | 91%   | C:0 H:2  | ✅ Approved| 019c8f2a-7f7f-3e38... |
| ...        | ...        | ...   | ...      | ...        | ...                  |

Legend:
  C: Critical findings | H: High findings | M: Medium | L: Low
  🟡 Open = Awaiting review | ✅ Approved = Reviewed and accepted

Commands:
  View report:    /audit-report --report <id>
  Download:       /audit-report --download <id>
  View trends:    /audit-report --trends
===================================================
```

### Empty State

```
===================================================
AUDIT REPORTS
===================================================

No audit reports found.

To generate a report:
  1. Run an audit: /audit-run --spec <NNN> --feature "<name>"
  2. Wait for completion
  3. Report will be auto-generated

Or check execution status:
  GET /api/audit/executions
===================================================
```

---

## Mode 2: View Specific Report

### API Request

```http
GET /api/audit/reports/{reportId}
```

### Display Format

```
===================================================
AUDIT REPORT DETAIL
===================================================
Report ID:        019c8f6e-b3b3-727c-b09b-ed39f5b9a691
Execution ID:     019c8f6e-b1c6-7126-bcd2-495106a53f9f
Generated:        2026-02-22T14:30:00Z
Reviewed:         2026-02-22T16:45:00Z (by Admin User)
Status:           ✅ APPROVED

AUDIT SCOPE
Feature:          User Authentication with MFA
Spec:             013 — Audit Management
Frameworks:       SOC2, HIPAA
Execution Date:   2026-02-22T14:25:00Z
Duration:         4m 32s

COMPLIANCE SCORE: 89%

FINDINGS SUMMARY
┌──────────┬───────┬───────┬─────────────┐
│ Severity │ Pass  │ Fail  │ Needs Review│
├──────────┼───────┼───────┼─────────────┤
│ 🔴 Critical│  8    │  2    │     0       │
│ 🟠 High    │  23   │  3    │     1       │
│ 🟡 Medium  │  31   │  4    │     2       │
│ ⚪ Low     │  15   │  0    │     0       │
├──────────┼───────┼───────┼─────────────┤
│ TOTAL    │  77   │  9    │     3       │
└──────────┴───────┴───────┴─────────────┘

FRAMEWORK BREAKDOWN
  SOC2:  92% (45 pass / 4 fail / 1 review)
  HIPAA: 85% (32 pass / 5 fail / 2 review)

CRITICAL FINDINGS (2)
─────────────────────────────────────────────────
❌ CC6.1 — Implement MFA for privileged access
   Status: FAILED
   File: src/server/routes/admin.ts:45
   Code:
     43 | router.post('/admin/users', requireAuth, createUser);
     44 | router.put('/admin/users/:id', requireAuth, updateUser);
     45 | router.delete('/admin/users/:id', requireAuth, deleteUser);
   
   Issue: MFA middleware not detected in admin route handlers
   
   Requirement:
     All administrative access requires multi-factor authentication
     using TOTP or hardware security keys.
   
   Suggested Fix:
     Add requireMFA middleware to all admin routes:
     
     router.post('/admin/users', requireAuth, requireMFA, createUser);
   
   Remediation:
     [ ] Create ticket to add MFA middleware
     [ ] Update admin route tests
     [ ] Document MFA requirement in API docs

─────────────────────────────────────────────────
❌ §164.312(d) — Person/entity authentication
   Status: FAILED
   File: src/server/services/auth.ts:123
   [Additional details...]

HIGH FINDINGS (3)
─────────────────────────────────────────────────
❌ CC6.2 — Logical access security measures
   Status: FAILED
   [Details...]

NEEDS REVIEW (3)
─────────────────────────────────────────────────
⚠️ CC7.2 — System monitoring procedures
   Status: NEEDS_REVIEW
   Reason: Cannot automatically verify log coverage
   Manual Check: Review monitoring dashboard configuration

APPROVAL STATUS
─────────────────────────────────────────────────
Approved By:    Admin User (admin@example.com)
Approved At:    2026-02-22T16:45:00Z
Notes:          "Critical findings addressed in PR #234. 
                MFA implementation scheduled for next sprint."

Download JSON:  /audit-report --download 019c8f6e-b3b3-727c-b09b-ed39f5b9a691
===================================================
```

---

## Mode 3: Download Report

### API Request

```http
GET /api/audit/reports/{reportId}/download
```

### Response Handling

Returns JSON file with full report data:

```json
{
  "reportId": "uuid",
  "executionId": "uuid",
  "generatedAt": "2026-02-22T14:30:00Z",
  "featureScope": "User Authentication with MFA",
  "frameworks": ["SOC2", "HIPAA"],
  "overallScore": 89.0,
  "findings": {
    "critical": { "pass": 8, "fail": 2, "review": 0 },
    "high": { "pass": 23, "fail": 3, "review": 1 },
    "medium": { "pass": 31, "fail": 4, "review": 2 },
    "low": { "pass": 15, "fail": 0, "review": 0 }
  },
  "results": [
    {
      "taskId": "uuid",
      "framework": "SOC2",
      "controlReference": "CC6.1",
      "title": "Implement MFA for privileged access",
      "status": "failed",
      "severity": "critical",
      "filePath": "src/server/routes/admin.ts",
      "lineNumber": 45,
      "codeSnippet": "router.post('/admin/users', requireAuth, createUser);",
      "resultDetails": "MFA middleware not detected",
      "suggestedFix": "Add requireMFA middleware to admin routes"
    }
  ],
  "metadata": {
    "approved": true,
    "reviewedBy": "Admin User",
    "reviewDate": "2026-02-22T16:45:00Z"
  }
}
```

### Display

```
===================================================
AUDIT REPORT DOWNLOAD
===================================================
Report ID:    019c8f6e-b3b3-727c-b09b-ed39f5b9a691
File:         audit-report-019c8f6e-b3b3-727c-b09b-ed39f5b9a691.json
Size:         24.5 KB
Records:      89 findings

Downloaded to: ./audit-report-019c8f6e-b3b3-727c-b09b-ed39f5b9a691.json

Use this file for:
  - Compliance documentation
  - External auditor review
  - Trend analysis
  - Remediation tracking
===================================================
```

---

## Mode 4: Compliance Trends

### API Request

```http
GET /api/audit/trends?days=30
```

### Display Format

```
===================================================
COMPLIANCE TRENDS (Last 30 Days)
===================================================

Overall Score Trend:
  2026-01-23:  82% ████████████████████░░░░░░░░░░░░
  2026-01-30:  85% █████████████████████░░░░░░░░░░░
  2026-02-06:  87% ██████████████████████░░░░░░░░░░
  2026-02-13:  88% ██████████████████████░░░░░░░░░░
  2026-02-20:  89% ███████████████████████░░░░░░░

Trend: ↗️ Improving (+7% over 30 days)

FRAMEWORK TRENDS:
  SOC2:  82% → 92% (+10%) ↗️
  HIPAA: 85% → 85% (0%)   ➡️
  HITRUST: N/A (not enabled)
  GDPR:  N/A (not enabled)

FINDINGS VOLUME:
  Critical:  5 → 2  (-60%) ↘️
  High:      12 → 4 (-67%) ↘️
  Medium:    28 → 6 (-79%) ↘️
  Low:       15 → 0 (-100%) ↘️

AUDIT ACTIVITY:
  Total Audits:     12
  Approved:         8
  Pending Review:   4
  Avg Duration:     4m 15s

MOST IMPROVED AREAS:
  1. Access Control (+15%)
  2. Data Encryption (+12%)
  3. Audit Logging (+10%)

AREAS NEEDING ATTENTION:
  1. System Monitoring (score: 72%)
  2. Incident Response (score: 78%)
===================================================
```

---

## Error Handling

| Error | Response |
|-------|----------|
| 401 Unauthorized | "Authentication failed. Check WXKANBAN_API_TOKEN." |
| 403 Forbidden | "Insufficient permissions. Requires ADMIN or COMPLIANCE_OFFICER role." |
| 404 Not Found | "Report not found. Verify the report ID." |
| 500 Error | "Report service error. Check server logs." |

### Report Not Found

```
ERROR: Report not found.

Report ID: <id>

Check available reports:
  /audit-report --list

Or find by execution:
  /audit-report --execution <executionId>
```

---

## Integration with wxAI Pipeline

### Post-Audit Review Workflow

```
# After audit completes
/audit-run --spec 013 --feature "auth" --wait

[Audit completes with score 89%]

# View detailed report
/audit-report --report <reportId>

[Review findings...]

# Approve if acceptable (ADMIN only)
[Manual approval via UI or API]

# Or download for external review
/audit-report --download <reportId>
```

### Compliance Tracking

```
# Weekly compliance check
/audit-report --trends 7

[Shows week-over-week improvement]

# Monthly board report
/audit-report --trends 30

[Shows monthly trends and metrics]
```

---

## Output Summary

```
===================================================
AUDIT-REPORT COMPLETE
===================================================
Mode:           <list|view|download|trends>
Reports Found:  <count>
Filters:        <framework|status|date>

Available Actions:
  View detail:  /audit-report --report <id>
  Download:     /audit-report --download <id>
  Trends:       /audit-report --trends [days]
  Run new audit: /audit-run --spec <NNN> --feature "<name>"

Next Steps:
  - Review any open reports
  - Address failed findings
  - Approve reports after remediation
  - Monitor trends for improvement
===================================================
