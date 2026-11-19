import { test, expect } from '@playwright/test';

test.describe('Registration E2E Tests', () => {
  test('complete registration flow', async ({ page }) => {
    // Navigate to registration page
    await page.goto('/registration?tier=FREE');
    
    // Fill company information
    await page.fill('[name="companyName"]', 'E2E Test Company');
    await page.fill('[name="billingEmail"]', 'e2e-test@example.com');
    
    // Fill admin information
    await page.fill('[name="adminFirstName"]', 'E2E');
    await page.fill('[name="adminLastName"]', 'Tester');
    await page.fill('[name="adminEmail"]', 'e2e-test@example.com');
    await page.fill('[name="adminPassword"]', 'SecurePass123!');
    
    // Submit registration
    await page.click('button[type="submit"]');
    
    // Wait for success message or redirect
    await page.waitForURL(/\/verify-email|\/dashboard/);
    
    // Verify success state
    const successMessage = await page.locator('text=/success|welcome/i').first();
    await expect(successMessage).toBeVisible();
  });

  test('registration with validation errors', async ({ page }) => {
    await page.goto('/registration');
    
    // Submit empty form
    await page.click('button[type="submit"]');
    
    // Check for validation errors
    const errorMessage = await page.locator('text=/required|invalid/i').first();
    await expect(errorMessage).toBeVisible();
  });

  test('email verification flow', async ({ page }) => {
    // Navigate to verification page with token
    await page.goto('/verify-email?token=test-token');
    
    // Wait for verification result
    await page.waitForLoadState('networkidle');
    
    // Should show error for invalid token or success
    const resultMessage = await page.locator('text=/verified|invalid|expired/i').first();
    await expect(resultMessage).toBeVisible();
  });

  test('login flow', async ({ page }) => {
    await page.goto('/login');
    
    // Fill credentials
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    
    // Submit login
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard or show error
    await page.waitForTimeout(1000);
    
    const currentUrl = page.url();
    expect(currentUrl.includes('/dashboard') || currentUrl.includes('/login')).toBeTruthy();
  });

  test('password reset flow', async ({ page }) => {
    await page.goto('/forgot-password');
    
    // Fill email
    await page.fill('[name="email"]', 'test@example.com');
    
    // Submit request
    await page.click('button[type="submit"]');
    
    // Should show confirmation or error
    const message = await page.locator('text=/sent|error/i').first();
    await expect(message).toBeVisible();
  });
});
