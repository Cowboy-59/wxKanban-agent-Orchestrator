/**
 * E2E Test: Scenario 2 - SOC 2 Compliance Violation
 *
 * Setup: Team member has Developer duty, attempt to assign System Review (conflict).
 * Expected: Compliance violation detected, override reason required.
 *
 * Implements T076
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 2: SOC 2 Compliance Violation', () => {
  let projectId: string;
  let teamMemberId: string;
  let devAssignmentId: string;

  beforeAll(async () => {
    projectId = 'test-project-002';
    teamMemberId = 'test-user-002';
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should detect SOC 2 violation when assigning conflicting duties', async () => {
    // Arrange: Verify Developer duty is assigned
    // (prerequisite from scenario 1)

    // Act: Validate assignment before committing
    const validateResponse = await fetch('/api/compliance/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        userId: teamMemberId,
        dutyNames: ['Developer', 'System Review'], // Developer + System Review = conflict
        securityStandard: 'SOC2',
      }),
    });

    // Assert: Violation detected
    expect(validateResponse.status).toBe(400);

    const validation = await validateResponse.json();
    expect(validation.isValid).toBe(false);
    expect(validation.violations.length).toBeGreaterThan(0);
    expect(validation.violations[0]).toMatchObject({
      ruleId: expect.any(String),
      reason: expect.stringContaining('cannot have both'),
      standard: 'SOC2',
      duties: expect.arrayContaining(['Developer', 'System Review']),
    });
  });

  it('should reject assignment without override reason', async () => {
    // Act: Attempt assignment without override reason
    const response = await fetch(
      `/api/projects/${projectId}/duties/assign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: teamMemberId,
          dutyName: 'System Review',
          // No overrideReason provided
        }),
      }
    );

    // Assert: Assignment rejected with 400 Bad Request
    expect(response.status).toBe(400);

    const error = await response.json();
    expect(error.error).toContain(
      'Override reason required' || 'violates'
    );
  });

  it('should accept assignment with valid override reason', async () => {
    const overrideReason =
      'Temporary assignment due to resource constraints. Security review approved by compliance team.';

    // Act: Attempt assignment with override reason
    const response = await fetch(
      `/api/projects/${projectId}/duties/assign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: teamMemberId,
          dutyName: 'System Review',
          overrideReason,
        }),
      }
    );

    // Assert: Assignment succeeds with 201
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.dutyAssignmentId).toBeDefined();

    // Assert: Compliance override recorded
    expect(data.complianceOverride).toBeDefined();
    expect(data.complianceOverride.violatedRules.length).toBeGreaterThan(0);
    expect(data.complianceOverride.reason).toBe(overrideReason);
  });

  it('should create immutable audit log entry', async () => {
    // Act: Query compliance overrides
    const response = await fetch(
      `/api/compliance/overrides?projectId=${projectId}&standard=SOC2`
    );

    // Assert: Override appears in audit trail
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.items.length).toBeGreaterThan(0);

    const override = data.items.find(
      (item: any) => item.userId === teamMemberId
    );
    expect(override).toBeDefined();
    expect(override.standard).toBe('SOC2');
    expect(override.violatedRules.length).toBeGreaterThan(0);
  });

  it('should prevent override modification (immutable audit trail)', async () => {
    // Get the override ID first
    const listResponse = await fetch(
      `/api/compliance/overrides?projectId=${projectId}`
    );
    const data = await listResponse.json();
    const overrideId = data.items[0].complianceOverrideId;

    // Act: Attempt to modify override (should fail - no PUT endpoint)
    const modifyResponse = await fetch(
      `/api/compliance/overrides/${overrideId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Modified reason' }),
      }
    );

    // Assert: PUT not allowed (405 Method Not Allowed)
    expect(modifyResponse.status).toBe(405);
  });
});
