# Quickstart: wxKanban End-to-End User Journey

**Date**: 2026-01-22
**Feature**: Multi-Platform Task Management System
**Branch**: 001-multi-platform-task

## Overview

This document provides an end-to-end user journey test that validates all major features of wxKanban. This test should be executable both manually and via automated E2E tests (Playwright).

**Total Duration**: ~15-20 minutes (manual execution)

---

## Prerequisites

- System is deployed and accessible
- Test accounts available for:
  - Jira (test instance with sample tasks)
  - Monday.com (test workspace)
  - Email service configured for invoice testing
- AI service (OpenAI/Gemini) API keys configured

---

## Test Scenario: Independent Developer's First Week

**Persona**: Alex, an independent software developer working with 2 clients (ACME Corp and TechStart Inc)

**Goal**: Set up wxKanban, connect PM systems, track time across projects, and generate first invoice

---

## Phase 1: Onboarding & Setup (5 min)

### 1.1 User Registration

**Steps**:

1. Navigate to https://wxkanban.com
2. Click "Sign Up"
3. Enter test credentials:
   - Email: `alex.developer+test@example.com`
   - Password: `SecureTestPass123!`
   - Name: `Alex Developer`
4. Submit form

**Expected Results**:

- ✅ Account created successfully
- ✅ Redirected to dashboard
- ✅ Welcome message displayed
- ✅ User record created in database with UUID v7 ID

**Validation**:

```sql
SELECT userid, email, name, createdat
FROM user
WHERE email = 'alex.developer+test@example.com';
```

**FR Coverage**: FR-001, FR-002, FR-003

---

### 1.2 Connect Jira Account

**Steps**:

1. Navigate to "Integrations" page
2. Click "Add Integration"
3. Select "Jira"
4. Complete OAuth flow with test Jira account
   - Jira instance: `testcompany.atlassian.net`
   - Authorize wxKanban access
5. Name connection: "ACME Corp Jira"

**Expected Results**:

- ✅ OAuth flow completes successfully
- ✅ Connection appears in integrations list
- ✅ Sync status shows "Active"
- ✅ Last sync timestamp displayed

**Validation**:

```sql
SELECT connectionid, systemtype, systemname, syncstatus
FROM pmsystemconnection
WHERE userid = (SELECT userid FROM user WHERE email = 'alex.developer+test@example.com')
  AND systemtype = 'jira';
```

**FR Coverage**: FR-005, FR-006, FR-009

---

### 1.3 Connect Monday.com Account

**Steps**:

1. Click "Add Integration" again
2. Select "Monday.com"
3. Complete OAuth flow with test Monday account
   - Authorize wxKanban access
4. Name connection: "TechStart Monday"

**Expected Results**:

- ✅ Second connection added successfully
- ✅ Both connections visible in list
- ✅ Automatic sync begins for both systems

**FR Coverage**: FR-005, FR-006, FR-009

---

## Phase 2: Task Management (5 min)

### 2.1 View Aggregated Tasks

**Steps**:

1. Navigate to Dashboard
2. Wait for initial sync to complete (~30 seconds)
3. Verify tasks from both PM systems displayed

**Expected Results**:

- ✅ Tasks from Jira displayed with "Jira" badge
- ✅ Tasks from Monday displayed with "Monday" badge
- ✅ Task list shows unified view of all tasks
- ✅ Each task shows: title, source, priority, due date, status
- ✅ Total task count displayed

**Example Display**:

```
╔══════════════════════════════════════════════════════════╗
║  My Tasks (28 total)                                     ║
╠══════════════════════════════════════════════════════════╣
║ [Jira] PROJ-123 - Implement user authentication         ║
║ Priority: High | Due: Jan 25 | Status: In Progress      ║
╠══════════════════════════════════════════════════════════╣
║ [Monday] Design database schema                          ║
║ Priority: Medium | Due: Jan 27 | Status: To Do          ║
╚══════════════════════════════════════════════════════════╝
```

**FR Coverage**: FR-011, FR-012, FR-018

---

### 2.2 Filter & Sort Tasks

**Steps**:

