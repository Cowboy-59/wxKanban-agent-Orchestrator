# wxKanban Quickstart & Integration Test Scenarios

**Phase 1 Design Output** — Executable test scenarios derived from acceptance criteria

**Date**: 2026-02-12 | **Status**: ✅ Complete

---

## Overview

These integration test scenarios validate the core user workflows. Each scenario maps to one or more acceptance scenarios from the feature specification and includes executable steps, expected results, and validation points.

**Test Environment**:

- Local development server: `http://localhost:3000`
- PostgreSQL test database
- Real API calls (not mocked)

---

## Scenario 1: User Registration and PM System Connection

**Feature**: Users can register and connect to external PM systems

**Acceptance Criteria**:

- User can register with email and password
- User receives JWT token
- User can connect to Jira and Monday.com
- Connected PM systems appear in settings

### Test Steps

```gherkin
Feature: User Registration and PM Connection
  Scenario: Register new user and connect to PM systems
    Given user is on registration page
    When user enters email "developer@example.com"
    And user enters password "SecurePassword123!"
    And user clicks "Register"
    Then user receives HTTP 201 Created
    And response contains jwt token with 24-hour expiry
    And user is redirected to dashboard
    And user sees "Settings" link

    When user clicks "Add PM Connection"
    And user selects "Jira"
    Then user is redirected to Jira OAuth flow

    When user authorizes wxKanban
    And user is redirected to wxKanban callback
    Then HTTP 201 Created received
    And response shows connectionid
    And PM System Connection record created with:
      - userid = <test user>
      - pmsystem = 'jira'
      - syncstatus = 'active'
      - accesstoken encrypted

    When user returns to Settings
    Then user sees "Jira (connected)"
    And user can see last sync time

    When user clicks "Add PM Connection" again
    And user selects "Monday.com"
    And completes OAuth flow
    Then user sees both "Jira (connected)" and "Monday.com (connected)"
```

### Validation Checklist

- [ ] POST /auth/register returns 201 with userid, email, token
- [ ] JWT token validates with 24-hour expiry
- [ ] Token stored in httpOnly cookie
- [ ] POST /api/pm-systems with auth code returns 201
- [ ] PMSystemConnection record created in database
- [ ] accesstoken and refreshtoken are encrypted
- [ ] Multiple connections per user allowed
- [ ] GET /api/pm-systems lists both connections

### Edge Cases

- Email already registered → 409 Conflict
- Password too weak → 400 Bad Request
- Invalid OAuth code → 400 Bad Request
- OAuth timeout → Graceful error message

---

## Scenario 2: Task Aggregation and Time Tracking

**Feature**: Tasks from multiple PM systems are aggregated and time can be tracked

**Acceptance Criteria**:

- Dashboard loads within 10 seconds
- Tasks from Jira and Monday shown in unified view
- User can start/stop timer on tasks
- Pause/resume functionality works

### Test Steps

```gherkin
Feature: Task Aggregation and Time Tracking
  Scenario: View aggregated tasks and start timer
    Given user is authenticated
    And user has Jira and Monday.com connections

    When automatic sync runs (every 5-15 min)
    Then system calls Jira API to fetch assigned tasks
    And system calls Monday.com API to fetch assigned tasks
    And tasks are stored in Task table with:
      - sourcepmSystem = 'jira' or 'monday'
      - externalId = PM system task ID
      - status = 'open'
      - sourceoforigin = 'external'

    When user navigates to Dashboard
    Then GET /api/tasks returns 200 in < 10 seconds
    And response contains tasks from both Jira and Monday
    And each task shows:
      - title
      - priority (from PM system)
      - duedate
      - sourcepmSystem badge
      - current status

    When user filters by priority="high"
    Then only high-priority tasks shown

    When user filters by status="open" AND sortBy="duedate"
    Then tasks sorted by due date (nearest first)

    When user clicks "Start Timer" on a task
    Then POST /api/tasks/{taskid}/start-timer called
    And TimeEntry created with:
      - taskid
      - projectid
      - starttime = NOW (UTC)
      - status = 'running'
    And timer widget shows elapsed time

    When user works for 15 minutes
    And user clicks "Pause"
    Then timer pauses at 15 minutes
    And can click "Resume" to continue

    When user clicks "Stop"
    And user selects billable=true, notes="Fixed login bug"
    Then POST /api/tasks/{taskid}/stop-timer called with request:
      {
        "billable": true,
        "notes": "Fixed login bug"
      }
    And TimeEntry updated with:
      - endtime = NOW
      - duration = 15 (minutes)
      - billable = true
      - notes = "Fixed login bug"
    And HTTP 200 returned with TimeEntry details
```

