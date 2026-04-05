close ---
description: Full compliance check pipeline — pre-implementation tasks + post-implementation audit
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

## Audit Check — Full Compliance Pipeline

This command runs the complete compliance workflow in one execution:
1. **Pre-Implementation**: Get relevant compliance tasks
2. **Post-Implementation**: Run automated audit
3. **Report**: Display results with actionable findings

**Combines**: `/audit-tasks` + `/audit-run` + `/audit-report`

---

## Pre-Flight Validation

### 1. Parse Arguments

Supported flags and arguments:

| Flag | Description | Example |
|------|-------------|---------|
| `--spec NNN` | **Required** — Spec number | `--spec 013` |
| `--feature "name"` | **Required** — Feature description | `--feature "authentication"` |
| `--keywords "k1 k2"` | Keywords for pre-implementation search | `--keywords "auth mfa"` |
| `--pre-only` | Only show pre-implementation tasks | `--pre-only` |
| `--post-only` | Only run post-implementation audit | `--post-only` |
| `--wait` | Wait for audit completion | `--wait` |
| `--timeout N` | Max wait time in seconds | `--timeout 600` |
| `--approve` | Auto-approve if score >= threshold | `--approve` |
| `--threshold N` | Approval threshold % (default: 90) | `--threshold 85` |

### 2. Required Arguments Validation

If `--spec` or `--feature` missing:

```
ERROR: Missing required arguments.

Usage: /audit-check --spec <NNN> --feature "<description>" [options]

Required:
  --spec <NNN>        : Specification number
  --feature "<desc>"  : Feature scope description

Optional:
  --keywords "<kws>"  : Space-separated keywords for pre-check
  --pre-only          : Only show pre-implementation tasks
  --post-only         : Only run post-implementation audit
  --wait              : Wait for audit completion
  --timeout <secs>    : Max wait time (default: 300)
  --approve           : Auto-approve if score >= threshold
  --threshold <%>     : Auto-approval threshold (default: 90)

Examples:
  /audit-check --spec 013 --feature "user authentication"
  /audit-check --spec 009 --feature "task lifecycle" --wait
  /audit-check --spec 012 --feature "kanban" --keywords "dnd drag drop" --wait
  /audit-check --spec 013 --feature "auth" --post-only --approve --threshold 85
```

### 3. Validate Environment

Required environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `WXKANBAN_API_URL` | Yes | Base URL (e.g., `http://localhost:3000`) |
| `WXKANBAN_API_TOKEN` | Yes | JWT token for authentication |

---

## Phase 1: Pre-Implementation Task Check

**Skipped if** `--post-only` flag is set.

### Extract Keywords

If `--keywords` provided, use those. Otherwise, extract from `--feature`:
1. Remove stop words
2. Split on spaces/punctuation
3. Take top 5 keywords

### API Call

```http
GET /api/audit/tasks/relevant?keywords=<keywords>
```

### Display

```
╔══════════════════════════════════════════════════════════════════╗
║           PHASE 1: PRE-IMPLEMENTATION COMPLIANCE CHECK           ║
╚══════════════════════════════════════════════════════════════════╝

Feature: User Authentication with MFA
Keywords: authentication, mfa, user, login, session

Enabled Frameworks: SOC2, HIPAA
Relevant Tasks Found: 5

┌─────────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL — SOC2 CC6.1                                        │
│ Implement MFA for privileged access                             │
├─────────────────────────────────────────────────────────────────┤
│ Priority: CRITICAL | Automated: ✅ | Framework: SOC2          │
│                                                                 │
│ Description:                                                    │
│ Multi-factor authentication must be implemented for all         │
│ privileged access to the system.                                │
│                                                                 │
│ Requirement:                                                    │
│ All administrative access requires MFA using TOTP or hardware │
│ keys. Implement requireMFA middleware for admin routes.         │
│                                                                 │
│ Suggested Implementation:                                       │
│ 1. Add MFA verification to user model                          │
│ 2. Create requireMFA middleware                                │
│ 3. Apply to all /admin/* routes                                │
│ 4. Add MFA setup flow in UI                                    │
│                                                                 │
│ Check Method: regex_pattern                                     │
│ Pattern: requireMFA|verifyMFA|mfaRequired                        │
│ File Types: *.ts, *.tsx                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 🟠 HIGH — HIPAA §164.312(d)                                     │
│ Person/entity authentication                                    │
├─────────────────────────────────────────────────────────────────┤
│ Priority: HIGH | Automated: ✅ | Framework: HIPAA              │
│                                                                 │
│ [Additional task details...]                                    │
└─────────────────────────────────────────────────────────────────┘

[3 more tasks...]

⚠️  ACTION REQUIRED: Review these tasks before implementing.
    Address CRITICAL and HIGH priority items first.
```

