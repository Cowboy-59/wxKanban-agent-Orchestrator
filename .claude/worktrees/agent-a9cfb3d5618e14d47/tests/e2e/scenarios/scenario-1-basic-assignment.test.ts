/**
 * E2E Test: Scenario 1 - Basic Duty Assignment
 *
 * Happy path: Team Manager assigns duty to team member without violations.
 * Expected: Assignment succeeds immediately, no override needed.
 *
 * Implements T075
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 1: Basic Duty Assignment', () => {
  let projectId: string;
  let teamMemberId: string;

  beforeAll(async () => {
    // Setup: Create test project and team member
    // These would use API calls to create test data
    projectId = 'test-project-001';
    teamMemberId = 'test-user-001';
  });

  afterAll(async () => {
    // Cleanup: Remove test data
  });

  it('should assign duty without compliance violations', async () => {
    // Arrange: Project has only Developer assigned (no conflicts)
    const dutyToAssign = 'Design Coordinator';

    // Act: Assign duty to team member
    const response = await fetch(
      `/api/projects/${projectId}/duties/assign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: teamMemberId,
          dutyName: dutyToAssign,
        }),
      }
    );

    // Assert: Assignment succeeds with 201 Created
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data).toMatchObject({
      dutyAssignmentId: expect.any(String),
      userId: teamMemberId,
      dutyName: dutyToAssign,
      projectId,
      assignedAt: expect.any(String),
    });

    // Assert: No compliance override created
    expect(data.complianceOverride).toBeUndefined();
  });

  it('should be queryable in assignments list', async () => {
    // Act: Fetch assignments for the project
    const response = await fetch(
      `/api/projects/${projectId}/duties/assignments`
    );

    // Assert: Assignment appears in list
    expect(response.status).toBe(200);

    const assignments = await response.json();
    const assignment = assignments.find(
      (a: any) =>
        a.userId === teamMemberId && a.dutyName === 'Design Coordinator'
    );

    expect(assignment).toBeDefined();
    expect(assignment.userName).toEqual(expect.any(String));
    expect(assignment.assignedAt).toEqual(expect.any(String));
  });

  it('should be removable by Team Manager', async () => {
    // Arrange: Get the assignment ID from list
    const listResponse = await fetch(
      `/api/projects/${projectId}/duties/assignments`
    );
    const assignments = await response.json();
    const assignment = assignments.find(
      (a: any) =>
        a.userId === teamMemberId && a.dutyName === 'Design Coordinator'
    );

    // Act: Remove assignment
    const removeResponse = await fetch(
      `/api/projects/${projectId}/duties/assignments/${assignment.dutyAssignmentId}`,
      { method: 'DELETE' }
    );

    // Assert: Removal succeeds with 204 No Content
    expect(removeResponse.status).toBe(204);

    // Assert: Assignment no longer in list
    const verifyResponse = await fetch(
      `/api/projects/${projectId}/duties/assignments?userId=${teamMemberId}`
    );
    const updatedAssignments = await verifyResponse.json();
    const removed = updatedAssignments.find(
      (a: any) => a.dutyName === 'Design Coordinator'
    );
    expect(removed).toBeUndefined();
  });
});
