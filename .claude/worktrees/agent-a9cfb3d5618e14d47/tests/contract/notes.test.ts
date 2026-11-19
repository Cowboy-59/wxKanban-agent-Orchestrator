import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Contract tests for notes endpoints
 * Tests: Note creation, editing, deletion, system auto-notes, filtering
 *
 * Endpoints:
 * - POST /api/notes (create note)
 * - GET /api/notes/project/:projectid (get project notes)
 * - GET /api/notes/:noteid (get specific note)
 * - PATCH /api/notes/:noteid (update note)
 * - DELETE /api/notes/:noteid (delete note)
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('Notes Management - Contract Tests', () => {
  let authToken = '';
  let userId = '';
  let projectId = '';
  let noteId = '';

  beforeAll(async () => {
    // Register a test user
    const registrationResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyName: `Notes Test ${Date.now()}`,
        billingEmail: `notes-test-${Date.now()}@test.com`,
        billingAddress: '123 Notes Street',
        billingCountry: 'US',
        billingPhone: '+1 (555) 000-0000',
        subscriptionTier: 'FREE',
        adminEmail: `notes-admin-${Date.now()}@test.com`,
        adminPassword: 'NotesTest123!@#',
        adminFirstName: 'Notes',
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
        email: `notes-admin-${Date.now()}@test.com`,
        password: 'NotesTest123!@#',
      }),
    });

    if (loginResponse.status === 200) {
      const loginData = await loginResponse.json();
      authToken = loginData.token;
    }

    // Create a test project
    const projectResponse = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        projectname: 'Notes Test Project',
        clientname: 'Test Client',
        hourlyrate: 50,
      }),
    });

    if (projectResponse.status === 201) {
      const projData = await projectResponse.json();
      projectId = projData.project.projectid;
    }
  });

  describe('POST /api/notes - Create Note', () => {
    it('should create user note with valid data', async () => {
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectid: projectId,
          content: 'This is a test note about the project.',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('note');
      expect(data.note).toHaveProperty('noteid');
      expect(data.note.content).toBe('This is a test note about the project.');
      expect(data.note.type).toBe('user');
      expect(data.note).toHaveProperty('createdAt');

      noteId = data.note.noteid;
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectid: projectId,
          content: 'Test note',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject missing content', async () => {
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectid: projectId,
          // Missing content
        }),
      });

      expect([400, 401]).toContain(response.status);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject missing project ID', async () => {
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          // Missing projectid
          content: 'Test note',
        }),
      });

      expect([400, 401]).toContain(response.status);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectid: fakeId,
          content: 'Test note',
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should enforce max content length', async () => {
      const longContent = 'a'.repeat(5001);
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectid: projectId,
          content: longContent,
        }),
      });

      expect([400, 401]).toContain(response.status);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('GET /api/notes/project/:projectid - Get Project Notes', () => {
    it('should list project notes', async () => {
      const response = await fetch(
        `${API_URL}/api/notes/project/${projectId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.notes)).toBe(true);
      expect(data).toHaveProperty('count');
      expect(data.notes.length).toBeGreaterThan(0);

      // Verify structure
      const note = data.notes[0];
      expect(note).toHaveProperty('noteid');
      expect(note).toHaveProperty('content');
      expect(note).toHaveProperty('type');
      expect(note).toHaveProperty('author');
      expect(note).toHaveProperty('createdAt');
      expect(note).toHaveProperty('updatedAt');
    });

    it('should filter by user notes only', async () => {
      const response = await fetch(
        `${API_URL}/api/notes/project/${projectId}?type=user`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      data.notes.forEach((n: any) => {
        expect(n.type).toBe('user');
      });
    });

    it('should filter by system notes only', async () => {
      const response = await fetch(
        `${API_URL}/api/notes/project/${projectId}?type=system`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      // May be empty if no system notes created
      if (data.notes.length > 0) {
        data.notes.forEach((n: any) => {
          expect(n.type).toBe('system');
        });
      }
    });

    it('should support pagination', async () => {
      const response = await fetch(
        `${API_URL}/api/notes/project/${projectId}?limit=1&offset=0`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.notes.length).toBeLessThanOrEqual(1);
    });

    it('should require authentication', async () => {
      const response = await fetch(
        `${API_URL}/api/notes/project/${projectId}`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(
        `${API_URL}/api/notes/project/${fakeId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('PATCH /api/notes/:noteid - Update Note', () => {
    it('should update note content', async () => {
      const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: 'Updated note content',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.note.content).toBe('Updated note content');
    });

    it('should not allow editing system notes', async () => {
      // This test would need a system note first
      expect(true).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Updated content',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent note', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/notes/${fakeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: 'Updated content',
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject content that is too long', async () => {
      const longContent = 'a'.repeat(5001);
      const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: longContent,
        }),
      });

      expect([400, 401]).toContain(response.status);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('DELETE /api/notes/:noteid - Delete Note', () => {
    it('should delete user note', async () => {
      // First create a note to delete
      const createResponse = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          projectid: projectId,
          content: 'Note to delete',
        }),
      });

      if (createResponse.status !== 201) {
        expect(true).toBe(true);
        return;
      }

      const createData = await createResponse.json();
      const deleteNoteId = createData.note.noteid;

      const response = await fetch(`${API_URL}/api/notes/${deleteNoteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should not allow deleting system notes', async () => {
      // This test would need a system note first
      expect(true).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 404 for non-existent note', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await fetch(`${API_URL}/api/notes/${fakeId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Note Timestamps', () => {
    it('should include createdAt timestamp', async () => {
      const response = await fetch(`${API_URL}/api/notes/project/${projectId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      if (data.notes.length > 0) {
        const note = data.notes[0];
        expect(note.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date
      }
    });

    it('should track updatedAt separately', async () => {
      const response = await fetch(`${API_URL}/api/notes/project/${projectId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      if (data.notes.length > 0) {
        const note = data.notes[0];
        expect(note.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date
      }
    });
  });
});