### Pre-Only Mode

If `--pre-only` specified, halt after displaying tasks:

```
╔══════════════════════════════════════════════════════════════════╗
║                    PRE-CHECK COMPLETE                            ║
╚══════════════════════════════════════════════════════════════════╝

Review the compliance tasks above before starting implementation.

Next Steps:
  1. Address CRITICAL and HIGH priority requirements
  2. Plan implementation with compliance in mind
  3. Run full check after implementation:
     
     /audit-check --spec <NNN> --feature "<name>" --post-only

═══════════════════════════════════════════════════════════════════
```

---

## Phase 2: Post-Implementation Audit

**Skipped if** `--pre-only` flag is set.

### Start Audit

```http
POST /api/audit/execute
Body:
{
  "specId": "<spec-uuid>",
  "featureScope": "<feature description>",
  "executionType": "manual"
}
```

### Progress Monitoring

If `--wait` specified, poll every 5 seconds:

```
╔══════════════════════════════════════════════════════════════════╗
║          PHASE 2: POST-IMPLEMENTATION AUDIT                     ║
╚══════════════════════════════════════════════════════════════════╝

Starting audit execution...
Execution ID: 019c8f6e-b1c6-7126-bcd2-495106a53f9f

Progress: 12/47 tasks (26%) ████████░░░░░░░░░░░░
Status: RUNNING | Elapsed: 25s

[Updates every 5 seconds...]

Progress: 47/47 tasks (100%) ████████████████████
Status: COMPLETED | Duration: 4m 32s

Fetching results...
```

### Results Display

```
╔══════════════════════════════════════════════════════════════════╗
║                    AUDIT RESULTS                                  ║
╚══════════════════════════════════════════════════════════════════╝

Execution ID:   019c8f6e-b1c6-7126-bcd2-495106a53f9f
Feature:        User Authentication with MFA
Spec:           013 — Audit Management
Completed:      2026-02-22T14:30:00Z

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  OVERALL COMPLIANCE SCORE: 89%                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

FRAMEWORK BREAKDOWN:
  ✅ SOC2:  92% (45 pass / 4 fail / 1 review)
  ✅ HIPAA: 85% (32 pass / 5 fail / 2 review)

SEVERITY BREAKDOWN:
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

═══════════════════════════════════════════════════════════════════
FAILED FINDINGS (Top 5)
═══════════════════════════════════════════════════════════════════

❌ [CRITICAL] SOC2 CC6.1 — Implement MFA for privileged access
   File: src/server/routes/admin.ts:45
   Status: FAILED
   
   Expected: requireMFA middleware in admin routes
   Found: router.post('/admin/users', requireAuth, createUser);
   
   Fix: Add requireMFA middleware:
   router.post('/admin/users', requireAuth, requireMFA, createUser);

❌ [HIGH] HIPAA §164.312(d) — Person/entity authentication
   File: src/server/services/auth.ts:123
   Status: FAILED
   
   Expected: Timing-safe password comparison
   Found: if (password === storedHash) return user;
   
   Fix: Use crypto.timingSafeEqual()

[3 more failed items...]

═══════════════════════════════════════════════════════════════════
NEEDS MANUAL REVIEW
═══════════════════════════════════════════════════════════════════

⚠️ [MEDIUM] SOC2 CC7.2 — System monitoring coverage
   Reason: Cannot automatically verify monitoring scope
   Action: Verify all auth events are logged in monitoring dashboard

⚠️ [MEDIUM] HIPAA §164.308(a)(1)(ii)(D) — Information access management
   Reason: Manual review required for access policy
   Action: Review user access control documentation

[1 more review item...]
```

---

## Phase 3: Auto-Approval (Optional)

If `--approve` flag set and score >= threshold:

```
╔══════════════════════════════════════════════════════════════════╗
║                    AUTO-APPROVAL                                  ║
╚══════════════════════════════════════════════════════════════════╝

Score: 89% | Threshold: 90% | Status: ❌ BELOW THRESHOLD

Auto-approval SKIPPED — score below threshold.

Manual review required. To approve:
  1. Review failed findings above
  2. Navigate to Compliance → Reports
  3. Click "Approve" on this report
  4. Add approval notes
```

If score >= threshold:

```
╔══════════════════════════════════════════════════════════════════╗
║                    AUTO-APPROVAL                                  ║
╚══════════════════════════════════════════════════════════════════╝

Score: 92% | Threshold: 90% | Status: ✅ APPROVED

Report automatically approved.
Approved by: System (auto-approval)
Notes: "Score meets or exceeds 90% threshold"
```

---

## Final Summary

