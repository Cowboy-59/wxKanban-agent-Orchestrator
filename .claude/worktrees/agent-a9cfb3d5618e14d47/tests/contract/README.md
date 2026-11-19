# Contract Tests - Team Assignments API

> Contract tests validate that API endpoints comply with their OpenAPI specification.

**Framework**: Vitest
**Type**: Contract/API validation tests
**Total Contracts**: 3 API modules with 11 endpoints

---

## What Are Contract Tests?

Contract tests verify that:
- API endpoints return correct HTTP status codes
- Response body structure matches specification
- Error responses follow standard format
- Required fields are always present
- Type validation works correctly

They run **against the actual API** (not mocked), ensuring real integration.

---

## Test Structure

### File Organization

```
tests/contract/
├── README.md                              (this file)
├── duties-assignment.contract.test.ts     (4 endpoints)
├── compliance-validation.contract.test.ts (3 endpoints)
└── task-routing.contract.test.ts          (4 endpoints)
```

### Test Pattern

Each contract test follows this structure:

```typescript
describe('POST /api/projects/{projectId}/duties/assign', () => {
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    // Setup: Create test data
    projectId = await createTestProject();
    userId = await createTestUser(projectId);
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    await deleteTestProject(projectId);
  });

  it('should return 201 with assignment object on success', async () => {
    const response = await fetch(
      `/api/projects/${projectId}/duties/assign`,
      {
        method: 'POST',
        body: JSON.stringify({
          userId,
          dutyName: 'Developer'
        })
      }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.dutyAssignment).toBeDefined();
    expect(body.dutyAssignment.assignmentId).toBeTruthy();
  });

  it('should return 400 with error on missing userId', async () => {
    const response = await fetch(
      `/api/projects/${projectId}/duties/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ dutyName: 'Developer' })
      }
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.error).toBeDefined();
  });
});
```

---

## Duty Assignment Endpoints (T048-T051)

### File: `duties-assignment.contract.test.ts`

#### 1. POST /api/projects/{projectId}/duties/assign

Assign a duty to a team member.

**Test Cases**:
- ✅ Valid assignment (201)
- ✅ Missing userId (400)
- ✅ Missing dutyName (400)
- ✅ Invalid dutyName (404)
- ✅ User not on project (404)
- ✅ Duplicate assignment (409)
- ✅ Compliance violation without override (400)
- ✅ Compliance violation with override (201)

**Response Validation**:
```typescript
expect(response.status).toBe(201);
const { dutyAssignment, complianceOverride } = await response.json();
expect(dutyAssignment).toHaveProperty('assignmentId');
expect(dutyAssignment).toHaveProperty('userId');
expect(dutyAssignment).toHaveProperty('dutyName');
expect(dutyAssignment).toHaveProperty('assignedAt');
```

---

#### 2. GET /api/projects/{projectId}/duties/assignments

List assignments for a project.

**Test Cases**:
- ✅ List all assignments (200)
- ✅ Filter by userId (200)
- ✅ Empty list returns empty array (200)
- ✅ Invalid projectId (404)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const { assignments } = await response.json();
expect(Array.isArray(assignments)).toBe(true);
assignments.forEach(a => {
  expect(a).toHaveProperty('assignmentId');
  expect(a).toHaveProperty('userId');
  expect(a).toHaveProperty('dutyName');
  expect(a).toHaveProperty('assignedAt');
});
```

---

#### 3. DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}

Remove an assignment.

**Test Cases**:
- ✅ Valid removal (204)
- ✅ Invalid assignmentId (404)
- ✅ Non-Team Manager user (403)
- ✅ Double-delete (404)

**Response Validation**:
```typescript
expect(response.status).toBe(204);
// 204 No Content means no body
```

---

#### 4. GET /api/projects/{projectId}/duties/available

List available duties.

**Test Cases**:
- ✅ List all duties (200)
- ✅ Shows correct sequence (200)
- ✅ Shows assignment counts (200)
- ✅ Invalid projectId (404)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const { duties } = await response.json();
duties.forEach(d => {
  expect(d).toHaveProperty('dutyName');
  expect(d).toHaveProperty('sequence');
  expect(d).toHaveProperty('isAvailable');
  expect(d).toHaveProperty('assignedCount');
});
```

---

## Compliance Validation Endpoints (T052-T054)

### File: `compliance-validation.contract.test.ts`

#### 1. POST /api/compliance/validate

Validate if assignment violates compliance rules.

**Test Cases**:
- ✅ Valid assignment (200, isValid: true)
- ✅ SOC2 violation (200, violations: [...])
- ✅ HiTrust violation (200, violations: [...])
- ✅ No violations with manager role (200, isValid: true)
- ✅ Invalid standard enum (400)
- ✅ Missing required fields (400)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const { isValid, violations, requiresOverride } = await response.json();
expect(typeof isValid).toBe('boolean');
if (!isValid) {
  expect(Array.isArray(violations)).toBe(true);
  violations.forEach(v => {
    expect(v).toHaveProperty('ruleId');
    expect(v).toHaveProperty('reason');
  });
}
```

---

#### 2. GET /api/compliance/overrides

List compliance overrides.

**Test Cases**:
- ✅ List all overrides (200)
- ✅ Filter by projectId (200)
- ✅ Filter by userId (200)
- ✅ Filter by standard (200)
- ✅ Date range filtering (200)
- ✅ Pagination (200, page info)
- ✅ Invalid filters (400)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const { overrides, totalCount, page, pageSize } = await response.json();
expect(Array.isArray(overrides)).toBe(true);
expect(typeof totalCount).toBe('number');
expect(page).toBeGreaterThanOrEqual(1);
```

---

#### 3. GET /api/compliance/overrides/{overrideId}

Get specific override details.

**Test Cases**:
- ✅ Valid override (200)
- ✅ Invalid overrideId (404)
- ✅ All required fields present (200)
- ✅ Immutable (no PUT/DELETE) (405)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const override = await response.json();
expect(override).toHaveProperty('overrideId');
expect(override).toHaveProperty('projectId');
expect(override).toHaveProperty('userId');
expect(override).toHaveProperty('reason');
expect(override.reason.length).toBeGreaterThanOrEqual(50);
```

