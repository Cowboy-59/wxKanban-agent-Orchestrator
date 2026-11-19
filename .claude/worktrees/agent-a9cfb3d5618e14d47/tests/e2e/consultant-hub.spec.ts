/**
 * E2E: Consultant Work Hub full journey (Spec 020).
 *
 * Covers FR-001/002/003/004/007/008/009/011.
 *
 * Pre-conditions:
 *  - Test consultant account with assigned tasks across at least one project
 *  - At least one task with sourcepmssystem set (for badge assertion)
 *  - .env: TEST_CONSULTANT_EMAIL / TEST_CONSULTANT_PASSWORD
 */

import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_CONSULTANT_EMAIL ?? "consultant@example.com";
const PASSWORD = process.env.TEST_CONSULTANT_PASSWORD ?? "TestPass123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('[name="email"]', EMAIL);
  await page.fill('[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Consultant Work Hub — full journey", () => {
  test("renders queue, filters by project, shows workload counters", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/work-hub");

    await expect(page.getByText("Consultant Work Hub")).toBeVisible();
    await expect(page.getByText("Total Tasks")).toBeVisible();
    await expect(page.getByText("Past Due")).toBeVisible();
    await expect(page.getByText("30+ Day Aging")).toBeVisible();
    await expect(page.getByText("Compliance")).toBeVisible();

    // Project filter selectable
    const filter = page.locator("select").first();
    await expect(filter).toBeVisible();
  });

  test("start timer, then stop opens billable prompt modal", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/work-hub");

    const startBtn = page.getByRole("button", { name: /Start Timer/i }).first();
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    await expect(page.getByText("Timer Running")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /Stop Timer/i }).first().click();
    await expect(page.getByText("Save Time Entry")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Billable?")).toBeVisible();

    // Submit as non-billable
    await page.getByRole("button", { name: /Non-billable/i }).click();
    await page.getByRole("button", { name: /Save Entry/i }).click();
  });

  test("mark task blocked via modal with reason", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/work-hub");

    await page.getByRole("button", { name: /Blocked/i }).first().click();
    await expect(page.getByText("Change Task Status")).toBeVisible();

    // Submit should be disabled until reason provided
    const submit = page.getByRole("button", { name: /Submit/i });
    await expect(submit).toBeDisabled();

    await page.locator("textarea").fill("Waiting on Jira approval");
    await expect(submit).toBeEnabled();
    await submit.click();
  });

  test("source badges visible on task cards", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/work-hub");

    // At least one badge should be visible (internal or pm system)
    const badge = page.locator('[class*="bg-slate-200"], [class*="bg-indigo-100"]').first();
    await expect(badge).toBeVisible();
  });

  test("activity drawer opens with override + timelog history", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/work-hub");

    await page.getByRole("button", { name: /Activity/i }).first().click();
    await expect(page.getByText("Task Activity")).toBeVisible();
    await expect(page.getByText("Time Entries")).toBeVisible();
    await expect(page.getByText("Status History")).toBeVisible();
  });
});
