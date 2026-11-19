/**
 * E2E Test: Scenario 4 - Auto Task Routing
 *
 * Setup: Task at Developer stage, exactly one person has Design Coordinator duty.
 * Expected: Auto-routes to that person without manual selection.
 *
 * Implements T078
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 4: Auto Task Routing', () => {
  let projectId: string;
  let taskId: string;
  let designCoordinatorId: string;

  beforeAll(async () => {
    projectId = 'test-project-routing-001';
    taskId = 'test-task-001';
    designCoordinatorId = 'test-user-dc-001';

    // Setup: Assign Design Coordinator to exactly one person
    await fetch(`/api/projects/${projectId}/duties/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: designCoordinatorId,
        dutyName: 'Design Coordinator',
      }),
    });
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should auto-route task when only one team member has next duty', async () => {
    // Act: Route task to next duty (Developer -> Design Coordinator)
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No manualAssigneeId - should auto-assign
        }),
      }
    );

    // Assert: Route succeeds with auto-assignment
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('autoAssigned');
    expect(data.taskId).toBe(taskId);
    expect(data.nextDuty).toBe('Design Coordinator');
    expect(data.assignedToUserId).toBe(designCoordinatorId);
    expect(data.message).toContain('Assigned');
  });

  it('should log assignment in duty history', async () => {
    // Act: Fetch task duty history
    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: Both Developer and Design Coordinator appear
    expect(response.status).toBe(200);

    const history = await response.json();
    expect(history.length).toBeGreaterThanOrEqual(2);

    const dcEntry = history.find(
      (h: any) => h.dutyName === 'Design Coordinator'
    );
    expect(dcEntry).toBeDefined();
    expect(dcEntry.assignedToUserId).toBe(designCoordinatorId);
    expect(dcEntry.assignedAt).toEqual(expect.any(String));
  });

  it('should not require manual selection on auto-route', async () => {
    // Verify the response does NOT include availableTeamMembers
    // (indicates manual selection NOT needed)

    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json();
    expect(data.availableTeamMembers).toBeUndefined();
    expect(data.status).toBe('autoAssigned');
  });
});
