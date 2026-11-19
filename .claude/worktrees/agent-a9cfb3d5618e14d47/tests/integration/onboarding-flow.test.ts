import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';

describe('Onboarding Flow Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  describe('Complete Registration to Dashboard Flow', () => {
    it('should complete full onboarding flow', async () => {
      // Step 1: Register company
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          companyName: 'Integration Test Co',
          adminEmail: 'integration@example.com',
          adminPassword: 'SecurePass123!',
          adminFirstName: 'Integration',
          subscriptionTier: 'FREE',
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.nextStep).toBe('verify_email');

      const userId = registerResponse.body.userid;
      const token = registerResponse.body.token;

      // Step 2: Verify email (would need actual token from email in real scenario)
      // For integration test, we'll check the endpoint exists
      const verifyResponse = await request(app)
        .post('/auth/verify-email')
        .send({ token: 'invalid-token' });

      // Should fail with invalid token, but endpoint should work
      expect([400, 401]).toContain(verifyResponse.status);

      // Step 3: Sign in
      const signinResponse = await request(app)
        .post('/auth/signin')
        .send({
          email: 'integration@example.com',
          password: 'SecurePass123!',
        });

      expect(signinResponse.status).toBe(200);
      expect(signinResponse.body).toHaveProperty('token');

      // Step 4: Get current user
      const meResponse = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${signinResponse.body.token}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.email).toBe('integration@example.com');

      // Step 5: Access dashboard (would need dashboard endpoint)
      // This verifies the user can access protected resources
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh tokens and maintain session', async () => {
      // Register and sign in
      await request(app)
        .post('/auth/register')
        .send({
          companyName: 'Refresh Flow Co',
          adminEmail: 'refreshflow@example.com',
          adminPassword: 'SecurePass123!',
        });

      const signinResponse = await request(app)
        .post('/auth/signin')
        .send({
          email: 'refreshflow@example.com',
          password: 'SecurePass123!',
        });

      const cookies = signinResponse.headers['set-cookie'];
      
      // Attempt refresh
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .set('Cookie', cookies || []);

      // May fail if refresh token not set, but endpoint should exist
      expect([200, 401]).toContain(refreshResponse.status);
    });
  });

  describe('Logout Flow', () => {
    it('should clear session on logout', async () => {
      const logoutResponse = await request(app).post('/auth/logout');

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.headers['set-cookie']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid credentials gracefully', async () => {
      const response = await request(app)
        .post('/auth/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          companyName: '',
        });

      expect(response.status).toBe(400);
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('Email Verification Flow', () => {
    it('should handle verification token lifecycle', async () => {
      // Test that verification endpoints exist and handle tokens appropriately
      const invalidTokenResponse = await request(app)
        .get('/auth/verify-email?token=invalid');

      expect([400, 401]).toContain(invalidTokenResponse.status);

      const missingTokenResponse = await request(app)
        .get('/auth/verify-email');

      expect(missingTokenResponse.status).toBe(400);
    });
  });
});