### Validation Checklist

- [ ] Dashboard GET /api/tasks returns < 10 seconds
- [ ] Tasks from 2+ PM systems visible in one view
- [ ] Timer startTime/endTime in UTC
- [ ] Duration calculation: (endTime - startTime) ±60 seconds tolerance
- [ ] Billable flag properly stored
- [ ] Multiple concurrent timers on different tasks supported
- [ ] Pause/resume state maintained
- [ ] Timer accuracy to nearest minute

### Edge Cases

- Timer running > 8 hours → Prompt user to confirm
- PM system API timeout → Show cached tasks from last sync
- Task deleted in source PM → Mark as "orphaned", preserve time entries
- No tasks assigned → Show friendly "No tasks" message

---

## Scenario 3: Invoice Generation and Billing

**Feature**: Users can generate invoices and timesheets with accurate billing calculations

**Acceptance Criteria**:

- Invoice can be generated in < 2 minutes
- Billable hours calculated correctly
- Invoice downloadable as PDF
- Can be sent via email
- Time entries marked as invoiced to prevent duplicates

### Test Steps

```gherkin
Feature: Invoice Generation and Billing
  Scenario: Generate and send invoice
    Given user is authenticated
    And project has hourlyRate = 150.00
    And user has 10 billable hours tracked in January 2026

    When user navigates to Invoicing
    And user selects project
    And user selects date range "2026-01-01" to "2026-01-31"
    And user clicks "Generate Invoice"
    Then system queries TimeEntry WHERE:
      - projectid = <selected project>
      - billable = true
      - starttime >= 2026-01-01
      - starttime <= 2026-01-31
    And system calculates:
      - totalHours = SUM(duration) / 60 = 10.0
      - totalAmount = 10.0 * 150.00 = 1500.00
    And POST /api/invoices/generate returns 201 with:
      {
        "invoiceid": "uuid",
        "projectid": "uuid",
        "totalamount": 1500.00,
        "hoursworked": 10.0,
        "downloadurl": "https://...",
        "generatedAt": "2026-02-12T10:00:00Z"
      }
    And Invoice record created in database
    And UI shows invoice with line items:
      - Task 1: 2 hours × $150 = $300
      - Task 2: 3 hours × $150 = $450
      - Task 3: 5 hours × $150 = $750
      - Total: 10 hours × $150 = $1,500

    When user clicks "Download PDF"
    Then PDF file generated via Puppeteer
    And PDF contains:
      - Client name
      - Invoice date
      - Due date
      - Itemized tasks with hours and rates
      - Total due amount
    And PDF downloaded to user's device

    When user clicks "Send Email"
    And user enters email "client@example.com"
    And user clicks "Send"
    Then POST /api/invoices/{invoiceid}/send called
    And email sent via Sendgrid
    And Invoice.emailsent = true
    And Invoice.sentat = NOW
    And user sees "Email sent successfully"

    When user generates another invoice with overlapping dates
    Then TimeEntry.invoiced = true (from first invoice)
    And those entries NOT included in second invoice
    And system prevents duplicate billing
```

### Validation Checklist

- [ ] POST /api/invoices/generate returns 201 in < 2 minutes
- [ ] totalAmount = SUM(billable hours in date range) × hourlyRate
- [ ] PDF generated with all required fields
- [ ] PDF downloadable with correct filename
- [ ] Email delivery tracked (emailsent=true, sentat timestamp)
- [ ] TimeEntry.invoiced flag prevents duplicate inclusion
- [ ] CSV export available for accounting software
- [ ] Multiple invoices per project supported

### Edge Cases

- No billable hours in date range → "No invoices to generate" message
- hourlyRate not set → "Please configure hourly rate" error
- Email delivery failure → Retry with user notification
- PDF generation timeout → Show downloadable invoice link anyway

---

## Scenario 4: Project Lifecycle - Phase Transitions

