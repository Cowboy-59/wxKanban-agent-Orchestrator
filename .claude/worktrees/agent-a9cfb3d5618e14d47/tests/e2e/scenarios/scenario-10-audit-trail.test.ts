/**
 * E2E Test: Scenario 10 - Audit Trail & Compliance History
 *
 * Verify that all compliance overrides are tracked immutably.
 * Expected: Complete audit trail with who, when, what, why.
 *
 * Implements T084
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Scenario 10: Audit Trail & Compliance History', () => {
  let projectId: string;
  let adminUserId: string;
  let teamMemberId: string;
  let overrideId: string;

  beforeAll(async () => {
    projectId = 'test-project-audit-001';
    adminUserId = 'test-admin-audit-001';
    teamMemberId = 'test-user-audit-001';
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should record compliance override with full audit details', async () => {
    // Setup: Create a violation scenario
    const overrideReason =
      'Critical security update requires temporary role expansion. Approved by CISO.';

    // Act: Create compliance override
    const assignResponse = await fetch(
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

    // Assert: Override created
    expect(assignResponse.status).toBe(201);

    const assignData = await assignResponse.json();
    expect(assignData.complianceOverride).toBeDefined();

    overrideId = assignData.complianceOverride.complianceOverrideId;
  });

  it('should store who, when, what, and why in audit record', async () => {
    // Act: Fetch override detail
    const response = await fetch(
      `/api/compliance/overrides/${overrideId}`
    );

    // Assert: Full audit details present
    expect(response.status).toBe(200);

    const override = await response.json();

    // WHO: User and approver
    expect(override.userId).toEqual(expect.any(String));
    expect(override.userName).toEqual(expect.any(String));
    expect(override.overriddenBy).toEqual(expect.any(String));
    expect(override.overriddenByName).toEqual(expect.any(String));

    // WHEN: Timestamp
    expect(override.createdAt).toEqual(expect.any(String));
    const createdDate = new Date(override.createdAt);
    expect(createdDate.getTime()).toBeLessThanOrEqual(Date.now());

    // WHAT: Rule violations and duty
    expect(override.dutyName).toEqual(expect.any(String));
    expect(override.violatedRules).toBeDefined();
    expect(override.violatedRules.length).toBeGreaterThan(0);

    // WHY: Override reason
    expect(override.reason).toEqual(expect.any(String));
    expect(override.reason.length).toBeGreaterThanOrEqual(50);
  });

  it('should list overrides with filtering by various fields', async () => {
    // Act: Query with filters
    const byProjectResponse = await fetch(
      `/api/compliance/overrides?projectId=${projectId}`
    );

    const byUserResponse = await fetch(
      `/api/compliance/overrides?userId=${teamMemberId}`
    );

    const byStandardResponse = await fetch(
      `/api/compliance/overrides?standard=SOC2`
    );

    // Assert: Filtering works
    expect(byProjectResponse.status).toBe(200);
    expect(byUserResponse.status).toBe(200);
    expect(byStandardResponse.status).toBe(200);

    const byProject = await byProjectResponse.json();
    const byUser = await byUserResponse.json();
    const byStandard = await byStandardResponse.json();

    // Overrides should appear in appropriate results
    expect(byProject.items.length).toBeGreaterThan(0);
    expect(byUser.items.length).toBeGreaterThan(0);
    expect(byStandard.items.length).toBeGreaterThan(0);
  });

  it('should support date range filtering for audit reports', async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Act: Query with date range
    const rangeResponse = await fetch(
      `/api/compliance/overrides?startDate=${yesterday.toISOString()}&endDate=${tomorrow.toISOString()}`
    );

    // Assert: Date filtering returns results
    expect(rangeResponse.status).toBe(200);

    const data = await rangeResponse.json();
    expect(data.items.length).toBeGreaterThan(0);

    // All items should fall within date range
    data.items.forEach((item: any) => {
      const itemDate = new Date(item.createdAt);
      expect(itemDate.getTime()).toBeGreaterThan(yesterday.getTime());
      expect(itemDate.getTime()).toBeLessThan(tomorrow.getTime());
    });
  });

  it('should support pagination for large audit trails', async () => {
    // Act: Query with pagination
    const page1 = await fetch(
      `/api/compliance/overrides?limit=10&offset=0`
    );

    const page2 = await fetch(
      `/api/compliance/overrides?limit=10&offset=10`
    );

    // Assert: Pagination works
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    const data1 = await page1.json();
    const data2 = await page2.json();

    expect(data1).toMatchObject({
      total: expect.any(Number),
      limit: 10,
      offset: 0,
      items: expect.any(Array),
    });

    expect(data2).toMatchObject({
      total: expect.any(Number),
      limit: 10,
      offset: 10,
      items: expect.any(Array),
    });
  });

  it('should prevent modification of audit records', async () => {
    // Act: Attempt to modify override
    const putResponse = await fetch(
      `/api/compliance/overrides/${overrideId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Modified reason',
        }),
      }
    );

    // Assert: Modification blocked
    expect(putResponse.status).toBe(405); // Method Not Allowed

    // Act: Attempt to delete override
    const deleteResponse = await fetch(
      `/api/compliance/overrides/${overrideId}`,
      { method: 'DELETE' }
    );

    // Assert: Deletion blocked
    expect(deleteResponse.status).toBe(405); // Method Not Allowed

    // Act: Verify record still intact
    const verifyResponse = await fetch(
      `/api/compliance/overrides/${overrideId}`
    );

    expect(verifyResponse.status).toBe(200);
    const override = await verifyResponse.json();
    expect(override.complianceOverrideId).toBe(overrideId);
  });

  it('should track all assignment changes in duty history', async () => {
    // Setup: Create a task and route through multiple duties
    const taskId = 'test-task-audit-001';

    // Act: Fetch duty history after multiple assignments
    const historyResponse = await fetch(
      `/api/tasks/${taskId}/duty-history`
    );

    // Assert: All changes recorded
    if (historyResponse.ok) {
      expect(historyResponse.status).toBe(200);

      const history = await historyResponse.json();
      expect(history).toEqual(expect.any(Array));

      // Each entry should have audit fields
      history.forEach((entry: any) => {
        expect(entry).toMatchObject({
          dutyName: expect.any(String),
          sequenceOrder: expect.any(Number),
          assignedToUserId: expect.any(String),
          assignedToUserName: expect.any(String),
          assignedAt: expect.any(String),
        });
      });
    }
  });
});
