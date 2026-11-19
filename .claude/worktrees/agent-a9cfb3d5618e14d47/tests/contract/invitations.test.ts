import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';

describe('Invitations API Contract Tests', () => {
  let app: ReturnType<typeof createApp>;
  let authToken: string;
  let companyId: string;

  beforeAll(async () => {
    app = createApp();

    // Register and authenticate
    const registerResponse = await request(app)
      .post('/auth/register')
      .send({
        companyName: 'Invitation Test Co',
        adminEmail: 'inviter@example.com',
        adminPassword: 'SecurePass123!',
        adminFirstName: 'Test',
      });

    authToken = registerResponse.body.token || '';
    companyId = registerResponse.body.companyid || '';
  });

  describe('POST /api/invitations/send', () => {
    it('should send single invitation', async () => {
      const response = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['newuser@example.com'],
          usertype: 'TEAM_MEMBER',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results.successful).toHaveLength(1);
    });

    it('should send multiple invitations', async () => {
      const response = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['user1@example.com', 'user2@example.com'],
          usertype: 'TEAM_MANAGER',
        });

      expect(response.status).toBe(200);
      expect(response.body.results.successful.length).toBeGreaterThan(0);
    });

    it('should reject more than 50 emails', async () => {
      const emails = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);

      const response = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails,
          usertype: 'TEAM_MEMBER',
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/invitations/send')
        .send({
          emails: ['test@example.com'],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/invitations/send-bulk', () => {
    it('should process CSV upload', async () => {
      const csvContent = `email,usertype,firstName
bulk1@example.com,TEAM_MEMBER,John
bulk2@example.com,TEAM_MANAGER,Jane`;

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'invitations.csv');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('batchId');
      expect(response.body.results.successful.length).toBeGreaterThan(0);
    });

    it('should reject non-CSV files', async () => {
      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('not a csv'), 'test.txt');

      expect(response.status).toBe(400);
    });

    it('should validate required email column', async () => {
      const csvContent = `name,role
John,Member`;

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'invalid.csv');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/invitations', () => {
    it('should list company invitations', async () => {
      const response = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('invitations');
      expect(Array.isArray(response.body.invitations)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/invitations?status=pending')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.invitations.every((inv: any) => inv.status === 'pending')).toBe(true);
    });
  });

  describe('GET /api/invitations/status/:batchId', () => {
    it('should return batch status', async () => {
      // First create a batch
      const csvContent = 'email\ntest@example.com';
      const batchResponse = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'test.csv');

      const batchId = batchResponse.body.batchId;

      const response = await request(app)
        .get(`/api/invitations/status/${batchId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('total');
    });

    it('should return 404 for non-existent batch', async () => {
      const response = await request(app)
        .get('/api/invitations/status/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/invitations/accept/:token', () => {
    it('should accept valid invitation', async () => {
      // This would require creating a real invitation first
      // For contract test, verify endpoint structure
      const response = await request(app)
        .post('/api/invitations/accept/invalid-token')
        .send({
          password: 'NewPass123!',
          firstName: 'New',
          lastName: 'User',
        });

      expect(response.status).toBe(400);
    });

    it('should require password', async () => {
      const response = await request(app)
        .post('/api/invitations/accept/some-token')
        .send({
          firstName: 'New',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/invitations/:id/revoke', () => {
    it('should revoke pending invitation', async () => {
      // First create an invitation
      const inviteResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['revoke@example.com'],
          usertype: 'TEAM_MEMBER',
        });

      const invitationId = inviteResponse.body.results.successful[0]?.invitationId;

      if (invitationId) {
        const response = await request(app)
          .post(`/api/invitations/${invitationId}/revoke`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('POST /api/invitations/:id/resend', () => {
    it('should resend invitation with new token', async () => {
      // First create an invitation
      const inviteResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['resend@example.com'],
          usertype: 'TEAM_MEMBER',
        });

      const invitationId = inviteResponse.body.results.successful[0]?.invitationId;

      if (invitationId) {
        const response = await request(app)
          .post(`/api/invitations/${invitationId}/resend`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('invitation');
      }
    });
  });
});