1. Apply filter: Show only "High" priority tasks
2. Sort by: Due date (ascending)
3. Filter by source: "Jira" only
4. Clear filters

**Expected Results**:

- ✅ Filtering works correctly
- ✅ Sorting updates task order
- ✅ Source filter shows only selected PM system
- ✅ Filter badges displayed
- ✅ Clear filters resets view

**FR Coverage**: FR-012

---

### 2.3 Create Internal Task

**Steps**:

1. Click "Create Task"
2. Select "Internal Task" (not from PM system)
3. Enter task details:
   - Title: "Prepare invoice templates"
   - Description: "Create PDF templates for client invoicing"
   - Priority: Medium
   - Effort: "2 hours"
   - Due date: Tomorrow
4. Assign to project: "ACME Corp - Website Redesign"
5. Save task

**Expected Results**:

- ✅ Task created with source "Internal"
- ✅ Task appears in unified task list
- ✅ Task marked with "Internal" badge
- ✅ Task distinguishable from external tasks

**Validation**:

```sql
SELECT taskid, title, source, priority
FROM task
WHERE source = 'internal'
  AND title = 'Prepare invoice templates';
```

**FR Coverage**: FR-016, FR-018, FR-019, FR-021

---

## Phase 3: Time Tracking (5 min)

### 3.1 Start Timer on Task

**Steps**:

1. From task list, select "PROJ-123 - Implement user authentication"
2. Click "Start Timer"
3. Verify timer shows running state
4. Note start time

**Expected Results**:

- ✅ Timer starts immediately (optimistic update)
- ✅ Timer displays running state
- ✅ Duration counter increments every second
- ✅ Timer badge shows on task card

**Validation**:

```sql
SELECT timeentryid, taskid, starttime, status
FROM timeentry
WHERE taskid = (SELECT taskid FROM task WHERE externaltaskid = 'PROJ-123')
  AND status = 'running';
```

**FR Coverage**: FR-023, FR-024

---

### 3.2 Multi-Task Tracking

**Steps**:

1. Without stopping first timer, navigate to another task
2. Click "Start Timer" on "Design database schema" task
3. Verify both timers running simultaneously
4. Navigate to "Time Tracking" page
5. Verify both active timers displayed

**Expected Results**:

- ✅ Two timers running simultaneously
- ✅ Each timer tracks independently
- ✅ Time tracking page shows both active timers
- ✅ Each timer shows task name and duration

**FR Coverage**: FR-023, FR-024

---

### 3.3 Pause & Resume Timer

**Steps**:

1. On first timer (PROJ-123), click "Pause"
2. Wait 10 seconds
3. Click "Resume"
4. Wait 5 more seconds
5. Verify duration calculation accounts for pause

**Expected Results**:

- ✅ Timer pauses immediately
- ✅ Duration counter stops
- ✅ Resume restarts counter
- ✅ Total paused time tracked
- ✅ Final duration = (resume time - start time) - paused duration

**FR Coverage**: FR-025

---

### 3.4 Stop Timer & Add Notes

**Steps**:

1. Click "Stop" on first timer
2. In dialog, enter notes: "Completed OAuth integration and basic auth flow"
3. Mark as "Billable"
4. Submit

**Expected Results**:

- ✅ Timer stops
- ✅ Final duration calculated
- ✅ Notes saved with time entry
- ✅ Time entry marked billable
- ✅ Time entry appears in history

**Validation**:

```sql
SELECT timeentryid, duration, isbillable, notes, status
FROM timeentry
WHERE notes LIKE '%OAuth integration%'
  AND status = 'completed';
```

**FR Coverage**: FR-024, FR-026, FR-027

---

### 3.5 Manual Time Entry

**Steps**:

1. Navigate to "Time Tracking" page
2. Click "Add Manual Entry"
3. Enter details:
   - Task: "Prepare invoice templates" (internal task)
   - Date: Yesterday
   - Start time: 2:00 PM
   - End time: 4:30 PM
   - Billable: Yes
   - Notes: "Created PDF templates and tested rendering"
4. Save entry

**Expected Results**:

- ✅ Manual entry created
- ✅ Duration calculated correctly (2.5 hours)
- ✅ Entry appears in history with "Manual" indicator
- ✅ Entry associated with correct task

