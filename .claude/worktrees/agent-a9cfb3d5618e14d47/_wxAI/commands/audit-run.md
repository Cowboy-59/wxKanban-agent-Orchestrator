---
description: Trigger and monitor post-implementation compliance audits
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

## Audit Run — Post-Implementation Compliance Check

This command triggers an automated compliance audit after code implementation. It creates an audit execution, monitors progress, and displays results.

**API Endpoints**:
- `POST /api/audit/execute` — Start audit
- `GET /api/audit/executions/:id` — Monitor progress
- `GET /api/audit/executions/:id/results` — Get detailed results

---

## Pre-Flight Validation

### 1. Parse Arguments

Supported flags and arguments:

| Flag | Description | Example |
|------|-------------|---------|
| `--spec NNN` | Spec number to audit | `--spec 013` |
| `--feature "name"` | Feature scope description | `--feature "authentication"` |
| `--wait` | Wait for completion (blocking) | `--wait` |
| `--timeout N` | Max wait time in seconds (default: 300) | `--timeout 600` |

If `{{args}}` is empty, halt with:

```
ERROR: No audit scope provided.

Usage: /audit-run --spec <NNN> --feature "<description>" [options]

Examples:
  /audit-run --spec 013 --feature "user authentication"
  /audit-run --spec 009 --feature "task lifecycle" --wait
  /audit-run --spec 012 --feature "kanban view" --wait --timeout 600

Required:
  --spec <NNN>        : Specification number
  --feature "<desc>"  : Feature scope description

Optional:
  --wait              : Block until audit completes
  --timeout <seconds> : Max wait time (default: 300)
```

### 2. Validate Environment

Required environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `WXKANBAN_API_URL` | Yes | Base URL (e.g., `http://localhost:3000`) |
| `WXKANBAN_API_TOKEN` | Yes | JWT token for authentication |

---

## Phase 1: Start Audit Execution

### API Request

```http
POST /api/audit/execute
Headers:
  Content-Type: application/json
  Authorization: Bearer <token>

Body:
{
  "specId": "<spec-uuid>",
  "featureScope": "<feature description>",
  "executionType": "manual"
}
```

### Response Handling

**Success (202 Accepted)**:

```json
{
  "executionId": "uuid",
  "status": "running",
  "startTime": "2026-02-22T10:30:00Z",
  "enabledFrameworks": ["SOC2", "HIPAA"],
  "totalTasks": 47
}
```

**Display**:

```
===================================================
AUDIT EXECUTION STARTED
===================================================
Execution ID:   <executionId>
Status:         RUNNING
Started:        <startTime>
Frameworks:     SOC2, HIPAA
Tasks Queued:   47

Monitoring progress...
===================================================
```

---

## Phase 2: Monitor Progress (if --wait)

### Polling Loop

If `--wait` flag is set, poll execution status every 5 seconds:

```http
GET /api/audit/executions/{executionId}
```

### Status Display

Show progress updates:

```
Audit Progress: 23/47 tasks completed (49%)
Status: RUNNING
Elapsed: 45s
```

### Completion States

| Status | Display |
|--------|---------|
| `completed` | ✅ Audit completed successfully |
| `failed` | ❌ Audit failed (see error details) |
| `cancelled` | ⚠️ Audit was cancelled |
| `running` | ⏳ Still processing... |

### Timeout Handling

If timeout reached before completion:

```
WARNING: Audit still running after <timeout>s

Execution ID: <id>
Current Status: <status>

To check results later:
  /audit-report --execution <id>

Or poll manually:
  GET /api/audit/executions/<id>
```

---

## Phase 3: Display Results

### Fetch Results

```http
GET /api/audit/executions/{executionId}/results
```

### Results Display Format

```
===================================================
AUDIT RESULTS
===================================================
Execution ID:   <executionId>
Feature Scope:  <featureScope>
Completed:      <endTime>
Duration:       <duration>

OVERALL SCORE:  <score>%

BREAKDOWN BY FRAMEWORK:
  SOC2:  85% (34 pass / 6 fail / 2 review)
  HIPAA: 92% (23 pass / 2 fail / 0 review)

BREAKDOWN BY SEVERITY:
  🔴 Critical:  2 pass / 1 fail / 0 review
  🟠 High:      15 pass / 3 fail / 1 review
  🟡 Medium:    28 pass / 4 fail / 1 review
  ⚪ Low:       12 pass / 0 fail / 0 review

SUMMARY:
  ✅ Passed:        77
  ❌ Failed:        8
  ⚠️  Needs Review:  3
  ─────────────────
  Total:           88
===================================================
```

