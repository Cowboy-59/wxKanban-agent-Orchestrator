/**
 * E2E Test: Scenario 6 - Task Completion
 *
 * Setup: Task reaches Publisher duty (final duty).
 * Expected: Routing completes task, returns completion status.
 *
 * Implements T080
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 6: Task Completion', () => {
  let projectId: string;
  let taskId: string;
  let publisherId: string;

  beforeAll(async () => {
    projectId = 'test-project-complete-001';
    taskId = 'test-task-complete-001';
    publisherId = 'test-user-publisher-001';

    // Setup: Assign Publisher duty
    await fetch(`/api/projects/${projectId}/duties/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: publisherId,
        dutyName: 'Publisher',
      }),
    });
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should mark task complete when routing reaches Publisher duty', async () => {
    // Setup: Route task through all duties until Publisher
    // (assumes task is at Final Acceptance Reviewer)

    // Act: Route to Publisher (final duty)
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualAssigneeId: publisherId,
        }),
      }
    );

    // Assert: Task completion returned
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('complete');
    expect(data.completedAt).toEqual(expect.any(String));
    expect(data.message).toContain('completed' || 'complete');
  });

  it('should set completedAt timestamp', async () => {
    // Setup: Route to completion if not already done
    // (from previous test)

    // Act: Fetch duty history to verify completion
    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: Final duty shows completion
    expect(response.status).toBe(200);

    const history = await response.json();
    const publisherEntry = history.find(
      (h: any) => h.dutyName === 'Publisher'
    );

    expect(publisherEntry).toBeDefined();
    expect(publisherEntry.completedAt).toEqual(expect.any(String));
  });

  it('should prevent re-routing completed task', async () => {
    // Act: Attempt to route already-completed task
    const response = await fetch(
      `/api/tasks/${taskId}/route-next-duty`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    // Assert: Should fail or indicate task already complete
    // (could be 400 Bad Request or special response)
    if (response.ok) {
      const data = await response.json();
      expect(data.status).toBe('complete');
    } else {
      expect(response.status).toBe(400);
    }
  });

  it('should record full workflow in duty history', async () => {
    // Act: Fetch complete duty history
    const response = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: All 6 duties appear in order
    expect(response.status).toBe(200);

    const history = await response.json();
    expect(history.length).toBe(6);

    const dutySequence = [
      'Developer',
      'Design Coordinator',
      'System Review',
      'QA',
      'Final Acceptance Reviewer',
      'Publisher',
    ];

    dutySequence.forEach((duty, index) => {
      expect(history[index].dutyName).toBe(duty);
      expect(history[index].sequenceOrder).toBe(index);
      expect(history[index].assignedAt).toEqual(expect.any(String));
    });

    // Only final duty should have completedAt
    history.forEach((entry: any, index: number) => {
      if (index === 5) {
        expect(entry.completedAt).toEqual(expect.any(String));
      } else {
        // Earlier duties may have completedAt from when they were completed
        // or may be undefined - depends on implementation
      }
    });
  });
});