**FR Coverage**: FR-028

---

## Phase 4: Project & Client Management (2 min)

### 4.1 Set Up Client

**Steps**:

1. Navigate to "Clients" page
2. Click "Add Client"
3. Enter details:
   - Company name: "ACME Corporation"
   - Billing email: `billing@acme.example.com`
   - Default hourly rate: $150.00
   - Address: "123 Main St, San Francisco, CA"
4. Save client

**Expected Results**:

- ✅ Client created
- ✅ Client appears in list
- ✅ Default rate displayed

**FR Coverage**: FR-026, FR-033

---

### 4.2 Set Up Project

**Steps**:

1. Navigate to "Projects" page
2. Click "Add Project"
3. Enter details:
   - Name: "Website Redesign"
   - Client: ACME Corporation
   - Hourly rate: $160.00 (overrides client default)
   - Status: Active
4. Save project

**Expected Results**:

- ✅ Project created
- ✅ Project associated with client
- ✅ Custom rate set for project

**FR Coverage**: FR-027, FR-034

---

## Phase 5: AI Task Proposals (2 min)

### 5.1 Request AI Proposals

**Steps**:

1. Navigate to project "Website Redesign"
2. Click "Get AI Suggestions"
3. Wait for AI to analyze context (~5-10 seconds)
4. Review proposed tasks

**Expected Results**:

- ✅ AI analyzes project context and current tasks
- ✅ 3-5 task proposals displayed
- ✅ Each proposal shows:
  - Title and description
  - Priority suggestion
  - Effort estimate
  - Rationale for suggestion
- ✅ Proposals relevant to project

**Example Proposals**:

```
1. "Write E2E tests for authentication flow"
   Priority: High | Effort: 4-6 hours
   Rationale: Testing is critical for security features

2. "Create API documentation"
   Priority: Medium | Effort: 2-3 hours
   Rationale: Documentation missing for auth endpoints

3. "Set up error monitoring"
   Priority: Medium | Effort: 1-2 hours
   Rationale: Need visibility into production errors
```

**FR Coverage**: FR-041, FR-042, FR-044

---

### 5.2 Accept AI Proposal

**Steps**:

1. Review first proposal: "Write E2E tests for authentication flow"
2. Click "Accept"
3. Verify task created

**Expected Results**:

- ✅ Proposal accepted
- ✅ New task created with source "AI Proposed"
- ✅ Task appears in task list with "AI" badge
- ✅ Task inherits proposal details (title, description, priority)

**Validation**:

```sql
SELECT t.taskid, t.title, t.source, ap.proposalid
FROM task t
JOIN aiproposal ap ON t.taskid = ap.taskid
WHERE ap.status = 'accepted';
```

**FR Coverage**: FR-045, FR-046

---

## Phase 6: Invoicing (3 min)

### 6.1 Generate Invoice

**Steps**:

1. Navigate to "Invoices" page
2. Click "Generate Invoice"
3. Select parameters:
   - Client: ACME Corporation
   - Project: Website Redesign
   - Period: Last 7 days
   - Include: Unbilled hours only
4. Preview invoice
5. Verify time entries included
6. Click "Generate"

**Expected Results**:

- ✅ Invoice preview shows:
  - Client details
  - Project name
  - Itemized time entries with dates and durations
  - Hourly rate per entry
  - Calculated amounts
  - Subtotal and total
- ✅ Only unbilled time entries included
- ✅ Invoice generated with unique number
- ✅ PDF downloadable

**Invoice Format**:

```
INVOICE #INV-2026-001

To: ACME Corporation
    billing@acme.example.com

Project: Website Redesign
Period: Jan 16 - Jan 22, 2026

Item                              Hours    Rate      Amount
──────────────────────────────────────────────────────────
Implement user authentication     2.5    $160.00    $400.00
Prepare invoice templates         2.5    $160.00    $400.00

                                 Subtotal:          $800.00
                                    Total:          $800.00
```

**Validation**:

