/**
 * Phase 7: Admin Dashboard & Reporting - Test Suite
 * Feature 002: Dashboard metrics, activity feed, notification settings
 *
 * Test coverage:
 * - Dashboard metrics aggregation
 * - Activity feed retrieval
 * - Notification settings CRUD
 * - Error handling and validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/client.js';
import { hashPassword } from '../src/server/lib/crypto.js';
import {
  getDashboardMetrics,
  getActivityFeed,
  getNotificationSettings,
  updateNotificationSettings,
} from '../src/services/dashboard-service.js';
import {
  generateEmailSummary,
  sendDailySummaries,
} from '../src/services/email-summary-service.js';
import { company, user, notificationsettings, invoice } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Phase 7: Admin Dashboard & Reporting', () => {
  let testCompanyId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test company with unique email
    const timestamp = Date.now();
    const testCompany = await db
      .insert(company)
      .values({
        name: `Test Company ${timestamp}`,
        contactemail: `test-${timestamp}@company.com`,
        billingplan: 'Professional',
        hourlyrate: '150',
      })
      .returning();

    testCompanyId = testCompany[0].companyid;

    // Create test admin user with hashed password
    const passwordHash = hashPassword('TestPassword123!');
    const testUser = await db
      .insert(user)
      .values({
        email: `admin-${timestamp}@test.com`,
        passwordhash: passwordHash,
        companyid: testCompanyId,
        role: 'Admin',
        activeflag: true,
      })
      .returning();

    testUserId = testUser[0].userid;
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(notificationsettings).where(eq(notificationsettings.companyid, testCompanyId));
    await db.delete(user).where(eq(user.companyid, testCompanyId));
    await db.delete(company).where(eq(company.companyid, testCompanyId));
  });

  describe('Dashboard Metrics Service', () => {
    it('should retrieve dashboard metrics for company', async () => {
      const metrics = await getDashboardMetrics(testCompanyId);

      expect(metrics).toBeDefined();
      expect(metrics.company).toBeDefined();
      expect(metrics.company.totalUsers).toBeGreaterThanOrEqual(1);
      expect(metrics.company.usersByRole).toBeInstanceOf(Array);
      expect(metrics.projects).toBeDefined();
      expect(metrics.projects.totalProjects).toBeGreaterThanOrEqual(0);
      expect(metrics.hours).toBeDefined();
      expect(metrics.hours.hoursThisMonth).toBeGreaterThanOrEqual(0);
      expect(metrics.financials).toBeDefined();
      expect(metrics.financials.revenueThisMonth).toBeDefined();
    });

    it('should calculate correct user counts', async () => {
      const metrics = await getDashboardMetrics(testCompanyId);

      const totalFromRoles = metrics.company.usersByRole.reduce((sum, r) => sum + r.count, 0);
      expect(metrics.company.totalUsers).toBe(totalFromRoles);
    });

    it('should include workload metrics', async () => {
      const metrics = await getDashboardMetrics(testCompanyId);

      expect(metrics.teamWorkload).toBeDefined();
      expect(metrics.teamWorkload.totalHours).toBeGreaterThanOrEqual(0);
      expect(metrics.teamWorkload.averageHoursPerUser).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Activity Feed Service', () => {
    it('should retrieve activity feed with pagination', async () => {
      const activities = await getActivityFeed(testCompanyId, { limit: 10, offset: 0 });

      expect(Array.isArray(activities)).toBe(true);
      expect(activities.length).toBeLessThanOrEqual(10);
    });

    it('should include required fields in activity items', async () => {
      const activities = await getActivityFeed(testCompanyId, { limit: 1 });

      if (activities.length > 0) {
        const activity = activities[0];
        expect(activity.auditid).toBeDefined();
        expect(activity.action).toBeDefined();
        expect(activity.timestamp).toBeDefined();
      }
    });

    it('should order activities by timestamp descending', async () => {
      const activities = await getActivityFeed(testCompanyId, { limit: 10 });

      for (let i = 0; i < activities.length - 1; i++) {
        const current = new Date(activities[i].timestamp).getTime();
        const next = new Date(activities[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('Notification Settings Service', () => {
    it('should create default notification settings if none exist', async () => {
      const settings = await getNotificationSettings(testCompanyId);

      expect(settings).toBeDefined();
      expect(settings.settingid).toBeDefined();
      expect(settings.emailfrequency).toBe('daily');
      expect(settings.emailtime).toBe('09:00:00');
    });

    it('should have correct default values', async () => {
      const settings = await getNotificationSettings(testCompanyId);

      expect(settings.includeprojectupdate).toBe(true);
      expect(settings.includeteamactivity).toBe(true);
      expect(settings.includefinancials).toBe(true);
    });

    it('should update notification settings', async () => {
      await updateNotificationSettings(testCompanyId, {
        emailfrequency: 'weekly',
        emailtime: '10:30:00',
        includeprojectupdate: false,
      });

      const updated = await getNotificationSettings(testCompanyId);
      expect(updated.emailfrequency).toBe('weekly');
      expect(updated.emailtime).toBe('10:30:00');
      expect(updated.includeprojectupdate).toBe(false);
    });

    it('should validate email frequency values', async () => {
      expect(async () => {
        await updateNotificationSettings(testCompanyId, {
          emailfrequency: 'invalid',
        });
      }).rejects.toThrow();
    });

    it('should validate email time format', async () => {
      expect(async () => {
        await updateNotificationSettings(testCompanyId, {
          emailtime: 'invalid-time',
        });
      }).rejects.toThrow();
    });

    it('should accept valid time formats', async () => {
      await updateNotificationSettings(testCompanyId, {
        emailtime: '14:30:45',
      });

      const updated = await getNotificationSettings(testCompanyId);
      expect(updated.emailtime).toBe('14:30:45');
    });
  });

  describe('Email Summary Service', () => {
    it('should generate email summary with all content sections', async () => {
      const { subject, html } = await generateEmailSummary(testCompanyId, {
        includeprojectupdate: true,
        includeteamactivity: true,
        includefinancials: true,
      });

      expect(subject).toBeDefined();
      expect(subject).toContain('Daily Summary');
      expect(html).toBeDefined();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Key Metrics');
    });

    it('should respect content filter preferences', async () => {
      const { html: fullHtml } = await generateEmailSummary(testCompanyId, {
        includeprojectupdate: true,
        includeteamactivity: true,
        includefinancials: true,
      });

      const { html: minimalHtml } = await generateEmailSummary(testCompanyId, {
        includeprojectupdate: false,
        includeteamactivity: false,
        includefinancials: false,
      });

      expect(fullHtml.length).toBeGreaterThan(minimalHtml.length);
      expect(minimalHtml).not.toContain('💰 Financial Summary');
    });

    it('should include company name in email', async () => {
      const { html } = await generateEmailSummary(testCompanyId, {
        includeprojectupdate: true,
        includeteamactivity: true,
        includefinancials: true,
      });

      expect(html).toContain('Test Company');
    });

    it('should generate valid HTML structure', async () => {
      const { html } = await generateEmailSummary(testCompanyId, {
        includeprojectupdate: true,
        includeteamactivity: true,
        includefinancials: true,
      });

      expect(html).toMatch(/<html[\s>]/i);
      expect(html).toMatch(/<\/html>/i);
      expect(html).toMatch(/<body[\s>]/i);
      expect(html).toMatch(/<\/body>/i);
      expect(html).toMatch(/<head[\s>]/i);
      expect(html).toMatch(/<\/head>/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent company gracefully', async () => {
      const metrics = await getDashboardMetrics('00000000-0000-0000-0000-000000000000');
      expect(metrics).toBeDefined();
      expect(metrics.company.totalUsers).toBe(0);
    });

    it('should handle missing activity feed data', async () => {
      const activities = await getActivityFeed('00000000-0000-0000-0000-000000000000');
      expect(Array.isArray(activities)).toBe(true);
      expect(activities.length).toBe(0);
    });

    it('should create default settings for any company', async () => {
      const settings = await getNotificationSettings(testCompanyId);
      expect(settings.settingid).toBeDefined();
    });
  });

  describe('Data Validation', () => {
    it('should preserve data types in dashboard metrics', async () => {
      const metrics = await getDashboardMetrics(testCompanyId);

      expect(typeof metrics.company.totalUsers).toBe('number');
      expect(typeof metrics.company.activeUsers).toBe('number');
      expect(typeof metrics.projects.totalProjects).toBe('number');
      expect(typeof metrics.hours.hoursThisMonth).toBe('number');
      expect(typeof metrics.financials.revenueThisMonth).toBe('string');
      expect(typeof metrics.financials.invoicesThisMonth).toBe('number');
    });

    it('should have valid notification settings types', async () => {
      const settings = await getNotificationSettings(testCompanyId);

      expect(typeof settings.settingid).toBe('string');
      expect(typeof settings.emailfrequency).toBe('string');
      expect(typeof settings.emailtime).toBe('string');
      expect(typeof settings.includeprojectupdate).toBe('boolean');
      expect(typeof settings.includeteamactivity).toBe('boolean');
      expect(typeof settings.includefinancials).toBe('boolean');
    });
  });
});