```
╔══════════════════════════════════════════════════════════════════╗
║              COMPLIANCE CHECK COMPLETE                            ║
╚══════════════════════════════════════════════════════════════════╝

Feature:        User Authentication with MFA
Spec:           013
Execution ID:   019c8f6e-b1c6-7126-bcd2-495106a53f9f

PHASE RESULTS:
  ✅ Pre-Implementation:  5 tasks identified
  ✅ Post-Implementation:  Audit completed
  ✅ Report Generated:    89% compliance score

FINDINGS:
  ✅ Passed:        77
  ❌ Failed:         9  (2 critical, 3 high)
  ⚠️  Needs Review:  3

COMPLIANCE STATUS: 🟡 CONDITIONAL PASS

Critical issues must be addressed before production deployment.

═══════════════════════════════════════════════════════════════════
NEXT STEPS
═══════════════════════════════════════════════════════════════════

Immediate Actions:
  1. Fix 2 CRITICAL findings (see above)
  2. Fix 3 HIGH priority findings
  3. Complete manual review of 3 items

Commands:
  View full report:  /audit-report --report <reportId>
  Re-run audit:      /audit-check --spec 013 --feature "auth" --post-only
  Download report:   /audit-report --download <reportId>

═══════════════════════════════════════════════════════════════════
```

---

## Error Handling

| Error | Response |
|-------|----------|
| 400 Bad Request | "Invalid spec ID or feature scope." |
| 401 Unauthorized | "Authentication failed." |
| 403 Forbidden | "Insufficient permissions." |
| 422 Validation | "No frameworks enabled or no tasks available." |
| 500 Error | "Audit engine error." |

### No Frameworks Enabled

```
╔══════════════════════════════════════════════════════════════════╗
║                    CONFIGURATION ERROR                            ║
╚══════════════════════════════════════════════════════════════════╝

No compliance frameworks are enabled for this app.

Enable frameworks:
  1. Go to App Settings → Compliance tab
  2. Toggle on required frameworks
  3. Or use API: PATCH /api/audit/config

Available frameworks: SOC2, HIPAA, HITRUST, GDPR
═══════════════════════════════════════════════════════════════════
```

### No Tasks Found

```
╔══════════════════════════════════════════════════════════════════╗
║                    NO COMPLIANCE TASKS                            ║
╚══════════════════════════════════════════════════════════════════╝

No compliance tasks found for enabled frameworks.

Upload compliance documents:
  1. Go to Compliance → Documents tab
  2. Upload framework documents (*.md files)
  3. Extract tasks from documents

Example documents:
  - SOC2_SDLC_Compliance_Rules.md
  - HIPAA_SDLC_Compliance_Rules.md
═══════════════════════════════════════════════════════════════════
```

---

## Integration with wxAI Pipeline

### Full Development Workflow

```
# 1. Plan phase — check compliance requirements
/wxAI-plan --spec 013

# 2. Before implementation — understand compliance tasks
/audit-check --spec 013 --feature "authentication" --pre-only

[Review 5 compliance tasks...]

# 3. Implement with compliance in mind
/wxAI-implement --spec 013 --tasks T001-T010

# 4. After implementation — full compliance check
/audit-check --spec 013 --feature "authentication" --wait

[Shows 89% score with 9 failed items...]

# 5. Fix issues
[Address critical findings...]

# 6. Re-verify
/audit-check --spec 013 --feature "authentication" --post-only --wait

[Shows improved score...]
```

### CI/CD Gate

```
# In deployment pipeline
/audit-check \
  --spec $SPEC_NUMBER \
  --feature "$FEATURE_NAME" \
  --wait \
  --timeout 600 \
  --threshold 90

if [ $? -ne 0 ]; then
  echo "❌ Compliance check failed — blocking deployment"
  exit 1
fi

echo "✅ Compliance check passed — proceeding with deployment"
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — all checks passed, score >= threshold |
| 1 | Failed — critical findings or score < threshold |
| 2 | Error — API error, auth failure, or system error |
| 3 | Cancelled — audit was cancelled |
| 4 | Timeout — audit did not complete in time |

---

## Output Summary

```
╔══════════════════════════════════════════════════════════════════╗
║              AUDIT-CHECK COMPLETE                                 ║
╚══════════════════════════════════════════════════════════════════╝

Modes:          <pre-only|post-only|full>
Spec:           <NNN>
Feature:        <description>
Execution ID:   <id>

Results:
  Pre-Check Tasks:  <count>
  Audit Score:      <score>%
  Status:           <pass|conditional|fail>

Exit Code: <0|1|2|3|4>

Next Steps:
  - Fix failed findings
  - Complete manual reviews
  - Re-run check after fixes
  - Approve report for compliance record

═══════════════════════════════════════════════════════════════════
