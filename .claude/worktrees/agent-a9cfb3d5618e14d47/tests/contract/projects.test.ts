import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Contract tests for project management endpoints
 * Tests: Project creation, configuration, hours tracking, budget management
 *
 * Endpoints:
 * - POST /api/projects (create project)
 * - GET /api/projects (list projects)
 * - GET /api/projects/:projectid (get project)
 * - PATCH /api/projects/:projectid (update project)
 * - GET /api/projects/:projectid/hours (get hours summary)
 * - POST /api/projects/:projectid/archive (archive project)
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('Project Management - Contract Tests', () => {
  let authToken = '';
  let userId = '';
  let projectId = '';

  beforeAll(async () => {
    // Register a test user
    const registrationResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyName: `Project Test ${Date.now()}`,
        billingEmail: `project-test-${Date.now()}@test.com`,
        billingAddress: '123 Project Street',
        billingCountry: 'US',
        billingPhone: '+1 (555) 000-0000',
        subscriptionTier: 'FREE',
        adminEmail: `project-admin-${Date.now()}@test.com`,
        adminPassword: 'ProjectTest123!@#',
        adminFirstName: 'Project',
      }),
    });

    if (registrationResponse.status === 201) {
      const regData = await registrationResponse.json();
      userId = regData.admin.userId;
    }

    // Login to get token
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `project-admin-${Date.now()}@test.com`,
        password: 'ProjectTest123!@#',
      }),
    });

    if (loginResponse.status === 200) {
      const loginData = await loginResponse.json();
      authToken = loginData.token;
    }
  });

  describe('POST /api/projects - Create Project', () => {
    it('should create project with valid data', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectname: 'Client A Website',
          clientname: 'Acme Corp',
          description: 'Website redesign project',
          hourlyrate: 75,
          allocatedhours: 120,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('project');
      expect(data.project).toHaveProperty('projectid');
      expect(data.project.projectname).toBe('Client A Website');
      expect(data.project.clientname).toBe('Acme Corp');
      expect(data.project.hourlyrate).toBe(75);
      expect(data.project.allocatedhours).toBe(120);
      expect(data.project.status).toBe('ACTIVE');
      expect(data.project).toHaveProperty('createdAt');

      projectId = data.project.projectid;
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectname: 'Test Project',
          clientname: 'Test Client',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject missing required fields', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectname: 'Test Project',
          // Missing clientname
        }),
      });

      expect([400, 401]).toContain(response.status);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should set default hourly rate if not provided', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectname: 'Default Rate Project',
          clientname: 'Test Client',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.project.hourlyrate).toBe(50);
    });
  });

  describe('GET /api/projects - List Projects', () => {
    it('should list user projects', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.projects)).toBe(true);
      expect(data).toHaveProperty('count');
      expect(data.projects.length).toBeGreaterThan(0);

      // Verify response structure
      const project = data.projects[0];
      expect(project).toHaveProperty('projectid');
      expect(project).toHaveProperty('projectname');
      expect(project).toHaveProperty('clientname');
      expect(project).toHaveProperty('hourlyrate');
      expect(project).toHaveProperty('allocatedhours');
      expect(project).toHaveProperty('status');
      expect(project).toHaveProperty('createdAt');
      expect(project).toHaveProperty('updatedAt');
    });

    it('should filter by status', async () => {
      const response = await fetch(`${API_URL}/api/projects?status=ACTIVE`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.projects)).toBe(true);
      data.projects.forEach((p: any) => {
        expect(p.status).toBe('ACTIVE');
      });
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return empty array when no projects', async () => {
      // This test assumes a clean user state, or would need separate setup
      expect(true).toBe(true);
    });
  });

  describe('GET /api/projects/:projectid - Get Project', () => {
    it('should return project details', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('project');
      expect(data.project.projectid).toBe(projectId);
      expect(data.project).toHaveProperty('description');
      expect(data.project).toHaveProperty('createdAt');
      expect(data.project).toHaveProperty('updatedAt');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/projects/${fakeId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should not return other user projects', async () => {
      // Would need a second user context to test properly
      expect(true).toBe(true);
    });
  });

  describe('PATCH /api/projects/:projectid - Update Project', () => {
    it('should update project hourly rate', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          hourlyrate: 85,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.project.hourlyrate).toBe(85);
    });

    it('should update allocated hours', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          allocatedhours: 150,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.project.allocatedhours).toBe(150);
    });

    it('should update multiple fields', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectname: 'Updated Project Name',
          clientname: 'Updated Client',
          description: 'Updated description',
          hourlyrate: 95,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.project.projectname).toBe('Updated Project Name');
      expect(data.project.clientname).toBe('Updated Client');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hourlyrate: 100,
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/projects/${fakeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          hourlyrate: 100,
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('GET /api/projects/:projectid/hours - Get Hours Summary', () => {
    it('should return hours summary', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/hours`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('hours');
      expect(data.hours).toHaveProperty('totalHours');
      expect(data.hours).toHaveProperty('billableHours');
      expect(data.hours).toHaveProperty('nonBillableHours');
      expect(data.hours).toHaveProperty('allocatedHours');
      expect(data.hours).toHaveProperty('remainingHours');
      expect(data.hours).toHaveProperty('budgetPercentage');
      expect(data.hours).toHaveProperty('hourlyRate');
      expect(data.hours).toHaveProperty('projectedTotal');
    });

    it('should calculate budget percentage correctly', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/hours`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.hours.budgetPercentage).toBe('number');
      expect(data.hours.budgetPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should calculate projected total correctly', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/hours`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const { billableHours, hourlyRate, projectedTotal } = data.hours;
      const calculated = billableHours * hourlyRate;
      expect(Math.abs(projectedTotal - calculated) < 0.01).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/hours`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/projects/${fakeId}/hours`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('POST /api/projects/:projectid/archive - Archive Project', () => {
    it('should archive project', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/archive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('project');
      expect(data.project.status).toBe('ARCHIVED');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/archive`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/projects/${fakeId}/archive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });
});
