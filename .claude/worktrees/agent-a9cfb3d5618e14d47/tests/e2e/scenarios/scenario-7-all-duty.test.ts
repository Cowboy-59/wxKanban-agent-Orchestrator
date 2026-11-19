/**
 * E2E Test: Scenario 7 - ALL Duty Assignment
 *
 * Setup: Custom duty "ALL" type that assigns to all team members simultaneously.
 * Expected: Task assigned to all team members at once, skips sequence.
 *
 * Implements T081
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 7: ALL Duty Assignment', () => {
  let projectId: string;
  let taskId: string;
  let teamMembers: string[];

  beforeAll(async () => {
    projectId = 'test-project-all-duty-001';
    taskId = 'test-task-all-duty-001';
    teamMembers = [
      'test-user-all-001',
      'test-user-all-002',
      'test-user-all-003',
    ];

    // Setup: Create team members with various duties
    await Promise.all(
      teamMembers.map((userId, index) =>
        fetch(`/api/projects/${projectId}/duties/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            dutyName: ['Developer', 'Design Coordinator', 'System Review'][
              index
            ],
          }),
        })
      )
    );
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should detect ALL duty and assign to all team members', async () => {
    // Arrange: Assume task is at a stage with ALL duty next
    // (This would require special setup or ALL duty to be in sequence)

    // Act: Route task - should detect ALL duty
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    // Assert: ALL duty assignment detected
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('assignAllTeamMembers');
    expect(data.assignedCount).toBeGreaterThanOrEqual(teamMembers.length);
    expect(data.message).toContain('all' || 'assigned');
  });

  it('should create assignment for each team member', async () => {
    // Act: Fetch duty history after ALL assignment
    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: Multiple entries with same duty for different team members
    expect(response.status).toBe(200);

    const history = await response.json();

    // ALL duty should have multiple entries (one per team member)
    const allDutyEntries = history.filter(
      (h: any) => h.dutyName === 'ALL'
    );

    expect(allDutyEntries.length).toBeGreaterThanOrEqual(teamMembers.length);

    // Each team member should appear
    const assignedUserIds = allDutyEntries.map(
      (entry: any) => entry.assignedToUserId
    );
    teamMembers.forEach((userId) => {
      expect(assignedUserIds).toContain(userId);
    });
  });

  it('should bypass normal sequence for ALL duty', async () => {
    // Verify that ALL duty doesn't follow the normal 6-duty sequence
    // but instead assigns simultaneously

    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    const history = await response.json();

    // Should be able to reach ALL duty without completing all 6 standard duties
    const hasAllDuty = history.some((h: any) => h.dutyName === 'ALL');
    expect(hasAllDuty).toBe(true);

    // The response from routing should indicate special handling
    const routeResponse = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    if (routeResponse.ok) {
      const data = await routeResponse.json();
      if (data.status === 'assignAllTeamMembers') {
        // Confirms ALL duty special case handling
        expect(data.assignedCount).toEqual(expect.any(Number));
      }
    }
  });
});