**Feature**: 6-phase quality workflow is enforced with completion criteria validation

**Acceptance Criteria**:

- Project initialized with 6 phases in pending state
- Phase transitions blocked until criteria met
- Transitions logged with timestamp and reason
- Can reopen prior phases with reason

### Test Steps

```gherkin
Feature: 6-Phase Project Lifecycle
  Scenario: Create project and progress through phases
    Given user is authenticated

    When user creates new project "Product X"
    And user clicks "Create"
    Then POST /api/projects returns 201
    And Project record created with:
      - projectid = uuid
      - userid = <authenticated user>
      - currentphase = 'Design'
    And 6 ProjectPhase records created:
      - Phase 1: Design (pending)
      - Phase 2: Implementation (pending)
      - Phase 3: QA (pending)
      - Phase 4: HumanTesting (pending)
      - Phase 5: Beta (pending)
      - Phase 6: Release (pending)
    And user is in Phase 1: Design

    When user clicks "Create Specification"
    And user creates spec "001-User Authentication"
    Then Specification created with:
      - projectid = <current project>
      - specnumber = '001'
      - status = 'draft'

    When user marks spec status = 'approved'
    Then Specification.status = 'approved'

    When user clicks "Complete Phase 1"
    And system verifies: ALL specs status = 'approved'
    Then POST /api/projects/{projectid}/phases/Design/complete succeeds
    And ProjectPhase.status = 'complete'
    And ProjectPhase.completedat = NOW
    And project.currentphase = 'Implementation'
    And ProjectPhase for Implementation.status = 'in_progress'
    And PhaseTransitionLog created:
      - fromPhase = Design
      - toPhase = Implementation
      - timestamp = NOW
      - reason = "User manual advance"

    When user is in Phase 2: Implementation
    And user creates tasks linked to spec "001"
    And user marks all tasks complete
    And user clicks "Complete Phase 2"
    Then system verifies: ALL specs have implementation tasks marked complete
    And transition to QA happens
    And QA phase status = 'in_progress'

    When user is in Phase 3: QA
    And user creates test plan for spec "001"
    And user executes tests and records pass/fail
    And user clicks "Complete Phase 3"
    Then system verifies: ALL test plans have results recorded
    And ALL test plans show 'pass' status
    And transition to HumanTesting happens

    When user is in Phase 4: HumanTesting
    And user provides feedback on feature
    And feedback identifies missing feature
    And user clicks "Convert to Specification"
    And system creates new spec "002-Advanced Auth"
    Then user is STILL in Phase 4 (not advanced)
    And Feedback.linkedspecid = <new spec>
    And user can advance to Phase 5 once feedback resolved

    When user resolves all feedback and advances to Phase 5: Beta
    Then Beta phase begins
    And same feedback mechanism enabled
    And user must APPROVE changes before applying

    When user is ready for Release (Phase 6)
    And ALL prior phases show 'complete'
    And ALL feedback resolved
    Then user can advance to Release
    And release method selection shown

    When user was in Phase 2 and issues discovered
    And user clicks "Reopen Phase 1: Design"
    And enters reason "Missing auth requirements"
    Then POST /api/projects/{projectid}/phases/Design/reopen succeeds
    And Design phase status = 'reopened'
    And PhaseTransitionLog created with reason
    And User can edit specs in Design
    And Project CANNOT advance past Phase 2 until Design re-complete
```

### Validation Checklist

- [ ] Project initializes with 6 phases, all pending
- [ ] Phase 1 Complete requires all specs approved
- [ ] Phase 2 Complete requires all tasks done (per spec)
- [ ] Phase 3 Complete requires all tests recorded + passing
- [ ] Phase 4 Complete requires feedback resolved
- [ ] Phase 5 Complete requires modifications approved
- [ ] Phase 6 requires all priors complete
- [ ] Phase reopening prevented from skipping phases
- [ ] Transition logging includes timestamp and reason
- [ ] Concurrent phases allowed (1 re-opened, 2+ in progress)

### Edge Cases