### Failed Items Detail (Top 10)

```
FAILED ITEMS (showing first 10):

❌ SOC2 CC6.1 — Implement MFA for privileged access
   Severity: CRITICAL
   File: src/server/routes/admin.ts:45
   Code: router.post('/admin/users', requireAuth, createUser);
   Issue: MFA check not found in admin route handlers
   Suggested Fix: Add requireMFA middleware to all admin routes

❌ HIPAA §164.312(d) — Person/entity authentication
   Severity: HIGH
   File: src/server/services/auth.ts:123
   Code: if (password === storedHash) return user;
   Issue: Password comparison uses timing-vulnerable equality
   Suggested Fix: Use crypto.timingSafeEqual for comparison

[... 8 more items ...]
```

### Needs Review Items

```
ITEMS REQUIRING MANUAL REVIEW:

⚠️ SOC2 CC7.2 — System monitoring coverage
   Severity: MEDIUM
   Reason: Automated check cannot verify monitoring scope
   Guidance: Verify that all authentication events are logged

⚠️ HIPAA §164.308(a)(1)(ii)(D) — Information access management
   Severity: MEDIUM
   Reason: Manual review required for access policy
   Guidance: Review user access control documentation
```

---

## Non-Wait Mode (Async)

If `--wait` is NOT specified:

```
===================================================
AUDIT EXECUTION INITIATED (Async Mode)
===================================================
Execution ID:   <executionId>
Status:         RUNNING
Started:        <startTime>

The audit is running in the background.

To check status:
  /audit-report --execution <executionId>

To view all executions:
  /audit-report --list

Execution will continue even if you close this session.
===================================================
```

---

## Error Handling

| Error | Response |
|-------|----------|
| 400 Bad Request | "Invalid spec ID or feature scope. Check your parameters." |
| 401 Unauthorized | "Authentication failed. Check WXKANBAN_API_TOKEN." |
| 403 Forbidden | "Insufficient permissions. Requires ADMIN role to execute audits." |
| 404 Not Found | "Spec not found. Verify the spec number exists." |
| 409 Conflict | "Audit already running for this spec. Wait for completion or cancel existing." |
| 422 Validation | "No frameworks enabled. Enable at least one framework in audit config." |
| 500 Error | "Audit engine error. Check server logs for details." |

### No Frameworks Enabled

```
ERROR: Cannot run audit — no compliance frameworks enabled.

Enable frameworks first:
  1. Navigate to App Settings → Compliance
  2. Toggle on required frameworks (SOC2, HIPAA, etc.)
  3. Or use: /audit-config --enable SOC2,HIPAA
```

### No Tasks Available

```
WARNING: No compliance tasks found for enabled frameworks.

Upload compliance documents:
  1. Go to Compliance → Documents tab
  2. Upload framework documents (e.g., SOC2_SDLC_Compliance_Rules.md)
  3. Extract tasks from uploaded documents
```

---

## Integration with wxAI Pipeline

### Post-Implementation Hook

Designed to run after `/wxAI-implement`:

```
/wxAI-implement --spec 013 --tasks T001-T010

[Implementation completes...]

/audit-run --spec 013 --feature "authentication" --wait

[Audit runs and shows compliance results...]

[Fix any failed items...]

[Re-run audit if needed...]
```

### CI/CD Integration

Can be triggered automatically on deployment:

```
# In deployment pipeline
/audit-run --spec $SPEC_NUMBER --feature "$FEATURE_NAME" --wait --timeout 600

if [ $? -ne 0 ]; then
  echo "Compliance audit failed — blocking deployment"
  exit 1
fi
```

---

## Output Summary

```
===================================================
AUDIT-RUN COMPLETE
===================================================
Execution ID:     <executionId>
Spec:             <specNumber>
Feature:          <featureScope>
Status:           <finalStatus>
Score:            <score>%
Duration:         <duration>

Results:
  ✅ Passed:        <count>
  ❌ Failed:        <count>
  ⚠️  Needs Review:  <count>

Report Available: /audit-report --execution <executionId>

Next Steps:
  - Review failed items above
  - Fix critical and high severity issues
  - Run /audit-report for detailed findings
  - Re-run /audit-run after fixes to verify
===================================================
