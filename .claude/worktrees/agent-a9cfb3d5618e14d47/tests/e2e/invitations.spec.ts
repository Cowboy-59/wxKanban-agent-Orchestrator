import { test, expect } from '@playwright/test';

test.describe('Invitations E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('send single invitation', async ({ page }) => {
    // Navigate to invite page
    await page.goto('/invite-team');
    
    // Fill invitation form
    await page.fill('[name="email"]', 'newmember@example.com');
    await page.selectOption('[name="usertype"]', 'TEAM_MEMBER');
    await page.fill('[name="message"]', 'Join our team!');
    
    // Send invitation
    await page.click('button:has-text("Send Invitation")');
    
    // Verify success
    await page.waitForSelector('text=/sent successfully|invitation sent/i');
  });

  test('bulk invitation via CSV upload', async ({ page }) => {
    await page.goto('/invite-team');
    
    // Switch to bulk tab
    await page.click('text=/bulk|csv|upload/i');
    
    // Upload CSV file
    const csvContent = `email,usertype,firstName
user1@example.com,TEAM_MEMBER,John
user2@example.com,TEAM_MANAGER,Jane`;
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invitations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    
    // Submit
    await page.click('button:has-text("Send Invitations")');
    
    // Verify progress or success
    await page.waitForSelector('text=/processing|sent|complete/i');
  });

  test('view and manage invitations', async ({ page }) => {
    await page.goto('/personnel');
    
    // Check invitations table
    const table = await page.locator('table').first();
    await expect(table).toBeVisible();
    
    // Test resend action if pending invitations exist
    const resendButton = page.locator('button:has-text("Resend")').first();
    if (await resendButton.isVisible().catch(() => false)) {
      await resendButton.click();
      await page.waitForSelector('text=/resent|sent/i');
    }
  });

  test('accept invitation flow', async ({ page }) => {
    // Navigate to invitation accept page with token
    await page.goto('/invite/accept?token=test-invitation-token');
    
    // Fill registration form
    await page.fill('[name="firstName"]', 'Invited');
    await page.fill('[name="lastName"]', 'User');
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.fill('[name="confirmPassword"]', 'SecurePass123!');
    
    // Accept invitation
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard or login
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl.includes('/dashboard') || currentUrl.includes('/login')).toBeTruthy();
  });

  test('invitation progress real-time updates', async ({ page }) => {
    await page.goto('/invite-team');
    
    // Start bulk upload
    const csvContent = `email
test1@example.com
test2@example.com
test3@example.com`;
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    
    await page.click('button:has-text("Send Invitations")');
    
    // Wait for progress indicator
    const progress = await page.locator('[role="progressbar"], .progress, text=/sending|progress/i').first();
    await expect(progress).toBeVisible();
  });

  test('revoke invitation', async ({ page }) => {
    await page.goto('/personnel');
    
    // Find and click revoke button for pending invitation
    const revokeButton = page.locator('button:has-text("Revoke")').first();
    
    if (await revokeButton.isVisible().catch(() => false)) {
      await revokeButton.click();
      
      // Confirm revocation
      await page.click('button:has-text("Confirm")');
      
      // Verify status changed
      await page.waitForSelector('text=/revoked|cancelled/i');
    }
  });

  test('invitation with personal message', async ({ page }) => {
    await page.goto('/invite-team');
    
    const email = 'personal@example.com';
    const message = 'Hey! Come join our awesome team on wxKanban. We\'d love to have you!';
    
    await page.fill('[name="email"]', email);
    await page.fill('[name="message"]', message);
    await page.selectOption('[name="usertype"]', 'TEAM_MANAGER');
    
    await page.click('button:has-text("Send Invitation")');
    
    // Verify success
    await page.waitForSelector('text=/sent successfully/i');
  });
});
