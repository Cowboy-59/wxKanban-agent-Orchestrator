/**
 * E2E Test: Scenario 5 - Manual Task Routing
 *
 * Setup: Task at Design Coordinator, multiple people have System Review duty.
 * Expected: Returns list of candidates, requires manual selection.
 *
 * Implements T079
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 5: Manual Task Routing', () => {
  let projectId: string;
  let taskId: string;
  let systemReviewUser1: string;
  let systemReviewUser2: string;

  beforeAll(async () => {
    projectId = 'test-project-manual-001';
    taskId = 'test-task-manual-001';
    systemReviewUser1 = 'test-user-sr-001';
    systemReviewUser2 = 'test-user-sr-002';

    // Setup: Assign System Review to multiple people
    await Promise.all([
      fetch(`/api/projects/${projectId}/duties/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: systemReviewUser1,
          dutyName: 'System Review',
        }),
      }),
      fetch(`/api/projects/${projectId}/duties/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: systemReviewUser2,
          dutyName: 'System Review',
        }),
      }),
    ]);
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should return list of candidates when multiple team members have next duty', async () => {
    // Act: Route task without specifying assignee
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    // Assert: Manual selection required
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('requiresManualSelection');
    expect(data.nextDuty).toBe('System Review');
    expect(data.availableTeamMembers).toBeDefined();
    expect(data.availableTeamMembers.length).toBeGreaterThanOrEqual(2);
  });

  it('should include candidate details in response', async () => {
    // Act: Get routing options
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json();
    const candidates = data.availableTeamMembers;

    // Assert: Each candidate has required fields
    candidates.forEach((member: any) => {
      expect(member).toMatchObject({
        userId: expect.any(String),
        userName: expect.any(String),
        dutyName: 'System Review',
      });
    });
  });

  it('should accept manual selection and assign to chosen member', async () => {
    // Arrange: Get candidates first
    const listResponse = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    const listData = await listResponse.json();
    const selectedUserId = listData.availableTeamMembers[0].userId;

    // Act: Submit with manual selection
    const assignResponse = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualAssigneeId: selectedUserId,
        }),
      }
    );

    // Assert: Assignment succeeds
    expect(assignResponse.status).toBe(200);

    const assignData = await assignResponse.json();
    expect(assignData.status).toBe('autoAssigned'); // Now assigned (was manual selection)
    expect(assignData.assignedToUserId).toBe(selectedUserId);
  });

  it('should record manual assignment in history', async () => {
    // Act: Check duty history
    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: Manual assignment recorded
    expect(response.status).toBe(200);

    const history = await response.json();
    const srEntry = history.find((h: any) => h.dutyName === 'System Review');
    expect(srEntry).toBeDefined();
    expect(srEntry.assignedToUserId).toEqual(expect.any(String));
  });
});