- Attempt to skip phases → 400 Bad Request
- Complete phase with pending specs → 400 "All specs must be approved"
- Reopen phase 1 while in phase 6 → Phase 6 blocks (can't advance)
- Feedback loop: Phase 5 → Phase 1 spec → Complete Phase 1 → Phase 5 ready

---

## Scenario 5: AI Task Proposals

**Feature**: AI analyzes project context and proposes additional tasks

**Acceptance Criteria**:

- AI triggered when user starts work on project
- Proposals presented for accept/reject
- Accepted proposals become internal tasks
- Can be disabled in settings

### Test Steps

```gherkin
Feature: AI Task Proposals
  Scenario: AI suggests related tasks
    Given user is authenticated
    And user has project "E-commerce Platform"
    And user has 3 existing tasks:
      - User registration
      - Product catalog
      - Shopping cart

    When user clicks "Start Work" on project
    Or system detects user starting timer on project task
    Then system calls Gemini API with:
      - Project description
      - Current task list
      - Project phase context
    And Gemini returns:
      [
        {
          "title": "Payment processing",
          "reasoning": "E-commerce needs payment handling"
        },
        {
          "title": "Order tracking",
          "reasoning": "Users need to track orders"
        }
      ]
    And AI Proposal records created
    And system shows proposal UI:
      - Proposal 1: "Payment processing - E-commerce needs payment handling"
      - Proposal 2: "Order tracking - Users need to track orders"
      - [Accept] [Skip] buttons for each

    When user clicks [Accept] on "Payment processing"
    Then Task created with:
      - title = "Payment processing"
      - projectid = <current project>
      - sourceoforigin = 'ai_proposed'
      - status = 'open'
    And Proposal.status = 'accepted'
    And UI updates to show new task in task list

    When user skips "Order tracking"
    Then Proposal.status = 'rejected'
    And no task created

    When user navigates to Settings
    And user finds "AI Preferences"
    And toggles "Auto-propose tasks" = OFF
    Then user preference saved
    And no more AI proposals shown (until re-enabled)
```

### Validation Checklist

- [ ] AI triggered when timer started on project
- [ ] Gemini API called with project context
- [ ] Fallback to OpenAI if Gemini unavailable
- [ ] Proposals cached for 1 hour (no duplicate API calls)
- [ ] Accepted proposals become Task with sourceoforigin='ai_proposed'
- [ ] Rejected proposals don't create tasks
- [ ] User preference toggle respected
- [ ] 60%+ acceptance rate metric tracked

### Edge Cases

- Gemini API timeout → Show cached suggestions or skip gracefully
- No Gemini quota → Fallback to OpenAI
- Both unavailable → Skip proposals, don't block user
- User disables → Don't show anymore

---

## Test Execution Framework

### Setup (Before All Tests)

```typescript
// tests/integration/fixtures.ts
describe("wxKanban Integration Tests", () => {
  let testUser: { userid: string; email: string; token: string };
  let testProject: { projectid: string };
  let testConnections: { jira: string; monday: string };

  beforeAll(async () => {
    // 1. Register test user
    const registerRes = await fetch("http://localhost:3000/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "TestPassword123!",
      }),
    });
    testUser = await registerRes.json();

    // 2. Connect test PM systems (with mocked OAuth)
    // 3. Create test project
    // 4. Sync test data from mock PM systems
  });

  afterAll(async () => {
    // Clean up: delete test user and all related data
  });
});
```

### Test Validation Pattern

```typescript
// Example test with validation
test("should generate invoice in < 2 minutes", async () => {
  const startTime = Date.now();

  const response = await fetch("/api/invoices/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${testUser.token}` },
    body: JSON.stringify({
      projectid: testProject.projectid,
      startdate: "2026-01-01",
      enddate: "2026-01-31",
      format: "pdf",
    }),
  });

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000; // seconds

  expect(response.status).toBe(200);
  expect(duration).toBeLessThan(120); // < 2 minutes

  const invoice = await response.json();
  expect(invoice.invoiceid).toBeDefined();
  expect(invoice.totalamount).toBe(1500.0); // 10 hours × $150
  expect(invoice.downloadurl).toMatch(/^https:\/\//);
});
```

---

## Success Criteria

All scenarios pass when:

- ✅ All HTTP status codes correct
- ✅ Database records created with correct fields
- ✅ Timestamps in UTC
- ✅ Encryption applied to sensitive data
- ✅ Response times meet SLA targets
- ✅ Edge cases handled gracefully
- ✅ User feedback provided for all actions

**Ready for Phase 2: Task Generation** ✅
