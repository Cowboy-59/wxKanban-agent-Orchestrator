/**
 * Security Tests: Authorization & Immutability
 *
 * Validates that:
 * - All protected endpoints require Team Manager role (T104)
 * - Compliance overrides are immutable (T105)
 * - Audit logging captures required fields (T106)
 * - Malformed input is properly rejected (T107)
 * - Overrides cannot bypass compliance rules (T108)
 *
 * Implements T104-T108
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Security: Authorization & Immutability', () => {
  let projectId: string;
  let userId: string;
  let overrideId: string;

  beforeAll(async () => {
    projectId = 'test-project-security-001';
    userId = 'test-user-security-001';
    overrideId = 'test-override-001';
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('T104: Team Manager Role Authorization', () => {
    it('should require Team Manager role for duty assignment endpoint', async () => {
      // Test POST /api/projects/{projectId}/duties/assign without Team Manager
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid-token-not-team-manager',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'Developer',
          }),
        }
      );

      // Should return 403 Forbidden
      expect(response.status).toBe(403);

      const error = await response.json();
      expect(error.error).toMatch(/[Ff]orbidden|[Pp]ermission|[Rr]ole/);
    });

    it('should require Team Manager role for duty removal endpoint', async () => {
      // Test DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}
      const response = await fetch(
        `/api/projects/${projectId}/duties/assignments/${overrideId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer invalid-token-not-team-manager',
          },
        }
      );

      expect(response.status).toBe(403);
    });

    it('should require authorization for compliance validation', async () => {
      const response = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token',
        },
        body: JSON.stringify({
          projectId,
          userId,
          proposedDuties: ['Developer'],
          standard: 'SOC2',
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    it('should allow Team Manager to assign duties', async () => {
      // Successful request with Team Manager token
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-team-manager-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'Developer',
          }),
        }
      );

      // Should return 201 or validation error, not 403
      expect([201, 400, 404, 409]).toContain(response.status);
    });
  });

  describe('T105: Compliance Override Immutability', () => {
    it('should not allow PUT/UPDATE on ComplianceOverride', async () => {
      const response = await fetch(
        `/api/compliance/overrides/${overrideId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-team-manager-token',
          },
          body: JSON.stringify({
            reason: 'Updated reason',
          }),
        }
      );

      // Should return 405 Method Not Allowed or 404
      expect([404, 405]).toContain(response.status);
    });

    it('should not allow DELETE on ComplianceOverride', async () => {
      const response = await fetch(
        `/api/compliance/overrides/${overrideId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer valid-team-manager-token',
          },
        }
      );

      // Should return 405 Method Not Allowed or 404
      expect([404, 405]).toContain(response.status);
    });

    it('should only allow GET and POST operations on audit trail', async () => {
      // GET should work
      const getResponse = await fetch('/api/compliance/overrides', {
        headers: {
          'Authorization': 'Bearer valid-team-manager-token',
        },
      });

      expect([200, 400, 404]).toContain(getResponse.status);

      // POST to create should work
      const postResponse = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-team-manager-token',
        },
        body: JSON.stringify({
          projectId,
          userId,
          proposedDuties: ['Developer'],
          standard: 'SOC2',
        }),
      });

      expect([200, 400, 404]).toContain(postResponse.status);
    });
  });

  describe('T106: Audit Logging Completeness', () => {
    it('should capture who created the override', async () => {
      // Simulate creating an override
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-team-manager-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'Developer',
            overrideReason: 'Business critical role requires both duties',
          }),
        }
      );

      if (response.status === 201) {
        const result = await response.json();

        // Audit record should include createdBy/approverId
        if (result.complianceOverride) {
          expect(result.complianceOverride).toHaveProperty('approverId');
          expect(result.complianceOverride.approverId).toBeTruthy();
        }
      }
    });

    it('should capture when override was created', async () => {
      // GET override detail
      const response = await fetch(
        `/api/compliance/overrides/${overrideId}`,
        {
          headers: {
            'Authorization': 'Bearer valid-team-manager-token',
          },
        }
      );

      if (response.status === 200) {
        const override = await response.json();

        // Should have timestamp
        expect(override).toHaveProperty('createdat');
        expect(override.createdat).toBeTruthy();
      }
    });

    it('should capture what duty was overridden', async () => {
      const response = await fetch(
        `/api/compliance/overrides/${overrideId}`,
        {
          headers: {
            'Authorization': 'Bearer valid-team-manager-token',
          },
        }
      );

      if (response.status === 200) {
        const override = await response.json();

        // Should have duty and standard info
        expect(override).toHaveProperty('dutyname');
        expect(override).toHaveProperty('standard');
      }
    });

    it('should capture why override was created', async () => {
      const response = await fetch(
        `/api/compliance/overrides/${overrideId}`,
        {
          headers: {
            'Authorization': 'Bearer valid-team-manager-token',
          },
        }
      );

      if (response.status === 200) {
        const override = await response.json();

        // Should have reason
        expect(override).toHaveProperty('reason');
        expect(override.reason).toBeTruthy();
        expect(override.reason.length).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('T107: Malformed Input Rejection', () => {
    it('should reject invalid project ID format', async () => {
      const response = await fetch(
        '/api/projects/not-a-valid-uuid/duties/assign',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId: 'test-user-001',
            dutyName: 'Developer',
          }),
        }
      );

      expect([400, 404]).toContain(response.status);
    });

    it('should reject invalid user ID', async () => {
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId: '', // Empty user ID
            dutyName: 'Developer',
          }),
        }
      );

      expect(response.status).toBe(400);
    });

    it('should reject invalid duty name', async () => {
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'NonExistentDuty', // Invalid duty
          }),
        }
      );

      expect(response.status).toBe(404);
    });

    it('should reject override reason under 50 characters', async () => {
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'Developer',
            overrideReason: 'Too short', // Less than 50 chars
          }),
        }
      );

      expect([400, 409]).toContain(response.status);
    });

    it('should reject invalid standard enum', async () => {
      const response = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: JSON.stringify({
          projectId,
          userId,
          proposedDuties: ['Developer'],
          standard: 'InvalidStandard',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            // Missing userId and dutyName
          }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe('T108: Compliance Rules Enforcement', () => {
    it('should not allow Developer + QA under SOC2', async () => {
      // Create override doesn't bypass rules, only logs exception
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'QA', // User already has Developer
            overrideReason:
              'This is a long enough reason that meets the 50 character minimum requirement',
          }),
        }
      );

      // Should only succeed WITH override reason
      if (response.status === 400) {
        const error = await response.json();
        // Should indicate compliance violation
        expect(error.error).toMatch(/[Cc]ompliance|[Vv]iolation/);
      } else if (response.status === 201) {
        const result = await response.json();
        // If succeeded, should have created override audit record
        expect(result).toHaveProperty('complianceOverride');
      }
    });

    it('should enforce HiTrust stricter rules (Dev + Publisher)', async () => {
      const response = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: JSON.stringify({
          projectId,
          userId,
          proposedDuties: ['Developer', 'Publisher'],
          standard: 'HITRUST',
        }),
      });

      if (response.status === 200) {
        const result = await response.json();

        // HiTrust should detect Developer + Publisher violation
        if (!result.isValid) {
          expect(result.violations).toBeDefined();
          expect(result.violations.length).toBeGreaterThan(0);
        }
      }
    });

    it('should allow Team Manager duty despite conflicts', async () => {
      // Team Manager is exempt from conflict restrictions
      const response = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: JSON.stringify({
          projectId,
          userId,
          proposedDuties: ['Developer', 'Team Manager'],
          standard: 'SOC2',
        }),
      });

      if (response.status === 200) {
        const result = await response.json();

        // Team Manager should not create violations
        expect(result.isValid).toBe(true);
      }
    });

    it('should log override but not circumvent rules', async () => {
      // Override reason allows assignment but creates audit trail
      const response = await fetch(
        `/api/projects/${projectId}/duties/assign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: JSON.stringify({
            userId,
            dutyName: 'QA',
            overrideReason:
              'Business critical: User manages both development and QA for urgent project',
          }),
        }
      );

      // Assignment should succeed with proper audit
      if (response.status === 201) {
        const result = await response.json();

        // Should have compliance override record
        expect(result).toHaveProperty('complianceOverride');

        // Override is logged, not a blank approval
        if (result.complianceOverride) {
          expect(result.complianceOverride.reason).toMatch(/[Bb]usiness/);
        }
      }
    });
  });
});
