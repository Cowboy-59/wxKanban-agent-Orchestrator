import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';

describe('Invitation Flow Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let authToken: string;
  let companyId: string;

  beforeAll(async () => {
    app = createApp();

    // Setup: Register admin user
    const registerResponse = await request(app)
      .post('/auth/register')
      .send({
        companyName: 'Invitation Flow Co',
        adminEmail: 'admin-invite@example.com',
        adminPassword: 'SecurePass123!',
        adminFirstName: 'Admin',
      });

    authToken = registerResponse.body.token || '';
    companyId = registerResponse.body.companyid || '';
  });

  describe('End-to-End Invitation Flow', () => {
    it('should complete full invitation lifecycle', async () => {
      // Step 1: Send invitation
      const sendResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['invited-user@example.com'],
          usertype: 'TEAM_MEMBER',
          message: 'Join our team!',
        });

      expect(sendResponse.status).toBe(200);
      expect(sendResponse.body.results.successful).toHaveLength(1);

      const invitationId = sendResponse.body.results.successful[0].invitationId;

      // Step 2: List invitations and verify it appears
      const listResponse = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      const foundInvitation = listResponse.body.invitations.find(
        (inv: any) => inv.id === invitationId
      );
      expect(foundInvitation).toBeDefined();
      expect(foundInvitation.status).toBe('pending');

      // Step 3: Resend invitation
      const resendResponse = await request(app)
        .post(`/api/invitations/${invitationId}/resend`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resendResponse.status).toBe(200);
      expect(resendResponse.body.invitation).toHaveProperty('token');

      // Step 4: Revoke invitation
      const revokeResponse = await request(app)
        .post(`/api/invitations/${invitationId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(revokeResponse.status).toBe(200);

      // Step 5: Verify invitation is revoked
      const finalListResponse = await request(app)
        .get('/api/invitations')
        .set('Authorization', `Bearer ${authToken}`);

      const revokedInvitation = finalListResponse.body.invitations.find(
        (inv: any) => inv.id === invitationId
      );
      expect(revokedInvitation?.status).toBe('revoked');
    });
  });

  describe('Bulk Invitation Flow', () => {
    it('should process bulk CSV upload', async () => {
      const csvContent = `email,usertype,firstName,lastName
bulk1@example.com,TEAM_MEMBER,John,Doe
bulk2@example.com,TEAM_MANAGER,Jane,Smith
bulk3@example.com,TEAM_MEMBER,Bob,Johnson`;

      const uploadResponse = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'bulk-invites.csv');

      expect(uploadResponse.status).toBe(200);
      expect(uploadResponse.body).toHaveProperty('batchId');
      expect(uploadResponse.body.results.successful.length).toBeGreaterThan(0);

      const batchId = uploadResponse.body.batchId;

      // Check batch status
      const statusResponse = await request(app)
        .get(`/api/invitations/status/${batchId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('status');
    });

    it('should handle partial failures in bulk upload', async () => {
      const csvContent = `email,usertype
valid@example.com,TEAM_MEMBER
invalid-email,TEAM_MEMBER
existing@example.com,ADMIN`;

      // First create the existing user
      await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['existing@example.com'],
          usertype: 'TEAM_MEMBER',
        });

      const uploadResponse = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'partial-failures.csv');

      expect(uploadResponse.status).toBe(200);
      // Should have some successful and some failed
      expect(uploadResponse.body.results.successful.length + 
             uploadResponse.body.results.failed.length).toBeGreaterThan(0);
    });
  });

  describe('Invitation Acceptance Flow', () => {
    it('should handle invitation acceptance', async () => {
      // Create invitation
      const sendResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['accept-test@example.com'],
          usertype: 'TEAM_MEMBER',
        });

      const invitation = sendResponse.body.results.successful[0];

      // Attempt to accept with invalid token
      const invalidAcceptResponse = await request(app)
        .post('/api/invitations/accept/invalid-token')
        .send({
          password: 'NewPass123!',
          firstName: 'New',
          lastName: 'User',
        });

      expect(invalidAcceptResponse.status).toBe(400);

      // Note: To test successful acceptance, we would need the actual token
      // which would require accessing the database or email
    });
  });

  describe('Concurrent Invitation Handling', () => {
    it('should handle multiple invitations to same email', async () => {
      const email = 'duplicate-concurrent@example.com';

      // First invitation
      const firstResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: [email],
          usertype: 'TEAM_MEMBER',
        });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.results.successful).toHaveLength(1);

      // Second invitation to same email (should fail or update)
      const secondResponse = await request(app)
        .post('/api/invitations/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: [email],
          usertype: 'TEAM_MANAGER', // Different role
        });

      // Should either fail or succeed depending on implementation
      expect([200, 400]).toContain(secondResponse.status);
    });
  });

  describe('Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/invitations/send')
        .send({
          emails: ['test@example.com'],
        });

      expect(response.status).toBe(401);
    });

    it('should reject cross-company access', async () => {
      // Create another company
      const otherResponse = await request(app)
        .post('/auth/register')
        .send({
          companyName: 'Other Co',
          adminEmail: 'other@example.com',
          adminPassword: 'SecurePass123!',
        });

      const otherToken = otherResponse.body.token;
      const otherBatchId = 'some-batch-id';

      // Try to access other company's batch
      const response = await request(app)
        .get(`/api/invitations/status/${otherBatchId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      // Should be 404 or 403 depending on implementation
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty CSV', async () => {
      const csvContent = 'email';

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'empty.csv');

      expect(response.status).toBe(200);
      expect(response.body.results.successful).toHaveLength(0);
    });

    it('should handle CSV with only headers', async () => {
      const csvContent = 'email,usertype,firstName\n';

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'headers-only.csv');

      expect(response.status).toBe(200);
      expect(response.body.results.successful).toHaveLength(0);
    });

    it('should handle very long email lists', async () => {
      // Create CSV with 50 emails (the limit)
      const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
      const csvContent = 'email\n' + emails.join('\n');

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'max-emails.csv');

      expect(response.status).toBe(200);
    });

    it('should reject CSV exceeding limit', async () => {
      const emails = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);
      const csvContent = 'email\n' + emails.join('\n');

      const response = await request(app)
        .post('/api/invitations/send-bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'too-many.csv');

      expect(response.status).toBe(400);
    });
  });
});
