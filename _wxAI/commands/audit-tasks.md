---
description: Get pre-implementation compliance task recommendations based on feature keywords
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

## Audit Tasks — Pre-Implementation Compliance Recommendations

This command queries the Audit Management system for relevant compliance tasks based on feature keywords. It helps developers understand compliance requirements **before** writing code.

**API Endpoint**: `GET /api/audit/tasks/relevant?keywords=<keywords>`

---

## Pre-Flight Validation

### 1. Parse Arguments

Extract keywords from `{{args}}`. Supported input formats:

| Format | Example |
|--------|---------|
| Space-separated keywords | `authentication mfa login` |
| Comma-separated | `auth, mfa, session` |
| Feature description | `Implement user authentication with OAuth2` |

If `{{args}}` is empty or whitespace only, halt with:

```
ERROR: No feature keywords provided.

Usage: /audit-tasks <keywords or feature description>

Examples:
  /audit-tasks authentication mfa
  /audit-tasks "user login with session management"
  /audit-tasks auth, oauth, jwt
```

### 2. Extract Keywords

Process `{{args}}` to extract searchable keywords:

1. Remove common stop words: "the", "a", "an", "and", "or", "with", "for", "to", "in", "on", "at", "from", "by", "implement", "add", "create", "build"
2. Split on spaces, commas, and hyphens
3. Convert to lowercase
4. Remove duplicates
5. Limit to 10 most relevant keywords

---

## API Call

### Request

```http
GET /api/audit/tasks/relevant?keywords=<keyword1,keyword2,keyword3>
Headers:
  Authorization: Bearer <token from WXKANBAN_API_TOKEN env>
```

### Environment Setup

The command expects these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `WXKANBAN_API_URL` | Yes | Base URL (e.g., `http://localhost:3000`) |
| `WXKANBAN_API_TOKEN` | Yes | JWT token for authentication |

If variables are missing, halt with:

```
ERROR: Missing environment variables.

Required:
  - WXKANBAN_API_URL (e.g., http://localhost:3000)
  - WXKANBAN_API_TOKEN (JWT token)

Set these in your .env file or environment before running /audit-tasks.
```

---

## Response Processing

### Success Response (200 OK)

```json
{
  "tasks": [
    {
      "id": "uuid",
      "framework": "SOC2",
      "category": "Access Control",
      "controlReference": "CC6.1",
      "priority": "critical",
      "title": "Implement MFA for privileged access",
      "description": "Multi-factor authentication must be implemented...",
      "requirementText": "All administrative access requires MFA...",
      "checkMethod": "regex_pattern",
      "suggestedFix": "Add MFA middleware to admin routes",
      "applicablePhases": ["implementation", "testing"],
      "applicableFileTypes": ["*.ts", "*.tsx"],
      "isAutomated": true
    }
  ],
  "enabledFrameworks": ["SOC2", "HIPAA"],
  "totalTasks": 5
}
```

### Display Format

Render results as a formatted compliance checklist:

```
===================================================
COMPLIANCE TASK RECOMMENDATIONS
===================================================

Enabled Frameworks: SOC2, HIPAA
Total Relevant Tasks: 5

---

🔴 CRITICAL — SOC2 CC6.1
Implement MFA for privileged access

Framework: SOC2 | Category: Access Control
Priority: CRITICAL | Automated: ✅

Description:
Multi-factor authentication must be implemented for all privileged
access to the system.

Requirement:
All administrative access requires MFA using TOTP or hardware keys.

Suggested Fix:
Add MFA middleware to admin routes

Applicable to: implementation, testing
File patterns: *.ts, *.tsx

---

🟠 HIGH — HIPAA §164.312(d)
Person/entity authentication

Framework: HIPAA | Category: Security
Priority: HIGH | Automated: ✅

[...]
```

### Empty Results

If no tasks returned:

```
===================================================
COMPLIANCE TASK RECOMMENDATIONS
===================================================

Enabled Frameworks: SOC2, HIPAA
Total Relevant Tasks: 0

No compliance tasks match your feature keywords.

This could mean:
  - No frameworks are enabled (check /api/audit/config)
  - Keywords don't match any task titles/descriptions
  - Feature scope doesn't trigger compliance requirements

Next Steps:
  1. Enable relevant frameworks in Audit Config
  2. Upload compliance documents to extract tasks
  3. Try broader keywords (e.g., "security", "auth", "data")
===================================================
```

### Error Responses

| Status | Handling |
|--------|----------|
| 401 Unauthorized | "Authentication failed. Check WXKANBAN_API_TOKEN." |
| 403 Forbidden | "Insufficient permissions. Requires ADMIN or DEVELOPER role." |
| 500 Server Error | "Audit service error. Check server logs." |
| Network Error | "Cannot connect to API. Verify WXKANBAN_API_URL." |

---

## Behavior Rules

- **Framework Filtering**: Only shows tasks from enabled frameworks (respects `app_audit_configuration`)
- **Keyword Matching**: Matches against `title`, `description`, and `requirementText` fields
- **Priority Ordering**: Sorts by priority (critical > high > medium > low)
- **Framework Grouping**: Groups tasks by framework for clarity
- **Actionable Output**: Always includes `suggestedFix` and `checkMethod` for developer guidance

---

## Integration with wxAI Pipeline

This command is designed to be called:

1. **During `/wxAI-plan` phase** — Before implementation starts, identify compliance requirements
2. **During `/wxAI-tasks` phase** — Add compliance tasks to the task list
3. **Manually by developers** — Check compliance before writing sensitive code

### Example Pipeline Integration

```
/wxAI-pipeline Add user authentication with MFA

[Phase 1-4 run normally...]

Before implementation:
  /audit-tasks authentication mfa session

[Shows relevant compliance tasks...]

[Developer addresses compliance requirements in implementation]
```

---

## Error Handling

### Missing Configuration

If no audit configuration exists:

```
WARNING: No audit configuration found for this app.

Run /audit-config to set up compliance frameworks, or:
  1. Navigate to App Settings → Compliance tab
  2. Enable required frameworks (SOC2, HIPAA, etc.)
  3. Upload compliance documents
```

### No Enabled Frameworks

If frameworks are configured but none enabled:

```
WARNING: No compliance frameworks are currently enabled.

Enabled frameworks: none

To enable frameworks:
  /audit-config --enable SOC2,HIPAA
```

---

## Output Summary

```
===================================================
AUDIT-TASKS COMPLETE
===================================================
Keywords:       <extracted keywords>
Frameworks:   <enabled frameworks>
Tasks Found:  <count>
Critical:     <count>
High:         <count>
Medium:       <count>
Low:          <count>

Next Steps:
  - Review tasks above before implementing
  - Run /audit-run after implementation to verify compliance
  - Run /audit-report to view detailed findings
===================================================