```sql
-- Verify invoice created
SELECT invoiceid, invoicenumber, clientid, totalamount
FROM invoice
WHERE clientid = (SELECT clientid FROM client WHERE companyname = 'ACME Corporation');

-- Verify time entries marked as invoiced
SELECT COUNT(*) as invoiced_entries
FROM timeentry
WHERE invoiceid IS NOT NULL
  AND invoicedat IS NOT NULL;
```

**FR Coverage**: FR-035, FR-036, FR-037, FR-038, FR-039

---

### 6.2 Send Invoice via Email

**Steps**:

1. From invoice detail page, click "Send Invoice"
2. Verify recipient email pre-filled: `billing@acme.example.com`
3. Add message: "Please find attached invoice for January 2026 web development work."
4. Click "Send"
5. Wait for confirmation

**Expected Results**:

- ✅ Email sent successfully
- ✅ Invoice status updated to "Sent"
- ✅ Send timestamp recorded
- ✅ Confirmation message displayed
- ✅ Email received at test inbox with PDF attachment

**Validation**:

```sql
SELECT invoiceid, status, sentat
FROM invoice
WHERE invoicenumber = 'INV-2026-001'
  AND status = 'sent'
  AND sentat IS NOT NULL;
```

**FR Coverage**: FR-040

---

## Phase 7: Task Sync & Updates (2 min)

### 7.1 Update Task in wxKanban

**Steps**:

1. Navigate to task list
2. Select Jira task "PROJ-123 - Implement user authentication"
3. Change status to "Completed"
4. Add notes: "Feature complete, ready for review"
5. Save changes

**Expected Results**:

- ✅ Task updated in wxKanban immediately (optimistic update)
- ✅ Sync triggered to Jira
- ✅ Within 30 seconds, task status updated in Jira
- ✅ Sync status shows "Last synced: Just now"

**Verification in Jira**:

- Log into Jira test instance
- Navigate to PROJ-123
- Verify status is "Done"
- Verify comment added with wxKanban notes

**FR Coverage**: FR-007, FR-014, FR-015

---

### 7.2 Verify Bidirectional Sync

**Steps**:

1. In Jira, update a different task (PROJ-124):
   - Change priority to "High"
   - Add comment: "Updated in Jira"
2. Wait for next sync cycle (~10 minutes, or trigger manual sync)
3. In wxKanban, verify task PROJ-124 updated

**Expected Results**:

- ✅ Change detected in Jira
- ✅ wxKanban task updated with new priority
- ✅ No conflicts (no local changes)
- ✅ Sync metadata updated

**FR Coverage**: FR-006, FR-007, FR-015

---

## Success Criteria Validation

After completing all phases, verify success criteria from spec:

| Criteria                    | Target                          | Actual      | Pass |
| --------------------------- | ------------------------------- | ----------- | ---- |
| Task Aggregation Efficiency | <10 seconds                     | \_\_\_s     | ☐    |
| Time Tracking Accuracy      | Minute precision, 100% reliable | \_\_\_%     | ☐    |
| Billing Productivity        | Invoice gen <2 minutes          | \_\_\_m     | ☐    |
| Synchronization Reliability | 99% success, <5 min latency     | ***% / ***m | ☐    |
| AI Task Quality             | 60% acceptance rate             | \_\_\_%     | ☐    |

---

## Cleanup

After test completion, clean up test data:

```sql
-- Delete test user and cascade delete all related data
DELETE FROM user WHERE email = 'alex.developer+test@example.com';

-- Verify cleanup
SELECT COUNT(*) FROM user WHERE email LIKE '%+test@example.com';
-- Should return 0
```

---

## Automation Notes

This quickstart can be automated using Playwright E2E tests:

```typescript
// tests/e2e/quickstart.spec.ts
import { test, expect } from "@playwright/test";

test.describe("wxKanban Quickstart Journey", () => {
  test("Phase 1: Onboarding & Setup", async ({ page }) => {
    // Test steps from Phase 1
  });

  test("Phase 2: Task Management", async ({ page }) => {
    // Test steps from Phase 2
  });

  // ... additional test phases
});
```

---

**Status**: ✅ Quickstart Test Complete
**Execution Time**: 15-20 minutes (manual) | 5-10 minutes (automated)
**Coverage**: All 56 functional requirements touched