---

## Task Routing Endpoints (T055-T057)

### File: `task-routing.contract.test.ts`

#### 1. POST /api/tasks/{taskId}/route-next-duty

Route task to next duty in sequence.

**Test Cases**:
- ✅ Auto-assign (1 member) (200, status: 'autoAssigned')
- ✅ Manual selection (2+ members) (200, status: 'requiresManualSelection')
- ✅ With manual selection (200, assignedToUserId)
- ✅ ALL duty (200, status: 'assignAllTeamMembers')
- ✅ Task complete (200, status: 'complete')
- ✅ No members available (400)
- ✅ Invalid taskId (404)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const { status, nextDuty, assignedToUserId } = await response.json();
const validStatuses = [
  'autoAssigned',
  'requiresManualSelection',
  'assignAllTeamMembers',
  'complete'
];
expect(validStatuses).toContain(status);
```

---

#### 2. POST /api/tasks/{taskId}/reassign-duty

Reassign task to different member.

**Test Cases**:
- ✅ Valid reassignment (200)
- ✅ With reason (200)
- ✅ Invalid userId (404)
- ✅ User doesn't have duty (400)
- ✅ Non-Team Manager (403)

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const result = await response.json();
expect(result).toHaveProperty('taskId');
expect(result).toHaveProperty('reassignedFrom');
expect(result).toHaveProperty('reassignedTo');
expect(result).toHaveProperty('reason');
```

---

#### 3. GET /api/tasks/{taskId}/duty-history

Get task's duty assignment history.

**Test Cases**:
- ✅ List full history (200)
- ✅ Chronological order (200)
- ✅ Includes completion times (200)
- ✅ Invalid taskId (404)
- ✅ Empty history (200, [])

**Response Validation**:
```typescript
expect(response.status).toBe(200);
const history = await response.json();
expect(Array.isArray(history)).toBe(true);
history.forEach(h => {
  expect(h).toHaveProperty('dutyName');
  expect(h).toHaveProperty('assignedToUserId');
  expect(h).toHaveProperty('assignedAt');
});
```

---

## Running Contract Tests

### Run All Contracts

```bash
npm run test:contract -- duties-assignment
npm run test:contract -- compliance-validation
npm run test:contract -- task-routing
```

### Run All at Once

```bash
npm run test:contract
```

### Run Specific Test

```bash
npm run test:contract -- duties-assignment --grep "should return 201"
```

### With Coverage

```bash
npm run test:contract -- --coverage
```

---

## Common Patterns

### Status Code Assertions

```typescript
// Success
expect(response.status).toBe(200);  // GET
expect(response.status).toBe(201);  // POST create
expect(response.status).toBe(204);  // DELETE

// Client errors
expect(response.status).toBe(400);  // Bad request
expect(response.status).toBe(403);  // Forbidden
expect(response.status).toBe(404);  // Not found
expect(response.status).toBe(409);  // Conflict

// Server errors (should NOT happen for client mistakes)
expect(response.status).toBeLessThan(500);
```

### Response Shape Validation

```typescript
const body = await response.json();

// Has error details
expect(body).toHaveProperty('error');
expect(body).toHaveProperty('message');
expect(body).toHaveProperty('statusCode');

// Has business data
expect(body).toHaveProperty('dutyAssignment');
expect(body.dutyAssignment).toHaveProperty('assignmentId');
```

### Setup/Teardown Pattern

```typescript
beforeAll(async () => {
  // Create minimal test data needed for this contract
  project = await createProject();
  user = await addUserToProject(project.id);
});

afterAll(async () => {
  // Always clean up, even if tests fail
  await deleteProject(project.id);
});
```

---

## Success Criteria

All contract tests must pass:

- ✅ All endpoints return correct status codes
- ✅ All response bodies match specification
- ✅ All error responses are formatted correctly
- ✅ No 500 errors for client mistakes
- ✅ Types are validated correctly

---

## Troubleshooting

### Test Fails with 404

**Cause**: Test data setup failed or endpoint doesn't exist

**Fix**:
- Check beforeAll() created data
- Verify endpoint path is correct
- Check API is running

### Test Fails with 500

**Cause**: Server error (unexpected, not client error)

**Fix**:
- Check server logs
- Verify test data is valid
- Check database is accessible

### Flaky Tests

**Cause**: Tests passing/failing randomly

**Fix**:
- Add explicit waits (async/await)
- Verify cleanup happens
- Check for concurrent test issues

---

## Adding New Contracts

When adding a new API endpoint:

1. **Create test file**: `my-feature.contract.test.ts`
2. **Test happy path**: Success case (201/200)
3. **Test error cases**: 400/403/404/409 errors
4. **Validate response**: Check structure matches OpenAPI spec
5. **Add to CI**: Update test command

Example:

```typescript
describe('POST /api/my-feature', () => {
  it('should return 201 on valid input', async () => {
    const response = await fetch('/api/my-feature', {
      method: 'POST',
      body: JSON.stringify({ /* valid input */ })
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
  });

  it('should return 400 on missing required field', async () => {
    const response = await fetch('/api/my-feature', {
      method: 'POST',
      body: JSON.stringify({ /* missing required field */ })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });
});
```

---

**Implemented by Phase 3 (Unit & Integration Tests) - T013-T020**
**Documented by Phase 11 (Documentation) - T114**
